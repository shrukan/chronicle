import { inject, Injectable } from '@angular/core';
import { summarizeSave, type SaveSummary } from '../utils/save-migration';
import { isScenarioId } from './content';
import { Game } from './game';
import { SaveStore } from './save-store';

/** The games saved on this device, as the main menu and the list of saved games show them. */
@Injectable({ providedIn: 'root' })
export class SavedGames {
  private readonly store = inject(SaveStore);
  private readonly game = inject(Game);

  /** Every saved game, most recently played first. */
  async list(): Promise<SaveSummary[]> {
    const summaries: SaveSummary[] = [];
    for (const raw of await this.store.list()) {
      const scenario = (raw as { scenario?: unknown } | undefined)?.scenario;
      if (!isScenarioId(scenario)) continue;
      const content = await this.game.contentOf(scenario);
      const summary = summarizeSave(raw, content.scenario);
      if (summary) summaries.push(summary);
    }
    return summaries.sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Deletes a saved game; the one being played is left first. */
  async remove(id: string): Promise<void> {
    if (this.game.saveId() === id) this.game.close();
    await this.store.remove(id);
  }
}
