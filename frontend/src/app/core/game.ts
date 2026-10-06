import { computed, inject, Injectable, signal } from '@angular/core';
import {
  resolveText,
  Story,
  StoryError,
  type ReadingMode,
  type StorySnapshot,
  type StoryView,
  type TextKind,
  type Value,
} from '@chronicle/engine';
import { loadContent, type ScenarioContent, type ScenarioId } from './content';
import { SaveStore, type GameSetup } from './save-store';

/**
 * The running game: loads the scenario, drives the story engine and saves progress after
 * every step. Components read signals and call `click` / `answer`.
 */
@Injectable({ providedIn: 'root' })
export class Game {
  private readonly saves = inject(SaveStore);

  readonly scenarioId = signal<ScenarioId>('cost-of-disease');
  /** Loaded content of the current scenario (undefined until loaded). */
  readonly content = signal<ScenarioContent | undefined>(undefined);
  private readonly loading = new Map<ScenarioId, Promise<ScenarioContent>>();
  readonly readingMode = signal<ReadingMode>('full');

  readonly setup = signal<GameSetup | undefined>(undefined);
  readonly view = signal<StoryView | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly playerNames = computed(() => this.setup()?.names.slice(0, this.setup()!.players) ?? []);

  private story?: Story;
  /** Last state without an open prompt – what a reload resumes from. */
  private lastSafe?: StorySnapshot;

  /** Looks up a string; placeholders are filled by the rich-text renderer. */
  text(key: string, kind: TextKind = 'instruction'): string {
    const strings = this.content()?.strings;
    return strings ? resolveText(strings, key, this.readingMode(), kind) : '';
  }

  async hasSave(): Promise<boolean> {
    return !!(await this.saves.load(this.scenarioId()));
  }

  async newGame(setup: GameSetup): Promise<void> {
    const content = await this.ready();
    const vars: Record<string, Value> = { players: setup.players, townname: setup.village };
    'ABCDE'
      .split('')
      .forEach((letter, i) => (vars[`name${letter}`] = i < setup.players ? setup.names[i]! : ''));
    this.story = new Story(content.scenario, { vars });
    this.setup.set(setup);
    this.step(() => this.story!.start());
  }

  /** Continues the saved game; false when there is none. */
  async resume(): Promise<boolean> {
    const saved = await this.saves.load(this.scenarioId());
    if (!saved) return false;
    const content = await this.ready();
    this.story = new Story(content.scenario);
    this.setup.set(saved.setup);
    this.step(() => this.story!.restore(saved.snapshot));
    return true;
  }

  async abandon(): Promise<void> {
    await this.saves.remove(this.scenarioId());
    this.story = undefined;
    this.view.set(undefined);
  }

  click(link: number, values?: Record<string, Value>): void {
    this.step(() => this.story!.click(link, values));
  }

  answer(value: Value): void {
    this.step(() => this.story!.answer(value));
  }

  private step(action: () => StoryView): void {
    try {
      const view = action();
      this.error.set(undefined);
      // The engine reuses its output tree; hand the UI a copy so signals see a change.
      this.view.set({ ...view, output: structuredClone(view.output) });
      if (!view.prompt) this.lastSafe = this.story!.snapshot();
      void this.persist();
    } catch (e) {
      if (!(e instanceof StoryError) && !(e instanceof TypeError) && !(e instanceof RangeError))
        throw e;
      this.error.set(e.message);
    }
  }

  private async persist(): Promise<void> {
    const setup = this.setup();
    if (!setup || !this.lastSafe) return;
    await this.saves.save({
      scenario: this.scenarioId(),
      setup,
      snapshot: this.lastSafe,
      savedAt: Date.now(),
    });
  }

  private async ready(): Promise<ScenarioContent> {
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
