import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Game } from '../core/game';
import { RichText } from '../story/rich-text';
import { StoryOutput } from '../story/story-output';

/** The story itself: current passage, its links, and the prompt when one is open. */
@Component({
  selector: 'cr-play',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoryOutput, RichText, FormField, FormRoot],
  template: `
    @if (game.view(); as view) {
      <article class="passage" aria-live="polite">
        <cr-story-output [items]="view.output" />
      </article>

      @if (view.prompt; as prompt) {
        <form class="prompt" [formRoot]="answerForm">
          <label for="answer"
            ><cr-rich-text [text]="game.text(prompt.key)" [args]="prompt.args"
          /></label>
          <div class="row">
            <input
              id="answer"
              [type]="prompt.input === 'number' ? 'number' : 'text'"
              [formField]="answerForm.value"
              autocomplete="off"
            />
            <button type="submit" [disabled]="answerForm().invalid()">OK</button>
          </div>
        </form>
      }

      @if (game.error(); as error) {
        <p class="error" role="alert">{{ error }}</p>
      }
    } @else {
      <p>No game in progress.</p>
      <button type="button" (click)="router.navigate(['/'])">Back</button>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .passage {
      line-height: 1.6;
      font-size: 1.15rem;
    }
    .prompt {
      margin-top: 1.5rem;
      padding: 1rem;
      border-radius: 0.5rem;
      background: var(--color-panel);
      border: 1px solid var(--color-accent);
    }
    .prompt .row {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }
    .prompt input {
      flex: 1;
      padding: 0.4rem 0.6rem;
      border-radius: 0.3rem;
      border: 1px solid var(--color-rule);
      background: var(--color-bg);
      color: inherit;
      font: inherit;
    }
    button {
      padding: 0.4rem 1rem;
      border-radius: 0.4rem;
      border: 1px solid var(--color-accent);
      background: var(--color-accent);
      color: var(--color-on-accent);
      font: inherit;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .error {
      margin-top: 1rem;
      color: var(--color-error);
    }
  `,
})
export class Play {
  protected readonly game = inject(Game);
  protected readonly router = inject(Router);

  private readonly answer = signal({ value: '' });
  protected readonly answerForm = form(this.answer, (p) => required(p.value), {
    submission: {
      action: async (f) => {
        this.game.answer(f.value().value());
        this.answer.set({ value: '' });
        return undefined;
      },
    },
  });
}
