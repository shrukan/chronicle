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
import { Game, PLAIN_CONTINUE } from '../../../../core/services/game';
import { bugReportUrl } from '../../../../core/utils/bug-report';
import { keepScreenOn } from '../../../../core/utils/wake-lock';
import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import { Library } from '../../../../core/services/library';
import { Settings } from '../../../../core/services/settings';
import { LogBook } from '../../components/log-book/log-book';
import { RoundBar } from '../../components/round-bar/round-bar';
import { RichText } from '../../components/rich-text/rich-text';
import { StoryOutput } from '../../components/story-output/story-output';
import { SETUP_CONTINUE_KEY, type Out } from '@chronicle/engine';
import { formatDuration } from '../../../../shared/utils/duration';
import { Modal } from '../../../../shared/components/modal/modal';
import { SettingsPanel } from '../../../../shared/components/settings-panel/settings-panel';

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

/**
 * Setup steps that the original showed as a pop-up on arrival go to the top of the page, as a
 * compact box; their Accept (the way on) moves to the end, after the story.
 */
function setupFirst(out: Out[]): Out[] {
  const setups: Out[] = [];
  const accepts: Out[] = [];
  // Also inside the sections that "continue" opened on the page.
  const take = (items: Out[]): Out[] =>
    items.flatMap((o): Out[] => {
      if (o.t === 'group') return [{ ...o, children: take(o.children) }];
      if (o.t !== 'block' || o.style !== 'setupEvent') return [o];
      const children = o.children.filter((c) => {
        const accept = c.t === 'link' && c.key === SETUP_CONTINUE_KEY;
        if (accept) accepts.push(c);
        return !accept;
      });
      setups.push({ ...o, children });
      return [];
    });
  const rest = take(out);
  return setups.length ? [...setups, ...rest, ...accepts] : out;
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

  /** The passage without its title (shown in the header) and the line breaks after it. */
  protected readonly body = computed(() => {
    const out = this.game.view()?.output ?? [];
    let i = 0;
    if (this.game.title() && out[0]?.t === 'text' && out[0].kind === 'title') i = 1;
    while (out[i]?.t === 'br') i++;
    return setupFirst(out.slice(i));
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

  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('title');
  private readonly passage = computed(() => this.game.view()?.passage);

  /**
   * Set once the page's handover notice has been confirmed; every new passage starts unset.
   * Revealing more of the same page keeps it: the notice is still at its top, but the right
   * player already holds the storybook.
   */
  protected readonly handedOver = linkedSignal({
    source: () => `${this.game.view()?.passage}#${this.game.visit()}`,
    computation: () => false,
  });

  /**
   * The app commands opening the page ("hand the storybook to …", and a tie rule right after
   * it): shown full screen first.
   */
  protected readonly handover = computed(() => {
    if (this.handedOver()) return undefined;
    const out = this.body().filter((o) => o.t !== 'br');
    const isCommand = (o: Out | undefined) => o?.t === 'text' && o.kind === 'command';
    const start = out.slice(0, 2).findIndex(isCommand);
    if (start < 0) return undefined;
    let end = start;
    while (isCommand(out[end])) end++;
    return out.slice(start, end) as Extract<Out, { t: 'text' }>[];
  });

  /**
   * The page's only link when it holds nothing but the handover notice and that link ("click
   * here to reveal your secret …"): confirming the notice follows it, so it takes one tap.
   */
  private readonly handoverLink = computed(() => {
    const notice = this.handover();
    const view = this.game.view();
    if (!notice || !view || view.prompt || view.links.length !== 1) return undefined;
    const flat = (out: Out[]): Out[] =>
      out.flatMap((o) => (o.t === 'group' ? flat(o.children) : o.t === 'br' ? [] : [o]));
    const rest = flat(this.body()).filter((o) => !(notice as Out[]).includes(o));
    const only = rest.length === 1 ? rest[0] : undefined;
    return only?.t === 'link' && only.id === view.links[0] && !only.disabled ? only.id : undefined;
  });

  protected showPage(): void {
    const link = this.handoverLink();
    this.handedOver.set(true);
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

  constructor() {
    // After a reload (or opening /play directly) continue the saved game.
    const resumed = this.game.view()
      ? Promise.resolve(true)
      : (this.resuming.set(true), this.game.resume().finally(() => this.resuming.set(false)));

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
