import { Autofocus } from '../ui/autofocus';
import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AudioPlayer } from '../core/audio';
import { Game } from '../core/game';
import { Library } from '../core/library';
import { WhatsNew } from '../core/whats-new';
import { Modal } from '../ui/modal';
import { SettingsPanel } from '../ui/settings-panel';

/** Title screen: continue, new game, endings, settings, help. */
@Component({
  selector: 'cr-main-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus, RouterLink, Modal, SettingsPanel],
  template: `
    <section class="menu">
      @if (library.ui('general/myfatherswork-logo'); as logo) {
        <img class="logo" [src]="logo" alt="My Father's Work" />
      } @else {
        <h1 class="heading">My Father's Work</h1>
      }
      <p class="sub">Chronicle · an unofficial companion app</p>

      @if (whatsNew.unseen()) {
        <p class="updated" role="status">
          <span>Chronicle has been updated to {{ whatsNew.version }}.</span>
          <a routerLink="/whats-new">See what's new</a>
          <button
            type="button"
            class="dismiss"
            (click)="whatsNew.markSeen()"
            aria-label="Dismiss the update note"
          >
            ×
          </button>
        </p>
      }

      <nav class="buttons">
        @if (hasSave.value()) {
          <button crAutofocus type="button" class="btn" (click)="resume()">
            {{ t('UI/MainMenu/Viewarea/GridButtons/Continue/Text (TMP)', 'Continue') }}
          </button>
        }
        <button type="button" class="btn" (click)="newGame()">
          {{ t('UI/MainMenu/Viewarea/GridButtons/NewGame/Text (TMP)', 'New game') }}
        </button>
        <a class="btn quiet" routerLink="/endings">{{
          t('UI/MainMenu/Viewarea/GridButtons/Endings/Text (TMP)', 'Endings')
        }}</a>
        <button type="button" class="btn quiet" (click)="settingsOpen.set(true)">
          {{ t('UI/MainMenu/Viewarea/GridButtons/Setting/Text (TMP)', 'Settings') }}
        </button>
        <a class="btn quiet" routerLink="/help">{{
          t('UI/Help/Viewarea/HowToUSe/HowToUSebtn/howtouseText', 'How to use')
        }}</a>
      </nav>
    </section>

    <cr-modal
      [open]="confirmOpen()"
      [dismissable]="true"
      (closed)="confirmOpen.set(false)"
      label="Start a new game"
    >
      <p class="confirm">
        {{
          t(
            'UI/MainMenu/Viewarea/RewriteData UI/RewriteData Panel/PanelBG/RewriteText',
            'Rewrite existing data?'
          )
        }}
      </p>
      <div class="row">
        <button type="button" class="btn quiet" (click)="confirmOpen.set(false)">
          {{
            t(
              'UI/MainMenu/Viewarea/RewriteData UI/RewriteData Panel/PanelBG/CancleButton/Text (TMP)',
              'Cancel'
            )
          }}
        </button>
        <button type="button" class="btn" (click)="startOver()">
          {{
            t(
              'UI/MainMenu/Viewarea/RewriteData UI/RewriteData Panel/PanelBG/OkButton/Text (TMP)',
              'Confirm'
            )
          }}
        </button>
      </div>
    </cr-modal>

    <cr-modal
      [open]="settingsOpen()"
      [dismissable]="true"
      (closed)="settingsOpen.set(false)"
      label="Settings"
    >
      <cr-settings-panel (done)="settingsOpen.set(false)" />
    </cr-modal>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 70dvh;
    }
    .menu {
      display: grid;
      justify-items: center;
      gap: 1rem;
      text-align: center;
    }
    .logo {
      width: min(22rem, 80vw);
      /* Shrinks on short windows so the menu and footer fit without scrolling. */
      max-height: 30dvh;
      object-fit: contain;
      filter: drop-shadow(0 0.5rem 1rem rgb(0 0 0 / 0.6));
    }
    h1 {
      font-size: 3rem;
      color: var(--color-on-backdrop);
    }
    .sub {
      margin: -0.5rem 0 1rem;
      font-style: italic;
      opacity: 0.75;
    }
    /* After an update, until the notes are read or dismissed. */
    .updated {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.25rem 0.75rem;
      margin: -0.5rem 0 0.5rem;
      padding: 0.35rem 0.5rem 0.35rem 1rem;
      border: 1px solid rgb(233 223 201 / 0.35);
      border-radius: 0.5rem;
      background: rgb(0 0 0 / 0.35);
    }
    .updated a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
    .dismiss {
      width: 2rem;
      height: 2rem;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
    }
    .dismiss:hover,
    .dismiss:focus-visible {
      background: rgb(255 255 255 / 0.12);
    }
    .buttons {
      display: grid;
      gap: 0.75rem;
      width: min(18rem, 80vw);
    }
    .confirm {
      margin: 0 0 1.25rem;
      font-size: 1.2rem;
      text-align: center;
    }
    .row {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
    }
  `,
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
