import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

/** A dialog in the stack; `back()` answers the browser's Back, true if it closed. */
export interface StackedModal {
  back(): boolean;
}

/** Marks the history entry that an open dialog adds. */
const ENTRY = 'crModal';

/**
 * Lets only one dialog be open at a time. A passage can raise several at once (a setup
 * pop-up and the end-of-round screen); they then appear one after another, in page order.
 *
 * Back (the browser's, Android's back gesture) closes the dialog in front instead of leaving
 * the page: while one is open, a history entry of its own sits on top. A dialog that must be
 * answered (a hand-over, the end of a round) stays, and the entry is put back.
 */
@Injectable({ providedIn: 'root' })
export class ModalStack {
  private readonly waiting = signal<readonly StackedModal[]>([]);
  readonly active = computed(() => this.waiting()[0]);

  private readonly router = inject(Router);

  constructor() {
    const ours = () => (history.state as Record<string, unknown> | null)?.[ENTRY] === true;
    effect(() => {
      const open = this.active() !== undefined;
      if (open && !ours()) history.pushState({ ...history.state, [ENTRY]: true }, '');
      // Closed by its own buttons: take the entry away again – unless a button also left the
      // page ("Main menu"); going back would then undo that.
      if (!open && ours())
        setTimeout(() => {
          if (!this.active() && ours() && !this.router.currentNavigation()) history.back();
        });
    });
    addEventListener('popstate', () => {
      const front = this.active();
      if (front && !front.back()) history.pushState({ ...history.state, [ENTRY]: true }, '');
    });
  }

  request(owner: StackedModal): void {
    if (!this.waiting().includes(owner)) this.waiting.update((w) => [...w, owner]);
  }

  release(owner: StackedModal): void {
    this.waiting.update((w) => w.filter((o) => o !== owner));
  }
}
