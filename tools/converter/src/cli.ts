/**
 * Converts the original story scripts into `content/`.
 *
 * Usage: node tools/converter/src/cli.ts --upstream <UnityOriginalApp> [--out content]
 *          [--reports build/reports] [--strict] [scenario-id …]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { convertScenario, type ConvertReport } from './convert.ts';
import { extractExtras, type ExtrasReport } from './extras.ts';
import { SCENARIOS } from './scenarios.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    upstream: { type: 'string', default: 'upstream/UnityOriginalApp' },
    out: { type: 'string', default: 'content' },
    reports: { type: 'string', default: 'build/reports' },
    strict: { type: 'boolean', default: false },
  },
});

const scripts = join(values.upstream, 'Assets/Scripts');
const selected = positionals.length ? SCENARIOS.filter((s) => positionals.includes(s.id)) : SCENARIOS;
if (!selected.length) {
  console.error(`Unknown scenario. Known: ${SCENARIOS.map((s) => s.id).join(', ')}`);
  process.exit(2);
}

const json = (v: unknown) => JSON.stringify(v, null, 1) + '\n';
let problems = 0;

for (const config of selected) {
  const storyPath = join(scripts, 'StoryScript', config.source);
  const { scenario, strings, report } = await convertScenario({
    config,
    story: readFileSync(storyPath, 'utf8'),
    mainData: readFileSync(join(scripts, 'Data/MainData.cs'), 'utf8'),
    file: basename(storyPath),
  });

  const { extras, report: extrasReport } = extractExtras(scenario, strings, join(values.upstream, 'Assets'));

  const dir = join(values.out, config.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'scenario.json'), json(scenario));
  writeFileSync(join(dir, 'strings.en.json'), json(strings));
  writeFileSync(join(dir, 'extras.json'), json(extras));
  mkdirSync(values.reports, { recursive: true });
  writeFileSync(join(values.reports, `${config.id}.json`), json({ ...report, extras: extrasReport }));

  summary(config.id, report, extrasReport);
  problems += report.manual.length + report.unknownExpressions.length + report.typing.issues.length;
}

if (values.strict && problems) {
  console.error(`\n${problems} problem(s) need attention (see ${values.reports}).`);
  process.exit(1);
}

function summary(id: string, r: ConvertReport, x: ExtrasReport): void {
  const types: Record<string, number> = {};
  for (const t of Object.values(r.typing.types)) types[t] = (types[t] ?? 0) + 1;
  const manual: Record<string, number> = {};
  for (const m of r.manual) manual[m.reason] = (manual[m.reason] ?? 0) + 1;
  console.log(`\n${id}`);
  console.log(`  passages      ${r.passages} kept (${r.endings} endings), ${r.unreachable.length} unreachable dropped`);
  console.log(`  text          ${r.kinds.narrative} narrative, ${r.kinds.instruction} instruction, ${r.kinds.command} app commands, ${r.kinds.title} title; ${Object.keys(r.commonKeys).length} shared labels`);
  console.log(`  variables     ${JSON.stringify(types)}; ${r.unusedVariables.length} unused dropped`);
  console.log(`  manual        ${r.manual.length}${r.manual.length ? ' ' + JSON.stringify(manual) : ''}`);
  console.log(`  unknown expr  ${r.unknownExpressions.length}`);
  console.log(`  typing issues ${r.typing.issues.length}`);
  console.log(`  extras        ${x.endOfRound} end-of-round texts, ${x.logBook} log book entries, ${x.voiceOver} voice-over passages`);
  console.log(`  broken links  ${r.brokenTargets.length}${r.brokenTargets.length ? ' ' + r.brokenTargets.map((b) => `${b.passage}→${b.target}`).join(', ') : ''}`);
}
