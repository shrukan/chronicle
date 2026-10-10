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
import { AudioPlayer } from '../../../../core/services/audio';
import { loadContent, SCENARIOS } from '../../../../core/services/content';
import { Library } from '../../../../core/services/library';
import { LANGUAGES } from '../../../../core/services/settings';
import { RichText } from '../../../storybook/components/rich-text/rich-text';

/**
 * Development only: each scenario's introduction in every version, with a player per narrator,
 * to compare voices and versions. Introductions only, so it gives nothing away.
 */
@Component({
  selector: 'cr-voices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText, RouterLink],
  templateUrl: './voices.html',
  styleUrl: './voices.css',
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
