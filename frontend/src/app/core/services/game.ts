import { computed, inject, Injectable, signal } from '@angular/core';
import {
  resolveText,
  Story,
  StoryError,
  type Node,
  type Out,
  type Passage,
  type ReadingMode,
  type StorySnapshot,
  type StoryView,
  type TextKind,
  type Value,
} from '@chronicle/engine';
import { AudioPlayer } from './audio';
import { loadContent, type ScenarioContent, type ScenarioId } from './content';
import { SaveStore, type GameSetup, type UndoStep } from './save-store';
import { Settings } from './settings';

/** Labels that only move the reading on ("Click to continue…") – no decision, no secret. */
/** How many choices can be undone. */
const UNDO_LIMIT = 10;

export const PLAIN_CONTINUE = /^(click( here)? to continue|continue)[.…\s]*$/i;

/** Nodes that must not run without the players: leaving the page, asking a question. */
function interrupts(
  nodes: Node[],
  passages: Record<string, Passage>,
  seen = new Set<string>(),
): boolean {
  return nodes.some((n) => {
    if (n.t === 'goto' || n.t === 'prompt' || n.t === 'manual') return true;
    if (n.t === 'include') {
      const name = 'lit' in n.passage ? String(n.passage.lit) : undefined;
      if (!name) return true;
      if (seen.has(name)) return false;
      seen.add(name);
      return interrupts(passages[name]?.body ?? [], passages, seen);
    }
    if (n.t === 'block') return interrupts(n.body, passages, seen);
    if (n.t === 'if') return n.branches.some((b) => interrupts(b.body, passages, seen));
    return false;
  });
}

function findLink(out: Out[], id: number): Extract<Out, { t: 'link' }> | undefined {
  for (const o of out) {
    if (o.t === 'link' && o.id === id) return o;
    if (o.t === 'block' || o.t === 'group') {
      const inner = findLink(o.children, id);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** First title of a passage's output (its heading in the original). */
function titleKey(out: Out[]): string | undefined {
  for (const o of out) {
    if (o.t === 'text' && o.kind === 'title') return o.key;
    if (o.t === 'text') return undefined;
  }
  return undefined;
}

/**
 * The running game: loads the scenario, drives the story engine and saves progress after
 * every step. Also keeps the log book, records endings and plays voice-over and music.
 */
@Injectable({ providedIn: 'root' })
export class Game {
  private readonly saves = inject(SaveStore);
  private readonly settings = inject(Settings);
  private readonly audio = inject(AudioPlayer);

  readonly scenarioId = signal<ScenarioId>('cost-of-disease');
  /** Loaded content of the current scenario (undefined until loaded). */
  readonly content = signal<ScenarioContent | undefined>(undefined);
  private readonly loading = new Map<ScenarioId, Promise<ScenarioContent>>();

  readonly setup = signal<GameSetup | undefined>(undefined);
  readonly view = signal<StoryView | undefined>(undefined);
  /**
   * Passages entered so far: changes when the story moves on, not when a link reveals more
   * of the same page.
   */
  readonly visit = signal(0);
  readonly error = signal<string | undefined>(undefined);
  /** Log book: passages with an entry, in the order reached. */
  readonly log = signal<string[]>([]);
  /** Time spent in the storybook, in milliseconds (counted by the story page while visible). */
  readonly playTime = signal(0);
  /** Set when the passage just reached is an ending that was unlocked for the first time. */
  readonly newEnding = signal<string | undefined>(undefined);

  readonly playerNames = computed(() => this.setup()?.names.slice(0, this.setup()!.players) ?? []);
  readonly passage = computed(() => {
    const view = this.view();
    return view ? this.content()?.scenario.passages[view.passage] : undefined;
  });
  /** Hub passages (tag HUB) list a generation's activities; the original shows them on their own page. */
  readonly isHub = computed(() => this.passage()?.tags.includes('HUB') ?? false);
  readonly isEnding = computed(() => this.passage()?.tags.includes('ending') ?? false);

  /**
   * Rounds completed (of 9: three generations of three rounds), counted as end-of-round and
   * end-of-generation screens appear. Saved with the game and with each undo step.
   */
  readonly roundsDone = signal(0);
  /** Generation and round being played (from 1); none once the last generation ended. */
  readonly progress = computed(() => {
    const done = this.roundsDone();
    return done >= 9 ? undefined : { generation: Math.floor(done / 3) + 1, round: (done % 3) + 1 };
  });
  readonly title = computed(() => {
    const key = titleKey(this.view()?.output ?? []);
    return key ? this.text(key, 'title') : '';
  });

  private story?: Story;
  /** Last state without an open prompt – what a reload resumes from. */
  private lastSafe?: StorySnapshot;
  /** States before the last choices, newest last. */
  private readonly undoSteps = signal<UndoStep[]>([]);
  readonly canUndo = computed(() => this.undoSteps().length > 0);

  /** Looks up a string; placeholders are filled by the rich-text renderer. */
  text(key: string, kind: TextKind = 'instruction'): string {
    const strings = this.content()?.strings;
    return strings ? resolveText(strings, key, this.settings.readingMode(), kind) : '';
  }

  async hasSave(): Promise<boolean> {
    return !!(await this.saves.load(this.scenarioId()));
  }

  async newGame(setup: GameSetup): Promise<void> {
    const content = await this.loadContent();
    const vars: Record<string, Value> = { players: setup.players, townname: setup.village };
    'ABCDE'
      .split('')
      .forEach((letter, i) => (vars[`name${letter}`] = i < setup.players ? setup.names[i]! : ''));
    this.story = new Story(content.scenario, { vars });
    // Ask the browser not to clear saves when storage runs low (some browsers ask the user).
    void navigator.storage?.persist?.().catch(() => false);
    this.setup.set(setup);
    this.log.set([]);
    this.roundsDone.set(0);
    this.playTime.set(0);
    this.undoSteps.set([]);
    this.audio.playMusic(this.scenarioId());
    this.step(() => this.story!.start());
  }

  /** Continues the saved game; false when there is none. */
  async resume(): Promise<boolean> {
    const saved = await this.saves.load(this.scenarioId());
    if (!saved) return false;
    const content = await this.loadContent();
    this.story = new Story(content.scenario);
    this.setup.set(saved.setup);
    this.log.set(saved.log);
    this.roundsDone.set(saved.roundsDone ?? 0);
    this.playTime.set(saved.playTime ?? 0);
    this.undoSteps.set(saved.undo ?? []);
    this.audio.playMusic(this.scenarioId());
    this.step(() => this.story!.restore(saved.snapshot), false);
    // The page's voice-over starts again, as when it was first reached.
    const passage = this.view()?.passage;
    if (passage) this.audio.playVoice(passage, this.voiceMode(passage));
    return true;
  }

  async abandon(): Promise<void> {
    await this.saves.remove(this.scenarioId());
    this.story = undefined;
    this.view.set(undefined);
    this.log.set([]);
    this.undoSteps.set([]);
  }

  /** Adds elapsed time; saves now and then so a closed tab loses little. */
  tick(ms: number): void {
    const before = this.playTime();
    this.playTime.set(before + ms);
    if (Math.floor(before / 30_000) !== Math.floor((before + ms) / 30_000)) void this.persist();
  }

  /**
   * Follows a link. `undoable: false` folds it into the previous choice, for a step the app
   * takes for the players (see Play.showPage): undo then skips the page it leaves.
   */
  click(link: number, values?: Record<string, Value>, undoable = true): void {
    if (undoable) this.remember();
    this.step(() => this.story!.click(link, values));
  }

  /**
   * Development only (see Play): jumps to a passage. Within a game the variables stay as they
   * are; without one, a test game with three players starts first.
   */
  async jumpTo(passage: string): Promise<void> {
    if (!this.story) {
      await this.newGame({
        players: 3,
        names: ['Ada', 'Bram', 'Cosima', 'Dara', 'Emil'],
        village: 'Testville',
      });
    }
    this.remember();
    // The round count only grows as end-of-round screens appear; a jump skips them, so the
    // count is taken from the page: one round before the end of round it leads to.
    const ends: number[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      const n = node as { t?: string; ui?: string; args?: Record<string, { lit?: unknown }> };
      const progress = n.args?.['progress']?.lit;
      const round =
        n.t === 'ui' && n.ui === 'endOfRound'
          ? this.content()?.extras.endOfRound[String(progress)]?.round
          : undefined;
      if (round) ends.push(round);
      Object.values(node).forEach(visit);
    };
    visit(this.content()?.scenario.passages[passage]);
    if (ends.length) this.roundsDone.set(Math.min(...ends) - 1);
    this.step(() => this.story!.start(passage));
  }

  /**
   * Goes back to the page before the last choice. A prompt's answer belongs to the choice that
   * opened it, so undoing after an answer returns to before that choice.
   */
  undo(): void {
    const steps = this.undoSteps();
    const last = steps.at(-1);
    if (!last || !this.story) return;
    this.undoSteps.set(steps.slice(0, -1));
    this.log.set(last.log);
    this.roundsDone.set(last.roundsDone ?? 0);
    this.audio.stopVoice();
    this.step(() => this.story!.restore(last.snapshot), false);
  }

  /** Remembers the current page before a choice (not while a prompt waits: see undo). */
  private remember(): void {
    if (!this.lastSafe || this.view()?.prompt) return;
    this.undoSteps.update((steps) =>
      [
        ...steps,
        { snapshot: this.lastSafe!, log: this.log(), roundsDone: this.roundsDone() },
      ].slice(-UNDO_LIMIT),
    );
  }

  answer(value: Value): void {
    this.step(() => this.story!.answer(value));
  }

  private step(action: () => StoryView, entering = true): void {
    const before = this.story?.history.length ?? 0;
    try {
      const view = this.revealPlainContinues(action());
      this.error.set(undefined);
      // The engine reuses its output tree; hand the UI a copy so signals see a change.
      this.view.set({ ...view, output: structuredClone(view.output) });
      this.visit.set(this.story!.history.length);
      this.countRounds(view.output);
      if (!view.prompt) this.lastSafe = this.story!.snapshot();
      if (entering) this.entered(this.story!.history.slice(before));
      void this.persist();
    } catch (e) {
      if (!(e instanceof StoryError) && !(e instanceof TypeError) && !(e instanceof RangeError))
        throw e;
      this.error.set(e.message);
    }
  }

  /**
   * Shows each page at once: opens reveals whose label only says "continue" and whose content
   * stays on the page – the reader would click them anyway. Reveals with their own label
   * (often hiding something from the other players), jumps and prompts still wait.
   */
  private revealPlainContinues(view: StoryView): StoryView {
    const passages = this.content()?.scenario.passages ?? {};
    for (let i = 0; i < 30 && !view.prompt; i++) {
      const next = view.links.find((id) => {
        const target = this.story!.linkTarget(id);
        if (!target?.reveal || !target.replace) return false;
        const out = findLink(view.output, id);
        if (!out || !PLAIN_CONTINUE.test(this.text(out.key).replace(/[*\\]/g, '').trim()))
          return false;
        const fragment = passages[target.revealFrom!]?.fragments[target.reveal];
        return !!fragment && !interrupts(fragment, passages);
      });
      if (next === undefined) break;
      view = this.story!.click(next);
    }
    return view;
  }

  /** Bookkeeping for passages just entered: log book, voice-over, endings. */
  private entered(passages: string[]): void {
    if (!passages.length) return;
    const extras = this.content()?.extras;
    const logged = passages.filter((p) => extras?.logBook[p]);
    if (logged.length)
      this.log.update((log) => [...log, ...logged.filter((p) => log.at(-1) !== p)]);

    const current = passages.at(-1)!;
    this.audio.playVoice(current, this.voiceMode(current));
    this.newEnding.set(undefined);
    if (this.content()?.scenario.passages[current]?.tags.includes('ending')) {
      this.audio.playEndingMusic();
      void this.saves
        .unlock(this.scenarioId(), current)
        .then((first) => first && this.newEnding.set(current));
    }
  }

  /**
   * Moves the round count on for an end-of-round or end-of-generation screen on the page. Each
   * says how many rounds are done; 0 means "this generation's third round". A screen counts only
   * when it is the next step, so showing the same page again changes nothing.
   */
  private countRounds(output: Out[]): void {
    const extras = this.content()?.extras;
    const done = this.roundsDone();
    const marks: number[] = [];
    const visit = (items: Out[]): void => {
      for (const o of items) {
        if (o.t === 'ui' && o.ui === 'endOfRound') {
          const round = extras?.endOfRound[String(o.args['progress'] ?? '')]?.round;
          if (round !== undefined) marks.push(round === 0 ? (Math.floor(done / 3) + 1) * 3 : round);
        } else if (o.t === 'ui' && o.ui === 'endOfGeneration') {
          marks.push(Number(o.args['generation']));
        } else if (o.t === 'block' || o.t === 'group') visit(o.children);
      }
    };
    visit(output);
    const next = marks.filter((m) => m > done).sort((a, b) => a - b)[0];
    if (next !== undefined) this.roundsDone.set(next);
  }

  /** The reading mode whose text a passage shows: the setting, or `full` without own text. */
  private voiceMode(name: string): ReadingMode {
    const mode = this.settings.readingMode();
    const strings = this.content()?.strings;
    const body = this.content()?.scenario.passages[name]?.body ?? [];
    const differs = body.some(
      (n) =>
        n.t === 'text' &&
        n.kind === 'narrative' &&
        strings &&
        resolveText(strings, n.key, mode) !== strings[n.key]?.full,
    );
    return differs ? mode : 'full';
  }

  /** Saves the game now (also called when leaving the storybook or hiding the app). */
  async persist(): Promise<void> {
    const setup = this.setup();
    if (!setup || !this.lastSafe) return;
    await this.saves.save({
      scenario: this.scenarioId(),
      setup,
      snapshot: this.lastSafe,
      log: this.log(),
      roundsDone: this.roundsDone(),
      playTime: this.playTime(),
      undo: this.undoSteps(),
      savedAt: Date.now(),
    });
  }

  /** Loads (once) and returns the current scenario's content. */
  async loadContent(): Promise<ScenarioContent> {
    const id = this.scenarioId();
    let loading = this.loading.get(id);
    if (!loading) {
      loading = loadContent(id, new AbortController().signal);
      this.loading.set(id, loading);
    }
    const content = await loading;
    this.content.set(content);
    return content;
  }
}
