/** Compact, readable form of an expression (for reports). */
import type { Expr } from '@chronicle/engine';

export function describe(e: Expr | undefined): string {
  if (!e) return 'else';
  if ('lit' in e) return JSON.stringify(e.lit);
  if ('var' in e) return e.var;
  if ('fn' in e) return `${e.fn}(${e.args.map(describe).join(', ')})`;
  if ('cases' in e) return `cases(${e.cases.map((c) => `${describe(c.cond)} → ${describe(c.value)}`).join('; ')})`;
  if ('at' in e) return `${describe(e.at)}[${describe(e.key)}]`;
  if ('unknown' in e) return `?${e.unknown}`;
  if (e.op === 'not') return `!${describe(e.a)}`;
  if (e.op === 'neg' || !('b' in e)) return `-${describe(e.a)}`;
  return `(${describe(e.a)} ${e.op} ${describe(e.b)})`;
}
