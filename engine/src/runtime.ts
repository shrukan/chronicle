import { SETUP_CONTINUE_KEY, type BlockStyle, type Expr, type IfNode, type Node, type Passage, type PromptNode, type Scenario, type TextKind, type Value } from './schema.ts';
import { binary, equals, indexList, toNumber, toText, truthy, typeOf, ValueError } from './values.ts';

/**
 * Decides every random outcome. The app uses a random chooser; the story tester
 * uses one that enumerates or records outcomes. `site` identifies the call for logs;
 * `display` is true when the result is only shown (e.g. a random month in a letter)
 * and cannot change where the story goes.
 */
export interface Chooser {
  choose(count: number, site: string, display: boolean): number;
}

/** Optional observer, used by the story tester to measure branch coverage. */
export interface StoryTrace {
  /** `index` is the branch taken, or -1 when no branch matched. */
  branch(node: IfNode, index: number, passage: string): void;
  /** A passage rendered inline (it does not appear in `history`). */
  include?(passage: string): void;
}

export const randomChooser: Chooser = {
  choose: (count) => Math.floor(Math.random() * count),
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type Out =
  | { t: 'text'; key: string; kind: TextKind; args: string[] }
  | { t: 'br' }
  | { t: 'block'; style: BlockStyle; image?: string; children: Out[] }
  /** Output of a revealed fragment; render its children inline. */
  | { t: 'group'; children: Out[] }
  /** `disabled`: a used reveal link that stays visible as plain text (Harlowe behaviour). */
  | { t: 'link'; id: number; key: string; args: string[]; disabled?: boolean }
  | { t: 'prompt'; var: string; input: PromptNode['input']; key: string; args: string[] }
  /** App screen; when it has `link`, the app calls `click(link)` once the players confirm. */
  | { t: 'ui'; ui: string; args: Record<string, Value>; link?: number };

export interface StoryView {
  passage: string;
  output: Out[];
  /** Ids of links that can be clicked right now. */
  links: number[];
  /** Set while the story waits for `answer()`. */
  prompt?: { var: string; input: PromptNode['input']; key: string; args: string[] };
}

export class StoryError extends Error {}

/**
 * Everything needed to continue a story later: plain JSON, usable for save games.
 * Only available while no prompt is waiting.
 */
export interface StorySnapshot {
  passage: string;
  history: string[];
  vars: Record<string, Value>;
  output: Out[];
  links: { id: number; passage: string; to?: string; reveal?: string; revealFrom?: string; replace: boolean }[];
  nextLinkId: number;
}

type Flow = undefined | { goto: string };
type Thread = Generator<PromptNode, Flow, Value>;

interface LinkEntry {
  passage: Passage;
  to?: string;
  reveal?: string;
  revealFrom?: string;
  replace: boolean;
  /** Where the link sits, so a revealed fragment can be placed there. */
  container: Out[];
  out: Out;
}

interface LinkTarget {
  to?: string;
  reveal?: string;
  revealFrom?: string;
  replace?: boolean;
}

const MAX_JUMPS = 200;

export class Story {
  vars: Record<string, Value>;
  passage = '';
  history: string[] = [];

  private output: Out[] = [];
  private links = new Map<number, LinkEntry>();
  private nextLinkId = 1;
  private suspended: { thread: Thread; prompt: PromptNode; args: string[] } | undefined;
  /** > 0 while evaluating values that are only displayed. */
  private displayDepth = 0;
  private readonly chooser: Chooser;
  private readonly trace: StoryTrace | undefined;
  readonly scenario: Scenario;

  constructor(scenario: Scenario, opts: { chooser?: Chooser; vars?: Record<string, Value>; trace?: StoryTrace } = {}) {
    this.scenario = scenario;
    this.chooser = opts.chooser ?? randomChooser;
    this.trace = opts.trace;
    this.vars = { ...scenario.variables, ...opts.vars };
  }

  view(): StoryView {
    const view: StoryView = { passage: this.passage, output: this.output, links: [...this.links.keys()] };
    if (this.suspended) {
      const p = this.suspended.prompt;
      view.prompt = { var: p.var, input: p.input, key: p.key, args: this.suspended.args };
    }
    return view;
  }

  snapshot(): StorySnapshot {
    if (this.suspended) throw new StoryError('Cannot snapshot while a prompt is waiting');
    return structuredClone({
      passage: this.passage,
      history: this.history,
      vars: this.vars,
      output: this.output,
      links: [...this.links].map(([id, l]) => ({
        id,
        passage: l.passage.name,
        replace: l.replace,
        ...(l.to !== undefined ? { to: l.to } : {}),
        ...(l.reveal !== undefined ? { reveal: l.reveal } : {}),
        ...(l.revealFrom !== undefined ? { revealFrom: l.revealFrom } : {}),
      })),
      nextLinkId: this.nextLinkId,
    });
  }

  restore(snap: StorySnapshot): StoryView {
    const s = structuredClone(snap);
    this.passage = s.passage;
    this.history = s.history;
    this.vars = s.vars;
    this.output = s.output;
    this.nextLinkId = s.nextLinkId;
    this.suspended = undefined;

    // Re-attach links to where they sit in the output (screen links sit nowhere).
    const placed = new Map<number, { container: Out[]; out: Out }>();
    const walk = (list: Out[]) => {
      for (const o of list) {
        if (o.t === 'link') placed.set(o.id, { container: list, out: o });
        if (o.t === 'block' || o.t === 'group') walk(o.children);
      }
    };
    walk(this.output);
    this.links.clear();
    for (const l of s.links) {
      const passage = this.scenario.passages[l.passage];
      if (!passage) throw new StoryError(`Snapshot refers to unknown passage "${l.passage}"`);
      const at = placed.get(l.id) ?? { container: [], out: { t: 'link', id: l.id, key: '', args: [] } };
      const entry: LinkEntry = { passage, replace: l.replace, container: at.container, out: at.out };
      if (l.to !== undefined) entry.to = l.to;
      if (l.reveal !== undefined) entry.reveal = l.reveal;
      if (l.revealFrom !== undefined) entry.revealFrom = l.revealFrom;
      this.links.set(l.id, entry);
    }
    return this.view();
  }

  start(name = this.scenario.start): StoryView {
    this.goTo(name);
    return this.view();
  }

  /**
   * Follows a link. App screens (`ui` output with a `link`) may pass values they collected,
   * e.g. the winner from the scoring screens; they are type-checked like any assignment.
   */
  click(id: number, values: Record<string, Value> = {}): StoryView {
    if (this.suspended) throw new StoryError('Answer the prompt first');
    const link = this.links.get(id);
    if (!link) throw new StoryError(`No link ${id}`);
    for (const [k, v] of Object.entries(values)) this.assign(k, v, this.passage);

    if (link.to !== undefined) {
      this.goTo(link.to);
      return this.view();
    }

    const owner = link.revealFrom ? this.scenario.passages[link.revealFrom] : link.passage;
    const fragment = owner?.fragments[link.reveal!];
    if (!owner || !fragment) throw new StoryError(`Unknown fragment ${link.reveal} in ${link.revealFrom ?? link.passage.name}`);
    // The fragment writes into a group placed where the link is (or right after it),
    // so output stays in place even if the fragment pauses for a prompt.
    // A reveal link works once: it is either replaced by the fragment or stays as plain text.
    const group: Out = { t: 'group', children: [] };
    const at = link.container.indexOf(link.out);
    this.links.delete(id);
    if (link.replace) {
      link.container.splice(at, 1, group);
    } else {
      if (link.out.t === 'link') link.out.disabled = true;
      link.container.splice(at + 1, 0, group);
    }
    this.drive(this.exec(fragment, group.children, owner));
    return this.view();
  }

  answer(value: Value): StoryView {
    const waiting = this.suspended;
    if (!waiting) throw new StoryError('No prompt is waiting');
    if (waiting.prompt.input === 'number') {
      // On invalid input the prompt stays open so the app can ask again.
      try {
        value = toNumber(value);
      } catch {
        throw new StoryError(`Not a number: ${toText(value)}`);
      }
    } else {
      value = toText(value);
    }
    this.assign(waiting.prompt.var, value, this.passage);
    this.suspended = undefined;
    this.drive(waiting.thread, value);
    return this.view();
  }

  // -------------------------------------------------------------------------

  private goTo(name: string, jumps = 0): void {
    if (jumps > MAX_JUMPS) throw new StoryError(`Too many jumps, last target ${name}`);
    const passage = this.scenario.passages[name];
    if (!passage) throw new StoryError(`Unknown passage "${name}" (from "${this.passage}")`);

    this.passage = name;
    this.history.push(name);
    this.output = [];
    this.links.clear();
    this.suspended = undefined;
    this.drive(this.exec(passage.body, this.output, passage), undefined, jumps);
  }

  /** Runs a thread until it ends, jumps or waits for a prompt. */
  private drive(thread: Thread, input?: Value, jumps = 0): void {
    const r = input === undefined ? thread.next() : thread.next(input);
    if (!r.done) {
      const out = this.findPromptOut(this.output, r.value);
      this.suspended = { thread, prompt: r.value, args: out?.args ?? [] };
      return;
    }
    if (r.value) this.goTo(r.value.goto, jumps + 1);
  }

  private *exec(nodes: Node[], out: Out[], passage: Passage): Thread {
    for (const node of nodes) {
      switch (node.t) {
        case 'text':
          out.push({ t: 'text', key: node.key, kind: node.kind, args: this.display(node.args) });
          break;
        case 'br':
          out.push({ t: 'br' });
          break;
        case 'block': {
          const children: Out[] = [];
          const block: Out = { t: 'block', style: node.style, children };
          out.push(block);
          const flow = yield* this.exec(node.body, children, passage);
          if (node.style === 'setupEvent' && this.vars['_SetupImage']) block.image = toText(this.vars['_SetupImage']);
          if (flow) return flow;
          if (node.next) this.addLink(children, passage, { to: toText(this.eval(node.next)) }, SETUP_CONTINUE_KEY);
          break;
        }
        case 'if': {
          const index = node.branches.findIndex((b) => !b.cond || truthy(this.eval(b.cond)));
          this.trace?.branch(node, index, passage.name);
          const branch = node.branches[index];
          if (branch) {
            const flow = yield* this.exec(branch.body, out, passage);
            if (flow) return flow;
          }
          break;
        }
        case 'set':
          this.assign(node.var, this.eval(node.value), passage.name);
          break;
        case 'link': {
          const target: LinkTarget = { replace: node.replace ?? false };
          if (node.to) target.to = toText(this.eval(node.to));
          if (node.reveal) target.reveal = node.reveal;
          if (node.revealFrom) target.revealFrom = node.revealFrom;
          this.addLink(out, passage, target, node.key, this.display(node.args));
          break;
        }
        case 'goto':
          return { goto: toText(this.eval(node.to)) };
        case 'include': {
          const name = toText(this.eval(node.passage));
          const included = this.scenario.passages[name];
          if (!included) throw new StoryError(`Unknown included passage "${name}"`);
          this.trace?.include?.(name);
          const flow = yield* this.exec(included.body, out, included);
          if (flow) return flow;
          break;
        }
        case 'prompt':
          out.push({ t: 'prompt', var: node.var, input: node.input, key: node.key, args: this.display(node.args) });
          yield node;
          break;
        case 'ui': {
          const args: Record<string, Value> = {};
          for (const [k, e] of Object.entries(node.args ?? {})) args[k] = this.eval(e);
          const o: Out = { t: 'ui', ui: node.ui, args };
          out.push(o);
          // Screens that lead on to a passage (end of round, bidding) continue via a link.
          if (typeof args['next'] === 'string' && args['next']) {
            this.addLink([], passage, { to: args['next'] }, `ui.${node.ui}`);
            o.link = this.nextLinkId - 1;
          }
          break;
        }
        case 'manual':
          throw new StoryError(`Unconverted code in ${passage.name}: ${node.reason}`);
      }
    }
    return undefined;
  }

  /** Evaluates values that are only shown, so random picks in them don't count as branches. */
  private display(args: Expr[] | undefined): string[] {
    this.displayDepth++;
    try {
      return (args ?? []).map((a) => toText(this.eval(a)));
    } finally {
      this.displayDepth--;
    }
  }

  /** The output entry of the prompt that is waiting (its arguments were evaluated there). */
  private findPromptOut(list: Out[], node: PromptNode): Extract<Out, { t: 'prompt' }> | undefined {
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]!;
      if (o.t === 'prompt' && o.key === node.key) return o;
      if (o.t === 'block' || o.t === 'group') {
        const found = this.findPromptOut(o.children, node);
        if (found) return found;
      }
    }
    return undefined;
  }

  private assign(name: string, value: Value, where: string): void {
    const current = this.vars[name];
    if (current === undefined) throw new StoryError(`Unknown variable "${name}" (${where})`);
    if (typeOf(current) !== typeOf(value)) {
      throw new StoryError(`Cannot store ${typeOf(value)} ${JSON.stringify(value)} in ${typeOf(current)} variable "${name}" (${where})`);
    }
    this.vars[name] = value;
  }

  private addLink(out: Out[], passage: Passage, target: LinkTarget, key: string, args: string[] = []): void {
    const id = this.nextLinkId++;
    const o: Out = { t: 'link', id, key, args };
    const entry: LinkEntry = { passage, replace: target.replace ?? false, container: out, out: o };
    if (target.to !== undefined) entry.to = target.to;
    if (target.reveal !== undefined) entry.reveal = target.reveal;
    if (target.revealFrom !== undefined) entry.revealFrom = target.revealFrom;
    this.links.set(id, entry);
    out.push(o);
  }

  eval(e: Expr): Value {
    if ('lit' in e) return e.lit;
    if ('var' in e) {
      const v = this.vars[e.var];
      if (v === undefined) throw new StoryError(`Unknown variable "${e.var}"`);
      return v;
    }
    if ('cases' in e) {
      const c = e.cases.find((c) => !c.cond || truthy(this.eval(c.cond)));
      if (!c) throw new StoryError('No case matched and there is no default');
      return this.eval(c.value);
    }
    if ('unknown' in e) throw new StoryError(`Unconverted expression: ${e.unknown}`);
    if ('fn' in e) return this.call(e.fn, e.args);
    if ('at' in e) return indexList(this.eval(e.at), this.eval(e.key));
    if (e.op === 'not') return !truthy(this.eval(e.a));
    if (e.op === 'neg') {
      const v = this.eval(e.a);
      if (typeof v !== 'number') throw new ValueError(`Cannot negate ${JSON.stringify(v)}`);
      return -v;
    }
    if (!('b' in e)) throw new StoryError(`Bad expression ${JSON.stringify(e)}`);
    if (e.op === '&&') return truthy(this.eval(e.a)) && truthy(this.eval(e.b));
    if (e.op === '||') return truthy(this.eval(e.a)) || truthy(this.eval(e.b));
    return binary(e.op, this.eval(e.a), this.eval(e.b));
  }

  private call(fn: string, argExprs: Expr[]): Value {
    const site = `${this.passage}:${fn}`;
    // `either` must not evaluate options it doesn't pick (they may be other macros).
    if (fn === 'either') {
      const i = this.chooser.choose(argExprs.length, site, this.displayDepth > 0);
      return this.eval(argExprs[i]!);
    }
    const args = argExprs.map((a) => this.eval(a));
    switch (fn) {
      case 'random': {
        const [lo, hi] = args;
        if (typeof lo !== 'number' || typeof hi !== 'number') throw new ValueError('random needs two numbers');
        return lo + this.chooser.choose(hi - lo + 1, site, this.displayDepth > 0);
      }
      case 'num':
        return toNumber(args[0]!);
      case 'str':
        return toText(args[0]!);
      case 'array':
        return args;
      case 'shuffled': {
        // `(shuffled: ...$arr)` spreads a single array argument.
        const a = args.length === 1 && Array.isArray(args[0]) ? [...args[0]] : [...args];
        for (let i = a.length - 1; i > 0; i--) {
          const j = this.chooser.choose(i + 1, site, this.displayDepth > 0);
          [a[i], a[j]] = [a[j]!, a[i]!];
        }
        return a;
      }
      case 'max':
      case 'min': {
        const xs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return (fn === 'max' ? Math.max : Math.min)(...xs.map(toNumber));
      }
      case 'count': {
        const [list, x] = args;
        if (!Array.isArray(list)) throw new ValueError('count needs a list');
        return list.filter((v) => equals(v, x!)).length;
      }
    }
    throw new StoryError(`Unknown function ${fn}`);
  }
}
