import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toText, type Out } from '@chronicle/engine';
import { Game } from '../core/game';
import { RichText } from './rich-text';

type Screen = Extract<Out, { t: 'ui' }>;

/**
 * App screens the story opens (end of round, bidding, scoring, …). For M3 these are simple
 * cards inside the story; M4 replaces them with the real screens.
 */
@Component({
  selector: 'cr-screen-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText],
  template: `
    @switch (screen().ui) {
      @case ('endOfRound') {
        @if (round(); as r) {
          <aside class="card">
            <h3>End of round {{ r.round }}</h3>
            <p><cr-rich-text [text]="game.text(r.text)" /></p>
            <p><cr-rich-text [text]="game.text(r.then)" /></p>
            @if (screen().link; as link) {
              <button type="button" class="action" (click)="game.click(link)">
                Start the next round
              </button>
            }
          </aside>
        }
      }
      @case ('endOfGeneration') {
        <aside class="card">
          <h3>End of the generation</h3>
          <p><cr-rich-text [text]="game.text(arg('text'))" /></p>
        </aside>
      }
      @case ('specialEvent') {
        <p class="banner">Special event</p>
      }
      @case ('bidding') {
        <aside class="card">
          <h3>{{ arg('mode') === 'Voting' ? 'Secret vote' : 'Secret bid' }}</h3>
          <p>Everyone decides in secret, then reveal at the same time.</p>
          @if (screen().link; as link) {
            <button type="button" class="action" (click)="game.click(link)">
              Revealed – continue
            </button>
          }
        </aside>
      }
      @case ('scoreEntry') {
        <aside class="card">
          <h3>Final scores</h3>
          <p>Who won? (Score entry and tie-breakers follow in M4.)</p>
          <div class="choices">
            @for (name of winners(); track name) {
              <label
                ><input
                  type="radio"
                  name="winner"
                  [checked]="winner() === name"
                  (change)="winner.set(name)"
                />
                {{ name }}</label
              >
            }
          </div>
          @if (screen().link; as link) {
            <button
              type="button"
              class="action"
              [disabled]="!winner()"
              (click)="game.click(link, { winnerName: winner() })"
            >
              Continue
            </button>
          }
        </aside>
      }
      @case ('generationEndingContinue') {
        <!-- enables the "continue" button of the ending screen in the original; nothing to show -->
      }
      @default {
        <p class="banner">{{ screen().ui }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .card {
      margin: 1rem 0;
      padding: 1rem;
      border-radius: 0.5rem;
      background: var(--color-panel);
      border: 1px solid var(--color-rule);
    }
    h3 {
      margin: 0 0 0.5rem;
      font-family: var(--font-display);
      font-weight: normal;
      font-size: 1.2rem;
      color: var(--color-heading);
    }
    .banner {
      font-family: var(--font-display);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-accent);
    }
    .choices {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      margin: 0.5rem 0 1rem;
    }
    .action {
      padding: 0.4rem 1rem;
      border-radius: 0.4rem;
      border: 1px solid var(--color-accent);
      background: var(--color-accent);
      color: var(--color-on-accent);
      font: inherit;
      cursor: pointer;
    }
    .action:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class ScreenCard {
  protected readonly game = inject(Game);
  readonly screen = input.required<Screen>();

  protected readonly winner = signal('');
  protected readonly winners = computed(() => [...this.game.playerNames(), 'The family']);
  protected readonly round = computed(
    () => this.game.content()?.extras.endOfRound[this.arg('progress')],
  );

  protected arg(name: string): string {
    const v = this.screen().args[name];
    return v === undefined ? '' : toText(v);
  }
}
