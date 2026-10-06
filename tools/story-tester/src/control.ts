/**
 * Variables that can influence where the story goes: read in conditions or link/jump
 * targets, plus everything that feeds into those. Variables that are only displayed
 * (e.g. the name of a creation) cannot change the path, so the explorer ignores them
 * when deciding whether it has seen a state before.
 */
import type { Expr, Scenario } from '@chronicle/engine';
import { eachExpr, eachNode } from './walk.ts';

function reads(e: Expr | undefined, into: Set<string>): void {
  if (e) eachExpr(e, (x) => { if ('var' in x) into.add(x.var); });
}

export function controlVariables(s: Scenario): Set<string> {
  const control = new Set<string>();
  eachNode(s, (n) => {
    if (n.t === 'if') n.branches.forEach((b) => reads(b.cond, control));
    if (n.t === 'goto') reads(n.to, control);
    if (n.t === 'include') reads(n.passage, control);
    if (n.t === 'link') reads(n.to, control);
    if (n.t === 'block') reads(n.next, control);
    if (n.t === 'ui') reads(n.args?.['next'], control);
    // Conditions hidden inside values (`cond ? a : b`) also decide what gets stored.
    for (const e of n.t === 'set' ? [n.value] : n.t === 'text' || n.t === 'link' || n.t === 'prompt' ? n.args ?? [] : []) {
      eachExpr(e, (x) => { if ('cases' in x) x.cases.forEach((c) => reads(c.cond, control)); });
    }
  });
  // Anything assigned into a control variable is control too.
  for (let changed = true; changed; ) {
    changed = false;
    eachNode(s, (n) => {
      if (n.t !== 'set' || !control.has(n.var)) return;
      const before = control.size;
      reads(n.value, control);
      if (control.size !== before) changed = true;
    });
  }
  return control;
}
