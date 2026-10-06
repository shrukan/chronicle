import type { BinaryOp, Value } from './schema.ts';

/*
 * Value semantics copied from Cradle 2.0 (StoryVar + Int/Double/String services),
 * because the stories were written and tested against them. Notable rules:
 *   - unset (null) equals only unset; `unset == 0` and `unset == ""` are false
 *   - number vs string compares numerically if the string parses as a number
 *   - string vs anything else falls back to string comparison
 *   - arithmetic with an unset left operand treats it as the right operand's zero value
 */

/** .NET `double.TryParse`-like conversion; undefined when not a number. */
export function toNumber(v: Value): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return undefined;
    return Number(s);
  }
  return undefined;
}

export function toText(v: Value): string {
  if (v === null) return '';
  if (Array.isArray(v)) return v.map(toText).join(',');
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

type CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

function compareNumbers(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
  }
}

/** Cradle `StoryVar.Compare` for `==`; other operators via the same conversions. */
function compareEq(op: CompareOp, a: Value, b: Value): boolean {
  if (a === null && b === null) return true;
  if (a === null) return false;

  if (typeof a === 'number' || typeof a === 'boolean') {
    const an = toNumber(a)!;
    const bn = b === null ? undefined : toNumber(b);
    return bn === undefined ? false : compareNumbers(op, an, bn);
  }
  if (typeof a === 'string') {
    const an = toNumber(a);
    const bn = b === null ? undefined : toNumber(b);
    if (an !== undefined && bn !== undefined) return compareNumbers(op, an, bn);
    if (b === null) return false;
    const bs = toText(b);
    switch (op) {
      case '==': return a === bs;
      case '!=': return a !== bs;
      case '<': return a < bs;
      case '<=': return a <= bs;
      case '>': return a > bs;
      case '>=': return a >= bs;
    }
  }
  if (Array.isArray(a) && Array.isArray(b) && (op === '==' || op === '!=')) {
    const same = a.length === b.length && a.every((x, i) => compare('==', x, b[i] ?? null));
    return op === '==' ? same : !same;
  }
  return false;
}

export function compare(op: CompareOp, a: Value, b: Value): boolean {
  // Cradle implements `!=` as the negation of `==`.
  if (op === '!=') return !compareEq('==', a, b);
  return compareEq(op, a, b);
}

export function truthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '' && v.toLowerCase() !== 'false';
  return v.length > 0;
}

export function combine(op: Exclude<BinaryOp, CompareOp | '&&' | '||'>, a: Value, b: Value): Value {
  // Uninitialised left operand takes the right operand's type (Cradle issue #39 fix).
  if (a === null && b !== null) a = typeof b === 'string' ? '' : typeof b === 'number' ? 0 : a;

  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
    const an = toNumber(a), bn = toNumber(b);
    // Cradle's string service tries numeric addition first.
    if (typeof a === 'string' && an !== undefined && bn !== undefined) return an + bn;
    return toText(a) + toText(b);
  }
  if (op === '+' && Array.isArray(a)) return [...a, ...(Array.isArray(b) ? b : [b])];
  if (op === '-' && Array.isArray(a)) {
    const remove = Array.isArray(b) ? b : [b];
    return a.filter((x) => !remove.some((r) => compare('==', x, r)));
  }

  const an = toNumber(a), bn = toNumber(b);
  if (an === undefined || bn === undefined) {
    throw new TypeError(`Cannot apply ${op} to ${JSON.stringify(a)} and ${JSON.stringify(b)}`);
  }
  switch (op) {
    case '+': return an + bn;
    case '-': return an - bn;
    case '*': return an * bn;
    case '/': return an / bn;
    case '%': return an % bn;
  }
}

export function binary(op: BinaryOp, a: Value, b: Value): Value {
  switch (op) {
    case '==': case '!=': case '<': case '<=': case '>': case '>=':
      return compare(op, a, b);
    case '&&': return truthy(a) && truthy(b);
    case '||': return truthy(a) || truthy(b);
    default: return combine(op, a, b);
  }
}

/** Harlowe-style array access: 1-based numbers or ordinals like "1st", "3rd", "last", "2ndlast". */
export function indexArray(arr: Value, key: Value): Value {
  if (!Array.isArray(arr)) throw new TypeError(`Cannot index ${JSON.stringify(arr)}`);
  let i: number | undefined;
  if (typeof key === 'number') i = key - 1;
  else if (typeof key === 'string') {
    const m = /^(\d+)(?:st|nd|rd|th)(last)?$/.exec(key);
    if (key === 'last') i = arr.length - 1;
    else if (m) i = m[2] ? arr.length - Number(m[1]) : Number(m[1]) - 1;
  }
  if (i === undefined || i < 0 || i >= arr.length) throw new RangeError(`Index ${JSON.stringify(key)} out of range for array of ${arr.length}`);
  return arr[i]!;
}
