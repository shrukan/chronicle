import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** How often an open app looks for a new version (it also looks when it comes back to the front). */
const CHECK_EVERY_MS = 30 * 60_000;

/**
 * Notices when the service worker has downloaded a new version. The app keeps running the
 * old one until it is reloaded; `ready` lets the shell offer that reload.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly sw = inject(SwUpdate);
  readonly ready = signal(false);

  constructor() {
    if (!this.sw.isEnabled) return;
    const sub = this.sw.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.ready.set(true);
    });
    const check = () => void this.sw.checkForUpdate().catch(() => false);
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** Switches to the new version. Games are saved after every step, so nothing is lost. */
  async reload(): Promise<void> {
    await this.sw.activateUpdate().catch(() => false);
    location.reload();
  }
}
