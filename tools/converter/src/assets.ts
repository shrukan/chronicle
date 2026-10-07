/**
 * Extracts images and audio from the original Unity project into `content/assets/`:
 * icons (TextMeshPro sprite assets), setup pictures, UI art, music, effects and voice-over.
 * Images become WebP, audio becomes MP3 (plays in every browser). A manifest maps the
 * names the app uses to files.
 *
 * Usage: node tools/converter/src/assets.ts [--upstream upstream/UnityOriginalApp] [--out content/assets]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { ScenarioExtras } from '@chronicle/engine';
import { guidIndex } from './unity.ts';

export interface AssetManifest {
  /** Icon name as used in `{icon:NAME}` → file. */
  icons: Record<string, string>;
  /** Setup picture name as set in `_SetupImage` → file. */
  setup: Record<string, string>;
  /** UI art, keyed by its path in the original (lower-case, dashes). */
  ui: Record<string, string>;
  music: { title: string; scenario: Record<string, string> };
  effects: Record<string, string>;
  /** Passage → voice-over files. */
  voiceOver: Record<string, { male?: string; female?: string }>;
}

/** Sound effects by the screen that plays them (from the main scene's components). */
const EFFECTS: Record<string, string> = {
  welcome: 'SFX/New_8_April/welcome to my fathers work-window.ogg',
  footsteps: 'SFX/Enter room-footsteps.ogg',
  setupWindow: 'SFX/New_8_April/set up window-new.ogg',
  endOfRound: 'New SFX/Fathers work SFX pt 2/End of round.ogg',
  specialEvent: 'New SFX/Fathers work SFX pt 2/Special Event-words appear.ogg',
  biddingOpen: 'New SFX/Fathers work SFX pt 2/Set up-window appear.ogg',
  reveal: 'New SFX/Fathers work SFX pt 2/Reveal.ogg',
  help: 'SFX/New_8_April/select-Help tab.ogg',
  thunder: 'SFX/New_8_April/Thunder-vox story.ogg',
};

/**
 * Story music per scenario (`ViewGenerationEnding.clip[StoryIndex]`). The original really
 * plays "Chronicle Part one" for The Cost of Disease; the file named after it belongs to
 * A Time of War.
 */
const MUSIC = {
  title: 'SFX/Fathers work Title theme.ogg',
  scenario: {
    'cost-of-disease': 'SFX/New_8_April/My Fathers Work-OST/Chronicle Part one_1-2.ogg',
    'fear-of-the-unknown': 'SFX/New_8_April/My Fathers Work-OST/Chronicle Part Two_2-2.ogg',
    'a-time-of-war': 'SFX/New_8_April/My Fathers Work-OST/Cost of disease theme loop-louder.ogg',
  },
};

/** UI art folders that are not used (animation frames, Unity-specific widgets). */
const SKIP_UI = /^(ScreenTransitions|CollapseAssets|SettingPanel|FakeLight)\//;

function slug(path: string): string {
  return path
    .replace(/\.[^.]+$/, '')
    .replace(/\(\d+,\s*\d+\)/g, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/-+(\/|$)/g, '$1')
    .replace(/(^|\/)-+/g, '$1');
}

/** Runs ffmpeg unless the output is newer than the input. */
function convert(input: string, output: string, args: string[]): void {
  if (existsSync(output) && statSync(output).mtimeMs >= statSync(input).mtimeMs) return;
  mkdirSync(dirname(output), { recursive: true });
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...args, output], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${input}: ${r.stderr}`);
}

const image = (input: string, output: string) => convert(input, output, ['-c:v', 'libwebp', '-quality', '85', '-compression_level', '6']);
const audio = (input: string, output: string, mono = false) =>
  convert(input, output, ['-vn', '-c:a', 'libmp3lame', '-q:a', mono ? '6' : '4', ...(mono ? ['-ac', '1'] : [])]);

export function extractAssets(assets: string, out: string, voiceOver: ScenarioExtras['voiceOver']): AssetManifest {
  const guids = guidIndex(assets);
  const m: AssetManifest = { icons: {}, setup: {}, ui: {}, music: { title: '', scenario: {} }, effects: {}, voiceOver: {} };
  const rel = (p: string) => p.slice(out.length + 1);

  // Icons: every TextMeshPro sprite asset is one 64×64 glyph covering its whole texture.
  const spriteDir = join(assets, 'TextMesh Pro/Resources/Sprite Assets');
  for (const f of readdirSync(spriteDir).filter((f) => f.endsWith('.asset'))) {
    const name = basename(f, '.asset');
    if (name === 'EmojiOne' || name.startsWith('bracket-')) continue;
    const texture = guids.get(/spriteSheet: \{fileID: \d+, guid: (\w+)/.exec(readFileSync(join(spriteDir, f), 'utf8'))?.[1] ?? '');
    if (!texture) continue;
    const file = join(out, 'icons', `${slug(name)}.webp`);
    image(join(assets, texture), file);
    m.icons[name] = rel(file);
  }

  // Setup pictures (`_SetupImage` names), loaded by name from Resources in the original.
  const setupDir = join(assets, 'Resources/setupImages');
  for (const f of readdirSync(setupDir).filter((f) => f.endsWith('.png'))) {
    const file = join(out, 'setup', `${slug(f)}.webp`);
    image(join(setupDir, f), file);
    m.setup[basename(f, '.png')] = rel(file);
  }

  // UI art.
  const uiDir = join(assets, 'New_UI_Assets');
  const walk = (dir: string, prefix = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : extname(e.name) === '.png' ? [`${prefix}${e.name}`] : []));
  for (const f of walk(uiDir).filter((f) => !SKIP_UI.test(f))) {
    const key = slug(f);
    if (m.ui[key]) continue; // duplicates like "bracket-left (1).png"
    const file = join(out, 'ui', `${key}.webp`);
    image(join(uiDir, f), file);
    m.ui[key] = rel(file);
  }

  // Music, effects, voice-over.
  const music = (src: string, name: string) => {
    const file = join(out, 'audio', `${name}.mp3`);
    audio(join(assets, src), file);
    return rel(file);
  };
  m.music.title = music(MUSIC.title, 'music/title');
  for (const [id, src] of Object.entries(MUSIC.scenario)) m.music.scenario[id] = music(src, `music/${id}`);
  for (const [name, src] of Object.entries(EFFECTS)) m.effects[name] = music(src, `effects/${slug(name)}`);
  for (const [passage, voices] of Object.entries(voiceOver)) {
    for (const [voice, src] of Object.entries(voices) as [keyof typeof voices, string][]) {
      const file = join(out, 'audio', 'voice', voice, `${slug(basename(src))}.mp3`);
      audio(join(assets, src), file, true);
      (m.voiceOver[passage] ??= {})[voice] = rel(file);
    }
  }
  return m;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      upstream: { type: 'string', default: 'upstream/UnityOriginalApp' },
      out: { type: 'string', default: 'content/assets' },
      content: { type: 'string', default: 'content' },
    },
  });
  // Voice-over clips of every converted scenario.
  const voiceOver: ScenarioExtras['voiceOver'] = {};
  for (const id of readdirSync(values.content)) {
    const extras = join(values.content, id, 'extras.json');
    if (existsSync(extras)) Object.assign(voiceOver, (JSON.parse(readFileSync(extras, 'utf8')) as ScenarioExtras).voiceOver);
  }
  const manifest = extractAssets(join(values.upstream, 'Assets'), values.out, voiceOver);
  writeFileSync(join(values.out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  const count = (o: object) => Object.keys(o).length;
  console.log(
    `assets: ${count(manifest.icons)} icons, ${count(manifest.setup)} setup pictures, ${count(manifest.ui)} UI images, ` +
      `${1 + count(manifest.music.scenario)} music tracks, ${count(manifest.effects)} effects, ${count(manifest.voiceOver)} voiced passages`,
  );
}
