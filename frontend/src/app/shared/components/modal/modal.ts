import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Settings } from '../../../core/services/settings';
import { ModalStack } from './modal-stack';

/**
 * A modal dialog on the native `<dialog>` element (focus trap, Esc and top layer for free).
 * Open while `open` is true; `dismissable` allows closing with Esc / backdrop. Several
 * open dialogs queue up (see ModalStack).
 */
@Component({
  selector: 'cr-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal.html',
  styleUrl: './modal.css',
})
export class Modal {
  readonly open = input(true);
  readonly label = input('');
  readonly dismissable = input(false);
  readonly fullscreen = input(false);
  protected readonly settings = inject(Settings);
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    const stack = inject(ModalStack);
    inject(DestroyRef).onDestroy(() => stack.release(this));
    effect(() => {
      if (this.open()) stack.request(this);
      else stack.release(this);
    });
    // Only the first waiting dialog is shown; the next one opens when it closes.
    effect(() => {
      const d = this.dialog().nativeElement;
      const show = this.open() && stack.active() === this;
      if (show && !d.open) d.showModal();
      if (!show && d.open) d.close();
    });
  }

  protected onCancel(e: Event): void {
    if (!this.dismissable()) e.preventDefault();
    else this.closed.emit();
  }
}
