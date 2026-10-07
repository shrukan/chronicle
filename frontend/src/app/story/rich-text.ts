import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { parseMarkup } from '@chronicle/engine';
import { Library } from '../core/library';

/** Renders string-table markup: **bold**, *italic*, {icon:NAME}, {0} placeholders. */
@Component({
  selector: 'cr-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (span of spans(); track $index) {
      @switch (span.t) {
        @case ('text') {
          <span [class.font-semibold]="span.bold" [class.italic]="span.italic">{{
            span.text
          }}</span>
        }
        @case ('icon') {
          @if (library.icon(span.name); as src) {
            <img
              class="icon"
              [src]="src"
              [alt]="iconLabel(span.name)"
              [title]="iconLabel(span.name)"
            />
          } @else {
            <span class="icon-label" [title]="span.name">{{ iconLabel(span.name) }}</span>
          }
        }
        @case ('newline') {
          <br />
        }
      }
    }
  `,
  styles: `
    .icon {
      display: inline-block;
      width: 1.6em;
      height: 1.6em;
      margin: -0.3em 0.1em;
      object-fit: contain;
      vertical-align: middle;
    }
    .icon-label {
      display: inline-block;
      padding: 0 0.35em;
      border: 1px solid var(--color-accent);
      border-radius: 0.3em;
      font-size: 0.8em;
      font-variant: small-caps;
      color: var(--color-accent);
    }
  `,
})
export class RichText {
  protected readonly library = inject(Library);
  readonly text = input.required<string>();
  readonly args = input<string[]>([]);

  protected readonly spans = computed(() => parseMarkup(this.text(), this.args()));

  protected iconLabel(name: string): string {
    return name
      .replace(/^S\d_/, '')
      .replace(/_?Icon$/i, '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
  }
}
