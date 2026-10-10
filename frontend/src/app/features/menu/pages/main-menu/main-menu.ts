import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AudioPlayer } from '../../../../core/services/audio';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import { WhatsNew } from '../../../../core/services/whats-new';
import { Modal } from '../../../../shared/components/modal/modal';
import { SettingsPanel } from '../../../../shared/components/settings-panel/settings-panel';
import { TitleScene } from '../../components/title-scene/title-scene';

/** Title screen, laid out like the original's: continue, new game, settings, endings, help. */
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
  private readonly game = inject(Game);
  private readonly router = inject(Router);
  private readonly audio = inject(AudioPlayer);

  protected readonly hasSave = resource({ loader: () => this.game.hasSave() });
  protected readonly confirmOpen = signal(false);
  protected readonly settingsOpen = signal(false);

  protected t(key: string, fallback: string): string {
    return this.library.text(key, fallback);
  }

  protected async resume(): Promise<void> {
    this.audio.effect('welcome');
    if (await this.game.resume()) await this.router.navigate(['/play']);
  }

  protected newGame(): void {
    // Starting over would overwrite the saved game – ask first, like the original.
    if (this.hasSave.value()) this.confirmOpen.set(true);
    else void this.startOver();
  }

  protected async startOver(): Promise<void> {
    this.confirmOpen.set(false);
    await this.game.abandon();
    this.audio.effect('welcome');
    await this.router.navigate(['/setup']);
  }
}
