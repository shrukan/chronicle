import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  resolveEntry,
  type AssetManifest,
  type GeneratedVoices,
  type ReadingMode,
  type UiText,
} from '@chronicle/engine';
import { Settings } from './settings';

const BASE = 'content';

/**
 * The original app's voices, named by its screen texts. They only read the original English
 * text; with another version or language the generated `standIn` takes over.
 */
const ORIGINAL_VOICES = [
  {
    value: 'female',
    key: 'UI/VoiceTrack/Viewarea/Prompt/Female/Lable',
    fallback: 'Feminine',
    standIn: 'emma',
  },
  {
    value: 'male',
    key: 'UI/VoiceTrack/Viewarea/Prompt/Male/Lable',
    fallback: 'Masculine',
    standIn: 'george',
  },
];

/**
 * Content shared by all scenarios: the original app's screen texts and the asset manifest
 * (icons, pictures, UI art, audio). Loaded once at start-up.
 */
@Injectable({ providedIn: 'root' })
export class Library {
  private readonly settings = inject(Settings);
  readonly texts = signal<UiText>({});
  readonly assets = signal<AssetManifest | undefined>(undefined);
  private readonly generated = signal<GeneratedVoices>({ voices: {}, clips: {} });
  private loading?: Promise<void>;

  constructor() {
    // An original narrator chosen while the text is not the original: its stand-in reads instead.
    effect(() => {
      const voice = this.settings.voice();
      const original = ORIGINAL_VOICES.find((v) => v.value === voice);
      const voices = this.generated().voices;
      if (original && !this.originalText() && Object.keys(voices).length)
        this.settings.voice.set(
          original.standIn in voices ? original.standIn : Object.keys(voices)[0]!,
        );
    });
  }

  /** True while the original recordings can be chosen: English in its original version. */
  private readonly originalText = computed(
    () => this.settings.language() === 'en' && this.settings.readingMode() === 'full',
  );

  /** Every voice: the original recordings, then the generated voices. */
  readonly allVoices = computed(() => [
    ...ORIGINAL_VOICES.map((v) => ({
      value: v.value,
      label: `${this.text(v.key, v.fallback)} (original)`,
      original: true,
    })),
    ...Object.entries(this.generated().voices).map(([value, name]) => ({
      value,
      label: `${name} (generated)`,
      original: false,
    })),
  ]);

  /** Voice choices: the original recordings only with the original text. */
  readonly voices = computed(() =>
    this.allVoices().filter((v) => this.originalText() || !v.original),
  );

  /** Scenario id → its introduction's passage (voice test page). */
  readonly intros = computed(() => this.generated().intros ?? {});

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

  /**
   * A screen text by key; `fallback` while texts load or if the key is missing. Texts with
   * variants follow the reading mode.
   */
  text(key: string, fallback = ''): string {
    const v = this.texts()[key];
    if (typeof v === 'string') return v;
    return v && !Array.isArray(v) ? resolveEntry(v, this.settings.readingMode()) : fallback;
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
