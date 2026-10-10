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
import { AppUpdate } from './core/services/app-update';
import { AudioPlayer } from './core/services/audio';
import { bugReportUrl } from './core/utils/bug-report';
import { VERSION } from './version';
import { Game } from './core/services/game';
import { Library } from './core/services/library';
import { Settings } from './core/services/settings';

/** Images the styles use everywhere, by CSS variable. */
const THEME_IMAGES = {
  '--paper-image': 'popup-panels/weathered-paper',
  '--frame-image': 'general/mfw-borders/mfw-border-gold',
  '--button-image': 'general/buttons/blank-button-brown',
  '--button-selected-image': 'general/blank-button-brown-highlight',
  '--button-cancel-image': 'general/buttons/button-red',
  '--button-confirm-image': 'general/buttons/blank-button-green',
  '--bracket-left-image': 'general/brackets/bracket-left',
  '--bracket-right-image': 'general/brackets/bracket-right',
};

const TITLE_PICTURES = [
  'main-menu/sky-dome',
  'main-menu/mountain',
  'main-menu/village',
  'main-menu/myfathersworklogofinal',
  'general/main-border',
  'general/vignette',
  'help/mfwhelp-button',
];

/** The storybook's backdrop per scenario, as in the original (ViewGenerationEnding). */
const STORYBOOK_ILLUSTRATIONS: Record<string, string> = {
  'cost-of-disease': 'generation-ending/bgs/b-illustration1-oj-v004',
  'fear-of-the-unknown': 'generation-ending/bgs/b-illustration2-oj-v004',
  'a-time-of-war': 'generation-ending/bgs/b-illustration3-oj-v004',
};
const DIM = 'linear-gradient(rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.6))';

@Component({
  selector: 'cr-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet],
  host: {
    '(document:pointerdown)': 'startMusic()',
    '(document:keydown)': 'startMusic()',
    '(document:click)': 'clickSound($event)',
  },
  templateUrl: './app.html',
  styleUrl: './app.css',
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
  private readonly game = inject(Game);
  /**
   * Scoring has its own (purple) background in the original, and the storybook shows the
   * scenario's illustration, darkened so it stays behind the page.
   */
  private readonly backdrop = computed(() => {
    const page = this.url().split(/[?#]/)[0];
    const illustration =
      page === '/play'
        ? this.library.ui(STORYBOOK_ILLUSTRATIONS[this.game.scenarioId()])
        : undefined;
    if (illustration) return `${DIM}, url("${illustration}")`;
    const src = this.library.ui(page === '/score' ? 'general/main-bg-scoring' : 'general/main-bg');
    return src ? `url("${src}")` : 'none';
  });
  private musicStarted = false;
  /** Decoded title-screen pictures, kept so the browser does not drop them. */
  private readonly keep: HTMLImageElement[] = [];

  constructor() {
    void this.library.load().then(() => {
      this.audio.preload('click');
      // The title screen's pictures, loaded and decoded once: returning to the menu then
      // shows it at once instead of building it up piece by piece.
      for (const key of TITLE_PICTURES) {
        const src = this.library.ui(key);
        if (!src) continue;
        const img = new Image();
        img.src = src;
        void img.decode().catch(() => undefined);
        this.keep.push(img);
      }
    });
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
    effect(() => root.setProperty('--backdrop-image', this.backdrop()));
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
