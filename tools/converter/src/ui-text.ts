/**
 * Extracts the English screen texts of the original app from its main scene:
 *  - every TextMeshPro text, keyed by its object path (`UI/MainMenu/…/Text`);
 *  - texts the screen scripts assemble at runtime, which live in per-language string arrays
 *    on the components (index 0 = English), keyed `@Script.field` (e.g. `@ViewPlayerIntro.introText1`);
 *  - lists such as the achievements and the ending passages, keyed the same way.
 * The app's screens pick the texts they need by key.
 *
 * Usage: node tools/converter/src/ui-text.ts [--upstream upstream/UnityOriginalApp] [--out content/ui.en.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import type { UiText } from '@chronicle/engine';
import { toMarkup } from './passage.ts';
import { guidIndex } from './unity.ts';
import { keepVariants } from './variants.ts';

interface UnityDoc {
  type: string;
  body: Record<string, unknown>;
}

/** Splits a Unity scene into `{ fileID → document }`. */
function documents(source: string): Map<string, UnityDoc> {
  const docs = new Map<string, UnityDoc>();
  for (const chunk of source.split(/^--- !u!\d+ &/m).slice(1)) {
    const id = /^(-?\d+)/.exec(chunk)![1]!;
    const yaml = chunk.slice(chunk.indexOf('\n') + 1);
    const type = /^(\w+):/.exec(yaml)?.[1] ?? '';
    // Parse only what we need, the scene is large.
    if (!['GameObject', 'RectTransform', 'Transform', 'MonoBehaviour'].includes(type)) continue;
    // Text components, and screen scripts with per-language text arrays or lists.
    if (type === 'MonoBehaviour' && !/^\s+(m_text:|\w+:\s*\n\s+- )/m.test(yaml)) continue;
    try {
      docs.set(id, { type, body: (parse(yaml) as Record<string, Record<string, unknown>>)[type]! });
    } catch {
      // A few Unity documents use YAML features the parser rejects; they hold no text.
    }
  }
  return docs;
}

type Ref = { fileID: number | string };

/**
 * Script fields that are real lists (passages, achievements). Every other string array is a
 * per-language text (English first; the original has 2 or 7 languages depending on the field).
 */
const LIST_FIELDS = new Set([
  'endingPassageList', 'genHubEPassageList', 'genHubMPassageList', 'genHubLPassageList', 'genIntroPassageNameList',
  'ignorPassageNameList', 'scoringPassageList', 'storyPreparationPassageName', 'TotalAchievements', 'specialAchievement', 'storyNameList',
]);

export function extractUiText(scene: string, assets: string): Record<string, string | string[]> {
  const guids = guidIndex(assets);
  const docs = documents(scene);
  const names = new Map<string, string>(); // GameObject id → name
  const parents = new Map<string, string>(); // GameObject id → parent GameObject id
  const transformOf = new Map<string, string>(); // transform id → GameObject id
  const parentTransform = new Map<string, string>(); // transform id → parent transform id

  for (const [id, d] of docs) {
    if (d.type === 'GameObject') names.set(id, String(d.body['m_Name']));
    if (d.type === 'RectTransform' || d.type === 'Transform') {
      transformOf.set(id, String((d.body['m_GameObject'] as Ref).fileID));
      const father = String((d.body['m_Father'] as Ref | undefined)?.fileID ?? 0);
      if (father !== '0') parentTransform.set(id, father);
    }
  }
  for (const [t, go] of transformOf) {
    const p = parentTransform.get(t);
    if (p && transformOf.has(p)) parents.set(go, transformOf.get(p)!);
  }
  const path = (go: string): string => {
    const parts: string[] = [];
    for (let cur: string | undefined = go; cur; cur = parents.get(cur)) parts.unshift(names.get(cur) ?? '?');
    return parts.join('/');
  };

  const texts: Record<string, string | string[]> = {};
  for (const d of docs.values()) {
    if (d.type !== 'MonoBehaviour') continue;
    const script = (guids.get(String((d.body['m_Script'] as { guid?: string } | undefined)?.guid)) ?? '').split('/').pop()?.replace(/\.cs$/, '');
    if (script && !script.startsWith('TMP')) {
      for (const [field, value] of Object.entries(d.body)) {
        if (!Array.isArray(value) || field.startsWith('m_')) continue;
        // `progress` (end-of-round texts) is extracted with the scenario extras.
        if (!value.length || field === 'progress') continue;
        if (value.every((v) => typeof v === 'string')) {
          texts[`@${script}.${field}`] = LIST_FIELDS.has(field) ? value.map((v: string) => toMarkup(v.trim())) : toMarkup(String(value[0]).trim());
        } else if (value.every((v) => v && typeof v === 'object')) {
          // Per-language lists (`[{ Achievement: [...] }, …]`): keep English.
          const inner = Object.values(value[0] as object)[0];
          if (Array.isArray(inner) && inner.every((v) => typeof v === 'string')) texts[`@${script}.${field}`] = inner.map((v: string) => toMarkup(v.trim()));
        }
      }
    }
    const text = d.body['m_text'];
    if (typeof text !== 'string' || !text.trim()) continue;
    let key = path(String((d.body['m_GameObject'] as Ref).fileID));
    for (let i = 2; key in texts; i++) key = `${path(String((d.body['m_GameObject'] as Ref).fileID))}#${i}`;
    texts[key] = toMarkup(text.trim());
  }
  return Object.fromEntries(Object.entries(texts).sort(([a], [b]) => a.localeCompare(b)));
}

/** Easy and short screen texts written by hand into the output stay (see variants.ts). */
function keepUiVariants(texts: Record<string, string | string[]>, out: string): UiText {
  const previous: UiText = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
  const result: UiText = { ...texts };
  for (const [key, text] of Object.entries(texts)) {
    const before = previous[key];
    if (typeof text !== 'string' || !before || typeof before !== 'object' || Array.isArray(before)) continue;
    result[key] = keepVariants({ [key]: { full: text } }, { [key]: before })[key]!;
  }
  return result;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      upstream: { type: 'string', default: 'upstream/UnityOriginalApp' },
      out: { type: 'string', default: 'content/ui.en.json' },
    },
  });
  const assets = join(values.upstream, 'Assets');
  const texts = extractUiText(readFileSync(join(assets, 'Scenes/Main.unity'), 'utf8'), assets);
  writeFileSync(values.out, JSON.stringify(keepUiVariants(texts, values.out), null, 1) + '\n');
  const keys = Object.keys(texts);
  const screens = new Set(keys.filter((k) => !k.startsWith('@')).map((k) => k.split('/').slice(0, 2).join('/')));
  console.log(`ui text: ${keys.filter((k) => !k.startsWith('@')).length} texts on ${screens.size} screens, ${keys.filter((k) => k.startsWith('@')).length} script fields`);
}
