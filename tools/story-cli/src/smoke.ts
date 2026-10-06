/**
 * Random-walk smoke test: plays the scenario many times with random choices and
 * reports errors and passage coverage. A stand-in until the real story tester (M2).
 * Usage: node tools/story-cli/src/smoke.ts [--runs N] [--seed S] [id] [contentDir]
 */
import { parseArgs } from 'node:util';
import { Story, StoryError, type Out } from '@chronicle/engine';
import { load, seeded, setupVars } from './load.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { runs: { type: 'string', default: '500' }, seed: { type: 'string', default: '1' }, steps: { type: 'string', default: '600' } },
});
const [id = 'cost-of-disease', dir = 'content'] = positionals;
const { scenario, strings } = load(dir, id);
const rnd = seeded(Number(values.seed));
const pick = (n: number) => Math.floor(rnd() * n);

const visited = new Set<string>();
const errors = new Map<string, { count: number; example: string }>();
const endings = new Map<string, number>();
const missingKeys = new Set<string>();
let totalSteps = 0;

const checkKeys = (out: Out[]) => {
  for (const o of out) {
    if ((o.t === 'text' || o.t === 'link' || o.t === 'prompt') && !strings[o.key]) missingKeys.add(o.key);
    if (o.t === 'block' || o.t === 'group') checkKeys(o.children);
  }
};

for (let run = 0; run < Number(values.runs); run++) {
  const story = new Story(scenario, { vars: setupVars(2 + pick(4)), chooser: { choose: (n) => pick(n) } });
  let trail = '';
  try {
    let view = story.start();
    for (let step = 0; step < Number(values.steps); step++, totalSteps++) {
      visited.add(view.passage);
      trail = view.passage;
      checkKeys(view.output);
      if (view.prompt) view = story.answer(view.prompt.input === 'number' ? pick(12) : 'Test');
      else if (view.links.length) view = story.click(view.links[pick(view.links.length)]!);
      else {
        endings.set(view.passage, (endings.get(view.passage) ?? 0) + 1);
        break;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const key = msg.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N');
    const entry = errors.get(key) ?? { count: 0, example: `${msg}  [in ${trail}]` };
    entry.count++;
    errors.set(key, entry);
    if (!(e instanceof StoryError) && !(e instanceof TypeError) && !(e instanceof RangeError)) throw e;
  }
}

const all = Object.keys(scenario.passages);
console.log(`runs: ${values.runs}, steps: ${totalSteps}`);
console.log(`passages visited: ${visited.size}/${all.length}`);
console.log(`dead ends (no links):`, Object.fromEntries([...endings].sort((a, b) => b[1] - a[1]).slice(0, 15)));
console.log(`missing string keys: ${missingKeys.size}`);
console.log(`errors (${[...errors.values()].reduce((n, e) => n + e.count, 0)} runs):`);
for (const e of [...errors.values()].sort((a, b) => b.count - a.count)) console.log(`  ${e.count}× ${e.example}`);
