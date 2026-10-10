import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Library } from '../core/library';

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
  template: `
    <div class="tube"></div>
    <ol>
      @for (slot of slots; track $index) {
        <li
          [class.current]="$index === done()"
          [class.past]="$index < done()"
          [attr.data-generation]="slot.generation"
        >
          {{ slot.label }}
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      height: 1.6rem;
      border-radius: 1rem;
      background: rgb(10 10 14 / 0.85);
      box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.12),
        0 0.3rem 0.8rem rgb(0 0 0 / 0.5);
      overflow: hidden;
    }
    /* The coloured tube, shown up to the end of the current round. */
    .tube {
      position: absolute;
      inset: 0;
      background: var(--tube, none) center / 100% 100%;
      clip-path: inset(0 calc((1 - var(--filled)) * 100%) 0 0);
      transition: clip-path 0.8s ease-out;
    }
    ol {
      position: relative;
      display: grid;
      grid-template-columns: repeat(9, 1fr);
      height: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      place-items: center;
      font-family: var(--font-display);
      font-size: 0.8rem;
      letter-spacing: 0.04em;
      color: rgb(255 255 255 / 0.35);
      border-left: 1px solid rgb(0 0 0 / 0.45);
    }
    li:first-child {
      border-left: 0;
    }
    li.past {
      color: rgb(255 255 255 / 0.75);
    }
    li.current {
      color: #fff;
      font-weight: bold;
      text-shadow:
        0 0 0.5rem var(--glow),
        0 0 0.2rem var(--glow);
    }
    li[data-generation='1'] {
      --glow: #b6ff8a;
    }
    li[data-generation='2'] {
      --glow: #ffb36b;
    }
    li[data-generation='3'] {
      --glow: #ff8a7a;
    }
    /* Narrow phones: only the current round keeps its label. */
    @media (max-width: 30rem) {
      li:not(.current) {
        font-size: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tube {
        transition: none;
      }
    }
  `,
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
