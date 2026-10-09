import type { ReadingMode, StringEntry, StringTable, TextKind } from './schema.ts';

/**
 * Picks the text for a key. Only narrative text uses the easy or short variant, and only once
 * it has been reviewed; everything else always shows the full text so no game
 * instruction can get lost.
 */
export function resolveText(table: StringTable, key: string, mode: ReadingMode = 'full', kind: TextKind = 'narrative'): string {
  const entry = table[key];
  return entry ? resolveEntry(entry, mode, kind) : `⟦${key}⟧`;
}

/** {@link resolveText} for one entry. */
export function resolveEntry(entry: StringEntry, mode: ReadingMode = 'full', kind: TextKind = 'narrative'): string {
  if (kind !== 'narrative') return entry.full;
  if (mode === 'easy' && entry.easy !== undefined && entry.easyReviewed) return entry.easy;
  if (mode === 'short' && entry.short !== undefined && entry.shortReviewed) return entry.short;
  return entry.full;
}

export type Span =
  | { t: 'text'; text: string; bold: boolean; italic: boolean }
  | { t: 'icon'; name: string; bold: boolean; italic: boolean }
  | { t: 'newline' };

/**
 * Parses string-table markup into spans:
 *   **bold**  *italic*  {icon:NAME}  {0}  `\` escapes the next character, newline = line break.
 */
export function parseMarkup(src: string, args: readonly string[] = []): Span[] {
  const spans: Span[] = [];
  let bold = false, italic = false, buf = '';
  const flush = () => {
    if (buf) spans.push({ t: 'text', text: buf, bold, italic });
    buf = '';
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '\\' && i + 1 < src.length) {
      buf += src[++i];
    } else if (c === '*' && src[i + 1] === '*') {
      flush();
      bold = !bold;
      i++;
    } else if (c === '*') {
      flush();
      italic = !italic;
    } else if (c === '\n') {
      flush();
      spans.push({ t: 'newline' });
    } else if (c === '{') {
      const end = src.indexOf('}', i);
      const inner = end < 0 ? '' : src.slice(i + 1, end);
      if (/^\d+$/.test(inner)) {
        buf += args[Number(inner)] ?? '';
      } else if (inner.startsWith('icon:')) {
        flush();
        spans.push({ t: 'icon', name: inner.slice(5), bold, italic });
      } else {
        buf += c;
        continue;
      }
      i = end;
    } else {
      buf += c;
    }
  }
  flush();
  return spans;
}

/** Escapes characters that have a meaning in markup. */
export function escapeMarkup(s: string): string {
  return s.replace(/[\\*{}]/g, (c) => '\\' + c);
}
