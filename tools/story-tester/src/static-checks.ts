/** Checks that need no playthrough: references between data, strings and variables. */
import { SETUP_CONTINUE_KEY, type Scenario, type StringTable } from '@chronicle/engine';
import { eachExpr, eachNode, nodeExprs } from './walk.ts';

export interface StaticReport {
  missingStrings: string[];
  unusedStrings: string[];
  /** Variables the story reads but never writes (other than the app's setup values). */
  neverSet: string[];
  /** Variables written but never read. */
  neverRead: string[];
  missingPassages: { passage: string; target: string }[];
  manualNodes: number;
}

export function staticChecks(s: Scenario, strings: StringTable, external: string[], extraKeys: string[] = []): StaticReport {
  const usedKeys = new Set<string>([SETUP_CONTINUE_KEY, ...extraKeys]);
  const written = new Set<string>(external), read = new Set<string>();
  const missingPassages: { passage: string; target: string }[] = [];
  let manualNodes = 0;

  eachNode(s, (n, p) => {
    if (n.t === 'text' || n.t === 'link' || n.t === 'prompt') usedKeys.add(n.key);
    if (n.t === 'ui' && n.args?.['text'] && 'lit' in n.args['text']) usedKeys.add(String(n.args['text'].lit));
    if (n.t === 'set' || n.t === 'prompt') written.add(n.var);
    if (n.t === 'manual') manualNodes++;
    for (const e of nodeExprs(n)) eachExpr(e, (x) => { if ('var' in x) read.add(x.var); });
    const target = n.t === 'link' || n.t === 'goto' ? n.to : n.t === 'include' ? n.passage : n.t === 'block' ? n.next : undefined;
    if (target && 'lit' in target && typeof target.lit === 'string' && !s.passages[target.lit]) missingPassages.push({ passage: p.name, target: target.lit });
  });

  return {
    missingStrings: [...usedKeys].filter((k) => !strings[k]).sort(),
    unusedStrings: Object.keys(strings).filter((k) => !usedKeys.has(k)).sort(),
    neverSet: [...read].filter((v) => !written.has(v)).sort(),
    neverRead: [...written].filter((v) => !read.has(v) && !external.includes(v)).sort(),
    missingPassages,
    manualNodes,
  };
}
