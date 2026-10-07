import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/**
 * Focuses the element when it appears, so the screen's main action reacts to Enter
 * (and its input accepts typing) without clicking first.
 */
@Directive({ selector: '[crAutofocus]' })
export class Autofocus {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
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
