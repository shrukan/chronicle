import { computed, inject, Injectable, signal } from '@angular/core';
import {
  resolveText,
  Story,
  StoryError,
  type Out,
  type StorySnapshot,
  type StoryView,
  type TextKind,
  type Value,
} from '@chronicle/engine';
import { AudioPlayer } from './audio';
import { loadContent, type ScenarioContent, type ScenarioId } from './content';
import { SaveStore, type GameSetup } from './save-store';
import { Settings } from './settings';

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
  readonly title = computed(() => {
    const key = titleKey(this.view()?.output ?? []);
    return key ? this.text(key, 'title') : '';
  });

  private story?: Story;
  /** Last state without an open prompt – what a reload resumes from. */
  private lastSafe?: StorySnapshot;

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
    this.setup.set(setup);
    this.log.set([]);
    this.playTime.set(0);
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
    this.playTime.set(saved.playTime ?? 0);
    this.audio.playMusic(this.scenarioId());
    this.step(() => this.story!.restore(saved.snapshot), false);
    return true;
  }

  async abandon(): Promise<void> {
    await this.saves.remove(this.scenarioId());
    this.story = undefined;
    this.view.set(undefined);
    this.log.set([]);
  }

  /** Adds elapsed time; saves now and then so a closed tab loses little. */
  tick(ms: number): void {
    const before = this.playTime();
    this.playTime.set(before + ms);
    if (Math.floor(before / 30_000) !== Math.floor((before + ms) / 30_000)) void this.persist();
  }

  click(link: number, values?: Record<string, Value>): void {
    this.step(() => this.story!.click(link, values));
  }

  answer(value: Value): void {
    this.step(() => this.story!.answer(value));
  }

  private step(action: () => StoryView, entering = true): void {
    const before = this.story?.history.length ?? 0;
    try {
      const view = action();
      this.error.set(undefined);
      // The engine reuses its output tree; hand the UI a copy so signals see a change.
      this.view.set({ ...view, output: structuredClone(view.output) });
      if (!view.prompt) this.lastSafe = this.story!.snapshot();
      if (entering) this.entered(this.story!.history.slice(before));
      void this.persist();
    } catch (e) {
      if (!(e instanceof StoryError) && !(e instanceof TypeError) && !(e instanceof RangeError))
        throw e;
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
    this.audio.playVoice(current);
    this.newEnding.set(undefined);
    if (this.content()?.scenario.passages[current]?.tags.includes('ending')) {
      this.audio.playEndingMusic();
      void this.saves
        .unlock(this.scenarioId(), current)
        .then((first) => first && this.newEnding.set(current));
    }
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
      playTime: this.playTime(),
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
