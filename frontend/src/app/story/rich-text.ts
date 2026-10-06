import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { parseMarkup } from '@chronicle/engine';

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
          <span class="icon" [title]="span.name">{{ iconLabel(span.name) }}</span>
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
      padding: 0 0.35em;
      border: 1px solid var(--color-accent);
      border-radius: 0.3em;
      font-size: 0.8em;
      font-variant: small-caps;
      color: var(--color-accent);
      vertical-align: 0.1em;
    }
  `,
})
export class RichText {
  readonly text = input.required<string>();
  readonly args = input<string[]>([]);

  protected readonly spans = computed(() => parseMarkup(this.text(), this.args()));

  /** Placeholder until the original icon images are extracted (M4). */
  protected iconLabel(name: string): string {
    return name
      .replace(/^S\d_/, '')
      .replace(/_?Icon$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
  }
}
