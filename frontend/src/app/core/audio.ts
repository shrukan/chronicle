import { effect, inject, Injectable } from '@angular/core';
import type { ReadingMode } from '@chronicle/engine';
import { Library } from './library';
import { Settings } from './settings';

/**
 * Music, sound effects and voice-over. Browsers only allow sound after a user gesture, so
 * everything is started from clicks and failures to play are ignored.
 */
@Injectable({ providedIn: 'root' })
export class AudioPlayer {
  private readonly library = inject(Library);
  private readonly settings = inject(Settings);

  private music?: HTMLAudioElement;
  private musicSrc?: string;
  private voice?: HTMLAudioElement;
  /** Loaded effects, so short sounds like the click play without delay. */
  private readonly effects = new Map<string, HTMLAudioElement>();
  /** Effects still playing, so muting or the effects slider reaches them too. */
  private readonly playing = new Set<HTMLAudioElement>();

  constructor() {
    effect(() => {
      const volume = this.settings.music();
      const muted = this.settings.muted();
      if (this.music) Object.assign(this.music, { volume, muted });
    });
    effect(() => {
      const volume = this.settings.effects();
      const muted = this.settings.muted();
      for (const a of this.playing) Object.assign(a, { volume, muted });
    });
    effect(() => {
      const volume = this.settings.voiceOver();
      const muted = this.settings.muted();
      if (this.voice) Object.assign(this.voice, { volume, muted });
    });
  }

  /** Loops the music of a scenario (or the title music); keeps playing if it's already on. */
  playMusic(scenario?: string): void {
    this.loop(this.library.music(scenario));
  }

  /** The original switches to its own music once an ending is reached. */
  playEndingMusic(): void {
    this.loop(this.library.endingMusic());
  }

  private loop(src: string | undefined): void {
    if (!src || src === this.musicSrc) return;
    this.music?.pause();
    this.musicSrc = src;
    this.music = new Audio(src);
    this.music.loop = true;
    this.music.volume = this.settings.music();
    this.music.muted = this.settings.muted();
    void this.music.play().catch(() => (this.musicSrc = undefined));
  }

  stopMusic(): void {
    this.music?.pause();
    this.music = undefined;
    this.musicSrc = undefined;
  }

  /** Loads effects ahead of time (the click should never lag). */
  preload(...names: string[]): void {
    for (const name of names) {
      const src = this.library.effect(name);
      if (src && !this.effects.has(src)) {
        const a = new Audio(src);
        a.preload = 'auto';
        this.effects.set(src, a);
      }
    }
  }

  effect(name: string): void {
    const src = this.library.effect(name);
    if (!src || this.settings.effects() === 0 || this.settings.muted()) return;
    let loaded = this.effects.get(src);
    if (!loaded) {
      loaded = new Audio(src);
      loaded.preload = 'auto';
      this.effects.set(src, loaded);
    }
    // A copy, so quick repeated clicks overlap instead of cutting each other off.
    const a = loaded.cloneNode() as HTMLAudioElement;
    a.volume = this.settings.effects();
    this.playing.add(a);
    a.addEventListener('ended', () => this.playing.delete(a), { once: true });
    void a.play().catch(() => this.playing.delete(a));
  }

  /**
   * Voice-over of a passage in the chosen voice, reading the text in `mode`; stops any
   * voice-over still playing.
   */
  playVoice(passage: string, mode: ReadingMode): void {
    this.stopVoice();
    const src = this.library.voiceOver(passage, this.settings.voice(), mode);
    if (!src || this.settings.voiceOver() === 0) return;
    this.voice = new Audio(src);
    this.voice.volume = this.settings.voiceOver();
    this.voice.muted = this.settings.muted();
    void this.voice.play().catch(() => undefined);
  }

  stopVoice(): void {
    this.voice?.pause();
    this.voice = undefined;
  }
}
