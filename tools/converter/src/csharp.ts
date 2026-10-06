/** Helpers for reading C# syntax trees produced by tree-sitter. */
import { createRequire } from 'node:module';
import { Language, Parser, type Node as TsNode } from 'web-tree-sitter';

export type { TsNode };

const require = createRequire(import.meta.url);
let parser: Promise<Parser> | undefined;

export function csharpParser(): Promise<Parser> {
  parser ??= (async () => {
    await Parser.init();
    const lang = await Language.load(require.resolve('tree-sitter-c-sharp/tree-sitter-c_sharp.wasm'));
    const p = new Parser();
    p.setLanguage(lang);
    return p;
  })();
  return parser;
}

export async function parseCSharp(source: string): Promise<TsNode> {
  const tree = (await csharpParser()).parse(source);
  if (!tree) throw new Error('C# parse failed');
  return tree.rootNode;
}

/** Named children without comments. */
export function named(n: TsNode): TsNode[] {
  return n.namedChildren.filter((c): c is TsNode => c !== null && c.type !== 'comment');
}

export function field(n: TsNode, name: string): TsNode | null {
  return n.childForFieldName(name);
}

export function walk(n: TsNode, visit: (n: TsNode) => void): void {
  visit(n);
  for (const c of named(n)) walk(c, visit);
}

/** Decodes a C# string literal (regular or verbatim) to its value. */
export function decodeString(raw: string): string {
  if (raw.startsWith('@"')) return raw.slice(2, -1).replace(/""/g, '"');
  return raw.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) => {
    if (e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r', '0': '\0' } as Record<string, string>)[e] ?? e;
  });
}

/** Constant string value of a literal or a `+` concatenation of literals. */
export function constString(n: TsNode): string | undefined {
  if (n.type === 'string_literal' || n.type === 'verbatim_string_literal') return decodeString(n.text);
  if (n.type === 'parenthesized_expression') return constString(named(n)[0]!);
  if (n.type === 'binary_expression' && opOf(n) === '+') {
    const a = constString(field(n, 'left')!), b = constString(field(n, 'right')!);
    return a !== undefined && b !== undefined ? a + b : undefined;
  }
  return undefined;
}

/** Flattens `"a" + x + "b"` into its parts: constant strings and other expressions. */
export function concatParts(n: TsNode): (string | TsNode)[] {
  const s = constString(n);
  if (s !== undefined) return [s];
  if (n.type === 'binary_expression' && opOf(n) === '+') return [...concatParts(field(n, 'left')!), ...concatParts(field(n, 'right')!)];
  if (n.type === 'parenthesized_expression') return concatParts(named(n)[0]!);
  return [n];
}

export function opOf(n: TsNode): string {
  return field(n, 'operator')?.text ?? n.children.find((c) => c && !c.isNamed)?.text ?? '';
}

/** Argument expressions of a call. */
export function args(call: TsNode): TsNode[] {
  const list = field(call, 'arguments');
  return list ? named(list).map((a) => named(a).at(-1)!) : [];
}

export function argNamed(call: TsNode, name: string): TsNode | undefined {
  const list = field(call, 'arguments');
  const a = list && named(list).find((a) => field(a, 'name')?.text === name);
  return a ? named(a).at(-1) : undefined;
}

/** `a.b.c(...)` → "a.b.c" */
export function calleeName(call: TsNode): string {
  return field(call, 'function')?.text.replace(/\s+/g, '') ?? '';
}

/** `Vars.x` → "x" */
export function varName(n: TsNode | null): string | undefined {
  if (n?.type === 'member_access_expression' && field(n, 'expression')?.text === 'Vars') return field(n, 'name')!.text;
  return undefined;
}

/** Declarators of a field or local declaration: name, type and initializer. */
export function declarators(decl: TsNode): { name: string; type: string; init: TsNode | undefined }[] {
  const vd = decl.type === 'variable_declaration' ? decl : named(decl).find((c) => c.type === 'variable_declaration');
  if (!vd) return [];
  const type = field(vd, 'type')!.text;
  return named(vd)
    .filter((c) => c.type === 'variable_declarator')
    .map((d) => {
      const name = field(d, 'name')!;
      const init = named(d).find((c) => c.id !== name.id);
      return { name: name.text.replace(/^@/, ''), type, init };
    });
}
