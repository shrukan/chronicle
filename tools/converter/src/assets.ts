/**
 * Extracts images and audio from the original Unity project into `content/assets/`:
 * icons (TextMeshPro sprite assets), setup pictures, UI art, music, effects and voice-over.
 * Images become WebP, audio becomes MP3 (plays in every browser). A manifest maps the
 * names the app uses to files.
 *
 * Usage: node tools/converter/src/assets.ts [--media <Unity Assets folder>] [--out content/assets]
 *   --media: an `Assets` folder with the real media files – Renegade's community download
 *            (the fan repo on GitHub only has Git LFS pointers).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { AssetManifest, ScenarioExtras } from '@chronicle/engine';
import { guidIndex } from './unity.ts';

/** Sound effects by the screen that plays them (from the main scene's components). */
const EFFECTS: Record<string, string> = {
  // Nearly every button and every story link in the original plays this.
  click: 'New SFX/click-to-continue.ogg',
  select: 'SFX/UI Select.ogg',
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
  /** Plays once an ending is reached (`EndGameAudioSource`). */
  ending: 'SFX/New_8_April/My Fathers Work-OST/Chronicle Part  Three.ogg',
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
  if (!existsSync(input)) throw new MissingSource(input);
  if (existsSync(output) && statSync(output).mtimeMs >= statSync(input).mtimeMs) return;
  mkdirSync(dirname(output), { recursive: true });
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...args, output], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${input}: ${r.stderr}`);
}

class MissingSource extends Error {}

/**
 * Bounding box of the non-transparent pixels. Unity textures are often padded to a power of
 * two with transparent space (e.g. a 2048×2048 file whose picture fills the lower-left part).
 */
function opaqueBounds(input: string): { x: number; y: number; w: number; h: number } | undefined {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input], { encoding: 'utf8' });
  const [width, height] = probe.stdout.trim().split(',').map(Number);
  if (!width || !height) return undefined;
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', input, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: width * height * 4 + 1024 });
  const px = raw.stdout as Buffer;
  if (px.length < width * height * 4) return undefined;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === width - 1 && y1 === height - 1)) return undefined;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const image = (input: string, output: string) => {
  if (existsSync(output) && existsSync(input) && statSync(output).mtimeMs >= statSync(input).mtimeMs) return;
  const crop = existsSync(input) ? opaqueBounds(input) : undefined;
  convert(input, output, [...(crop ? ['-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`] : []), '-c:v', 'libwebp', '-quality', '85', '-compression_level', '6']);
};
/** Music and effects: VBR stereo. Speech: 48 kbit/s mono is plenty and a third of the size. */
const audio = (input: string, output: string, speech = false) =>
  convert(input, output, ['-vn', '-c:a', 'libmp3lame', ...(speech ? ['-b:a', '48k', '-ac', '1', '-ar', '32000'] : ['-q:a', '4'])]);

export function extractAssets(assets: string, out: string, voiceOver: ScenarioExtras['voiceOver']): AssetManifest {
  const guids = guidIndex(assets);
  const m: AssetManifest = { icons: {}, setup: {}, ui: {}, music: { title: '', scenario: {} }, effects: {}, voiceOver: {}, missing: [] };
  const rel = (p: string) => p.slice(out.length + 1);
  /** Runs one conversion; a missing source is recorded instead of failing the whole run. */
  const tryConvert = (fn: () => void): boolean => {
    try {
      fn();
      return true;
    } catch (e) {
      if (!(e instanceof MissingSource)) throw e;
      m.missing.push(e.message.slice(assets.length + 1));
      return false;
    }
  };

  // Icons: every TextMeshPro sprite asset is one 64×64 glyph covering its whole texture.
  const spriteDir = join(assets, 'TextMesh Pro/Resources/Sprite Assets');
  for (const f of readdirSync(spriteDir).filter((f) => f.endsWith('.asset'))) {
    const name = basename(f, '.asset');
    if (name === 'EmojiOne' || name.startsWith('bracket-')) continue;
    const texture = guids.get(/spriteSheet: \{fileID: \d+, guid: (\w+)/.exec(readFileSync(join(spriteDir, f), 'utf8'))?.[1] ?? '');
    if (!texture) continue;
    const file = join(out, 'icons', `${slug(name)}.webp`);
    if (tryConvert(() => image(join(assets, texture), file))) m.icons[name] = rel(file);
  }

  // Setup pictures (`_SetupImage` names), loaded by name from Resources in the original.
  const setupDir = join(assets, 'Resources/setupImages');
  for (const f of readdirSync(setupDir).filter((f) => f.endsWith('.png'))) {
    const file = join(out, 'setup', `${slug(f)}.webp`);
    if (tryConvert(() => image(join(setupDir, f), file))) m.setup[basename(f, '.png')] = rel(file);
  }

  // UI art.
  const uiDir = join(assets, 'New_UI_Assets');
  const walk = (dir: string, prefix = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : extname(e.name) === '.png' ? [`${prefix}${e.name}`] : []));
  for (const f of walk(uiDir).filter((f) => !SKIP_UI.test(f))) {
    const key = slug(f);
    if (m.ui[key]) continue; // duplicates like "bracket-left (1).png"
    const file = join(out, 'ui', `${key}.webp`);
    if (tryConvert(() => image(join(uiDir, f), file))) m.ui[key] = rel(file);
  }

  // Music, effects, voice-over.
  const music = (src: string, name: string): string | undefined => {
    const file = join(out, 'audio', `${name}.mp3`);
    return tryConvert(() => audio(join(assets, src), file)) ? rel(file) : undefined;
  };
  m.music.title = music(MUSIC.title, 'music/title') ?? '';
  const ending = music(MUSIC.ending, 'music/ending');
  if (ending) m.music.ending = ending;
  for (const [id, src] of Object.entries(MUSIC.scenario)) {
    const file = music(src, `music/${id}`);
    if (file) m.music.scenario[id] = file;
  }
  for (const [name, src] of Object.entries(EFFECTS)) {
    const file = music(src, `effects/${slug(name)}`);
    if (file) m.effects[name] = file;
  }
  for (const [passage, voices] of Object.entries(voiceOver)) {
    for (const [voice, src] of Object.entries(voices) as [keyof typeof voices, string][]) {
      const file = join(out, 'audio', 'voice', voice, `${slug(basename(src))}.mp3`);
      if (tryConvert(() => audio(join(assets, src), file, true))) (m.voiceOver[passage] ??= {})[voice] = rel(file);
    }
  }
  return m;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      media: { type: 'string', default: 'media/my-fathers-work-master-4/Assets' },
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
  const manifest = extractAssets(values.media, values.out, voiceOver);
  writeFileSync(join(values.out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  const count = (o: object) => Object.keys(o).length;
  console.log(
    `assets: ${count(manifest.icons)} icons, ${count(manifest.setup)} setup pictures, ${count(manifest.ui)} UI images, ` +
      `${(manifest.music.title ? 1 : 0) + (manifest.music.ending ? 1 : 0) + count(manifest.music.scenario)} music tracks, ${count(manifest.effects)} effects, ${count(manifest.voiceOver)} voiced passages`,
  );
  if (manifest.missing.length) console.log(`missing source files (${manifest.missing.length}):\n  ${manifest.missing.join('\n  ')}`);
}
