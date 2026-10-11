import { computed, inject, Injectable, signal } from '@angular/core';
import {
  resolveText,
  PLAYER_NAME_VARIABLES,
  Story,
  StoryError,
  ValueError,
  type Out,
  type ReadingMode,
  type StorySnapshot,
  type StoryView,
  type TextKind,
  type Value,
} from '@chronicle/engine';
import { AudioPlayer } from './audio';
import { isScenarioId, loadContent, type ScenarioContent, type ScenarioId } from './content';
import { boxOnly, revealPlainContinues, takeBoxesTogether } from '../utils/auto-steps';
import { ROUNDS, roundPosition, roundsAfter } from '../utils/rounds';
import { migrateSave } from '../utils/save-migration';
import { titleKey } from '../utils/story-output';
import { newSaveId, SAVE_VERSION, SaveStore, type GameSetup, type UndoStep } from './save-store';
import { Settings } from './settings';

/**
 * What became of continuing the saved game: `none` when there is none, `changed` when the story
 * changed in an update so that it can't continue, `newer` when a newer version of the app saved it.
 */
export type ResumeResult = 'resumed' | 'none' | 'changed' | 'newer';

/** What to tell the players when the saved game can't be continued. */
export const NOT_RESUMED: Record<'changed' | 'newer', string> = {
  changed: 'The story has changed in an update since it was saved.',
  newer: 'A newer version of Chronicle saved it. Reload to update, then continue.',
};

/** How many choices can be undone. */
const UNDO_LIMIT = 10;
/** How long after a page change a tap is taken for the second half of a double tap. */
const TAP_GUARD_MS = 350;

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
  /** Id of the saved game being played (several can be saved; see SavedGames). */
  readonly saveId = signal<string | undefined>(undefined);
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
   * Rounds completed (of `ROUNDS`: three generations of three), counted as end-of-round and
   * end-of-generation screens appear. Saved with the game and with each undo step.
   */
  readonly roundsDone = signal(0);
  /** Generation and round being played (from 1); none once the last generation ended. */
  readonly progress = computed(() => {
    const done = this.roundsDone();
    return done >= ROUNDS ? undefined : roundPosition(done + 1);
  });
  readonly title = computed(() => {
    const key = titleKey(this.view()?.output ?? []);
    return key ? this.text(key, 'title') : '';
  });

  private story?: Story;
  /**
   * Boxes of the steps taken together with the current page: a box's Accept that only leads to
   * another box is taken at once, and both show on one page (see `takeBoxesTogether`).
   */
  private carried: Out[] = [];
  /** When the current page was shown (see `tap`). */
  private shownAt = 0;
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

  /** Starts a game of the current scenario; it is saved next to the games saved before. */
  async newGame(setup: GameSetup): Promise<void> {
    const content = await this.loadContent();
    this.saveId.set(newSaveId());
    const vars: Record<string, Value> = { players: setup.players, townname: setup.village };
    PLAYER_NAME_VARIABLES.forEach((v, i) => (vars[v] = i < setup.players ? setup.names[i]! : ''));
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

  /** Continues a saved game, if it fits the current story. */
  async resume(id: string): Promise<ResumeResult> {
    const raw = await this.saves.load(id);
    const scenario = (raw as { scenario?: unknown } | undefined)?.scenario;
    if (!isScenarioId(scenario)) return 'none';
    this.scenarioId.set(scenario);
    const content = await this.loadContent();
    const loaded = migrateSave(raw, content.scenario);
    if (!loaded) return 'none';
    // Not logged: the problems name passages, which would give the story away.
    if (loaded.status !== 'ok') return loaded.status;
    const saved = loaded.save;
    this.saveId.set(saved.id);
    this.story = new Story(content.scenario);
    this.setup.set(saved.setup);
    this.log.set(saved.log);
    this.roundsDone.set(saved.roundsDone);
    this.playTime.set(saved.playTime);
    this.undoSteps.set(saved.undo);
    this.audio.playMusic(this.scenarioId());
    this.step(() => this.story!.restore(saved.snapshot), false, saved.carried);
    // The page's voice-over starts again, as when it was first reached.
    const passage = this.view()?.passage;
    if (passage) this.audio.playVoice(passage, this.voiceMode(passage));
    return 'resumed';
  }

  /** Leaves the game being played (it stays saved), e.g. before starting another one. */
  close(): void {
    this.story = undefined;
    this.saveId.set(undefined);
    this.setup.set(undefined);
    this.lastSafe = undefined;
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
   * A player's tap on the page. Taps right after the page changed are ignored: a double tap
   * would otherwise also take the first link of the next page, unseen.
   */
  tap(link: number): void {
    if (performance.now() - this.shownAt < TAP_GUARD_MS) return;
    this.click(link);
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
    this.roundsDone.set(last.roundsDone);
    this.audio.stopVoice();
    this.step(() => this.story!.restore(last.snapshot), false, last.carried);
  }

  /** Remembers the current page before a choice (not while a prompt waits: see undo). */
  private remember(): void {
    if (!this.lastSafe || this.view()?.prompt) return;
    this.undoSteps.update((steps) =>
      [
        ...steps,
        {
          snapshot: this.lastSafe!,
          log: this.log(),
          roundsDone: this.roundsDone(),
          carried: this.carried,
        },
      ].slice(-UNDO_LIMIT),
    );
  }

  answer(value: Value): void {
    this.step(() => this.story!.answer(value));
  }

  private step(action: () => StoryView, entering = true, carried: Out[] = []): void {
    const before = this.story?.history.length ?? 0;
    try {
      const story = this.story!;
      const passages = this.content()?.scenario.passages ?? {};
      const taken = takeBoxesTogether(
        story,
        passages,
        revealPlainContinues(story, passages, action()),
        carried,
      );
      this.carried = taken.carried;
      const view = { ...taken.view, output: [...taken.carried, ...taken.view.output] };
      this.error.set(undefined);
      // The engine reuses its output tree; hand the UI a copy so signals see a change.
      this.view.set({ ...view, output: structuredClone(view.output) });
      this.shownAt = performance.now();
      this.visit.set(story.history.length);
      const endOfRound = this.content()?.extras.endOfRound ?? {};
      this.roundsDone.set(roundsAfter(view.output, this.roundsDone(), endOfRound));
      if (!view.prompt) this.lastSafe = story.snapshot();
      if (entering) this.entered(story.history.slice(before));
      void this.persist();
    } catch (e) {
      // Errors in the story data are shown on the page; anything else is a bug in the app.
      if (!(e instanceof StoryError) && !(e instanceof ValueError)) throw e;
      this.error.set(e.message);
    }
  }

  /** Bookkeeping for passages just entered: log book, voice-over, endings. */
  private entered(passages: string[]): void {
    if (!passages.length) return;
    const extras = this.content()?.extras;
    const logged = passages.filter((p) => extras?.logBook[p]);
    if (logged.length)
      this.log.update((log) => [...log, ...logged.filter((p) => log.at(-1) !== p)]);

    const current = passages.at(-1)!;
    // Boxes taken together with a story page are read on it: its voice-over plays.
    const all = this.content()?.scenario.passages ?? {};
    const page = [...passages].reverse().find((p) => !boxOnly(all[p])) ?? current;
    this.audio.playVoice(page, this.voiceMode(page));
    this.newEnding.set(undefined);
    if (this.content()?.scenario.passages[current]?.tags.includes('ending')) {
      this.audio.playEndingMusic();
      void this.saves
        .unlock(this.scenarioId(), current)
        .then((first) => first && this.newEnding.set(current));
    }
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
    const [id, setup] = [this.saveId(), this.setup()];
    if (!id || !setup || !this.lastSafe) return;
    await this.saves.save({
      version: SAVE_VERSION,
      id,
      scenario: this.scenarioId(),
      setup,
      snapshot: this.lastSafe,
      log: this.log(),
      roundsDone: this.roundsDone(),
      carried: this.carried,
      playTime: this.playTime(),
      undo: this.undoSteps(),
      savedAt: Date.now(),
    });
  }

  /** Loads (once) and returns the current scenario's content. */
  async loadContent(): Promise<ScenarioContent> {
    const content = await this.contentOf(this.scenarioId());
    this.content.set(content);
    return content;
  }

  /** Loads (once) a scenario's content, without making it the current one. */
  contentOf(id: ScenarioId): Promise<ScenarioContent> {
    let loading = this.loading.get(id);
    if (!loading) {
      loading = loadContent(id);
      this.loading.set(id, loading);
    }
    return loading;
  }
}
