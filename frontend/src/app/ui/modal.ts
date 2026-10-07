import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * A modal dialog on the native `<dialog>` element (focus trap, Esc and top layer for free).
 * Open while `open` is true; `dismissable` allows closing with Esc / backdrop.
 */
@Component({
  selector: 'cr-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="paper" (cancel)="onCancel($event)" [attr.aria-label]="label()">
      <ng-content />
    </dialog>
  `,
  styles: `
    dialog {
      /* Tailwind's reset removes the browser's margin: auto, which centres a modal dialog. */
      margin: auto;
      width: min(36rem, calc(100vw - 2rem));
      max-height: calc(100dvh - 2rem);
      overflow: auto;
      border: 0;
    }
    dialog::backdrop {
      background: rgb(10 8 6 / 0.7);
      backdrop-filter: blur(2px);
    }
    dialog[open] {
      animation: appear 0.25s ease-out;
    }
    @keyframes appear {
      from {
        opacity: 0;
        transform: translateY(0.75rem) scale(0.98);
      }
    }
  `,
})
export class Modal {
  readonly open = input(true);
  readonly label = input('');
  readonly dismissable = input(false);
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const d = this.dialog().nativeElement;
      if (this.open() && !d.open) d.showModal();
      if (!this.open() && d.open) d.close();
    });
  }

  protected onCancel(e: Event): void {
    if (!this.dismissable()) e.preventDefault();
    else this.closed.emit();
  }
}
