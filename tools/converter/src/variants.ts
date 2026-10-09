/**
 * Easy and Short texts are written into `strings.en.json`, which the converter regenerates.
 * Converting again keeps them, with their review flags, as long as the original text is the
 * same; a rewrite of a text that changed is dropped, it would show the old content.
 */
import type { StringEntry, StringTable } from '@chronicle/engine';

const VARIANTS = [
  ['easy', 'easyReviewed'],
  ['short', 'shortReviewed'],
] as const;

export function keepVariants(
  converted: StringTable,
  previous: StringTable,
): StringTable {
  const out: StringTable = {};
  for (const [key, entry] of Object.entries(converted)) {
    const before = previous[key];
    const merged: StringEntry = { ...entry };
    for (const [text, reviewed] of VARIANTS) {
      if (before?.[text] === undefined || before.full !== entry.full) continue;
      merged[text] = before[text];
      if (before[reviewed]) merged[reviewed] = true;
    }
    out[key] = merged;
  }
  return out;
}
