import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Library } from '../../../../core/services/library';

const ROMAN = ['I', 'II', 'III'];

/**
 * The original's progress bar: a glass tube in the three generations' colours, filled up to the
 * round being played, with a label per round; the current one glows.
 */
@Component({
  selector: 'cr-round-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'progressbar',
    'aria-valuemin': '1',
    'aria-valuemax': '9',
    '[attr.aria-valuenow]': 'done() + 1',
    '[attr.aria-valuetext]': 'label()',
    '[style.--tube]': 'tube()',
    '[style.--filled]': '(done() + 1) / 9',
  },
  templateUrl: './round-bar.html',
  styleUrl: './round-bar.css',
})
export class RoundBar {
  private readonly library = inject(Library);
  /** Rounds completed so far (0–8); the next one is being played. */
  readonly done = input.required<number>();

  protected readonly slots = Array.from({ length: 9 }, (_, i) => ({
    generation: Math.floor(i / 3) + 1,
    label: `${ROMAN[Math.floor(i / 3)]}-${(i % 3) + 1}`,
  }));
  protected readonly label = computed(
    () => `Generation ${ROMAN[Math.floor(this.done() / 3)]}, round ${(this.done() % 3) + 1}`,
  );
  protected readonly tube = computed(() => {
    const src = this.library.ui('progress-bar/mfw-progress-bar');
    return src ? `url("${src}")` : 'none';
  });
}
