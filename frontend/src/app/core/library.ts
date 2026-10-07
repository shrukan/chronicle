import { Injectable, signal } from '@angular/core';
import type { AssetManifest, UiText } from '@chronicle/engine';

const BASE = 'content';

/**
 * Content shared by all scenarios: the original app's screen texts and the asset manifest
 * (icons, pictures, UI art, audio). Loaded once at start-up.
 */
@Injectable({ providedIn: 'root' })
export class Library {
  readonly texts = signal<UiText>({});
  readonly assets = signal<AssetManifest | undefined>(undefined);
  private loading?: Promise<void>;

  load(): Promise<void> {
    this.loading ??= (async () => {
      const [texts, assets] = await Promise.all([
        fetch(`${BASE}/ui.en.json`).then((r) => (r.ok ? (r.json() as Promise<UiText>) : {})),
        fetch(`${BASE}/assets/manifest.json`).then((r) =>
          r.ok ? (r.json() as Promise<AssetManifest>) : undefined,
        ),
      ]);
      this.texts.set(texts);
      this.assets.set(assets);
    })();
    return this.loading;
  }

  /** A screen text by key; `fallback` while texts load or if the key is missing. */
  text(key: string, fallback = ''): string {
    const v = this.texts()[key];
    return typeof v === 'string' ? v : fallback;
  }

  list(key: string): string[] {
    const v = this.texts()[key];
    return Array.isArray(v) ? v : [];
  }

  private url(path: string | undefined): string | undefined {
    return path ? `${BASE}/assets/${path}` : undefined;
  }

  icon(name: string): string | undefined {
    return this.url(this.assets()?.icons[name]);
  }

  setupImage(name: string): string | undefined {
    return this.url(this.assets()?.setup[name]);
  }

  /** UI art by its key in the manifest, e.g. `general/main-bg`. */
  ui(key: string): string | undefined {
    return this.url(this.assets()?.ui[key]);
  }

  music(scenario?: string): string | undefined {
    const m = this.assets()?.music;
    return this.url((scenario && m?.scenario[scenario]) || m?.title);
  }

  endingMusic(): string | undefined {
    return this.url(this.assets()?.music.ending);
  }

  effect(name: string): string | undefined {
    return this.url(this.assets()?.effects[name]);
  }

  voiceOver(passage: string, voice: 'male' | 'female'): string | undefined {
    return this.url(this.assets()?.voiceOver[passage]?.[voice]);
  }
}
