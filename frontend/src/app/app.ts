import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AudioPlayer } from './core/audio';
import { bugReportUrl } from './core/bug-report';
import { VERSION } from './version';
import { Library } from './core/library';

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
    <footer>
      Unofficial fan project · Story, art and music © Renegade Game Studios ·
      <a routerLink="/about">Chronicle {{ version }} – about &amp; credits</a> ·
      <a [href]="bugReport()" target="_blank" rel="noopener">Report a bug ↗</a>
    </footer>
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
    footer {
      padding: 0.25rem 1rem calc(1.75rem + env(safe-area-inset-bottom));
      font-size: 0.75rem;
      text-align: center;
      opacity: 0.6;
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
  protected readonly version = VERSION;
  protected bugReport(): string {
    return bugReportUrl({ where: location.pathname });
  }
  private readonly library = inject(Library);
  private readonly audio = inject(AudioPlayer);
  private readonly router = inject(Router);

  private readonly url = toSignal(
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
    effect(() => {
      const root = document.documentElement.style;
      const url = (src: string | undefined) => (src ? `url("${src}")` : 'none');
      root.setProperty('--backdrop-image', url(this.backdrop()));
      // The original's paper and gold frame (see styles.css and the modal).
      root.setProperty('--paper-image', url(this.library.ui('popup-panels/weathered-paper')));
      root.setProperty(
        '--frame-image',
        url(this.library.ui('general/mfw-borders/mfw-border-gold')),
      );
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
