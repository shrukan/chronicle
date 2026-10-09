import { effect, Injectable, signal } from '@angular/core';
import type { ReadingMode } from '@chronicle/engine';

/** `female`/`male`: the original recordings; anything else a generated voice (Library.voices). */
export type Voice = string;
/**
 * Languages of the story and the reading modes (versions) each one has; the settings only
 * offer these.
 */
export const LANGUAGES: { code: string; name: string; versions: Record<ReadingMode, string> }[] = [
  {
    code: 'en',
    name: 'English',
    versions: { full: 'Original', easy: 'Easy English', short: 'Short' },
  },
];

/** Light or dark paper; `auto` follows the system. */
export type Theme = 'auto' | 'light' | 'dark';

interface Stored {
  language: string;
  voice: Voice;
  music: number;
  effects: number;
  voiceOver: number;
  readingMode: ReadingMode;
  /** Open plain "continue" reveals automatically, so a page appears in one piece. */
  wholePage: boolean;
  /** All sound off, without touching the volumes. */
  muted: boolean;
  theme: Theme;
}

const KEY = 'chronicle.settings';
const DEFAULTS: Stored = {
  language: 'en',
  voice: 'female',
  music: 0.5,
  effects: 0.8,
  voiceOver: 1,
  readingMode: 'full',
  wholePage: true,
  muted: false,
  theme: 'auto',
};

function read(): Stored {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Stored>) };
  } catch {
    return DEFAULTS;
  }
}

/** Per-device preferences, kept in localStorage. Volumes are 0…1. */
@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly initial = read();
  readonly language = signal(this.initial.language);
  readonly voice = signal<Voice>(this.initial.voice);
  readonly music = signal(this.initial.music);
  readonly effects = signal(this.initial.effects);
  readonly voiceOver = signal(this.initial.voiceOver);
  readonly readingMode = signal<ReadingMode>(this.initial.readingMode);
  readonly wholePage = signal(this.initial.wholePage);
  readonly muted = signal(this.initial.muted);
  readonly theme = signal<Theme>(this.initial.theme);

  constructor() {
    effect(() => {
      const value: Stored = {
        language: this.language(),
        voice: this.voice(),
        music: this.music(),
        effects: this.effects(),
        voiceOver: this.voiceOver(),
        readingMode: this.readingMode(),
        wholePage: this.wholePage(),
        muted: this.muted(),
        theme: this.theme(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        // Private mode or storage disabled: settings just don't persist.
      }
    });
  }
}
