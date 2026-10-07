/**
 * Data the original app keeps outside the story scripts: end-of-round texts (scene data),
 * log book entries (CSV, matched by passage title) and voice-over clips (ScriptableObject).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { toMarkup } from './passage.ts';
import { guidIndex } from './unity.ts';
import { type Node, type Scenario, type ScenarioExtras as Extras, type StringTable } from '@chronicle/engine';

export interface ExtrasReport {
  endOfRound: number;
  logBook: number;
  voiceOver: number;
  /** CSV rows whose column count shows commas inside the text (the original misreads them too). */
  irregularLogBookRows: string[];
}

/** Cuts a top-level-ish YAML property (`  name:` and its indented body) out of a Unity file. */
function yamlSection(source: string, name: string): unknown {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start < 0) throw new Error(`No "${name}" in scene`);
  let end = start + 1;
  while (end < lines.length && (/^  [- ]/.test(lines[end]!) || lines[end] === '')) end++;
  return (parse(lines.slice(start, end).map((l) => l.slice(2)).join('\n')) as Record<string, unknown>)[name];
}

function titleOf(nodes: Node[], strings: StringTable): string | undefined {
  const title = nodes.find((n) => n.t === 'text' && n.kind === 'title');
  return title?.t === 'text' ? strings[title.key]!.full.replace(/\*+/g, '').replace(/\\(.)/g, '$1').trim() : undefined;
}

/**
 * @param assets the Unity `Assets` folder
 * @param strings English string table; extracted texts are added to it
 */
export function extractExtras(scenario: Scenario, strings: StringTable, assets: string): { extras: Extras; report: ExtrasReport } {
  const extras: Extras = { endOfRound: {}, logBook: {}, voiceOver: {} };
  const report: ExtrasReport = { endOfRound: 0, logBook: 0, voiceOver: 0, irregularLogBookRows: [] };
  const passages = scenario.passages;
  const add = (key: string, text: string) => {
    strings[key] = { full: toMarkup(text.trim()) };
    return key;
  };

  // End of round: PassageTracker.progress in the main scene; language 0 is English.
  const progress = yamlSection(readFileSync(join(assets, 'Scenes/Main.unity'), 'utf8'), 'progress') as {
    PassageName: string[]; Details: string[]; details2: string[]; Progress: number;
  }[];
  for (const entry of progress) {
    for (const name of entry.PassageName.filter((n) => passages[n])) {
      extras.endOfRound[name] = {
        round: entry.Progress,
        text: add(`round.${name}.end`, entry.Details[0] ?? ''),
        then: add(`round.${name}.then`, entry.details2[0] ?? ''),
      };
      report.endOfRound++;
    }
  }

  // Log book: rows are matched against passage titles, case-insensitively.
  const csv = readFileSync(join(assets, 'CSV/Updated Features MFW - Log Book Data (1).csv'), 'utf8').split(/\r?\n/).filter(Boolean);
  const columns = csv[0]!.split(',').length;
  const rows = new Map<string, string[]>();
  for (const line of csv.slice(1)) {
    const cells = line.split(',');
    if (cells.length !== columns) report.irregularLogBookRows.push(cells[0]!);
    rows.set(cells[0]!.trim().toLowerCase(), cells);
  }
  for (const p of Object.values(passages)) {
    const title = titleOf(p.body, strings);
    const row = title && rows.get(title.toLowerCase());
    if (!row) continue;
    extras.logBook[p.name] = {
      title: add(`log.${p.name}.title`, row[0]!),
      location: add(`log.${p.name}.location`, row[1] ?? ''),
      summary: add(`log.${p.name}.summary`, row[2] ?? ''),
    };
    report.logBook++;
  }

  // Voice-over: VOAudio.asset maps passage names to clips by Unity GUID.
  const vo = readFileSync(join(assets, 'Scripts/ScriptableObject/VOAudio.asset'), 'utf8').replace(/^(%|---).*$/gm, '');
  const data = (parse(vo) as { MonoBehaviour: Record<string, { PassageName: string; clip: { guid: string } }[]> }).MonoBehaviour;
  const guids = guidIndex(assets);
  for (const [field, voice] of [['MaleAudioDatas', 'male'], ['FemaleAudioDatas', 'female']] as const) {
    for (const { PassageName, clip } of data[field] ?? []) {
      const file = guids.get(clip.guid);
      if (!passages[PassageName] || !file) continue;
      (extras.voiceOver[PassageName] ??= {})[voice] = file;
    }
  }
  report.voiceOver = Object.keys(extras.voiceOver).length;
  return { extras, report };
}
