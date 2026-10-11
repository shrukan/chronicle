import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppUpdate } from '../../../../core/services/app-update';
import { AudioPlayer } from '../../../../core/services/audio';
import { SCENARIOS } from '../../../../core/services/content';
import { Game, NOT_RESUMED } from '../../../../core/services/game';
import { SavedGames } from '../../../../core/services/saved-games';
import { generationNumeral, ROUNDS, roundPosition } from '../../../../core/utils/rounds';
import type { SaveSummary } from '../../../../core/utils/save-migration';
import { Modal } from '../../../../shared/components/modal/modal';
import { formatDuration } from '../../../../shared/utils/duration';

const lastPlayed = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Where a saved game stands, without giving the story away. */
function standing(save: SaveSummary): string {
  if (save.status !== 'ok') return NOT_RESUMED[save.status];
  if (save.finished) return 'Finished';
  if (save.roundsDone >= ROUNDS) return 'Final scoring';
  const { generation, round } = roundPosition(save.roundsDone + 1);
  return `Generation ${generationNumeral(generation)}, round ${round}`;
}

/** The games saved on this device: continue one, or delete it. */
@Component({
  selector: 'cr-saved-games',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, RouterLink],
  templateUrl: './saved-games.html',
  styleUrl: './saved-games.css',
})
export class SavedGamesPage {
  private readonly savedGames = inject(SavedGames);
  private readonly game = inject(Game);
  private readonly router = inject(Router);
  private readonly audio = inject(AudioPlayer);
  private readonly appUpdate = inject(AppUpdate);

  private readonly saves = resource({ loader: () => this.savedGames.list() });
  protected readonly loaded = computed(() => this.saves.hasValue());
  protected readonly items = computed(() =>
    (this.saves.value() ?? []).map((save) => ({
      ...save,
      title: SCENARIOS.find((s) => s.id === save.scenario)?.title ?? save.scenario,
      standing: standing(save),
      lastPlayed: lastPlayed.format(save.savedAt),
      played: formatDuration(save.playTime),
    })),
  );
  /** The saved game whose deletion waits for confirmation. */
  protected readonly toDelete = signal<SaveSummary | undefined>(undefined);

  protected async open(id: string): Promise<void> {
    this.audio.effect('welcome');
    if ((await this.game.resume(id)) === 'resumed') await this.router.navigate(['/play']);
    else this.saves.reload();
  }

  protected async remove(): Promise<void> {
    const save = this.toDelete();
    this.toDelete.set(undefined);
    if (!save) return;
    await this.savedGames.remove(save.id);
    this.saves.reload();
  }

  /** A newer version saved the game: fetch it and switch to it. */
  protected async update(): Promise<void> {
    await this.appUpdate.check();
    await this.appUpdate.reload();
  }
}
