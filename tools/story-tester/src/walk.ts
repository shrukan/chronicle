/** Helpers to visit every node and expression of a scenario. */
import type { Expr, Node, Passage, Scenario } from '@chronicle/engine';

export function eachNode(s: Scenario, fn: (n: Node, p: Passage) => void): void {
  const visit = (nodes: Node[], p: Passage) => {
    for (const n of nodes) {
      fn(n, p);
      if (n.t === 'block') visit(n.body, p);
      if (n.t === 'if') n.branches.forEach((b) => visit(b.body, p));
    }
  };
  for (const p of Object.values(s.passages)) {
    visit(p.body, p);
    Object.values(p.fragments).forEach((f) => visit(f, p));
  }
}

/** Expressions held directly by a node. */
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
