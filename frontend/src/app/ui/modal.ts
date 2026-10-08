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
import { Settings } from '../core/settings';
import { ModalStack } from './modal-stack';

/**
 * A modal dialog on the native `<dialog>` element (focus trap, Esc and top layer for free).
 * Open while `open` is true; `dismissable` allows closing with Esc / backdrop. Several
 * open dialogs queue up (see ModalStack).
 */
@Component({
  selector: 'cr-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      [class.paper]="!fullscreen()"
      [class.fullscreen]="fullscreen()"
      (cancel)="onCancel($event)"
      [attr.aria-label]="label()"
    >
      <ng-content />
      <!-- Dialogs block the rest of the page, the header's mute button included. Last in the
           DOM so the dialog's own first button gets the focus (Enter). -->
      <button
        type="button"
        class="sound"
        (click)="settings.muted.set(!settings.muted())"
        [attr.aria-label]="settings.muted() ? 'Turn sound on' : 'Mute all sound'"
        [attr.aria-pressed]="settings.muted()"
        [title]="settings.muted() ? 'Turn sound on' : 'Mute all sound'"
      >
        <span class="speaker" [class.off]="settings.muted()" aria-hidden="true"></span>
      </button>
    </dialog>
  `,
  styles: `
    dialog {
      /* Tailwind's reset removes the browser's margin: auto, which centres a modal dialog. */
      margin: auto;
      width: min(36rem, calc(100vw - 2rem));
      max-height: calc(100dvh - 2rem);
      overflow: auto;
      /* The original's gold frame around dialogs. */
      border: 1.1rem solid transparent;
      border-image: var(--frame-image) 70 / 1.1rem stretch;
      background-clip: padding-box;
    }
    /* Covers the whole screen, e.g. to hide a page until the right player holds the device. */
    dialog.fullscreen {
      width: 100vw;
      height: 100dvh;
      max-width: none;
      max-height: none;
      margin: 0;
      border: 0;
      padding: 0;
      background: var(--color-backdrop) var(--backdrop-image, none) center / cover;
    }
    .sound {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      display: grid;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-muted);
      cursor: pointer;
    }
    dialog.fullscreen .sound {
      top: max(0.75rem, env(safe-area-inset-top));
      right: 0.75rem;
      color: var(--color-on-backdrop);
    }
    .sound:hover,
    .sound:focus-visible {
      color: var(--color-accent-text);
    }
    .speaker {
      width: 1.2rem;
      height: 1.2rem;
      background: currentColor;
      mask: var(--icon-sound) center / contain no-repeat;
    }
    .speaker.off {
      mask-image: var(--icon-muted);
    }
    dialog::backdrop {
      background: rgb(10 8 6 / 0.7);
      backdrop-filter: blur(2px);
    }
    dialog[open] {
      animation: appear 0.25s ease-out;
    }
    /* Opaque from the first frame: a fade-in would show the page it hides. */
    dialog.fullscreen[open] {
      animation: none;
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
