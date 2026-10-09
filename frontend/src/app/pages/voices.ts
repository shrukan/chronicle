import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { resolveText, type ReadingMode } from '@chronicle/engine';
import { AudioPlayer } from '../core/audio';
import { loadContent, SCENARIOS } from '../core/content';
import { Library } from '../core/library';
import { LANGUAGES } from '../core/settings';
import { RichText } from '../story/rich-text';

/**
 * Development only: each scenario's introduction in every version, with a player per narrator,
 * to compare voices and versions. Introductions only, so it gives nothing away.
 */
@Component({
  selector: 'cr-voices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText, RouterLink],
  template: `
    <section class="paper sheet">
      <h1 class="heading">Voice test</h1>
      <p class="note">
        Development only. Regenerate the clips with <code>task content:voices</code> (settings in
        <code>tools/voice/voices.json</code>), try any text with
        <code>task content:voices -- --try "…"</code> (clips in <code>build/voice-try/</code>).
      </p>
      @for (s of scenarios(); track s.id) {
        <h2 class="heading">{{ s.title }}</h2>
        @for (v of s.versions; track v.mode) {
          <article class="version">
            <h3>{{ v.label }}</h3>
            <div class="players">
              @for (n of v.narrators; track n.value) {
                <div class="player">
                  <span>{{ n.label }}</span>
                  @if (n.src) {
                    <audio controls preload="none" [src]="n.src" (play)="onlyOne($event)"></audio>
                  } @else {
                    <small>No clip yet</small>
                  }
                </div>
              }
            </div>
            @for (p of v.paragraphs; track $index) {
              <p><cr-rich-text [text]="p" /></p>
            }
          </article>
        }
      } @empty {
        <p>
          {{ content.isLoading() ? 'Loading…' : 'No introductions with generated voices yet.' }}
        </p>
      }
      <a class="btn" routerLink="/">Back</a>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sheet {
      display: grid;
      gap: 1rem;
      max-width: 44rem;
      margin: 0 auto;
    }
    h1,
    h2 {
      margin: 0;
      text-align: center;
    }
    .note {
      margin: 0;
      font-size: 0.9rem;
      color: var(--color-muted);
    }
    .version {
      padding: 0.75rem 1rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
    }
    h3 {
      margin: 0 0 0.5rem;
      font-size: 1.2rem;
    }
    .players {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      gap: 0.5rem 1rem;
      margin-bottom: 0.75rem;
    }
    .player {
      display: grid;
      gap: 0.2rem;
    }
    .player small {
      color: var(--color-muted);
    }
    audio {
      width: 100%;
    }
    .version p {
      line-height: 1.6;
    }
    .btn {
      justify-self: center;
    }
  `,
})
export class Voices {
  private readonly library = inject(Library);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly content = resource({
    params: () => this.library.intros(),
    loader: ({ params: intros, abortSignal }) =>
      Promise.all(
        SCENARIOS.filter((s) => intros[s.id]).map(async (s) => ({
          ...s,
          content: await loadContent(s.id, abortSignal),
        })),
      ),
  });

  protected readonly scenarios = computed(() =>
    (this.content.value() ?? []).map(({ id, title, content }) => {
      const passage = this.library.intros()[id]!;
      const keys = (content.scenario.passages[passage]?.body ?? []).flatMap((n) =>
        n.t === 'text' && n.kind === 'narrative' ? [n.key] : [],
      );
      const read = (mode: ReadingMode) => keys.map((k) => resolveText(content.strings, k, mode));
      const full = read('full');
      const versions = Object.entries(LANGUAGES[0]!.versions).flatMap(([m, label]) => {
        const mode = m as ReadingMode;
        const paragraphs = read(mode);
        // A version without its own text would only repeat the original.
        if (mode !== 'full' && paragraphs.every((p, i) => p === full[i])) return [];
        const narrators = this.library
          .allVoices()
          .filter((v) => mode === 'full' || !v.original)
          .map((v) => ({ ...v, src: this.library.voiceOver(passage, v.value, mode) }));
        return [{ mode, label, paragraphs, narrators }];
      });
      return { id, title, versions };
    }),
  );

  constructor() {
    inject(AudioPlayer).stopMusic();
  }

  /** One clip at a time: starting one pauses the others. */
  protected onlyOne(event: Event): void {
    for (const audio of this.host.nativeElement.querySelectorAll('audio'))
      if (audio !== event.target) audio.pause();
  }
}
