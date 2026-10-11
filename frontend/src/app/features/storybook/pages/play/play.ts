import {
  ChangeDetectionStrategy,
  Component,
  computed,
  afterRenderEffect,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  isDevMode,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { AudioPlayer } from '../../../../core/services/audio';
import { Game, NOT_RESUMED, type ResumeResult } from '../../../../core/services/game';
import { SavedGames } from '../../../../core/services/saved-games';
import { bugReportUrl } from '../../../../core/utils/bug-report';
import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import { Library } from '../../../../core/services/library';
import { Settings } from '../../../../core/services/settings';
import { LogBook } from '../../components/log-book/log-book';
import { RoundBar } from '../../components/round-bar/round-bar';
import { RichText } from '../../components/rich-text/rich-text';
import { StoryOutput } from '../../components/story-output/story-output';
import { formatDuration } from '../../../../shared/utils/duration';
import { Modal } from '../../../../shared/components/modal/modal';
import { SettingsPanel } from '../../../../shared/components/settings-panel/settings-panel';
import { handoverNotice, noticeLink, onlyWay, pageBody } from '../../utils/page-layout';
import { startPlaySession } from '../../utils/play-session';

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
    RoundBar,
    RouterLink,
  ],
  templateUrl: './play.html',
  styleUrl: './play.css',
})
export class Play {
  /** A bug report that names the current passage (and the error, if any). */
  protected bugReport(error?: string): string {
    const passage = this.game.view()?.passage;
    return bugReportUrl({ error, where: passage ? `Passage ${passage}` : 'Storybook' });
  }

  protected readonly game = inject(Game);
  protected readonly library = inject(Library);
  protected readonly settings = inject(Settings);
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

  /** The page without the title the header shows (see `pageBody`). */
  protected readonly body = computed(() =>
    pageBody(this.game.view()?.output ?? [], !!this.game.title()),
  );

  /**
   * The single way forward when a page offers no choice: shown as a clear button where the
   * link is, and bound to Space / Enter.
   */
  protected readonly onlyWay = computed(() => onlyWay(this.game.view()));

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
    this.game.tap(way.id);
  }

  protected readonly confirmUndo = signal(false);

  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('title');
  private readonly passage = computed(() => this.game.view()?.passage);

  /**
   * The page being shown; revealing more of it keeps the same key. A computed, so it only
   * notifies when the key changes – with a plain function, every update of the page would
   * reset what depends on it.
   */
  private readonly page = computed(() => `${this.game.view()?.passage}#${this.game.visit()}`);

  /**
   * Set once the page's handover notice has been confirmed; every new passage starts unset.
   * Revealing more of the same page keeps it: the notice is still at its top, but the right
   * player already holds the storybook.
   */
  protected readonly handedOver = linkedSignal({ source: this.page, computation: () => false });

  /**
   * Set once a player has taken the storybook for a secret; cleared when the story is back on
   * a location page. Meanwhile the secret's own pages ("pick up the storybook", "continue to
   * not let others see") need no new notice: the right player already holds it.
   */
  private readonly holding = linkedSignal({ source: this.game.isHub, computation: () => false });

  /** The hand-over notice opening the page, shown full screen first (see `handoverNotice`). */
  protected readonly handover = computed(() =>
    this.handedOver() ? undefined : handoverNotice(this.body(), this.holding()),
  );

  /** A link that confirming the notice follows at once (see `noticeLink`). */
  private readonly handoverLink = computed(() => {
    const notice = this.handover();
    return notice && noticeLink(notice, this.body(), this.game.view());
  });

  protected showPage(): void {
    const link = this.handoverLink();
    this.handedOver.set(true);
    this.holding.set(true);
    // Not a choice of its own: undoing it would land on this notice again, whose only way on
    // is the same link.
    if (link !== undefined) this.game.click(link, undefined, false);
  }

  protected undo(): void {
    this.confirmUndo.set(false);
    this.pauseOpen.set(false);
    this.game.undo();
  }

  /** True while a reload picks up the saved game. */
  protected readonly resuming = signal(false);
  /** Why the saved game could not be picked up, when it couldn't. */
  protected readonly notResumed = signal<string | undefined>(undefined);

  constructor() {
    // After a reload (or opening /play directly) continue the game played last.
    const savedGames = inject(SavedGames);
    const resumed: Promise<ResumeResult> = this.game.view()
      ? Promise.resolve('resumed')
      : (this.resuming.set(true),
        savedGames
          .list()
          .then(([last]) => (last ? this.game.resume(last.id) : 'none'))
          .then((result) => {
            if (result === 'changed' || result === 'newer')
              this.notResumed.set(NOT_RESUMED[result]);
            return result;
          })
          .finally(() => this.resuming.set(false)));

    // Development only – the passage names would give the story away to players:
    // the URL shows the current passage, and /play?passage=<name> jumps there.
    if (isDevMode()) {
      const jump = inject(ActivatedRoute).snapshot.queryParamMap.get('passage');
      if (jump)
        void resumed.then(async () => {
          if (jump !== this.game.view()?.passage) await this.game.jumpTo(jump);
        });
      effect(() => {
        const passage = this.game.view()?.passage;
        if (passage) void this.router.navigate([], { queryParams: { passage }, replaceUrl: true });
      });
    }

    // A new page moves the focus to its title: screen readers announce the page, and the
    // keyboard starts from the top of it. Dialogs and the answer field keep theirs.
    afterRenderEffect(() => {
      const passage = this.passage();
      const title = this.titleRef()?.nativeElement;
      if (!passage || !title || document.querySelector('dialog[open]')) return;
      if (document.activeElement?.matches('input, textarea, select')) return;
      title.focus({ preventScroll: true });
    });

    inject(DestroyRef).onDestroy(startPlaySession(this.game));
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

  /** Help, mid-game; its Back returns here. */
  protected async toHelp(): Promise<void> {
    this.pauseOpen.set(false);
    this.audio.stopVoice();
    await this.router.navigate(['/help']);
  }

  protected async toTitle(): Promise<void> {
    this.pauseOpen.set(false);
    this.audio.stopVoice();
    this.audio.playMusic();
    await this.router.navigate(['/']);
  }
}
