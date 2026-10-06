import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Scenario, StringTable, Value } from '@chronicle/engine';

export function load(dir: string, id: string): { scenario: Scenario; strings: StringTable } {
  return {
    scenario: JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as Scenario,
    strings: JSON.parse(readFileSync(join(dir, `${id}.strings.json`), 'utf8')) as StringTable,
  };
}

/** What the original app's setup screens put into the story before it starts. */
export function setupVars(players: number): Record<string, Value> {
  const names = ['Ada', 'Bram', 'Cosima', 'Dorian', 'Elodie'];
  const vars: Record<string, Value> = { players, townname: 'Ravensbrück' };
  'ABCDE'.split('').forEach((l, i) => (vars[`name${l}`] = i < players ? names[i]! : ''));
  return vars;
}

/** Small seeded PRNG (mulberry32) so runs are reproducible. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
