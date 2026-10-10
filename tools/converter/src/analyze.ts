/** Whole-scenario passes that run after every passage is converted. */
import type { Expr, Node, Passage, StringTable, TextKind } from '@chronicle/engine';

export type Passages = Record<string, Passage>;

/** Calls `fn` for every node of every passage (bodies and fragments, nested). */
export function eachNode(passages: Passages, fn: (n: Node, passage: Passage) => void): void {
  const visit = (nodes: Node[], p: Passage) => {
    for (const n of nodes) {
      fn(n, p);
      if (n.t === 'block') visit(n.body, p);
      if (n.t === 'if') n.branches.forEach((b) => visit(b.body, p));
    }
  };
  for (const p of Object.values(passages)) {
    visit(p.body, p);
    Object.values(p.fragments).forEach((f) => visit(f, p));
  }
}

/** All expressions directly inside a node (not inside nested nodes). */
export function nodeExprs(n: Node): Expr[] {
  switch (n.t) {
    case 'text': return n.args ?? [];
    case 'link': return [...(n.args ?? []), ...(n.to ? [n.to] : [])];
    case 'prompt': return n.args ?? [];
    case 'block': return n.next ? [n.next] : [];
    case 'if': return n.branches.flatMap((b) => (b.cond ? [b.cond] : []));
    case 'set': return [n.value];
    case 'goto': return [n.to];
    case 'include': return [n.passage];
    case 'ui': return Object.values(n.args ?? {});
    default: return [];
  }
}

export function eachExpr(e: Expr, fn: (e: Expr) => void): void {
  fn(e);
  if ('fn' in e) e.args.forEach((a) => eachExpr(a, fn));
  else if ('cases' in e) e.cases.forEach((c) => { if (c.cond) eachExpr(c.cond, fn); eachExpr(c.value, fn); });
  else if ('at' in e) { eachExpr(e.at, fn); eachExpr(e.key, fn); }
  else if ('op' in e) { eachExpr(e.a, fn); if ('b' in e) eachExpr(e.b, fn); }
}

/** Removes fragments nothing links to (left over from hand edits). */
export function dropDeadFragments(passages: Passages, used: Set<string>): string[] {
  const dropped: string[] = [];
  for (const p of Object.values(passages)) {
    for (const id of Object.keys(p.fragments)) {
      if (!used.has(`${p.name}#${id}`)) {
        delete p.fragments[id];
        dropped.push(`${p.name}#${id}`);
      }
    }
  }
  return dropped;
}

/**
 * Passages reachable from the entry points. Conservative: any text constant in a reachable
 * passage that names a passage counts as a reference, which also covers targets stored in
 * variables (`ending = "X"` … `goto ending`).
 */
export function reachable(passages: Passages, entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = entries.filter((e) => passages[e]);
  const refs = new Map<string, Set<string>>();
  eachNode(passages, (n, p) => {
    const set = refs.get(p.name) ?? refs.set(p.name, new Set()).get(p.name)!;
    if (n.t === 'link' && n.revealFrom) set.add(n.revealFrom);
    for (const e of nodeExprs(n)) {
      eachExpr(e, (x) => {
        if ('lit' in x && typeof x.lit === 'string' && passages[x.lit]) set.add(x.lit);
      });
    }
  });
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const r of refs.get(name) ?? []) if (!seen.has(r)) queue.push(r);
  }
  return seen;
}

/**
 * Tags passages that end the story: they enable the ending screen's continue button
 * (`generationEndingContinue`) and offer no way onward.
 */
export function tagEndings(passages: Passages): string[] {
  const exits = new Set<string>(), endingUi = new Set<string>();
  eachNode(passages, (n, p) => {
    if (n.t === 'link' || n.t === 'goto' || n.t === 'include' || (n.t === 'block' && n.next) || (n.t === 'ui' && n.args?.['next'])) exits.add(p.name);
    if (n.t === 'ui' && n.ui === 'generationEndingContinue') endingUi.add(p.name);
  });
  const endings = [...endingUi].filter((n) => !exits.has(n)).sort();
  for (const n of endings) passages[n]!.tags = [...new Set([...passages[n]!.tags, 'ending'])];
  return endings;
}

/** Literal passage targets that don't exist. */
export function brokenTargets(passages: Passages): { passage: string; target: string }[] {
  const out: { passage: string; target: string }[] = [];
  eachNode(passages, (n, p) => {
    const t = n.t === 'link' || n.t === 'goto' ? n.to : n.t === 'include' ? n.passage : n.t === 'block' ? n.next : undefined;
    if (t && 'lit' in t && typeof t.lit === 'string' && !passages[t.lit]) out.push({ passage: p.name, target: t.lit });
  });
  return out;
}

export function manualNodes(passages: Passages): { passage: string; line: number; reason: string; code: string }[] {
  const out: { passage: string; line: number; reason: string; code: string }[] = [];
  eachNode(passages, (n, p) => {
    if (n.t === 'manual') out.push({ passage: p.name, line: n.source?.line ?? 0, reason: n.reason, code: n.code.slice(0, 200) });
  });
  return out;
}

/** Variables that no remaining node reads or writes. */
export function usedVariables(passages: Passages): Set<string> {
  const used = new Set<string>();
  eachNode(passages, (n) => {
    if (n.t === 'set' || n.t === 'prompt') used.add(n.var);
    for (const e of nodeExprs(n)) eachExpr(e, (x) => { if ('var' in x) used.add(x.var); });
  });
  return used;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/** Links that move the game on (to the next round or generation) rather than finish an action. */
const PROGRESSION_LINK = /^click( here)? (at the end of the (second )?(round|generation)|to continue to the next round)/i;

/**
 * The original puts the "end of the round" links inside the boxed action of a location
 * (hubDetails). They aren't part of the action, so they move below the box; a section left
 * without content (and its heading) goes. Returns how many links moved.
 */
export function hoistProgressionLinks(passages: Passages, strings: StringTable): number {
  let moved = 0;
  const visit = (nodes: Node[]): Node[] =>
    dropEmptySections(nodes.flatMap((n): Node[] => {
      if (n.t === 'if') n.branches.forEach((b) => (b.body = visit(b.body)));
      if (n.t !== 'block') return [n];
      n.body = visit(n.body);
      if (n.style !== 'hubDetails') return [n];
      let end = n.body.length;
      while (end > 0 && n.body[end - 1]!.t === 'br') end--;
      const last = n.body[end - 1];
      const text = last?.t === 'link' ? strings[last.key]?.full.replace(/[*\\]/g, '').trim() : undefined;
      if (!last || !text || !PROGRESSION_LINK.test(text)) return [n];
      let start = end - 1;
      while (start > 0 && n.body[start - 1]!.t === 'br') start--;
      n.body = n.body.slice(0, start);
      moved++;
      return [n, last];
    }));
  for (const p of Object.values(passages)) {
    p.body = visit(p.body);
    for (const f of Object.keys(p.fragments)) p.fragments[f] = visit(p.fragments[f]!);
  }
  return moved;
}

/** Removes hub sections (heading + details) whose details show nothing. */
function dropEmptySections(nodes: Node[]): Node[] {
  const shows = (body: Node[]): boolean =>
    body.some((n) => (n.t === 'block' ? shows(n.body) : n.t === 'if' ? n.branches.some((b) => shows(b.body)) : !['br', 'set', 'goto'].includes(n.t)));
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.t === 'block' && n.style === 'hubDetails' && !shows(n.body)) {
      // Its heading, and the line breaks after it, go too.
      let k = out.length;
      while (k > 0 && out[k - 1]!.t === 'br') k--;
      const head = out[k - 1];
      if (head?.t === 'block' && head.style === 'hubTitle') out.length = k - 1;
      out.push(...n.body);
      continue;
    }
    out.push(n);
  }
  return out;
}

/**
 * Builds the final string table: link labels used at least `minUses` times share one
 * `common.*` key, everything else is numbered per passage in reading order
 * (`Passage.1`, `Passage.2`, …). Strings of removed passages disappear.
 */
export function finalizeStrings(
  passages: Passages,
  strings: StringTable,
  kinds: Map<string, TextKind>,
  extra: StringTable,
  minUses = 3,
): { strings: StringTable; kinds: Record<TextKind, number>; common: Record<string, number> } {
  const labelUses = new Map<string, number>();
  eachNode(passages, (n) => {
    if (n.t === 'link' && !n.args) {
      const t = strings[n.key]!.full;
      labelUses.set(t, (labelUses.get(t) ?? 0) + 1);
    }
  });

  const out: StringTable = { ...extra };
  const kindCount: Record<TextKind, number> = { narrative: 0, instruction: 0, command: 0, title: 0 };
  const common: Record<string, number> = {};
  const commonKey = new Map<string, string>();
  for (const [text, uses] of labelUses) {
    if (uses < minUses) continue;
    let key = `common.${slug(text)}`;
    for (let i = 2; [...commonKey.values()].includes(key); i++) key = `common.${slug(text)}-${i}`;
    commonKey.set(text, key);
    out[key] = { full: text };
    common[key] = uses;
  }

  for (const p of Object.values(passages)) {
    let i = 0;
    const rekey = (old: string): string => {
      const key = `${p.name}.${++i}`;
      out[key] = strings[old]!;
      const kind = kinds.get(old);
      if (kind) kindCount[kind]++;
      return key;
    };
    const visit = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.t === 'link' && !n.args && commonKey.has(strings[n.key]!.full)) n.key = commonKey.get(strings[n.key]!.full)!;
        else if (n.t === 'text' || n.t === 'link' || n.t === 'prompt') n.key = rekey(n.key);
        if (n.t === 'ui' && n.args?.['text'] && 'lit' in n.args['text']) n.args['text'] = { lit: rekey(String(n.args['text'].lit)) };
        if (n.t === 'block') visit(n.body);
        if (n.t === 'if') n.branches.forEach((b) => visit(b.body));
      }
    };
    visit(p.body);
    Object.values(p.fragments).forEach(visit);
  }
  return { strings: out, kinds: kindCount, common };
}
