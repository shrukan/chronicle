import { ErrorHandler, Injectable, signal } from '@angular/core';

/**
 * Errors nothing else handled: bugs in the app (errors in the story data are shown by the
 * storybook itself). Logged as before, and kept so the shell can offer a bug report.
 */
@Injectable({ providedIn: 'root' })
export class AppErrors implements ErrorHandler {
  readonly last = signal<string | undefined>(undefined);

  handleError(error: unknown): void {
    console.error(error);
    this.last.set(error instanceof Error ? error.message : String(error));
  }
}
