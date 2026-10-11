import { computed, Injectable, signal } from '@angular/core';

/** Chrome's install offer (not in TypeScript's DOM types yet). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED = 'chronicle.installHintDismissed';

function stored(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

/** Already running as an installed app (home screen, dock, desktop window). */
function standalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone or iPad, where only the Share menu installs (iPads may say they are Macs). */
function appleMobile(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Suggests installing Chronicle: installed, it opens full screen, works offline and keeps its
 * saves safe (Safari clears a website's data after about a week without a visit). Chrome and
 * Edge can show their own install dialog; on iPhone and iPad only the Share menu can, so the
 * hint explains the steps. Created at start, so Chrome's offer isn't missed.
 */
@Injectable({ providedIn: 'root' })
export class Install {
  private offer?: InstallPromptEvent;
  private readonly offered = signal(false);
  private readonly isInstalled = signal(standalone());
  private readonly dismissed = signal(stored());
  /** The browser offers its own install dialog (see `prompt`). */
  readonly canPrompt = this.offered.asReadonly();
  /** Running as the installed app, or just installed. */
  readonly installed = this.isInstalled.asReadonly();
  /** iPhone or iPad: only Share → Add to Home Screen installs. */
  readonly apple = appleMobile();

  /** Which hint to show: the install button, the iPhone/iPad steps, or none. */
  readonly hint = computed<'prompt' | 'apple' | undefined>(() => {
    if (this.installed() || this.dismissed()) return undefined;
    if (this.canPrompt()) return 'prompt';
    return this.apple ? 'apple' : undefined;
  });

  constructor() {
    addEventListener('beforeinstallprompt', (e) => {
      // Keep it for the button instead of the browser's own mini bar.
      e.preventDefault();
      this.offer = e as InstallPromptEvent;
      this.offered.set(true);
    });
    addEventListener('appinstalled', () => this.isInstalled.set(true));
  }

  /** Opens the browser's install dialog. */
  async prompt(): Promise<void> {
    const offer = this.offer;
    if (!offer) return;
    // An offer can be used once.
    this.offer = undefined;
    this.offered.set(false);
    await offer.prompt();
    if ((await offer.userChoice).outcome === 'accepted') this.isInstalled.set(true);
  }

  /** Not now, and not again on this device. */
  dismiss(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Private mode: the hint comes back next time, which is harmless.
    }
  }
}
