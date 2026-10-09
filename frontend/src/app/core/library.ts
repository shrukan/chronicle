import { computed, Injectable, signal } from '@angular/core';
import type { AssetManifest, GeneratedVoices, ReadingMode, UiText } from '@chronicle/engine';

const BASE = 'content';

/** The original app's voices, named by its screen texts. */
const ORIGINAL_VOICES = [
  { value: 'female', key: 'UI/VoiceTrack/Viewarea/Prompt/Female/Lable', fallback: 'Feminine' },
  { value: 'male', key: 'UI/VoiceTrack/Viewarea/Prompt/Male/Lable', fallback: 'Masculine' },
];

/**
 * Content shared by all scenarios: the original app's screen texts and the asset manifest
 * (icons, pictures, UI art, audio). Loaded once at start-up.
 */
@Injectable({ providedIn: 'root' })
export class Library {
  readonly texts = signal<UiText>({});
  readonly assets = signal<AssetManifest | undefined>(undefined);
  private readonly generated = signal<GeneratedVoices>({ voices: {}, clips: {} });
  private loading?: Promise<void>;

  /** Voice choices: the original recordings, then the generated voices. */
  readonly voices = computed(() => [
    ...ORIGINAL_VOICES.map((v) => ({ value: v.value, label: this.text(v.key, v.fallback) })),
    ...Object.entries(this.generated().voices).map(([value, name]) => ({
      value,
      label: `${name} (generated)`,
    })),
  ]);

  load(): Promise<void> {
    this.loading ??= (async () => {
      const [texts, assets, generated] = await Promise.all([
        fetch(`${BASE}/ui.en.json`).then((r) => (r.ok ? (r.json() as Promise<UiText>) : {})),
        fetch(`${BASE}/assets/manifest.json`).then((r) =>
          r.ok ? (r.json() as Promise<AssetManifest>) : undefined,
        ),
        fetch(`${BASE}/assets/voices.json`).then((r) =>
          r.ok ? (r.json() as Promise<GeneratedVoices>) : undefined,
        ),
      ]);
      this.texts.set(texts);
      this.assets.set(assets);
      if (generated) this.generated.set(generated);
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

  /** An icon by name; the original's texts aren't consistent about case (`storybook`). */
  icon(name: string): string | undefined {
    const icons = this.assets()?.icons;
    if (!icons) return undefined;
    const key = name in icons ? name : this.iconKeys().get(name.toLowerCase());
    return this.url(key ? icons[key] : undefined);
  }

  private readonly iconKeys = computed(
    () => new Map(Object.keys(this.assets()?.icons ?? {}).map((k) => [k.toLowerCase(), k])),
  );

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

  /**
   * A passage's voice-over in `mode`: `full` unless the page shows easy or short text. The
   * original recordings only read the full text.
   */
  voiceOver(passage: string, voice: string, mode: ReadingMode): string | undefined {
    const generated = this.generated().clips[passage]?.[voice]?.[mode];
    const original =
      mode === 'full' && (voice === 'male' || voice === 'female')
        ? this.assets()?.voiceOver[passage]?.[voice]
        : undefined;
    return this.url(generated ?? original);
  }
}
