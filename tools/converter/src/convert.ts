/** Converts one Cradle story script into Chronicle story data. */
import { FORMAT_VERSION, SETUP_CONTINUE_KEY, type Passage, type Scenario, type StringTable, type TextKind, type Value } from '@chronicle/engine';
import {
  brokenTargets,
  dropDeadFragments,
  finalizeStrings,
  manualNodes,
  reachable,
  usedVariables,
} from './analyze.ts';
import { args, constString, field, named, parseCSharp, walk, type TsNode } from './csharp.ts';
import { normalize, type NormalizeReport } from './normalize.ts';
import { normNum, PassageConverter, type ConvertIssue } from './passage.ts';
import { EXTERNAL_VARIABLES, type ScenarioConfig } from './scenarios.ts';
import { classFields, storyVariables } from './variables.ts';

export interface ConvertInput {
  config: ScenarioConfig;
  /** C# source of the story script. */
  story: string;
  /** C# source of `MainData.cs` (Unity starting values). */
  mainData: string;
  /** File name recorded in `source` references. */
  file: string;
}

export interface ConvertReport {
  passages: number;
  unreachable: string[];
  deadFragments: string[];
  manual: ConvertIssue[];
  unknownExpressions: ConvertIssue[];
  brokenTargets: { passage: string; target: string }[];
  unusedVariables: string[];
  ignored: Record<string, number>;
  kinds: Record<TextKind, number>;
  commonKeys: Record<string, number>;
  typing: NormalizeReport;
}

export interface ConvertResult {
  scenario: Scenario;
  strings: StringTable;
  report: ConvertReport;
}

function findStoryClass(root: TsNode): TsNode {
  let cls: TsNode | undefined;
  walk(root, (n) => {
    if (!cls && n.type === 'class_declaration' && named(field(n, 'body')!).some((m) => /^passage\w+_Init$/.test(field(m, 'name')?.text ?? ''))) cls = n;
  });
  if (!cls) throw new Error('No Cradle story class found');
  return cls;
}

export async function convertScenario(input: ConvertInput): Promise<ConvertResult> {
  const { config } = input;
  const cls = findStoryClass(await parseCSharp(input.story));
  const mainData = await parseCSharp(input.mainData);

  const methods = new Map<string, TsNode>();
  for (const m of named(field(cls, 'body')!)) if (m.type === 'method_declaration') methods.set(field(m, 'name')!.text, m);

  // Passage registrations: `this.Passages[@"Name"] = new StoryPassage(@"Name", tags, passageN_Main)`.
  const inits: { num: string; name: string; tags: string[]; main: string }[] = [];
  for (const [method, m] of methods) {
    const num = /^passage(\w+?)_Init$/.exec(method)?.[1];
    if (!num) continue;
    walk(m, (n) => {
      if (n.type !== 'object_creation_expression' || field(n, 'type')?.text !== 'StoryPassage') return;
      const [name, tagList, main] = args(n);
      const tags = tagList ? named(tagList).flatMap((c) => (c.type === 'initializer_expression' ? named(c).map((s) => constString(s)!) : [])) : [];
      inits.push({ num, name: constString(name!)!, tags, main: main!.text });
    });
  }

  const fields = classFields(cls);
  const converter = new PassageConverter({
    file: input.file,
    fields: new Set(Object.keys(fields)),
    passageByNumber: new Map(inits.map((i) => [normNum(i.num), i.name])),
    screens: config.screens,
  });

  let passages: Record<string, Passage> = {};
  for (const { num, name, tags, main } of inits) {
    const fragments = new Map<string, TsNode>();
    for (const [method, m] of methods) {
      const f = /^passage(\w+?)_Fragment_(\d+)$/.exec(method);
      if (f && normNum(f[1]!) === normNum(num)) fragments.set(f[2]!, m);
    }
    const mainMethod = methods.get(main);
    if (!mainMethod) throw new Error(`Passage "${name}" registers missing method ${main}`);
    passages[name] = converter.convert(name, tags, mainMethod, fragments);
  }

  const deadFragments = dropDeadFragments(passages, converter.usedFragments);

  // Keep only what players can reach.
  const live = reachable(passages, [config.start, ...config.entries]);
  const unreachable = Object.keys(passages).filter((n) => !live.has(n)).sort();
  passages = Object.fromEntries(Object.entries(passages).filter(([n]) => live.has(n)));

  // Variables: the original's starting values, minus everything nothing uses any more.
  const used = usedVariables(passages);
  const allVars: Record<string, Value> = { ...storyVariables(cls, mainData), ...fields };
  for (const v of Object.keys(EXTERNAL_VARIABLES)) allVars[v] ??= '';
  const unusedVariables = Object.keys(allVars).filter((v) => !used.has(v) && !(v in EXTERNAL_VARIABLES)).sort();
  const variables = Object.fromEntries(Object.entries(allVars).filter(([v]) => used.has(v) || v in EXTERNAL_VARIABLES));

  const final = finalizeStrings(passages, converter.strings, converter.kinds, { [SETUP_CONTINUE_KEY]: { full: 'Continue' } });

  const raw: Scenario = { format: FORMAT_VERSION, id: config.id, start: config.start, variables, passages };
  const { scenario, report: typing } = normalize(raw, EXTERNAL_VARIABLES);

  return {
    scenario,
    strings: final.strings,
    report: {
      passages: Object.keys(passages).length,
      unreachable,
      deadFragments,
      manual: manualNodes(passages),
      unknownExpressions: converter.unknownExprs.filter((u) => live.has(u.passage)),
      brokenTargets: brokenTargets(passages),
      unusedVariables,
      ignored: converter.ignored,
      kinds: final.kinds,
      commonKeys: final.common,
      typing,
    },
  };
}
