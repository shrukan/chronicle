/**
 * Easy and Short texts are written into `strings.en.json`, which the converter regenerates.
 * Converting again keeps them, with their review flags, as long as the original text is the
 * same; a rewrite of a text that changed is dropped, it would show the old content, and so is
 * one of a text that is no longer flavour text (`isNarrative`): rules are never rewritten.
 */
import type { StringEntry, StringTable } from '@chronicle/engine';

const VARIANTS = [
  ['easy', 'easyReviewed'],
  ['short', 'shortReviewed'],
] as const;

export function keepVariants(
  converted: StringTable,
  previous: StringTable,
  narrative: (key: string) => boolean = () => true,
): StringTable {
  // A rewrite belongs to its text: when converting again shifts the keys, it is found by the text.
  const byText = new Map<string, StringEntry>();
  for (const entry of Object.values(previous))
    if (entry.easy !== undefined || entry.short !== undefined) byText.set(entry.full, entry);
  const out: StringTable = {};
  for (const [key, entry] of Object.entries(converted)) {
    const same = previous[key]?.full === entry.full ? previous[key] : undefined;
    const before = same ?? byText.get(entry.full);
    const merged: StringEntry = { ...entry };
    for (const [text, reviewed] of VARIANTS) {
      if (before?.[text] === undefined || before.full !== entry.full || !narrative(key)) continue;
      merged[text] = before[text];
      if (before[reviewed]) merged[reviewed] = true;
    }
    out[key] = merged;
  }
  return out;
}
