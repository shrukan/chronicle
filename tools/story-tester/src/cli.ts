/**
 * Story tester: static checks plus systematic exploration of a converted scenario.
 * Output is spoiler-free (counts, anonymous ending labels); details go to the report file
 * or are printed with --spoilers.
 *
 * Usage: node tools/story-tester/src/cli.ts [id] [--content content] [--players 2,3,4,5]
 *          [--max-states N] [--seconds N] [--spoilers] [--reports build/reports]
 *
 * Known, accepted issues live in content/<id>/known-issues.json:
 *   { "deadEnds": { "<passage>": "reason" }, "errors": { "<message>": "reason" }, "unvisited": { "<passage>": "reason" } }
 * Exit code 1 when anything else is found.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { IfNode, Scenario, StringTable, Value } from '@chronicle/engine';
import { promptCandidates } from './candidates.ts';
import { controlVariables } from './control.ts';
import { explore, type ExploreResult, type Finding } from './explore.ts';
import { staticChecks } from './static-checks.ts';
import { describe } from './describe.ts';
import { closedDomains, isImpossibleFallthrough } from './infeasible.ts';
import { eachNode } from './walk.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    content: { type: 'string', default: 'content' },
    reports: { type: 'string', default: 'build/reports' },
    players: { type: 'string', default: '2,3,4,5' },
    seconds: { type: 'string', default: '240' },
    plateau: { type: 'string', default: '30' },
    seed: { type: 'string', default: '1' },
    spoilers: { type: 'boolean', default: false },
  },
});

const id = positionals[0] ?? 'cost-of-disease';
const dir = join(values.content, id);
const read = <T>(file: string): T => JSON.parse(readFileSync(join(dir, file), 'utf8')) as T;
const scenario = read<Scenario>('scenario.json');
const strings = read<StringTable>('strings.en.json');
const extras = existsSync(join(dir, 'extras.json')) ? read<Record<string, Record<string, Record<string, string>>>>('extras.json') : {};
const known = existsSync(join(dir, 'known-issues.json'))
  ? read<{ deadEnds?: Record<string, string>; errors?: Record<string, string>; unvisited?: Record<string, string>; neverSet?: Record<string, string> }>('known-issues.json')
  : {};

const NAMES = ['Ada', 'Bram', 'Cosima', 'Dorian', 'Elodie'];
const EXTERNAL = ['players', 'townname', 'nameA', 'nameB', 'nameC', 'nameD', 'nameE', 'winnerName'];

// --- static ----------------------------------------------------------------
const extraKeys = Object.values(extras).flatMap((m) => Object.values(m).flatMap((e) => Object.values(e).filter((v) => /^(round|log)\./.test(v))));
const stat = staticChecks(scenario, strings, EXTERNAL, extraKeys);

// --- exploration (once per player count) ---------------------------------------
const candidates = promptCandidates(scenario, ['townname']);
const setupChoices = new Map([['townname', candidates.get('townname')!]]);
const control = controlVariables(scenario);
console.log(`  ${control.size} of ${Object.keys(scenario.variables).length} variables decide the path`);
const playerCounts = values.players.split(',').map(Number);
const perRun = Number(values.seconds) * 1000 / playerCounts.length;
const runs: { players: number; r: ExploreResult }[] = [];
const branches = new Map<IfNode, Set<number>>();
for (const players of playerCounts) {
  const setup: Record<string, Value> = { players, townname: 'Ravensbrück', winnerName: NAMES[0]! };
  'ABCDE'.split('').forEach((l, i) => (setup[`name${l}`] = i < players ? NAMES[i]! : ''));
  const t0 = Date.now();
  const r = explore(scenario, {
    setup, setupChoices, candidates, control, branches, timeLimitMs: perRun, plateauMs: Number(values.plateau) * 1000,
    maxOutcomesPerAction: 5000, sampleRangeAbove: 6, maxStepsPerWalk: 3000, seed: Number(values.seed) * 10 + players,
  });
  runs.push({ players, r });
  console.log(`  players ${players}: ${r.corpus} interesting states, ${r.walks} walks, ${r.actions} actions, ${r.plateaued ? 'coverage stopped growing' : 'time budget used'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

// --- merge -----------------------------------------------------------------
const visited = new Set<string>();
const endings = new Map<string, number>();
const deadEnds = new Map<string, Finding & { players: number }>();
const errors = new Map<string, Finding & { message: string; players: number }>();
const sampled = new Set<string>();
for (const { players, r } of runs) {
  r.visited.forEach((p) => visited.add(p));
  r.sampledSites.forEach((s) => sampled.add(s));
  for (const [p, n] of r.endings) endings.set(p, (endings.get(p) ?? 0) + n);
  for (const [p, f] of r.deadEnds) if (!deadEnds.has(p)) deadEnds.set(p, { ...f, players });
  for (const [k, f] of r.errors) if (!errors.has(k)) errors.set(k, { ...f, players });
}
const complete = runs.every(({ r }) => r.plateaued);
const allEndings = Object.values(scenario.passages).filter((p) => p.tags.includes('ending')).map((p) => p.name);
const unvisited = Object.keys(scenario.passages).filter((p) => !visited.has(p)).sort();

// Branch coverage: every branch of every condition, plus "no branch matched" where there is no else.
const uncovered: { passage: string; branch: number; of: number; cond: string }[] = [];
const domains = closedDomains(scenario, { players: playerCounts });
let branchSlots = 0, impossible = 0;
eachNode(scenario, (n, p) => {
  if (n.t !== 'if') return;
  const slots = n.branches.map((_, i) => i);
  if (n.branches.at(-1)?.cond) slots.push(-1);
  // Leave out fall-throughs that cannot happen (e.g. "else" after every player count).
  for (const i of [...slots]) {
    const at = i < 0 ? n.branches.length : n.branches[i]!.cond ? -1 : i;
    if (at >= 0 && isImpossibleFallthrough(n, at, domains)) {
      slots.splice(slots.indexOf(i), 1);
      impossible++;
    }
  }
  branchSlots += slots.length;
  const taken = branches.get(n);
  for (const i of slots) {
    if (taken?.has(i)) continue;
    const cond = i < 0 ? `none of: ${n.branches.map((b) => describe(b.cond)).join(' | ')}` : describe(n.branches[i]!.cond) === 'else' ? `else after: ${n.branches.slice(0, i).map((b) => describe(b.cond)).join(' | ')}` : describe(n.branches[i]!.cond);
    uncovered.push({ passage: p.name, branch: i, of: n.branches.length, cond });
  }
});

/** Stable anonymous label, so results can be discussed without spoilers. */
const hash = (s: string) => createHash('sha1').update(s).digest('hex');
const endingLabel = new Map([...allEndings].sort((a, b) => hash(a).localeCompare(hash(b))).map((n, i) => [n, `Ending ${i + 1}`]));

const newDeadEnds = [...deadEnds.keys()].filter((p) => !known.deadEnds?.[p]);
const newErrors = [...errors.values()].filter((e) => !known.errors?.[e.message]);
const newUnvisited = complete ? unvisited.filter((p) => !known.unvisited?.[p]) : [];
const newNeverSet = stat.neverSet.filter((v) => !known.neverSet?.[v]);

// --- report ----------------------------------------------------------------
mkdirSync(values.reports, { recursive: true });
const reportFile = join(values.reports, `${id}.tester.json`);
writeFileSync(reportFile, JSON.stringify({
  static: stat,
  runs: runs.map(({ players, r }) => ({ players, corpus: r.corpus, walks: r.walks, actions: r.actions, plateaued: r.plateaued })),
  endings: Object.fromEntries([...endingLabel].map(([n, l]) => [l, { passage: n, endStates: endings.get(n) ?? 0 }])),
  deadEnds: Object.fromEntries(deadEnds),
  errors: [...errors.values()],
  unvisited,
  uncoveredBranches: uncovered,
  sampledSites: [...sampled].sort(),
  promptCandidates: Object.fromEntries(candidates),
}, null, 1) + '\n');

const line = (label: string, text: string) => console.log(`  ${label.padEnd(12)}${text}`);
console.log(`\n${id}`);
line('static', `${stat.missingStrings.length} missing strings, ${stat.unusedStrings.length} unused strings, ${stat.neverSet.length} variables read but never set, ${stat.neverRead.length} set but never read, ${stat.missingPassages.length} missing passages, ${stat.manualNodes} manual nodes`);
line('explored', `${playerCounts.join('/')} players – ${complete ? 'coverage stopped growing' : 'time budget used, coverage may still grow'}`);
line('coverage', `${visited.size}/${Object.keys(scenario.passages).length} passages, ${branchSlots - uncovered.length}/${branchSlots} condition branches (${impossible} impossible ones excluded)${sampled.size ? `; ${sampled.size} random choices sampled instead of enumerated` : ''}`);
line('endings', `${[...endingLabel.keys()].filter((n) => endings.has(n)).length}/${allEndings.length} reached; missing: ${[...endingLabel].filter(([n]) => !endings.has(n)).map(([, l]) => l).join(', ') || 'none'}`);
line('dead ends', `${deadEnds.size}${deadEnds.size - newDeadEnds.length ? ` (${deadEnds.size - newDeadEnds.length} known)` : ''}`);
line('errors', `${errors.size}${errors.size - newErrors.length ? ` (${errors.size - newErrors.length} known)` : ''}`);
console.log(`  details in ${reportFile}${values.spoilers ? '' : ' (contains spoilers)'}`);

if (values.spoilers) {
  for (const [p, f] of deadEnds) console.log(`  dead end ${p} (${f.players} players): ${f.trail.join(' → ')}`);
  for (const e of errors.values()) console.log(`  error ${e.message} (${e.players} players): ${e.trail.join(' → ')}`);
  if (complete) for (const p of unvisited) console.log(`  unvisited ${p}`);
}

const failures = newDeadEnds.length + newErrors.length + newUnvisited.length + newNeverSet.length + stat.missingStrings.length + stat.missingPassages.length + stat.manualNodes;
if (failures) {
  console.error(`\n${failures} new issue(s) – fix them or list them in ${join(dir, 'known-issues.json')} with a reason.`);
  process.exit(1);
}
