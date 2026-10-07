import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SETUP_CONTINUE_KEY, type Out } from '@chronicle/engine';
import { Game } from '../core/game';
import { Library } from '../core/library';
import { Modal } from '../ui/modal';
import { RichText } from './rich-text';
import { ScreenCard } from './screen-card';

/** Renders the engine's output tree. Recursive for blocks and revealed fragments. */
@Component({
  selector: 'cr-story-output',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText, ScreenCard, Modal],
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
            <button type="button" class="btn setup-continue" (click)="game.click(o.id)">
              {{ library.text('UI/ItemObtain/ViewArea/Acceptbtn/Text (TMP)', 'Accept') }}
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
          @if (o.style === 'setupEvent') {
            <!-- The original shows these as a pop-up with a picture; ACCEPT continues. -->
            <cr-modal [label]="setupLabel">
              <h2 class="heading setup-heading">{{ setupLabel }}</h2>
              @if (o.image && library.setupImage(o.image); as src) {
                <img class="setup-image" [src]="src" alt="" />
              }
              <div class="setup-body"><cr-story-output [items]="trim(o.children)" /></div>
            </cr-modal>
          } @else {
            <section class="block" [class]="o.style">
              @if (o.style === 'setup') {
                <header>{{ setupLabel }}</header>
              }
              <cr-story-output [items]="trim(o.children)" />
            </section>
          }
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
  protected readonly library = inject(Library);
  readonly items = input.required<Out[]>();
  protected readonly setupContinue = SETUP_CONTINUE_KEY;

  /** Line breaks at the start or end of a block only add empty space. */
  protected trim(out: Out[]): Out[] {
    let start = 0,
      end = out.length;
    while (start < end && out[start]!.t === 'br') start++;
    while (end > start && out[end - 1]!.t === 'br') end--;
    return out.slice(start, end);
  }
  protected get setupLabel(): string {
    return this.library.text('@TwineTMProPlayer.setupText', 'Setup');
  }
}
