import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Library } from '../../../core/services/library';
import { generationNumeral, ROUNDS, roundPosition } from '../../../core/utils/rounds';

/** "I-1" … "III-3" for a round of the whole game (from 1). */
function slotLabel(n: number): string {
  const { generation, round } = roundPosition(n);
  return `${generationNumeral(generation)}-${round}`;
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
    '[attr.aria-valuenow]': 'current()',
    '[attr.aria-valuetext]': 'label()',
    '[style.--tube]': 'tube()',
    '[style.--filled]': 'current() / rounds',
    '[style.--rounds]': 'rounds',
  },
  templateUrl: './round-bar.html',
  styleUrl: './round-bar.css',
})
export class RoundBar {
  private readonly library = inject(Library);
  /** Rounds completed so far; the next one is being played, unless all are done. */
  readonly done = input.required<number>();
  /** The round being played (from 1), or the last one once all are done. */
  protected readonly current = computed(() => Math.min(this.done() + 1, ROUNDS));

  protected readonly rounds = ROUNDS;
  protected readonly slots = Array.from({ length: ROUNDS }, (_, i) => ({
    generation: roundPosition(i + 1).generation,
    label: slotLabel(i + 1),
  }));
  protected readonly label = computed(() => {
    if (this.done() >= ROUNDS) return 'All rounds played';
    const { generation, round } = roundPosition(this.done() + 1);
    return `Generation ${generationNumeral(generation)}, round ${round}`;
  });
  protected readonly tube = computed(() => {
    const src = this.library.ui('progress-bar/mfw-progress-bar');
    return src ? `url("${src}")` : 'none';
  });
}
