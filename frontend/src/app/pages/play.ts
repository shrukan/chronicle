import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { AudioPlayer } from '../core/audio';
import { Game, PLAIN_CONTINUE } from '../core/game';
import { bugReportUrl } from '../core/bug-report';
import { keepScreenOn } from '../core/wake-lock';
import { Autofocus } from '../ui/autofocus';
import { Library } from '../core/library';
import { LogBook } from '../story/log-book';
import { RichText } from '../story/rich-text';
import { StoryOutput } from '../story/story-output';
import { SETUP_CONTINUE_KEY, type Out } from '@chronicle/engine';
import { formatDuration } from '../ui/duration';
import { Modal } from '../ui/modal';
import { SettingsPanel } from '../ui/settings-panel';

/** A clickable story link (not one inside a setup pop-up, which the pop-up handles). */
function findStoryLink(out: Out[], id: number): Extract<Out, { t: 'link' }> | undefined {
  for (const o of out) {
    if (o.t === 'link' && o.id === id && !o.disabled && o.key !== SETUP_CONTINUE_KEY) return o;
    if (o.t === 'group' || (o.t === 'block' && o.style !== 'setupEvent')) {
      const inner = findStoryLink(o.children, id);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** The storybook: current passage, log book, pause menu, prompts and endings. */
@Component({
  selector: 'cr-play',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  imports: [
    Autofocus,
    StoryOutput,
    RichText,
    FormField,
    FormRoot,
    Modal,
    SettingsPanel,
    LogBook,
    RouterLink,
  ],
  template: `
    @if (game.view(); as view) {
      @if (handover(); as notice) {
        <!-- A dialog, so it queues ahead of the page's own pop-ups instead of under them. -->
        <cr-modal [fullscreen]="true" label="Pass the storybook">
          <div class="handover">
            <div class="hand" aria-hidden="true"></div>
            <p><cr-rich-text [text]="game.text(notice.key)" [args]="notice.args" /></p>
            <button crAutofocus type="button" class="btn" (click)="handedOver.set(true)">
              Ready – show the page
            </button>
          </div>
        </cr-modal>
      }
      <header class="bar">
        <button type="button" class="icon-btn" (click)="logOpen.set(true)" aria-label="Log book">
          @if (library.ui('general/book-icon-1'); as src) {
            <img [src]="src" alt="" />
          } @else {
            📖
          }
        </button>
        <div class="center">
          <h1 class="heading title" [class.hub]="game.isHub()">
            @if (game.title()) {
              <cr-rich-text [text]="game.title()" />
            }
          </h1>
          <p class="clock" [attr.aria-label]="'Play time ' + playTime()">⏱ {{ playTime() }}</p>
        </div>
        <button type="button" class="icon-btn" (click)="pauseOpen.set(true)" aria-label="Menu">
          ☰
        </button>
      </header>

      <article class="paper passage" [class.hub]="game.isHub()" aria-live="polite">
        <cr-story-output
          [items]="body()"
          [primaryLink]="onlyWay()?.plain ? onlyWay()?.id : undefined"
        />

        @if (view.prompt; as prompt) {
          <form class="prompt" [formRoot]="answerForm">
            <label for="answer"
              ><cr-rich-text [text]="game.text(prompt.key)" [args]="prompt.args"
            /></label>
            <div class="row">
              <input
                id="answer"
                [type]="prompt.input === 'number' ? 'number' : 'text'"
                [class.number]="prompt.input === 'number'"
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
            <p class="played">Played in {{ playTime() }}</p>
            <div class="row">
              <a class="btn quiet" routerLink="/endings">Endings</a>
              <button type="button" class="btn" (click)="toTitle()">Main menu</button>
            </div>
          </footer>
        }

        @if (game.error(); as error) {
          <p class="error" role="alert">
            {{ error }}
            <a [href]="bugReport(error)" target="_blank" rel="noopener">Report this error ↗</a>
          </p>
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
        <p class="paused-time">Play time {{ playTime() }}</p>
        @if (game.canUndo()) {
          <div class="undo">
            @if (!confirmUndo()) {
              <button type="button" class="btn quiet" (click)="confirmUndo.set(true)">
                ↶ Undo last choice
              </button>
            } @else {
              <p>This shows the previous page again. Make sure it isn't another player's secret.</p>
              <div class="row">
                <button type="button" class="btn quiet" (click)="confirmUndo.set(false)">
                  Cancel
                </button>
                <button type="button" class="btn" (click)="undo()">Undo</button>
              </div>
            }
          </div>
        }
        <cr-settings-panel [showHeading]="false" (done)="pauseOpen.set(false)">
          <button actions type="button" class="btn quiet" (click)="toTitle()">Main menu</button>
        </cr-settings-panel>
        <p class="report">
          Something wrong on this page?
          <a [href]="bugReport()" target="_blank" rel="noopener">Report a bug ↗</a>
        </p>
      </cr-modal>
    } @else if (game.error(); as error) {
      <section class="paper empty">
        <p class="error" role="alert">The storybook could not be opened: {{ error }}</p>
        <a class="btn" routerLink="/">Main menu</a>
        <a [href]="bugReport(error)" target="_blank" rel="noopener">Report this error ↗</a>
      </section>
    } @else if (resuming()) {
      <p class="loading">Opening the storybook…</p>
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
    .center {
      display: grid;
      justify-items: center;
      gap: 0.1rem;
    }
    .clock {
      margin: 0;
      font-size: 0.85rem;
      color: var(--color-on-backdrop);
      opacity: 0.7;
      font-variant-numeric: tabular-nums;
    }
    .played,
    .paused-time {
      margin: 0 0 0.75rem;
      text-align: center;
      font-style: italic;
      color: var(--color-muted);
      font-variant-numeric: tabular-nums;
    }
    .title {
      margin: 0;
      text-align: center;
      /* Long titles stay on one line on phones where possible. */
      font-size: clamp(1.2rem, 5.5vw, 1.7rem);
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
    /* Inputs keep a ~20 character default width in a flex row unless given one. */
    .prompt input.number {
      width: 6rem;
      text-align: center;
    }
    .prompt .row {
      margin-top: 0.75rem;
    }
    .prompt input {
      width: min(18rem, 100%);
      min-width: 0;
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
      margin: 0 0 0.25rem;
      text-align: center;
      font-size: 1.6rem;
    }
    /* Covers the page until the player it is meant for has the storybook. */
    .handover {
      min-height: 100%;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 1.5rem;
      padding: 2rem max(1.5rem, env(safe-area-inset-left));
      color: var(--color-on-backdrop);
      text-align: center;
    }
    .handover p {
      max-width: 26rem;
      margin: 0;
      font-size: 1.35rem;
      line-height: 1.5;
    }
    .handover .hand {
      width: 4.5rem;
      height: 4.5rem;
      background: var(--color-on-backdrop);
      mask: var(--command-icon) center / contain no-repeat;
    }
    .undo {
      display: grid;
      justify-items: center;
      gap: 0.5rem;
      margin: 0 0 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--color-rule);
      text-align: center;
    }
    .undo p {
      margin: 0;
    }
    .undo .quiet,
    .row .quiet {
      color: var(--color-ink);
    }
    .report {
      margin: 1rem 0 0;
      text-align: center;
      font-size: 0.9rem;
      color: var(--color-muted);
    }
    .report a,
    .error a {
      color: inherit;
      text-decoration: underline;
    }
    .error {
      margin-top: 1rem;
      color: var(--color-error);
    }
    .loading {
      text-align: center;
      font-style: italic;
      opacity: 0.7;
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
  /** A bug report that names the current passage (and the error, if any). */
  protected bugReport(error?: string): string {
    const passage = this.game.view()?.passage;
    return bugReportUrl({ error, where: passage ? `Passage ${passage}` : 'Storybook' });
  }

  protected readonly game = inject(Game);
  protected readonly library = inject(Library);
  private readonly router = inject(Router);
  private readonly audio = inject(AudioPlayer);

  protected readonly playTime = computed(() => formatDuration(this.game.playTime()));

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

  /**
   * The single way forward when a page offers no choice: shown as a clear button where the
   * link is, and bound to Space / Enter.
   */
  protected readonly onlyWay = computed(() => {
    const view = this.game.view();
    if (!view || view.prompt || view.links.length !== 1) return undefined;
    const link = findStoryLink(view.output, view.links[0]!);
    if (!link) return undefined;
    const label = this.game.text(link.key).replace(/[*\\]/g, '').trim();
    return { id: link.id, key: link.key, args: link.args, plain: PLAIN_CONTINUE.test(label) };
  });

  protected onKey(event: KeyboardEvent): void {
    const way = this.onlyWay();
    const target = event.target as HTMLElement;
    if (!way || this.handover() || (event.key !== ' ' && event.key !== 'Enter')) return;
    if (
      target.closest('input, button, a, textarea, select, dialog[open]') ||
      document.querySelector('dialog[open]')
    )
      return;
    event.preventDefault();
    this.game.click(way.id);
  }

  protected readonly confirmUndo = signal(false);

  /** Set once the page's handover notice has been confirmed; every new page starts unset. */
  protected readonly handedOver = linkedSignal({
    source: () => this.game.view(),
    computation: () => false,
  });

  /** An app command opening the page ("hand the storybook to …"): shown full screen first. */
  protected readonly handover = computed(() => {
    if (this.handedOver()) return undefined;
    const first = this.body()
      .filter((o) => o.t !== 'br')
      .slice(0, 2)
      .find((o) => o.t === 'text' && o.kind === 'command');
    return first?.t === 'text' ? first : undefined;
  });

  protected undo(): void {
    this.confirmUndo.set(false);
    this.pauseOpen.set(false);
    this.game.undo();
  }

  /** True while a reload picks up the saved game. */
  protected readonly resuming = signal(false);

  constructor() {
    // After a reload (or opening /play directly) continue the saved game.
    if (!this.game.view()) {
      this.resuming.set(true);
      void this.game.resume().finally(() => this.resuming.set(false));
    }

    // Count play time while the storybook is on screen and the story isn't over.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && this.game.view() && !this.game.isEnding())
        this.game.tick(1000);
    }, 1000);
    // Save on leaving and when the app goes to the background (phones may close it there).
    const save = () => void this.game.persist();
    const onVisibility = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    const releaseScreen = keepScreenOn();
    inject(DestroyRef).onDestroy(() => {
      releaseScreen();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', save);
      save();
    });
  }

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
