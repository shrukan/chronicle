/** Story variables and their starting values as the original app had them. */
import type { Value } from '@chronicle/engine';
import { declarators, field, named, varName, walk, type TsNode } from './csharp.ts';
import { NULL } from './passage.ts';

function literal(init: TsNode | undefined): Value | undefined {
  if (!init) return undefined;
  switch (init.type) {
    case 'integer_literal':
    case 'real_literal':
      return Number(init.text.replace(/[fFdDmM]$/, ''));
    case 'boolean_literal':
      return init.text === 'true';
    case 'string_literal':
      return JSON.parse(init.text) as string;
  }
  return undefined;
}

/**
 * Cradle variables (`VarDefs` fields) with Unity's starting values: `LoadData()` copies
 * every variable from the serialised `MainData`, where text fields start as "" and numbers
 * as 0. Variables not in `MainData` keep their field initialiser, or Cradle's "unset".
 */
export function storyVariables(cls: TsNode, mainData: TsNode): Record<string, Value> {
  const mainTypes = new Map<string, string>();
  walk(mainData, (n) => {
    if (n.type === 'class_declaration' && field(n, 'name')?.text === 'MainData') {
      walk(n, (f) => {
        if (f.type === 'field_declaration') for (const d of declarators(f)) mainTypes.set(d.name, d.type);
      });
    }
  });

  const vars: Record<string, Value> = {};
  walk(cls, (n) => {
    if (n.type !== 'class_declaration' || field(n, 'name')?.text !== 'VarDefs') return;
    walk(n, (f) => {
      if (f.type === 'field_declaration') for (const d of declarators(f)) vars[d.name] = literal(d.init) ?? NULL;
    });
  });

  walk(cls, (n) => {
    if (n.type !== 'method_declaration' || field(n, 'name')?.text !== 'LoadData') return;
    walk(n, (a) => {
      if (a.type !== 'assignment_expression') return;
      const name = varName(field(a, 'left'));
      const right = field(a, 'right')!;
      if (!name || field(right, 'expression')?.text !== 'mainData') return;
      const type = mainTypes.get(field(right, 'name')!.text);
      if (type === 'string') vars[name] = '';
      else if (type === 'int' || type === 'float' || type === 'double') vars[name] = 0;
      else if (type === 'bool') vars[name] = false;
    });
  });
  return vars;
}

/** Private bool/int/string fields of the story class that passages use as state. */
export function classFields(cls: TsNode): Record<string, Value> {
  const fields: Record<string, Value> = {};
  for (const f of named(field(cls, 'body')!).filter((m) => m.type === 'field_declaration')) {
    for (const d of declarators(f)) {
      if (d.type !== 'bool' && d.type !== 'string' && d.type !== 'int') continue;
      fields[d.name] = literal(d.init) ?? (d.type === 'bool' ? false : d.type === 'int' ? 0 : '');
    }
  }
  return fields;
}
