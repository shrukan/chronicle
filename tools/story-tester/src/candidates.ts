/**
 * Which answers to try for each prompt. Instead of guessing, use the values the story
 * itself compares the answer with (plus neighbours), so every branch that depends on an
 * answer gets exercised.
 */
import type { Expr, Scenario, Value } from '@chronicle/engine';
import { eachExpr, eachNode, nodeExprs } from './walk.ts';

const COMPARE = new Set(['==', '!=', '<', '<=', '>', '>=']);

/** Variables an expression reads. */
function readsOf(e: Expr): Set<string> {
  const vars = new Set<string>();
  eachExpr(e, (x) => { if ('var' in x) vars.add(x.var); });
  return vars;
}

/**
 * @param setupText text variables the app's setup screens fill in (e.g. the village name);
 *   they get candidates like text prompts, so special names the story checks for are tried.
 */
export function promptCandidates(s: Scenario, setupText: string[] = []): Map<string, Value[]> {
  const prompts = new Map<string, 'number' | 'text'>();
  eachNode(s, (n) => { if (n.t === 'prompt') prompts.set(n.var, n.input); });
  for (const v of setupText) prompts.set(v, 'text');

  // Variables that carry a prompt's answer onwards (`total = answer + 1`).
  const derived = new Map<string, Set<string>>();
  for (const v of prompts.keys()) derived.set(v, new Set([v]));
  for (let changed = true; changed; ) {
    changed = false;
    eachNode(s, (n) => {
      if (n.t !== 'set') return;
      const reads = readsOf(n.value);
      for (const [v, set] of derived) {
        if (!set.has(n.var) && [...reads].some((r) => set.has(r))) {
          set.add(n.var);
          changed = true;
        }
      }
    });
  }

  const literals = new Map<string, Set<Value>>();
  eachNode(s, (n) => {
    for (const root of nodeExprs(n)) {
      eachExpr(root, (e) => {
        if (!('op' in e) || !COMPARE.has(e.op) || !('b' in e)) return;
        for (const [side, other] of [[e.a, e.b], [e.b, e.a]] as const) {
          if (!('lit' in other)) continue;
          for (const r of readsOf(side)) {
            for (const [v, set] of derived) if (set.has(r)) (literals.get(v) ?? literals.set(v, new Set()).get(v)!).add(other.lit);
          }
        }
      });
    }
  });

  const out = new Map<string, Value[]>();
  for (const [v, input] of prompts) {
    const lits = [...(literals.get(v) ?? [])];
    if (input === 'number') {
      const nums = new Set<number>([0, 1, 3]);
      for (const l of lits) if (typeof l === 'number') for (const d of [-1, 0, 1]) if (l + d >= 0) nums.add(l + d);
      out.set(v, [...nums].sort((a, b) => a - b));
    } else {
      out.set(v, ['Test', ...new Set(lits.filter((l): l is string => typeof l === 'string' && l !== ''))]);
    }
  }
  return out;
}
