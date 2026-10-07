import { effect, inject, Injectable } from '@angular/core';
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

  constructor() {
    effect(() => {
      const volume = this.settings.music();
      if (this.music) this.music.volume = volume;
    });
    effect(() => {
      const volume = this.settings.voiceOver();
      if (this.voice) this.voice.volume = volume;
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
    if (!src || this.settings.effects() === 0) return;
    let loaded = this.effects.get(src);
    if (!loaded) {
      loaded = new Audio(src);
      loaded.preload = 'auto';
      this.effects.set(src, loaded);
    }
    // A copy, so quick repeated clicks overlap instead of cutting each other off.
    const a = loaded.cloneNode() as HTMLAudioElement;
    a.volume = this.settings.effects();
    void a.play().catch(() => undefined);
  }

  /** Voice-over of a passage in the chosen voice; stops any voice-over still playing. */
  playVoice(passage: string): void {
    this.stopVoice();
    const src = this.library.voiceOver(passage, this.settings.voice());
    if (!src || this.settings.voiceOver() === 0) return;
    this.voice = new Audio(src);
    this.voice.volume = this.settings.voiceOver();
    void this.voice.play().catch(() => undefined);
  }

  stopVoice(): void {
    this.voice?.pause();
    this.voice = undefined;
  }
}
