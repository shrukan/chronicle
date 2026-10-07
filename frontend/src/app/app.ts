import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AudioPlayer } from './core/audio';
import { Library } from './core/library';

@Component({
  selector: 'cr-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
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
      Unofficial fan project. Story, text, art and music © Renegade Game Studios (CC BY-NC 4.0).
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
      max-width: 46rem;
      margin: 0 auto;
      padding: 1.25rem 1rem 3rem;
      box-sizing: border-box;
    }
    footer {
      padding: 1rem;
      font-size: 0.75rem;
      text-align: center;
      opacity: 0.6;
    }
  `,
})
export class App {
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
      const src = this.backdrop();
      document.documentElement.style.setProperty(
        '--backdrop-image',
        src ? `url("${src}")` : 'none',
      );
    });
  }

  /** Like the original, every button and story link clicks. */
  protected clickSound(event: Event): void {
    const target = (event.target as Element | null)?.closest('button, a, [role="tab"], input[type="radio"], input[type="checkbox"]');
    if (target && !(target as HTMLButtonElement).disabled) this.audio.effect('click');
  }

  /** Browsers only allow sound after a user gesture: start the title music on the first one. */
  protected startMusic(): void {
    if (this.musicStarted) return;
    this.musicStarted = true;
    if (!this.url().startsWith('/play')) this.audio.playMusic();
  }
}
