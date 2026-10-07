/**
 * Extracts the English screen texts of the original app from its main scene: every
 * TextMeshPro text, keyed by its object path (`Canvas/MainMenu/Welcome/Text`). The app's
 * screens pick the texts they need by path.
 *
 * Usage: node tools/converter/src/ui-text.ts [--upstream upstream/UnityOriginalApp] [--out content/ui.en.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { toMarkup } from './passage.ts';

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
    if (type === 'MonoBehaviour' && !/^\s+m_text:/m.test(yaml)) continue;
    try {
      docs.set(id, { type, body: (parse(yaml) as Record<string, Record<string, unknown>>)[type]! });
    } catch {
      // A few Unity documents use YAML features the parser rejects; they hold no text.
    }
  }
  return docs;
}

type Ref = { fileID: number | string };

export function extractUiText(scene: string): Record<string, string> {
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

  const texts: Record<string, string> = {};
  for (const d of docs.values()) {
    if (d.type !== 'MonoBehaviour') continue;
    const text = d.body['m_text'];
    if (typeof text !== 'string' || !text.trim()) continue;
    let key = path(String((d.body['m_GameObject'] as Ref).fileID));
    for (let i = 2; key in texts; i++) key = `${path(String((d.body['m_GameObject'] as Ref).fileID))}#${i}`;
    texts[key] = toMarkup(text.trim());
  }
  return Object.fromEntries(Object.entries(texts).sort(([a], [b]) => a.localeCompare(b)));
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      upstream: { type: 'string', default: 'upstream/UnityOriginalApp' },
      out: { type: 'string', default: 'content/ui.en.json' },
    },
  });
  const texts = extractUiText(readFileSync(join(values.upstream, 'Assets/Scenes/Main.unity'), 'utf8'));
  writeFileSync(values.out, JSON.stringify(texts, null, 1) + '\n');
  const screens = new Set(Object.keys(texts).map((k) => k.split('/').slice(0, 2).join('/')));
  console.log(`ui text: ${Object.keys(texts).length} texts on ${screens.size} screens`);
}
