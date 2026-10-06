/**
 * Coverage-guided exploration (the approach of greybox fuzzers):
 *
 * - The corpus holds story states whose last step covered something new (a condition
 *   branch or a passage).
 * - Every corpus state is expanded once systematically: every link, with every outcome of
 *   the random choices and prompt answers it triggers. This finds unlikely branches.
 * - Between expansions, random playthroughs continue from corpus states; whatever covers
 *   something new joins the corpus.
 * - It stops when coverage hasn't grown for a while or the time budget is used up.
 *
 * Exhaustive search is not an option: around 185 variables decide the path.
 */
import { createHash } from 'node:crypto';
import { Story, type IfNode, type Scenario, type StorySnapshot, type StoryView, type Value } from '@chronicle/engine';

export interface ExploreOptions {
  /** Variables the app's setup screens fill in (players, names, …). */
  setup: Record<string, Value>;
  /** Setup variables to vary at the start, with the values to try. */
  setupChoices: Map<string, Value[]>;
  /** Answers to try per prompt variable. */
  candidates: Map<string, Value[]>;
  /** Variables that decide the path; only these distinguish states (see control.ts). */
  control: Set<string>;
  /** Shared across runs: every if-branch taken, as "if node → branch indexes". */
  branches: Map<IfNode, Set<number>>;
  timeLimitMs: number;
  /** Stop when nothing new was covered for this long. */
  plateauMs: number;
  /** Outcome combinations tried per action in a systematic expansion. */
  maxOutcomesPerAction: number;
  /** Random ranges larger than this are sampled (lowest, middle, highest) in expansions. */
  sampleRangeAbove: number;
  maxStepsPerWalk: number;
  seed: number;
}

export interface Finding {
  count: number;
  /** Steps to reproduce: passages entered and link numbers clicked. */
  trail: string[];
}

export interface ExploreResult {
  corpus: number;
  actions: number;
  walks: number;
  /** True when coverage stopped growing before the time ran out. */
  plateaued: boolean;
  visited: Set<string>;
  endings: Map<string, number>;
  deadEnds: Map<string, Finding>;
  errors: Map<string, Finding & { message: string }>;
  sampledSites: Set<string>;
}

interface Entry {
  snap: StorySnapshot;
  trail: string[];
  expanded: boolean;
}

interface Outcome {
  story: Story;
  view?: StoryView;
  error?: Error;
  entered: string[];
  /** Covered a condition branch nobody covered before. */
  novel: boolean;
}

function stateKey(snap: StorySnapshot, control: Set<string>): string {
  const links = snap.links.map((l) => [l.to, l.reveal, l.revealFrom, l.replace]);
  const vars = Object.keys(snap.vars).filter((v) => control.has(v)).sort().map((v) => [v, snap.vars[v]]);
  return createHash('sha1').update(snap.passage).update('\0').update(JSON.stringify(vars)).update('\0').update(JSON.stringify(links)).digest('base64');
}

/** mulberry32 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Next choice vector in odometer order, or undefined when all were tried. */
function nextForced(forced: number[], arities: number[]): number[] | undefined {
  let j = arities.length - 1;
  while (j >= 0 && (forced[j] ?? 0) + 1 >= arities[j]!) j--;
  if (j < 0) return undefined;
  return [...arities.slice(0, j).map((_, k) => forced[k] ?? 0), (forced[j] ?? 0) + 1];
}

export function explore(scenario: Scenario, opts: ExploreOptions): ExploreResult {
  const result: ExploreResult = {
    corpus: 0, actions: 0, walks: 0, plateaued: false,
    visited: new Set(), endings: new Map(), deadEnds: new Map(), errors: new Map(), sampledSites: new Set(),
  };
  const rnd = seeded(opts.seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const seen = new Set<string>();
  const corpus: Entry[] = [];
  const deadline = Date.now() + opts.timeLimitMs;
  let lastProgress = Date.now();

  let novel = false;
  const trace = {
    branch(node: IfNode, index: number) {
      const set = opts.branches.get(node) ?? opts.branches.set(node, new Set()).get(node)!;
      if (!set.has(index)) {
        set.add(index);
        novel = true;
      }
    },
    include(passage: string) {
      if (!result.visited.has(passage)) {
        result.visited.add(passage);
        novel = true;
      }
    },
  };

  /**
   * Runs one action (start or link click, then any prompts). With `forced`, choices are
   * enumerated systematically and their arities recorded; without, they are random.
   */
  function act(base: StorySnapshot | undefined, link: number | undefined, forced?: number[], arities?: number[]): Outcome {
    let i = 0;
    const next = (arity: number) => {
      if (!forced) return pick(arity);
      arities!.push(arity);
      return forced[i++] ?? 0;
    };
    // At the start, setup values the story checks for (e.g. special village names) are choices too.
    const vars = { ...opts.setup };
    if (!base) for (const [v, values] of opts.setupChoices) vars[v] = values[next(values.length)]!;
    const story = new Story(scenario, {
      vars,
      trace,
      chooser: {
        choose(n, site, display) {
          if (display) return pick(n);
          if (n <= 1) return 0;
          if (forced && site.endsWith(':shuffled')) {
            // Every permutation would explode; try "keep" and "swap" at each step.
            result.sampledSites.add(site);
            return next(2) === 0 ? n - 1 : 0;
          }
          if (forced && n > opts.sampleRangeAbove) {
            result.sampledSites.add(site);
            return [0, Math.floor(n / 2), n - 1][next(3)]!;
          }
          return next(n);
        },
      },
    });
    const before = base ? base.history.length : 0;
    novel = false;
    try {
      let view = base ? (story.restore(base), story.click(link!)) : story.start();
      while (view.prompt) {
        const cands = opts.candidates.get(view.prompt.var) ?? [view.prompt.input === 'number' ? 0 : 'Test'];
        view = story.answer(cands[next(cands.length)]!);
      }
      return { story, view, entered: story.history.slice(before), novel };
    } catch (e) {
      return { story, error: e as Error, entered: story.history.slice(before), novel };
    }
  }

  /**
   * Records an outcome; returns a new corpus entry if the state covered something new
   * (or `keep` is set – used for every distinct start, e.g. per village name).
   */
  function record(o: Outcome, trail: string[], keep = false): Entry | undefined {
    result.actions++;
    let isNew = o.novel || keep;
    for (const p of o.entered) {
      if (!result.visited.has(p)) isNew = true;
      result.visited.add(p);
    }
    if (isNew) lastProgress = Date.now();
    const steps = [...trail, ...o.entered];
    if (o.error) {
      const key = o.error.message.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N');
      const f = result.errors.get(key);
      if (f) f.count++;
      else result.errors.set(key, { count: 1, trail: steps, message: o.error.message });
      return undefined;
    }
    const view = o.view!;
    if (!view.links.length) {
      if (scenario.passages[view.passage]?.tags.includes('ending')) {
        result.endings.set(view.passage, (result.endings.get(view.passage) ?? 0) + 1);
      } else {
        const f = result.deadEnds.get(view.passage);
        if (f) f.count++;
        else result.deadEnds.set(view.passage, { count: 1, trail: steps });
      }
      return undefined;
    }
    if (!isNew) return undefined;
    const snap = o.story.snapshot();
    const key = stateKey(snap, opts.control);
    if (seen.has(key)) return undefined;
    seen.add(key);
    const entry: Entry = { snap, trail: steps, expanded: false };
    corpus.push(entry);
    result.corpus++;
    return entry;
  }

  /** Every link × every outcome, once per corpus entry. */
  function expand(entry: Entry): void {
    entry.expanded = true;
    entry.snap.links.forEach((l, index) => {
      let forced: number[] | undefined = [];
      for (let n = 0; forced && n < opts.maxOutcomesPerAction; n++) {
        const arities: number[] = [];
        record(act(entry.snap, l.id, forced, arities), [...entry.trail, `#${index + 1}`]);
        forced = nextForced(forced, arities);
      }
    });
  }

  /** Random playthrough from a corpus entry. */
  function walk(entry: Entry): void {
    result.walks++;
    let snap = entry.snap, trail = entry.trail;
    for (let step = 0; step < opts.maxStepsPerWalk; step++) {
      const index = pick(snap.links.length);
      const o = act(snap, snap.links[index]!.id);
      const added = record(o, [...trail, `#${index + 1}`]);
      if (o.error || !o.view!.links.length) return;
      trail = added?.trail ?? [...trail, `#${index + 1}`, ...o.entered];
      snap = added?.snap ?? o.story.snapshot();
    }
  }

  // The beginning may already contain random choices – enumerate them.
  for (let forced: number[] | undefined = []; forced; ) {
    const arities: number[] = [];
    record(act(undefined, undefined, forced, arities), [], true);
    forced = nextForced(forced, arities);
  }

  while (corpus.length) {
    const now = Date.now();
    if (now > deadline) break;
    if (now - lastProgress > opts.plateauMs) {
      result.plateaued = true;
      break;
    }
    const todo = corpus.find((e) => !e.expanded);
    if (todo) {
      expand(todo);
      walk(todo);
    } else {
      // Favour recent discoveries: they sit on the frontier of what's covered.
      const entry = rnd() < 0.5 ? corpus[corpus.length - 1 - pick(Math.min(corpus.length, 20))]! : corpus[pick(corpus.length)]!;
      walk(entry);
    }
  }
  return result;
}
