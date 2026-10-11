import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { AppErrors } from './core/services/app-errors';
import { Install } from './core/services/install';
import { WhatsNew } from './core/services/whats-new';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useExisting: AppErrors },
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => {
      // Before the settings are first saved: they tell a returning player from a first visit.
      inject(WhatsNew);
      // From the start: Chrome offers installing once, early.
      inject(Install);
    }),
  ],
};
