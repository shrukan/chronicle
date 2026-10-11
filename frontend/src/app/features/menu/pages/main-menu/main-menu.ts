import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AudioPlayer } from '../../../../core/services/audio';
import { Game } from '../../../../core/services/game';
import { Install } from '../../../../core/services/install';
import { Library } from '../../../../core/services/library';
import { SavedGames } from '../../../../core/services/saved-games';
import { WhatsNew } from '../../../../core/services/whats-new';
import { Modal } from '../../../../shared/components/modal/modal';
import { SettingsPanel } from '../../../../shared/components/settings-panel/settings-panel';
import { TitleScene } from '../../components/title-scene/title-scene';

/**
 * Title screen, laid out like the original's: continue, new game, settings, endings, help – and
 * the saved games, since several can be kept.
 */
@Component({
  selector: 'cr-main-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus, RouterLink, Modal, SettingsPanel, TitleScene],
  templateUrl: './main-menu.html',
  styleUrl: './main-menu.css',
})
export class MainMenu {
  protected readonly library = inject(Library);
  protected readonly whatsNew = inject(WhatsNew);
  protected readonly install = inject(Install);
  private readonly game = inject(Game);
  private readonly router = inject(Router);
  private readonly audio = inject(AudioPlayer);
  private readonly savedGames = inject(SavedGames);

  protected readonly saves = resource({ loader: () => this.savedGames.list() });
  /** Continue picks up the game played last that isn't over and still fits the story. */
  protected readonly toContinue = computed(() =>
    this.saves.value()?.find((s) => s.status === 'ok' && !s.finished),
  );
  protected readonly settingsOpen = signal(false);

  protected t(key: string, fallback: string): string {
    return this.library.text(key, fallback);
  }

  protected async resume(): Promise<void> {
    const save = this.toContinue();
    if (!save) return;
    this.audio.effect('welcome');
    if ((await this.game.resume(save.id)) === 'resumed') await this.router.navigate(['/play']);
    else this.saves.reload();
  }

  /** A new game is saved next to the others; the one being played stays saved. */
  protected async newGame(): Promise<void> {
    this.game.close();
    this.audio.effect('welcome');
    await this.router.navigate(['/setup']);
  }
}
