import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { AudioPlayer } from '../core/audio';
import { Game } from '../core/game';
import { Library } from '../core/library';
import { LogBook } from '../story/log-book';
import { RichText } from '../story/rich-text';
import { StoryOutput } from '../story/story-output';
import { Modal } from '../ui/modal';
import { SettingsPanel } from '../ui/settings-panel';

/** The storybook: current passage, log book, pause menu, prompts and endings. */
@Component({
  selector: 'cr-play',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoryOutput, RichText, FormField, FormRoot, Modal, SettingsPanel, LogBook, RouterLink],
  template: `
    @if (game.view(); as view) {
      <header class="bar">
        <button type="button" class="icon-btn" (click)="logOpen.set(true)" aria-label="Log book">
          @if (library.ui('general/book-icon-1'); as src) {
            <img [src]="src" alt="" />
          } @else {
            📖
          }
        </button>
        <h1 class="heading title" [class.hub]="game.isHub()">
          @if (game.title()) {
            <cr-rich-text [text]="game.title()" />
          }
        </h1>
        <button type="button" class="icon-btn" (click)="pauseOpen.set(true)" aria-label="Menu">
          ☰
        </button>
      </header>

      <article class="paper passage" [class.hub]="game.isHub()" aria-live="polite">
        <cr-story-output [items]="body()" />

        @if (view.prompt; as prompt) {
          <form class="prompt" [formRoot]="answerForm">
            <label for="answer"
              ><cr-rich-text [text]="game.text(prompt.key)" [args]="prompt.args"
            /></label>
            <div class="row">
              <input
                id="answer"
                [type]="prompt.input === 'number' ? 'number' : 'text'"
                [formField]="answerForm.value"
                autocomplete="off"
              />
              <button type="submit" class="btn" [disabled]="answerForm().invalid()">OK</button>
            </div>
          </form>
        }

        @if (game.isEnding()) {
          <footer class="ending">
            @if (game.newEnding(); as passage) {
              <p class="unlocked">
                {{ library.text('@ViewShareEnding.unlockedText', 'You have unlocked') }}
                <strong>{{ endingTitle(passage) }}</strong>
                {{ library.text('@ViewShareEnding.EndingText', 'ending.') }}
              </p>
            }
            <div class="row">
              <a class="btn quiet" routerLink="/endings">Endings</a>
              <button type="button" class="btn" (click)="toTitle()">Return to title</button>
            </div>
          </footer>
        }

        @if (game.error(); as error) {
          <p class="error" role="alert">{{ error }}</p>
        }
      </article>

      <cr-modal
        [open]="logOpen()"
        [dismissable]="true"
        (closed)="logOpen.set(false)"
        label="Log book"
      >
        <cr-log-book (done)="logOpen.set(false)" />
      </cr-modal>

      <cr-modal
        [open]="pauseOpen()"
        [dismissable]="true"
        (closed)="pauseOpen.set(false)"
        label="Paused"
      >
        <h2 class="heading paused">
          {{
            library.text(
              'UI/GanrationEnding/Viewarea/PausePopup/Settings Panel/Panel/PausedHeader',
              'Paused'
            )
          }}
        </h2>
        <cr-settings-panel (done)="pauseOpen.set(false)" />
        <div class="row">
          <button type="button" class="btn quiet" (click)="toTitle()">
            {{
              library.text(
                'UI/GanrationEnding/Viewarea/PausePopup/Settings Panel/Panel/GotoMainMenu/Text (TMP)',
                'Return to title'
              )
            }}
          </button>
        </div>
      </cr-modal>
    } @else {
      <section class="paper empty">
        <p>No game in progress.</p>
        <a class="btn" routerLink="/">Back to the title</a>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .bar {
      display: grid;
      grid-template-columns: 2.75rem 1fr 2.75rem;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .title {
      margin: 0;
      text-align: center;
      font-size: 1.7rem;
      color: var(--color-on-backdrop);
      text-shadow: 0 0.15rem 0.5rem rgb(0 0 0 / 0.7);
    }
    .icon-btn {
      width: 2.75rem;
      height: 2.75rem;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: rgb(0 0 0 / 0.35);
      color: var(--color-on-backdrop);
      font-size: 1.4rem;
      cursor: pointer;
    }
    .icon-btn img {
      width: 2rem;
      height: 2rem;
      object-fit: contain;
    }
    .passage {
      line-height: 1.65;
      font-size: 1.15rem;
    }
    .passage.hub {
      font-size: 1.05rem;
    }
    .prompt {
      margin-top: 1.5rem;
      padding: 1rem;
      border-radius: 0.5rem;
      background: var(--color-panel);
      border: 1px solid var(--color-accent);
    }
    .prompt .row {
      margin-top: 0.75rem;
    }
    .prompt input {
      flex: 1;
      padding: 0.4rem 0.6rem;
      border-radius: 0.3rem;
      border: 1px solid var(--color-rule);
      background: rgb(255 255 255 / 0.6);
      color: inherit;
      font: inherit;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.75rem;
    }
    .ending {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-rule);
      text-align: center;
    }
    .unlocked {
      font-size: 1.15rem;
    }
    .paused {
      margin: 0 0 1rem;
      text-align: center;
    }
    .error {
      margin-top: 1rem;
      color: var(--color-error);
    }
    .empty {
      display: grid;
      justify-items: center;
      gap: 1rem;
      text-align: center;
    }
  `,
})
export class Play {
  protected readonly game = inject(Game);
  protected readonly library = inject(Library);
  private readonly router = inject(Router);
  private readonly audio = inject(AudioPlayer);

  protected readonly logOpen = signal(false);
  protected readonly pauseOpen = signal(false);

  private readonly answer = signal({ value: '' });
  protected readonly answerForm = form(this.answer, (p) => required(p.value), {
    submission: {
      action: async (f) => {
        this.game.answer(f.value().value());
        this.answer.set({ value: '' });
        return undefined;
      },
    },
  });

  /** The passage without its title (shown in the header) and the line breaks after it. */
  protected readonly body = computed(() => {
    const out = this.game.view()?.output ?? [];
    let i = 0;
    if (this.game.title() && out[0]?.t === 'text' && out[0].kind === 'title') i = 1;
    while (out[i]?.t === 'br') i++;
    return out.slice(i);
  });

  private readonly endingTitles = computed(() => {
    const content = this.game.content();
    const titles: Record<string, string> = {};
    for (const p of Object.values(content?.scenario.passages ?? {})) {
      const title = p.body.find((n) => n.t === 'text' && n.kind === 'title');
      if (p.tags.includes('ending') && title?.t === 'text')
        titles[p.name] = this.game.text(title.key, 'title').replace(/\*/g, '');
    }
    return titles;
  });

  protected endingTitle(passage: string): string {
    return this.endingTitles()[passage] ?? '';
  }

  protected async toTitle(): Promise<void> {
    this.pauseOpen.set(false);
    this.audio.stopVoice();
    this.audio.playMusic();
    await this.router.navigate(['/']);
  }
}
