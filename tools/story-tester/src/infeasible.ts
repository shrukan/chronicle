/**
 * Branch slots that can never run: an `else` (or "no branch matched") after equality
 * checks that already cover every value the variable can have. Only variables with a
 * closed set of values qualify: their start value and every assignment are constants
 * (or the app limits them, like the player count).
 */
import type { Expr, IfNode, Scenario, Value } from '@chronicle/engine';
import { eachNode } from './walk.ts';

export function closedDomains(s: Scenario, fixed: Record<string, Value[]>): Map<string, Value[]> {
  const domains = new Map<string, Set<string>>();
  const open = new Set<string>();
  for (const [v, init] of Object.entries(s.variables)) domains.set(v, new Set([JSON.stringify(init)]));
  eachNode(s, (n) => {
    if (n.t === 'prompt') open.add(n.var);
    if (n.t !== 'set') return;
    const values = n.value;
    const lits = 'lit' in values ? [values.lit] : 'fn' in values && values.fn === 'either' && values.args.every((a) => 'lit' in a) ? values.args.map((a) => (a as { lit: Value }).lit) : undefined;
    if (!lits) open.add(n.var);
    else for (const l of lits) domains.get(n.var)?.add(JSON.stringify(l));
  });
  const out = new Map<string, Value[]>();
  for (const [v, set] of domains) if (!open.has(v)) out.set(v, [...set].map((x) => JSON.parse(x) as Value));
  for (const [v, values] of Object.entries(fixed)) out.set(v, values);
  return out;
}

/** `v == literal` (either side). */
function equality(e: Expr | undefined): [string, Value] | undefined {
  if (!e || !('op' in e) || e.op !== '==' || !('b' in e)) return undefined;
  if ('var' in e.a && 'lit' in e.b) return [e.a.var, e.b.lit];
  if ('var' in e.b && 'lit' in e.a) return [e.b.var, e.a.lit];
  return undefined;
}

/** Whether the fall-through slot of `n` after branch `upTo` (exclusive) is impossible. */
export function isImpossibleFallthrough(n: IfNode, upTo: number, domains: Map<string, Value[]>): boolean {
  const checks = n.branches.slice(0, upTo).map((b) => equality(b.cond));
  if (!checks.length || checks.some((c) => !c)) return false;
  const v = checks[0]![0];
  if (checks.some((c) => c![0] !== v)) return false;
  const domain = domains.get(v);
  if (!domain) return false;
  const covered = new Set(checks.map((c) => JSON.stringify(c![1])));
  return domain.every((x) => covered.has(JSON.stringify(x)));
}
