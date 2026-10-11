import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Library } from '../../../../core/services/library';
import { ROMAN, ROUNDS, roundPosition } from '../../../../core/utils/rounds';

/** "I-1" … "III-3" for a round of the whole game (from 1). */
function slotLabel(n: number): string {
  const { generation, round } = roundPosition(n);
  return `${ROMAN[generation - 1]}-${round}`;
}

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
    '[attr.aria-valuemax]': 'rounds',
    '[attr.aria-valuenow]': 'done() + 1',
    '[attr.aria-valuetext]': 'label()',
    '[style.--tube]': 'tube()',
    '[style.--filled]': '(done() + 1) / rounds',
  },
  templateUrl: './round-bar.html',
  styleUrl: './round-bar.css',
})
export class RoundBar {
  private readonly library = inject(Library);
  /** Rounds completed so far (0 to `ROUNDS` − 1); the next one is being played. */
  readonly done = input.required<number>();

  protected readonly rounds = ROUNDS;
  protected readonly slots = Array.from({ length: ROUNDS }, (_, i) => ({
    generation: roundPosition(i + 1).generation,
    label: slotLabel(i + 1),
  }));
  protected readonly label = computed(() => {
    const { generation, round } = roundPosition(this.done() + 1);
    return `Generation ${ROMAN[generation - 1]}, round ${round}`;
  });
  protected readonly tube = computed(() => {
    const src = this.library.ui('progress-bar/mfw-progress-bar');
    return src ? `url("${src}")` : 'none';
  });
}
