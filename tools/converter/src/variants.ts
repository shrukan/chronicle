/**
 * Easy and Short texts are written by hand into `strings.en.json`, which the converter
 * regenerates. Converting again keeps them: a variant whose original text changed stays, but
 * has to be reviewed again.
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
      if (before?.[text] === undefined) continue;
      merged[text] = before[text];
      if (before[reviewed] && before.full === entry.full)
        merged[reviewed] = true;
    }
    out[key] = merged;
  }
  return out;
}
