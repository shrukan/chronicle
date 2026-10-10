import {
  afterNextRender,
  booleanAttribute,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/**
 * Focuses the element when it appears, so the screen's main action reacts to Enter
 * (and its input accepts typing) without clicking first. `[crAutofocus]="false"` opts out,
 * e.g. for all but one item of a list.
 */
@Directive({ selector: '[crAutofocus]' })
export class Autofocus {
  readonly enabled = input(true, { alias: 'crAutofocus', transform: booleanAttribute });

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (!this.enabled()) return;
      // Don't steal focus from something the user is already typing in.
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active.matches('input, textarea, select') &&
        !el.contains(active)
      )
        return;
      el.focus({ preventScroll: true });
    });
  }
}
