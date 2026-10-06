import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SETUP_CONTINUE_KEY, type Out } from '@chronicle/engine';
import { Game } from '../core/game';
import { RichText } from './rich-text';
import { ScreenCard } from './screen-card';

/** Renders the engine's output tree. Recursive for blocks and revealed fragments. */
@Component({
  selector: 'cr-story-output',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText, ScreenCard],
  template: `
    @for (o of items(); track $index) {
      @switch (o.t) {
        @case ('text') {
          <cr-rich-text [text]="game.text(o.key, o.kind)" [args]="o.args" [class]="o.kind" />
        }
        @case ('br') {
          <br />
        }
        @case ('link') {
          @if (o.disabled) {
            <cr-rich-text class="used-link" [text]="game.text(o.key)" [args]="o.args" />
          } @else if (o.key === setupContinue) {
            <button type="button" class="setup-continue" (click)="game.click(o.id)">
              {{ game.text(o.key) }}
            </button>
          } @else {
            <button type="button" class="story-link" (click)="game.click(o.id)">
              <cr-rich-text [text]="game.text(o.key)" [args]="o.args" />
            </button>
          }
        }
        @case ('group') {
          <cr-story-output [items]="o.children" />
        }
        @case ('block') {
          <section class="block" [class]="o.style">
            @if (o.style === 'setupEvent' || o.style === 'setup') {
              <!-- The original shows an image here (o.image); images arrive in M4. -->
              <header>Setup</header>
            }
            <cr-story-output [items]="o.children" />
          </section>
        }
        @case ('ui') {
          <cr-screen-card [screen]="o" />
        }
      }
    }
  `,
  styleUrl: './story-output.css',
})
export class StoryOutput {
  protected readonly game = inject(Game);
  readonly items = input.required<Out[]>();
  protected readonly setupContinue = SETUP_CONTINUE_KEY;
}
