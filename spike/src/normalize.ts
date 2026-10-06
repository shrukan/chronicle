/**
 * Turns the loosely typed data read from the original (Cradle/Unity) into strictly typed
 * story data: every variable gets one type and a starting value, and expressions are
 * rewritten so they never rely on implicit conversions. This is the only place where
 * the original's loose rules are known – the engine never sees them.
 */
import type { Expr, Node, Scenario, Value } from '@chronicle/engine';

type T = 'number' | 'string' | 'boolean' | 'list';

/** Raw values from the converter may still contain `null` (Cradle's "unset"). */
type Raw = Value | null;

export interface NormalizeReport {
  types: Record<string, T>;
  /** Variables the story stores both text and numbers in. */
  mixed: { var: string; types: T[] }[];
  /** How often each kind of rewrite was applied. */
  rewrites: Record<string, number>;
  /** Places that need a human decision. */
  issues: { passage: string; message: string }[];
}

const isZero = (v: Raw) => v === null || v === 0 || v === '';
const zeroOf = (t: T): Value => ({ number: 0, string: '', boolean: false, list: [] as Value[] })[t];
const litType = (v: Raw): T | undefined =>
  v === null ? undefined : Array.isArray(v) ? 'list' : (typeof v as 'number' | 'string' | 'boolean');
const COMPARE = new Set(['==', '!=', '<', '<=', '>', '>=']);
const LOGIC = new Set(['&&', '||']);

// ---------------------------------------------------------------------------
// 1. Type inference
// ---------------------------------------------------------------------------

type Src = { t: T; weak?: boolean } | { var: string } | { elemOf: string };

function sources(e: Expr): Src[] {
  if ('lit' in e) {
    const t = litType(e.lit as Raw);
    return t ? [{ t, weak: isZero(e.lit as Raw) }] : [];
  }
  if ('var' in e) return [{ var: e.var }];
  if ('cases' in e) return e.cases.flatMap((c) => sources(c.value));
  if ('at' in e) return 'var' in e.at ? [{ elemOf: e.at.var }] : [];
  if ('unknown' in e) return [];
  if ('fn' in e) {
    switch (e.fn) {
      case 'either': return e.args.flatMap(sources);
      case 'str': return [{ t: 'string' }];
      case 'array': case 'shuffled': return [{ t: 'list' }];
      default: return [{ t: 'number' }];
    }
  }
  if (COMPARE.has(e.op) || LOGIC.has(e.op) || e.op === 'not') return [{ t: 'boolean' }];
  if (e.op === 'neg') return [{ t: 'number' }];
  const all = [...sources(e.a), ...('b' in e ? sources(e.b) : [])];
  if (e.op === '+') return all.filter((s) => !('t' in s) || !s.weak || all.length === 1);
  return all.some((s) => 't' in s && s.t === 'list') ? [{ t: 'list' }] : [{ t: 'number' }];
}

function forEachNode(s: Scenario, fn: (n: Node, passage: string) => void): void {
  const visit = (nodes: Node[], p: string) => {
    for (const n of nodes) {
      fn(n, p);
      if (n.t === 'block') visit(n.body, p);
      if (n.t === 'if') n.branches.forEach((b) => visit(b.body, p));
    }
  };
  for (const p of Object.values(s.passages)) {
    visit(p.body, p.name);
    Object.values(p.fragments).forEach((f) => visit(f, p.name));
  }
}

function inferTypes(s: Scenario, external: Record<string, T>, report: NormalizeReport): { types: Record<string, T>; elems: Record<string, T> } {
  const strong = new Map<string, Set<T>>(), weak = new Map<string, Set<T>>();
  const links = new Map<string, Set<string>>(), elemLinks = new Map<string, Set<string>>();
  const elemEvidence = new Map<string, Set<T>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v);

  // Every assignment's sources, to count types once links are resolved (see below).
  const assignments: { v: string; srcs: Src[] }[] = [];
  const record = (v: string, srcs: Src[]) => {
    assignments.push({ v, srcs });
    for (const src of srcs) {
      if ('t' in src) add(src.weak ? weak : strong, v, src.t);
      else if ('var' in src) add(links, v, src.var);
      else add(elemLinks, v, src.elemOf);
    }
  };
  for (const [v, t] of Object.entries(external)) add(strong, v, t);
  for (const [v, init] of Object.entries(s.variables)) {
    const t = litType(init as Raw);
    if (t) add(weak, v, t);
  }
  forEachNode(s, (n) => {
    if (n.t === 'set') {
      record(n.var, sources(n.value));
      // Element types of lists built from literals.
      const v = n.value;
      if ('fn' in v && (v.fn === 'array' || v.fn === 'shuffled')) {
        for (const a of v.args) for (const src of sources(a)) if ('t' in src && src.t !== 'list') add(elemEvidence, n.var, src.t);
        for (const a of v.args) if ('var' in a) add(elemLinks, `${n.var}[]`, a.var);
      }
    }
    if (n.t === 'prompt') add(strong, n.var, n.input === 'number' ? 'number' : 'string');
  });

  // Resolve var → var links to a fixed point.
  const resolved = new Map<string, { strong: Set<T>; weak: Set<T> }>();
  const all = new Set([...strong.keys(), ...weak.keys(), ...links.keys(), ...elemLinks.keys(), ...Object.keys(s.variables)]);
  const elems: Record<string, T> = {};
  for (const v of all) resolved.set(v, { strong: new Set(strong.get(v)), weak: new Set(weak.get(v)) });
  for (let changed = true; changed; ) {
    changed = false;
    for (const [v, from] of links) {
      const r = resolved.get(v)!;
      for (const f of from) {
        const rf = resolved.get(f);
        if (!rf) continue;
        for (const t of rf.strong) if (!r.strong.has(t)) { r.strong.add(t); changed = true; }
        for (const t of rf.weak) if (!r.weak.has(t)) { r.weak.add(t); changed = true; }
      }
    }
    for (const [v, lists] of elemLinks) {
      if (v.endsWith('[]')) continue;
      const r = resolved.get(v)!;
      for (const l of lists) {
        for (const t of elemEvidence.get(l) ?? []) if (!r.strong.has(t)) { r.strong.add(t); changed = true; }
      }
    }
  }

  // How often each type is assigned – decides variables the story uses inconsistently.
  const counts = new Map<string, Map<T, number>>();
  for (const { v, srcs } of assignments) {
    for (const src of srcs) {
      let t: T | undefined;
      if ('t' in src) t = src.weak ? undefined : src.t;
      else if ('var' in src) {
        const st = resolved.get(src.var)?.strong;
        t = st && st.size === 1 ? [...st][0] : undefined;
      } else t = elemEvidence.get(src.elemOf)?.has('string') ? 'string' : [...(elemEvidence.get(src.elemOf) ?? [])][0];
      if (!t) continue;
      const m = counts.get(v) ?? counts.set(v, new Map()).get(v)!;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
  }

  const types: Record<string, T> = {};
  for (const [v, r] of resolved) {
    if (v.endsWith('[]')) continue;
    let t: T;
    if (r.strong.size === 1) t = [...r.strong][0]!;
    else if (r.strong.size > 1) {
      const ts = [...r.strong];
      report.mixed.push({ var: v, types: ts });
      // Use the type the story assigns most often; the rest show up as issues.
      const c = counts.get(v);
      t = c ? [...c].sort((a, b) => b[1] - a[1])[0]![0] : ts.includes('string') ? 'string' : ts[0]!;
    } else if (r.weak.size === 1) t = [...r.weak][0]!;
    else if (r.weak.has('number')) t = 'number';
    else t = 'string';
    types[v] = t;
  }
  for (const [l, ts] of elemEvidence) elems[l] = ts.has('string') ? 'string' : [...ts][0]!;
  return { types, elems };
}

// ---------------------------------------------------------------------------
// 2. Rewriting
// ---------------------------------------------------------------------------

class Rewriter {
  passage = '';
  private readonly types: Record<string, T>;
  private readonly elems: Record<string, T>;
  private readonly report: NormalizeReport;

  constructor(types: Record<string, T>, elems: Record<string, T>, report: NormalizeReport) {
    this.types = types;
    this.elems = elems;
    this.report = report;
  }

  private count(kind: string): void {
    this.report.rewrites[kind] = (this.report.rewrites[kind] ?? 0) + 1;
  }

  private issue(message: string): void {
    this.report.issues.push({ passage: this.passage, message });
  }

  /** Static type of an already rewritten expression. */
  typeOf(e: Expr): T | undefined {
    if ('lit' in e) return litType(e.lit as Raw);
    if ('var' in e) return this.types[e.var];
    if ('at' in e) return 'var' in e.at ? this.elems[e.at.var] : undefined;
    if ('cases' in e) return this.typeOf(e.cases[0]!.value);
    if ('unknown' in e) return undefined;
    if ('fn' in e) {
      if (e.fn === 'either') return e.args.map((a) => this.typeOf(a)).find(Boolean);
      return e.fn === 'str' ? 'string' : e.fn === 'array' || e.fn === 'shuffled' ? 'list' : 'number';
    }
    if (COMPARE.has(e.op) || LOGIC.has(e.op) || e.op === 'not') return 'boolean';
    if (e.op === 'neg') return 'number';
    return this.typeOf(e.a) ?? ('b' in e ? this.typeOf(e.b) : undefined);
  }

  /** Rewrites `e` so that it produces a value of type `want` (if given). */
  expr(e: Expr, want?: T): Expr {
    if ('lit' in e) return this.literal(e.lit as Raw, want);
    if ('unknown' in e) return e;
    if ('var' in e || 'at' in e) {
      const out: Expr = 'at' in e ? { at: this.expr(e.at), key: this.expr(e.key) } : e;
      return want ? this.convert(out, want) : out;
    }
    if ('cases' in e) {
      const out: Expr = { cases: e.cases.map((c) => ({ ...(c.cond ? { cond: this.cond(c.cond) } : {}), value: this.expr(c.value, want) })) };
      // Make sure the last case is a default.
      const last = e.cases.at(-1);
      if (last?.cond && want) (out as { cases: { value: Expr }[] }).cases.push({ value: { lit: zeroOf(want) } });
      return out;
    }
    if ('fn' in e) {
      if (e.fn === 'either') return { fn: 'either', args: e.args.map((a) => this.expr(a, want)) };
      const args = e.fn === 'num' ? e.args.map((a) => this.expr(a)) : e.args.map((a) => this.expr(a));
      // `num` of something that is already a number is a no-op.
      if (e.fn === 'num' && args[0] && this.typeOf(args[0]) === 'number') return want ? this.convert(args[0], want) : args[0];
      const out: Expr = { fn: e.fn, args };
      return want ? this.convert(out, want) : out;
    }
    if (e.op === 'not') return { op: 'not', a: this.cond(e.a) };
    if (e.op === 'neg') return this.convert({ op: 'neg', a: this.expr(e.a, 'number') }, want);
    if (!('b' in e)) return e;
    if (LOGIC.has(e.op)) return { op: e.op, a: this.cond(e.a), b: this.cond(e.b) };
    if (COMPARE.has(e.op)) return this.compare(e.op, e.a, e.b);

    // Arithmetic / concatenation.
    let a = this.expr(e.a), b = this.expr(e.b);
    const ta = this.typeOf(a), tb = this.typeOf(b);
    if (e.op === '+' && (ta === 'string' || tb === 'string' || want === 'string')) {
      // `"" + x` was the converter's ToString().
      if ('lit' in a && a.lit === '') return this.convert(b, 'string');
      a = this.convert(a, 'string');
      b = this.convert(b, 'string');
      return this.convert({ op: '+', a, b }, want);
    }
    if (ta === 'list' || tb === 'list') {
      return { op: e.op, a: this.convert(a, 'list'), b: this.convert(b, 'list') };
    }
    return this.convert({ op: e.op, a: this.convert(a, 'number'), b: this.convert(b, 'number') }, want);
  }

  /** A condition must be true/false. */
  cond(e: Expr): Expr {
    const out = this.expr(e);
    const t = this.typeOf(out);
    if (t === 'boolean' || t === undefined) return out;
    this.count('condition from non-boolean');
    return { op: '!=', a: out, b: { lit: zeroOf(t) } };
  }

  private compare(op: string, ea: Expr, eb: Expr): Expr {
    // Compare against `null` (unset) means "still at its starting value".
    if ('lit' in eb && eb.lit === null) eb = { lit: '' };
    if ('lit' in ea && ea.lit === null) ea = { lit: '' };
    let a = this.expr(ea), b = this.expr(eb);
    const ta = this.typeOf(a), tb = this.typeOf(b);
    if (!ta || !tb || ta === tb) return { op: op as '==', a, b };

    // One side is a literal: convert it to the other side's type.
    const la = 'lit' in a, lb = 'lit' in b;
    if (la || lb) {
      const [lit, other, otherType] = lb ? [b, a, ta] : [a, b, tb];
      const v = (lit as { lit: Raw }).lit;
      const converted = this.tryConvertLiteral(v, otherType);
      if (converted !== undefined) {
        this.count(isZero(v) ? 'unset check → starting value' : 'literal converted');
        const l: Expr = { lit: converted };
        return lb ? { op: op as '==', a: other, b: l } : { op: op as '==', a: l, b: other };
      }
      // A number can never equal a non-numeric text (the original also returned false).
      if (op === '==' || op === '!=') {
        this.count('impossible comparison → constant');
        return { lit: op === '!=' };
      }
      this.issue(`cannot compare ${otherType} with ${JSON.stringify(v)}`);
      return { op: op as '==', a, b };
    }

    // Two different non-literal types: compare as text, and flag it.
    this.issue(`comparing ${ta} with ${tb}; compared as text`);
    a = this.convert(a, 'string');
    b = this.convert(b, 'string');
    return { op: op as '==', a, b };
  }

  private literal(v: Raw, want?: T): Expr {
    if (!want) {
      if (v === null) {
        this.issue('unset value without a known type; using ""');
        return { lit: '' };
      }
      return { lit: v };
    }
    const converted = this.tryConvertLiteral(v, want);
    if (converted !== undefined) {
      if (v !== converted) this.count(isZero(v) ? 'unset value → starting value' : 'literal converted');
      return { lit: converted };
    }
    this.issue(`cannot use ${JSON.stringify(v)} as ${want}`);
    return { lit: v as Value };
  }

  private tryConvertLiteral(v: Raw, want: T): Value | undefined {
    if (v === null || (isZero(v) && litType(v) !== want)) return zeroOf(want);
    const t = litType(v);
    if (t === want) return v as Value;
    if (want === 'string' && t === 'number') return String(v);
    if (want === 'number' && t === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v as string)) return Number(v);
    return undefined;
  }

  /** Wraps a non-literal expression in an explicit conversion when types differ. */
  private convert(e: Expr, want?: T): Expr {
    const t = this.typeOf(e);
    if (!want || !t || t === want) return e;
    if (want === 'string' && t !== 'list') {
      this.count('explicit str()');
      return { fn: 'str', args: [e] };
    }
    if (want === 'number' && t === 'string') {
      this.count('explicit num()');
      return { fn: 'num', args: [e] };
    }
    this.issue(`cannot convert ${t} to ${want}: ${JSON.stringify(e).slice(0, 80)}`);
    return e;
  }

  nodes(nodes: Node[]): Node[] {
    return nodes.map((n) => this.node(n));
  }

  private node(n: Node): Node {
    switch (n.t) {
      case 'text':
        return n.args ? { ...n, args: n.args.map((a) => this.expr(a)) } : n;
      case 'link': {
        const out = { ...n };
        if (n.args) out.args = n.args.map((a) => this.expr(a));
        if (n.to) out.to = this.expr(n.to, 'string');
        return out;
      }
      case 'block': {
        const out: Node = { ...n, body: this.nodes(n.body) };
        if (n.next) out.next = this.expr(n.next, 'string');
        return out;
      }
      case 'if':
        return { t: 'if', branches: n.branches.map((b) => ({ ...(b.cond ? { cond: this.cond(b.cond) } : {}), body: this.nodes(b.body) })) };
      case 'set':
        return { t: 'set', var: n.var, value: this.expr(n.value, this.types[n.var]) };
      case 'goto':
        return { t: 'goto', to: this.expr(n.to, 'string') };
      case 'include':
        return { t: 'include', passage: this.expr(n.passage, 'string') };
      case 'ui':
        return n.args ? { ...n, args: Object.fromEntries(Object.entries(n.args).map(([k, v]) => [k, this.expr(v)])) } : n;
      default:
        return n;
    }
  }
}

/**
 * @param external variables the app sets before the story starts (setup screens)
 */
export function normalize(raw: Scenario, external: Record<string, T>): { scenario: Scenario; report: NormalizeReport } {
  const report: NormalizeReport = { types: {}, mixed: [], rewrites: {}, issues: [] };
  const { types, elems } = inferTypes(raw, external, report);
  report.types = types;

  const rw = new Rewriter(types, elems, report);
  const passages: Scenario['passages'] = {};
  for (const [name, p] of Object.entries(raw.passages)) {
    rw.passage = name;
    const fragments: Record<string, Node[]> = {};
    for (const [id, f] of Object.entries(p.fragments)) fragments[id] = rw.nodes(f);
    passages[name] = { ...p, body: rw.nodes(p.body), fragments };
  }

  const variables: Record<string, Value> = {};
  for (const [v, t] of Object.entries(types)) {
    const init = raw.variables[v] as Raw | undefined;
    variables[v] = init !== undefined && litType(init) === t ? init! : zeroOf(t);
  }
  return { scenario: { ...raw, variables, passages }, report };
}
