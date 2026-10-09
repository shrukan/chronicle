import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AppUpdate } from './core/app-update';
import { AudioPlayer } from './core/audio';
import { bugReportUrl } from './core/bug-report';
import { VERSION } from './version';
import { Library } from './core/library';
import { Settings } from './core/settings';

/** Images the styles use everywhere, by CSS variable. */
const THEME_IMAGES = {
  '--paper-image': 'popup-panels/weathered-paper',
  '--frame-image': 'general/mfw-borders/mfw-border-gold',
  '--button-image': 'general/buttons/button-red',
  '--button-selected-image': 'general/blank-button-brown-highlight',
  '--button-quiet-image': 'general/buttons/blank-button-brown',
};

@Component({
  selector: 'cr-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet],
  host: {
    '(document:pointerdown)': 'startMusic()',
    '(document:keydown)': 'startMusic()',
    '(document:click)': 'clickSound($event)',
  },
  template: `
    <main>
      <router-outlet />
    </main>
    @if (update.ready()) {
      <aside class="update" role="status">
        <span>A new version of Chronicle is ready.</span>
        <button type="button" class="btn" (click)="update.reload()">Reload</button>
        <button type="button" class="later" (click)="update.ready.set(false)">Later</button>
      </aside>
    }
    @if (showFooter()) {
      <footer>
        Unofficial fan project · Story, art and music © Renegade Game Studios ·
        <a routerLink="/whats-new">Chronicle {{ version }} – what's new</a> ·
        <a routerLink="/about">About &amp; credits</a> ·
        <a [href]="bugReport()" target="_blank" rel="noopener">Report a bug ↗</a>
      </footer>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }
    main {
      flex: 1;
      width: 100%;
      max-width: 50rem;
      margin: 0 auto;
      padding: 1.25rem 1rem 0.75rem;
      box-sizing: border-box;
    }
    /* Over every page, dialogs excepted: reloading is safe, the game is saved after every step. */
    .update {
      position: fixed;
      left: 50%;
      bottom: calc(1rem + env(safe-area-inset-bottom));
      z-index: 5;
      transform: translateX(-50%);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.5rem 1rem;
      width: max-content;
      max-width: calc(100vw - 2rem);
      box-sizing: border-box;
      padding: 0.6rem 1rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.5rem;
      background: var(--color-bg) var(--paper-image, none) center / cover;
      background-blend-mode: var(--paper-blend);
      color: var(--color-ink);
      box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.5);
    }
    .update .btn {
      padding: 0.3rem 0.9rem;
    }
    .later {
      border: 0;
      background: none;
      font: inherit;
      color: var(--color-muted);
      text-decoration: underline;
      cursor: pointer;
    }
    footer {
      padding: 0.25rem 1rem calc(1.75rem + env(safe-area-inset-bottom));
      font-size: 0.8rem;
      text-align: center;
      opacity: 0.85;
    }
    footer a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 0.2em;
      white-space: nowrap;
    }
    footer a:hover,
    footer a:focus-visible {
      opacity: 1;
      color: var(--color-on-backdrop);
    }
  `,
})
export class App {
  /** Credits and links on the menu pages; the storybook keeps the screen for the story. */
  protected readonly showFooter = computed(() =>
    ['/', '/about', '/endings', '/help', '/whats-new'].includes(this.url().split(/[?#]/)[0]!),
  );
  protected readonly version = VERSION;
  protected bugReport(): string {
    return bugReportUrl({ where: location.pathname });
  }
  private readonly library = inject(Library);
  private readonly audio = inject(AudioPlayer);
  protected readonly update = inject(AppUpdate);
  private readonly settings = inject(Settings);
  private readonly router = inject(Router);

  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: '/' },
  );
  /** Scoring has its own (purple) background in the original. */
  private readonly backdrop = computed(() =>
    this.library.ui(
      this.url().startsWith('/score') ? 'general/main-bg-scoring' : 'general/main-bg',
    ),
  );
  private musicStarted = false;

  constructor() {
    void this.library.load().then(() => this.audio.preload('click'));
    // Light or dark paper; "Automatic" follows the system, also when it changes (styles.css).
    const systemDark = matchMedia('(prefers-color-scheme: dark)');
    const prefersDark = signal(systemDark.matches);
    systemDark.addEventListener('change', (e) => prefersDark.set(e.matches));
    effect(() => {
      const theme = this.settings.theme();
      const dark = theme === 'dark' || (theme === 'auto' && prefersDark());
      document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    });
    const root = document.documentElement.style;
    const url = (src: string | undefined) => (src ? `url("${src}")` : 'none');
    effect(() => root.setProperty('--backdrop-image', url(this.backdrop())));
    effect(() => {
      // The original's paper, gold frame and buttons (see styles.css and the modal). Fetched
      // right away: otherwise the first dialog opens plain and its frame appears a moment later.
      for (const [name, key] of Object.entries(THEME_IMAGES)) {
        const src = this.library.ui(key);
        root.setProperty(name, url(src));
        if (src) new Image().src = src;
      }
    });
  }

  /** Like the original, every button and story link clicks. */
  protected clickSound(event: Event): void {
    const target = (event.target as Element | null)?.closest(
      'button, a, [role="tab"], input[type="radio"], input[type="checkbox"]',
    );
    if (target && !(target as HTMLButtonElement).disabled) this.audio.effect('click');
  }

  /** Browsers only allow sound after a user gesture: start the title music on the first one. */
  protected startMusic(): void {
    if (this.musicStarted) return;
    this.musicStarted = true;
    if (!this.url().startsWith('/play')) this.audio.playMusic();
  }
}
