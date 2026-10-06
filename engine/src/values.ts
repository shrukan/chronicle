import type { BinaryOp, Value } from './schema.ts';

/*
 * Strict value semantics: no implicit conversion between types. Comparing or combining
 * values of different types is an error, so a story bug surfaces in the story tester
 * instead of silently evaluating to false. Conversions are explicit (`num`, `str`).
 */

export class ValueError extends TypeError {}

export type ValueType = 'number' | 'string' | 'boolean' | 'list';

export function typeOf(v: Value): ValueType {
  if (Array.isArray(v)) return 'list';
  return typeof v as 'number' | 'string' | 'boolean';
}

/** The value a variable of this type starts with. */
export function zeroOf(t: ValueType): Value {
  return { number: 0, string: '', boolean: false, list: [] }[t];
}

/** Explicit text → number conversion (`num`). */
export function toNumber(v: Value): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(v)) return Number(v);
  throw new ValueError(`Not a number: ${JSON.stringify(v)}`);
}

export function toText(v: Value): string {
  if (Array.isArray(v)) return v.map(toText).join(', ');
  return String(v);
}

function sameType(op: string, a: Value, b: Value): void {
  if (typeOf(a) !== typeOf(b)) throw new ValueError(`Cannot apply ${op} to ${typeOf(a)} ${JSON.stringify(a)} and ${typeOf(b)} ${JSON.stringify(b)}`);
}

export function equals(a: Value, b: Value): boolean {
  sameType('==', a, b);
  if (Array.isArray(a)) {
    const bl = b as Value[];
    return a.length === bl.length && a.every((x, i) => equals(x, bl[i]!));
  }
  return a === b;
}

export function truthy(v: Value): boolean {
  if (typeof v !== 'boolean') throw new ValueError(`Expected a condition (true/false), got ${JSON.stringify(v)}`);
  return v;
}

export function binary(op: BinaryOp, a: Value, b: Value): Value {
  switch (op) {
    case '==': return equals(a, b);
    case '!=': return !equals(a, b);
    case '&&': return truthy(a) && truthy(b);
    case '||': return truthy(a) || truthy(b);
  }
  sameType(op, a, b);
  if (op === '<' || op === '<=' || op === '>' || op === '>=') {
    if (typeof a !== 'number' && typeof a !== 'string') throw new ValueError(`Cannot order ${typeOf(a)} values`);
    const x = a as number | string, y = b as number | string;
    return op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
  }
  if (Array.isArray(a)) {
    const bl = b as Value[];
    if (op === '+') return [...a, ...bl];
    if (op === '-') return a.filter((x) => !bl.some((r) => equals(x, r)));
  }
  if (typeof a === 'string' && op === '+') return a + (b as string);
  if (typeof a === 'number') {
    const n = b as number;
    switch (op) {
      case '+': return a + n;
      case '-': return a - n;
      case '*': return a * n;
      case '/': return a / n;
      case '%': return a % n;
    }
  }
  throw new ValueError(`Cannot apply ${op} to ${typeOf(a)} values`);
}

/** List access: 1-based numbers or ordinals like "1st", "3rd", "last", "2ndlast". */
export function indexList(list: Value, key: Value): Value {
  if (!Array.isArray(list)) throw new ValueError(`Cannot index ${JSON.stringify(list)}`);
  let i: number | undefined;
  if (typeof key === 'number') i = key - 1;
  else if (typeof key === 'string') {
    const m = /^(\d+)(?:st|nd|rd|th)(last)?$/.exec(key);
    if (key === 'last') i = list.length - 1;
    else if (m) i = m[2] ? list.length - Number(m[1]) : Number(m[1]) - 1;
  }
  if (i === undefined || i < 0 || i >= list.length) throw new RangeError(`Index ${JSON.stringify(key)} out of range for a list of ${list.length}`);
  return list[i]!;
}
