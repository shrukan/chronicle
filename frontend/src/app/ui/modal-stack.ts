import { computed, Injectable, signal } from '@angular/core';

/**
 * Lets only one dialog be open at a time. A passage can raise several at once (a setup
 * pop-up and the end-of-round screen); they then appear one after another, in page order.
 */
@Injectable({ providedIn: 'root' })
export class ModalStack {
  private readonly waiting = signal<readonly object[]>([]);
  readonly active = computed(() => this.waiting()[0]);

  request(owner: object): void {
    if (!this.waiting().includes(owner)) this.waiting.update((w) => [...w, owner]);
  }

  release(owner: object): void {
    this.waiting.update((w) => w.filter((o) => o !== owner));
  }
}
