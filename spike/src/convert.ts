/**
 * M0 spike: prototype converter from Cradle-generated (and hand-edited) C# to the
 * Chronicle story format. Throwaway code – it exists to prove the format and to
 * measure how much of the source converts automatically.
 *
 * Usage: node spike/src/convert.ts <Story.cs> <MainData.cs> <outDir> [scenarioId]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { Language, Parser, type Node as TsNode } from 'web-tree-sitter';
import {
  escapeMarkup,
  FORMAT_VERSION,
  SETUP_CONTINUE_KEY,
  type BlockStyle,
  type Expr,
  type FnName,
  type Node,
  type Passage,
  type Scenario,
  type StringTable,
  type TextKind,
  type Value,
} from '@chronicle/engine';

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);

async function parser(): Promise<Parser> {
  await Parser.init();
  const lang = await Language.load(require.resolve('tree-sitter-c-sharp/tree-sitter-c_sharp.wasm'));
  const p = new Parser();
  p.setLanguage(lang);
  return p;
}

function named(n: TsNode): TsNode[] {
  return n.namedChildren.filter((c): c is TsNode => c !== null && c.type !== 'comment');
}

function field(n: TsNode, name: string): TsNode | null {
  return n.childForFieldName(name);
}

function walk(n: TsNode, visit: (n: TsNode) => void): void {
  visit(n);
  for (const c of named(n)) walk(c, visit);
}

/** Decodes a C# string literal (regular or verbatim) to its value. */
function decodeString(raw: string): string {
  if (raw.startsWith('@"')) return raw.slice(2, -1).replace(/""/g, '"');
  return raw.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) => {
    if (e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r', '0': '\0' } as Record<string, string>)[e] ?? e;
  });
}

/** Constant string value of a literal or a `+` concatenation of literals. */
function constString(n: TsNode): string | undefined {
  if (n.type === 'string_literal' || n.type === 'verbatim_string_literal') return decodeString(n.text);
  if (n.type === 'parenthesized_expression') return constString(named(n)[0]!);
  if (n.type === 'binary_expression' && opOf(n) === '+') {
    const a = constString(field(n, 'left')!), b = constString(field(n, 'right')!);
    return a !== undefined && b !== undefined ? a + b : undefined;
  }
  return undefined;
}

function opOf(n: TsNode): string {
  return field(n, 'operator')?.text ?? n.children.find((c) => c && !c.isNamed)?.text ?? '';
}

function args(call: TsNode): TsNode[] {
  const list = field(call, 'arguments');
  return list ? named(list).map((a) => named(a).at(-1)!) : [];
}

function argNamed(call: TsNode, name: string): TsNode | undefined {
  const list = field(call, 'arguments');
  const a = list && named(list).find((a) => field(a, 'name')?.text === name);
  return a ? named(a).at(-1) : undefined;
}

/** `a.b.c(...)` → "a.b.c" */
function calleeName(call: TsNode): string {
  return field(call, 'function')?.text.replace(/\s+/g, '') ?? '';
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface Report {
  manual: { passage: string; line: number; reason: string; code: string }[];
  unknownExprs: { passage: string; line: number; code: string }[];
  ignored: Record<string, number>;
  deadFragments: string[];
  brokenTargets: { passage: string; target: string }[];
  kinds: Record<TextKind, number>;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

const FNS: Record<string, FnName> = {
  either: 'either', random: 'random', num: 'num', a: 'array', shuffled: 'shuffled', max: 'max', min: 'min',
};

class Converter {
  readonly strings: StringTable = {};
  readonly report: Report = {
    manual: [], unknownExprs: [], ignored: {}, deadFragments: [], brokenTargets: [],
    kinds: { narrative: 0, instruction: 0, title: 0 },
  };
  private passage = '';
  private counter = 0;
  /** Private bool/string fields of the story class used as extra state (e.g. `ispopup`). */
  readonly fields = new Set<string>();
  /** Target set by `ViewItemObtain.SetupPassagename = …`, attached to the next setup pop-up. */
  private setupNext: Expr | undefined;
  /** Local string constants inside the current method (`string s = "...";`). */
  private locals = new Map<string, string>();
  /** Generated method number ("28", "04") → passage name. */
  readonly passageByNumber = new Map<string, string>();
  /** Fragments referenced from live code, per passage. */
  readonly usedFragments = new Set<string>();

  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  expr(n: TsNode): Expr {
    switch (n.type) {
      case 'integer_literal':
      case 'real_literal':
        return { lit: Number(n.text.replace(/[fFdDmM]$/, '')) };
      case 'boolean_literal':
        return { lit: n.text === 'true' };
      case 'null_literal':
        return { lit: null };
      case 'string_literal':
      case 'verbatim_string_literal':
        return { lit: decodeString(n.text) };
      case 'parenthesized_expression':
        return this.expr(named(n)[0]!);
      case 'cast_expression':
        return this.expr(field(n, 'value')!);
      case 'conditional_expression': {
        const cases: { cond?: Expr; value: Expr }[] = [];
        let cur: TsNode = n;
        while (cur.type === 'conditional_expression') {
          cases.push({ cond: this.expr(field(cur, 'condition')!), value: this.expr(field(cur, 'consequence')!) });
          cur = field(cur, 'alternative')!;
          while (cur.type === 'parenthesized_expression') cur = named(cur)[0]!;
        }
        cases.push({ value: this.expr(cur) });
        return { cases };
      }
      case 'element_access_expression': {
        const sub = named(field(n, 'subscript')!)[0]!;
        return { at: this.expr(field(n, 'expression')!), key: this.expr(named(sub).at(-1)!) };
      }
      case 'identifier':
        if (this.locals.has(n.text)) return { lit: this.locals.get(n.text)! };
        if (this.fields.has(n.text)) return { var: n.text };
        break;
      case 'member_access_expression':
        if (field(n, 'expression')?.text === 'Vars') return { var: field(n, 'name')!.text };
        // App-wide globals mirror story variables (see OnSetGlobleVariable in the original).
        if (field(n, 'expression')?.text === 'GLOBALS') {
          const g = field(n, 'name')!.text;
          return { var: ({ townName: 'townname', playerCount: 'players' } as Record<string, string>)[g] ?? g };
        }
        break;
      case 'prefix_unary_expression': {
        const op = n.children[0]?.text;
        const a = this.expr(named(n)[0]!);
        if (op === '!') return { op: 'not', a };
        if (op === '-') return 'lit' in a && typeof a.lit === 'number' ? { lit: -a.lit } : { op: 'neg', a };
        break;
      }
      case 'binary_expression': {
        const op = opOf(n);
        const s = constString(n);
        if (s !== undefined) return { lit: s };
        if (['==', '!=', '<', '<=', '>', '>=', '&&', '||', '+', '-', '*', '/', '%'].includes(op)) {
          return { op: op as never, a: this.expr(field(n, 'left')!), b: this.expr(field(n, 'right')!) };
        }
        break;
      }
      case 'invocation_expression': {
        const name = calleeName(n);
        const m = /^macros\d*\.(\w+)$/.exec(name);
        const fn = m && FNS[m[1]!];
        if (fn) return { fn, args: args(n).map((a) => this.expr(a)) };
        if (name.endsWith('.ToString') && args(n).length === 0) {
          const recv = field(field(n, 'function')!, 'expression')!;
          return { op: '+', a: { lit: '' }, b: this.expr(recv) };
        }
        if (name === 'int.Parse' || name === 'float.Parse') return { fn: 'num', args: [this.expr(args(n)[0]!)] };
        if (name === 'Mathf.Max' || name === 'Math.Max') return { fn: 'max', args: args(n).map((x) => this.expr(x)) };
        if (name === 'String.IsNullOrEmpty' || name === 'string.IsNullOrEmpty') {
          const v = this.expr(args(n)[0]!);
          return { op: '||', a: { op: '==', a: v, b: { lit: null } }, b: { op: '==', a: v, b: { lit: '' } } };
        }
        break;
      }
    }
    this.report.unknownExprs.push({ passage: this.passage, line: n.startPosition.row + 1, code: n.text });
    return { unknown: n.text };
  }

  // -------------------------------------------------------------------------
  // Statements → items (inline pieces and nodes), then grouped into text runs
  // -------------------------------------------------------------------------

  convertPassage(name: string, tags: string[], main: TsNode, fragments: Map<string, TsNode>): Passage {
    this.passage = name;
    this.counter = 0;
    const p: Passage = {
      name, tags,
      body: this.body(main, true),
      fragments: {},
      source: { file: this.file, line: main.startPosition.row + 1 },
    };
    for (const [id, f] of fragments) p.fragments[id] = this.body(f, false);
    this.renumber(p);
    return p;
  }

  /** Re-keys this passage's strings in reading order: Name.1, Name.2, … */
  private renumber(p: Passage): void {
    const old = { ...this.strings };
    for (const k of Object.keys(this.strings)) if (k.startsWith(`${p.name}.`)) delete this.strings[k];
    let i = 0;
    const re = (k: string) => {
      const nk = `${p.name}.${++i}`;
      this.strings[nk] = old[k]!;
      return nk;
    };
    const visit = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.t === 'text' || n.t === 'link' || n.t === 'prompt') n.key = re(n.key);
        if (n.t === 'ui' && n.args?.['text'] && 'lit' in n.args['text']) n.args['text'] = { lit: re(String(n.args['text'].lit)) };
        if (n.t === 'block') visit(n.body);
        if (n.t === 'if') n.branches.forEach((b) => visit(b.body));
      }
    };
    visit(p.body);
    Object.values(p.fragments).forEach(visit);
  }

  private body(method: TsNode, isMain: boolean): Node[] {
    this.locals = new Map();
    this.setupNext = undefined;
    const block = field(method, 'body')!;
    const items = this.stmts(named(block), { bold: false, italic: false, block: undefined });
    return this.group(items, isMain);
  }

  private stmts(list: TsNode[], st: Style): Item[] {
    const out: Item[] = [];
    list.forEach((s, i) => {
      // A trailing `yield break;` just ends the method.
      if (s.type === 'yield_statement' && s.text === 'yield break;' && i === list.length - 1) return;
      out.push(...this.stmt(s, st));
    });
    return out;
  }

  private stmt(s: TsNode, st: Style): Item[] {
    switch (s.type) {
      case 'block':
        return this.stmts(named(s), st);
      case 'yield_statement':
        return this.yieldStmt(s, st);
      case 'using_statement':
        return this.usingStmt(s, st);
      case 'if_statement':
        return this.ifStmt(s, st);
      case 'expression_statement':
        return this.exprStmt(named(s)[0]!, st);
      case 'empty_statement':
        return [];
      case 'local_declaration_statement': {
        const decl = named(s)[0]!;
        const ds = named(decl).filter((c) => c.type === 'variable_declarator');
        const values = ds.map((d) => [field(d, 'name')!.text, constString(named(d).at(-1)!)] as const);
        if (values.every(([, v]) => v !== undefined)) {
          for (const [k, v] of values) this.locals.set(k, v!);
          return [];
        }
        break;
      }
    }
    return [this.manual(s, `unsupported statement: ${s.type}`)];
  }

  private yieldStmt(s: TsNode, st: Style): Item[] {
    if (s.text === 'yield break;') return [this.manual(s, 'yield break in the middle of a passage')];
    const call = named(s)[0]!;
    if (call.type !== 'invocation_expression') return [this.manual(s, 'yield return of non-call')];
    const name = calleeName(call);
    const a = args(call);

    switch (name) {
      case 'text': {
        const lit = constString(a[0]!);
        if (lit !== undefined) return [{ k: 'text', text: lit, ...st }];
        return [{ k: 'expr', expr: this.expr(a[0]!), ...st }];
      }
      case 'lineBreak':
        return [{ k: 'node', node: { t: 'br' } }];
      case 'link': {
        const label = constString(a[0]!);
        const node: Node = { t: 'link', key: this.str(label ?? '{0}', 'instruction', label === undefined) };
        if (label === undefined) node.args = [this.expr(a[0]!)];
        if (a[1] && a[1].type !== 'null_literal') node.to = this.expr(a[1]);
        const action = a[2];
        if (action && action.type !== 'null_literal') {
          const inner = action.type === 'lambda_expression' ? field(action, 'body') : null;
          if (inner?.type === 'invocation_expression' && calleeName(inner) === 'enchantHook') {
            const [, cmd, frag] = args(inner);
            const ref = this.fragmentRef(frag!.text);
            node.reveal = ref.id;
            if (ref.passage !== this.passage) node.revealFrom = ref.passage;
            node.replace = cmd!.text.endsWith('Replace');
          } else {
            return [this.manual(s, 'link with unknown action')];
          }
        }
        return [{ k: 'node', node }];
      }
      case 'abort': {
        const target = argNamed(call, 'goToPassage') ?? a[0];
        return [{ k: 'node', node: { t: 'goto', to: this.expr(target!) } }];
      }
      case 'passage':
        return [{ k: 'node', node: { t: 'include', passage: this.expr(a[0]!) } }];
      case 'enchant':
      case 'enchantIntoLink':
        // Live uses are rare (the originals were hand-replaced by hook links).
        this.fragmentRef(a.at(-1)!.text);
        return [this.manual(s, `${name} (Harlowe text enchantment)`)];
    }
    return [this.manual(s, `unknown yield return ${name}`)];
  }

  private usingStmt(s: TsNode, st: Style): Item[] {
    const res = named(s)[0]!;
    const body = field(s, 'body')!;
    if (res.type !== 'invocation_expression' || calleeName(res) !== 'styleScope') {
      return [this.manual(s, 'unknown using()')];
    }
    const [kind, val] = args(res).map((a) => constString(a) ?? a.text);
    const inner = (st2: Style) => this.stmt(body, st2);
    switch (kind) {
      case 'bold': return inner({ ...st, bold: true });
      case 'italic': return inner({ ...st, italic: true });
      case 'hook': return inner(st); // the link inside references its fragment directly
    }
    const blocks: Record<string, BlockStyle> = {
      setupStyle: 'setup', setupStyleEvnt: 'setupEvent', hubTitle: 'hubTitle', hubDetails: 'hubDetails', heading: 'heading',
    };
    const style = blocks[kind!];
    if (!style) return [this.manual(s, `unknown style ${kind}=${val}`)];
    const items = inner({ ...st, block: st.block ?? style });
    const block: Item = { k: 'block', style, items };
    if (style === 'setupEvent' && this.setupNext) {
      block.next = this.setupNext;
      this.setupNext = undefined;
    }
    return [block];
  }

  private ifStmt(s: TsNode, st: Style): Item[] {
    const cond = field(s, 'condition')!;
    if (cond.text.includes('ViewPopupPanel.instance.PassageValue')) return [this.prompt(s)];

    const branches: { cond?: Expr; items: Item[] }[] = [];
    let cur: TsNode | null = s;
    while (cur) {
      if (cur.type === 'if_statement') {
        branches.push({ cond: this.expr(field(cur, 'condition')!), items: this.stmt(field(cur, 'consequence')!, st) });
        cur = field(cur, 'alternative');
      } else {
        branches.push({ items: this.stmt(cur, st) });
        cur = null;
      }
    }

    // A condition that only picks a *value* to print (e.g. a player name) becomes an
    // inline placeholder, so the surrounding sentence stays one translatable string.
    const valueOnly = branches.every((b) => b.items.length <= 1 && b.items.every((i) => i.k === 'expr'));
    if (valueOnly && branches.some((b) => b.items.length)) {
      const first = branches.find((b) => b.items.length)!.items[0] as ExprItem;
      const cases = branches.map((b) => {
        const c: { cond?: Expr; value: Expr } = { value: b.items.length ? (b.items[0] as ExprItem).expr : { lit: '' } };
        if (b.cond) c.cond = b.cond;
        return c;
      });
      if (branches.at(-1)!.cond) cases.push({ value: { lit: '' } });
      return [{ ...first, expr: { cases } }];
    }
    return [{ k: 'if', branches }];
  }

  /**
   * The hand-edited prompt pattern:
   *   if (ViewPopupPanel.instance.PassageValueNumber() >= 0) { Vars.x = …PassageValueNumber(); … }
   *   else { ViewPopupPanel.instance.OnGenerationBtn("Passage", "Question", "number", 1f); }
   */
  private prompt(s: TsNode): Item {
    let variable: string | undefined, question: string | undefined, input: 'number' | 'text' = 'number';
    walk(s, (n) => {
      if (n.type === 'assignment_expression') {
        const left = field(n, 'left')!, right = field(n, 'right')!;
        if (field(left, 'expression')?.text === 'Vars' && right.text.includes('PassageValue')) variable = field(left, 'name')!.text;
      }
      if (n.type === 'invocation_expression' && calleeName(n).endsWith('OnGenerationBtn')) {
        const a = args(n);
        question = constString(a[1]!);
        input = constString(a[2]!) === 'number' ? 'number' : 'text';
      }
    });
    if (!variable || question === undefined) return this.manual(s, 'unrecognised popup pattern');
    this.ignore('popup prompt pattern');
    return { k: 'node', node: { t: 'prompt', var: variable, input, key: this.str(question, 'instruction') } };
  }

  private exprStmt(e: TsNode, st: Style): Item[] {
    void st;
    if (e.type === 'assignment_expression') {
      const left = field(e, 'left')!, right = field(e, 'right')!;
      const op = opOf(e);
      if (field(left, 'expression')?.text === 'Vars') {
        const name = field(left, 'name')!.text;
        let value = this.expr(right);
        if (op !== '=') value = { op: op.slice(0, -1) as never, a: { var: name }, b: value };
        return [{ k: 'node', node: { t: 'set', var: name, value } }];
      }
      const target = left.text.replace(/\s+/g, '');
      if (left.type === 'identifier' && this.fields.has(target)) {
        return [{ k: 'node', node: { t: 'set', var: target, value: this.expr(right) } }];
      }
      if (target === 'ViewItemObtain.SetupPassagename') {
        this.setupNext = this.expr(right);
        return [];
      }
      if (target.startsWith('ViewPopupPanel.instance.')) {
        this.ignore(target);
        return [];
      }
      return [this.manual(e, `assignment to ${target}`)];
    }
    if (e.type === 'invocation_expression') {
      const name = calleeName(e);
      const a = args(e);
      const str = (i: number): Expr => (a[i] ? this.expr(a[i]) : { lit: null });
      switch (name) {
        case 'PassageTracker.instance.CheckProgress':
          return [{ k: 'node', node: { t: 'ui', ui: 'endOfRound', args: { progress: str(0), next: str(1) } } }];
        case 'ViewSpecialEvent.instance.ShowEventPopup':
          return [{ k: 'node', node: { t: 'ui', ui: 'specialEvent' } }];
        case 'ViewBiddingSystem.instance.OnShowBidding':
          return [{ k: 'node', node: { t: 'ui', ui: 'bidding', args: { next: str(0), mode: { lit: a[1]!.text.split('.').pop()! } } } }];
        case 'ViewGenerationEnding.instance.EnableDisableContinueBtn':
          return [{ k: 'node', node: { t: 'ui', ui: 'generationEndingContinue', args: { enabled: str(0) } } }];
        case 'ViewPopupPanel.instance.Clear':
        case 'Debug.Log':
          this.ignore(name);
          return [];
        case 'ViewEndOfGeneration.S_OnEndOfGeneration?.Invoke': {
          const text = constString(a[0]!) ?? (a[0]!.type === 'identifier' ? this.locals.get(a[0]!.text) : undefined);
          if (text === undefined) break;
          return [{ k: 'node', node: { t: 'ui', ui: 'endOfGeneration', args: { text: { lit: this.str(text, 'instruction') }, generation: str(1) } } }];
        }
        case 'ViewController.instance.ChangeView': {
          const view = a[0]!.text.split('.').pop()!;
          return [{ k: 'node', node: { t: 'ui', ui: view } }];
        }
      }
      return [this.manual(e, `call ${name}`)];
    }
    if (e.type === 'conditional_access_expression') {
      // `X?.Invoke(...)` parses as conditional access; retry as a plain call.
      const call = named(e).find((c) => c.type === 'invocation_expression');
      if (call) return this.exprStmt(call, st);
    }
    return [this.manual(e, `expression ${e.type}`)];
  }

  // -------------------------------------------------------------------------

  /** Turns items into nodes: consecutive inline pieces become one text node. */
  private group(items: Item[], isMain: boolean, inBlock?: BlockStyle): Node[] {
    const nodes: Node[] = [];
    let run: (TextItem | ExprItem)[] = [];
    const flush = () => {
      if (!run.length) return;
      const node = this.textNode(run, isMain && !nodes.some((n) => n.t === 'text'), inBlock);
      if (node) nodes.push(node);
      run = [];
    };
    for (const it of items) {
      switch (it.k) {
        case 'text':
        case 'expr':
          run.push(it);
          break;
        case 'node':
          flush();
          nodes.push(it.node);
          break;
        case 'block':
          flush();
          nodes.push({ t: 'block', style: it.style, body: this.group(it.items, false, inBlock ?? it.style), ...(it.next ? { next: it.next } : {}) });
          break;
        case 'if':
          flush();
          nodes.push({
            t: 'if',
            branches: it.branches.map((b) => {
              const br: { cond?: Expr; body: Node[] } = { body: this.group(b.items, false, inBlock) };
              if (b.cond) br.cond = b.cond;
              return br;
            }),
          });
          break;
      }
    }
    flush();
    return nodes;
  }

  private textNode(run: (TextItem | ExprItem)[], first: boolean, inBlock?: BlockStyle): Node | undefined {
    let out = '', bold = false, italic = false, plain = '';
    const args: Expr[] = [];
    for (const piece of run) {
      if (piece.k === 'text' && piece.text === '') continue;
      // Close/open markers only when the style changes; whitespace stays outside markers.
      if (bold !== piece.bold) { out += '**'; bold = piece.bold; }
      if (italic !== piece.italic) { out += '*'; italic = piece.italic; }
      if (piece.k === 'text') {
        out += piece.text
          .split(/(<sprite="[^"]+"[^>]*>)/)
          .map((part) => {
            const m = /^<sprite="([^"]+)"/.exec(part);
            return m ? `{icon:${m[1]}}` : escapeMarkup(part);
          })
          .join('');
        plain += piece.text;
      } else {
        out += `{${args.length}}`;
        args.push(piece.expr);
      }
    }
    if (italic) out += '*';
    if (bold) out += '**';
    out = out.replace(/\*\*\*\*/g, '').replace(/(?<!\*)\*\*(?!\*)(\s*)\*\*(?!\*)/g, '$1');
    if (!out.trim()) return undefined;

    const allBold = run.every((p) => p.bold || (p.k === 'text' && !p.text.trim()));
    const kind: TextKind =
      first && allBold ? 'title'
      : inBlock === 'setup' || inBlock === 'setupEvent' || inBlock === 'hubTitle' ? 'instruction'
      : looksLikeInstruction(plain, out) ? 'instruction'
      : 'narrative';
    const node: Node = { t: 'text', key: this.str(out, kind, true), kind };
    if (args.length) node.args = args;
    return node;
  }

  private str(text: string, kind: TextKind, isMarkup = false): string {
    const key = `${this.passage}.${++this.counter}`;
    this.strings[key] = { full: isMarkup ? text : escapeMarkup(text) };
    this.report.kinds[kind]++;
    return key;
  }

  /** Resolves `passageN_Fragment_K` to its owning passage – hand edits reuse other passages' fragments. */
  private fragmentRef(methodName: string): { passage: string; id: string } {
    const m = /^passage(\w+?)_Fragment_(\d+)$/.exec(methodName);
    const passage = (m && this.passageByNumber.get(normNum(m[1]!))) ?? this.passage;
    const id = m?.[2] ?? methodName;
    this.usedFragments.add(`${passage}#${id}`);
    return { passage, id };
  }

  private manual(n: TsNode, reason: string): Item {
    const line = n.startPosition.row + 1;
    this.report.manual.push({ passage: this.passage, line, reason, code: n.text.slice(0, 200) });
    return { k: 'node', node: { t: 'manual', reason, code: n.text, source: { file: this.file, line } } };
  }

  private ignore(what: string): void {
    this.report.ignored[what] = (this.report.ignored[what] ?? 0) + 1;
  }
}

interface Style { bold: boolean; italic: boolean; block: BlockStyle | undefined }
interface TextItem extends Style { k: 'text'; text: string }
interface ExprItem extends Style { k: 'expr'; expr: Expr }
type Item =
  | TextItem
  | ExprItem
  | { k: 'node'; node: Node }
  | { k: 'block'; style: BlockStyle; items: Item[]; next?: Expr }
  | { k: 'if'; branches: { cond?: Expr; items: Item[] }[] };

/** Hand edits mix `passage4_Main` with `passage04_Fragment_0`. */
function normNum(n: string): string {
  return /^\d+$/.test(n) ? String(Number(n)) : n;
}

/** Heuristic: game instructions mention components, points, money or player actions. */
function looksLikeInstruction(plain: string, markup: string): boolean {
  if (markup.includes('{icon:')) return true;
  return /\b\d+\s?VP\b|\$\d|\bVP\b|\b(gain|gains|lose|loses|place|places|draw|draws|discard|discards|pay|pays|take|takes|return|returns|token|tokens|card|cards|marker|board|supply|Estate|Village Chronicle|Storybook|turn to|round|player|players)\b/i.test(plain);
}

// ---------------------------------------------------------------------------
// Variables: Cradle fields + Unity defaults (MainData field types)
// ---------------------------------------------------------------------------

function variables(cls: TsNode, mainDataSrc: TsNode): Record<string, Value> {
  const mainTypes = new Map<string, string>();
  walk(mainDataSrc, (n) => {
    if (n.type === 'class_declaration' && field(n, 'name')?.text === 'MainData') {
      walk(n, (f) => {
        if (f.type !== 'field_declaration') return;
        const decl = named(f).find((c) => c.type === 'variable_declaration')!;
        const type = field(decl, 'type')!.text;
        for (const d of named(decl).filter((c) => c.type === 'variable_declarator')) mainTypes.set(field(d, 'name')!.text, type);
      });
    }
  });

  const vars: Record<string, Value> = {};
  walk(cls, (n) => {
    if (n.type === 'class_declaration' && field(n, 'name')?.text === 'VarDefs') {
      walk(n, (f) => {
        if (f.type !== 'field_declaration') return;
        const decl = named(f).find((c) => c.type === 'variable_declaration')!;
        for (const d of named(decl).filter((c) => c.type === 'variable_declarator')) {
          const name = field(d, 'name')!.text.replace(/^@/, '');
          const init = named(d).find((c) => c !== field(d, 'name'));
          vars[name] = init && /literal/.test(init.type) ? (JSON.parse(init.type === 'string_literal' ? init.text : init.text) as Value) : null;
        }
      });
    }
  });

  // LoadData(): Vars.x = mainData.y – Unity serialises strings as "" and numbers as 0.
  walk(cls, (n) => {
    if (n.type !== 'method_declaration' || field(n, 'name')?.text !== 'LoadData') return;
    walk(n, (a) => {
      if (a.type !== 'assignment_expression') return;
      const left = field(a, 'left')!, right = field(a, 'right')!;
      if (field(left, 'expression')?.text !== 'Vars' || field(right, 'expression')?.text !== 'mainData') return;
      const type = mainTypes.get(field(right, 'name')!.text);
      const name = field(left, 'name')!.text;
      if (type === 'string') vars[name] = '';
      else if (type === 'int' || type === 'float' || type === 'double') vars[name] = 0;
      else if (type === 'bool') vars[name] = false;
    });
  });
  return vars;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [storyPath, mainDataPath, outDir, id = 'scenario'] = process.argv.slice(2);
  if (!storyPath || !mainDataPath || !outDir) {
    console.error('Usage: convert.ts <Story.cs> <MainData.cs> <outDir> [scenarioId]');
    process.exit(2);
  }
  const p = await parser();
  const tree = p.parse(readFileSync(storyPath, 'utf8'))!;
  const mainData = p.parse(readFileSync(mainDataPath, 'utf8'))!;

  let cls: TsNode | undefined;
  walk(tree.rootNode, (n) => {
    if (!cls && n.type === 'class_declaration' && named(field(n, 'body')!).some((m) => /^passage\d+_Init$/.test(field(m, 'name')?.text ?? ''))) cls = n;
  });
  if (!cls) throw new Error('No Cradle story class found');

  const methods = new Map<string, TsNode>();
  let start = '';
  for (const m of named(field(cls, 'body')!)) {
    if (m.type === 'method_declaration') methods.set(field(m, 'name')!.text, m);
    if (m.type === 'constructor_declaration') {
      walk(m, (a) => {
        if (a.type === 'assignment_expression' && field(a, 'left')!.text.endsWith('StartPassage')) start = constString(field(a, 'right')!) ?? '';
      });
    }
  }

  const conv = new Converter(basename(storyPath));
  const fieldInit: Record<string, Value> = {};
  for (const f of named(field(cls, 'body')!).filter((m) => m.type === 'field_declaration')) {
    const decl = named(f).find((c) => c.type === 'variable_declaration')!;
    const type = field(decl, 'type')!.text;
    if (type !== 'bool' && type !== 'string' && type !== 'int') continue;
    for (const d of named(decl).filter((c) => c.type === 'variable_declarator')) {
      const name = field(d, 'name')!.text;
      const init = named(d).at(-1)!;
      conv.fields.add(name);
      fieldInit[name] = init !== field(d, 'name') && /literal/.test(init.type) ? (conv.expr(init) as { lit: Value }).lit : type === 'bool' ? false : type === 'int' ? 0 : '';
    }
  }
  const passages: Record<string, Passage> = {};
  const inits: { num: string; name: string; tags: string[] }[] = [];
  for (const [name, m] of methods) {
    const num = /^passage(\w+?)_Init$/.exec(name)?.[1];
    if (!num) continue;
    let pName = '', tags: string[] = [];
    walk(m, (n) => {
      if (n.type === 'object_creation_expression' && field(n, 'type')?.text === 'StoryPassage') {
        const a = args(n);
        pName = constString(a[0]!)!;
        tags = a[1] ? named(a[1]).flatMap((c) => (c.type === 'initializer_expression' ? named(c).map((s) => constString(s)!) : [])) : [];
      }
    });
    inits.push({ num, name: pName, tags });
    conv.passageByNumber.set(normNum(num), pName);
  }
  for (const { num, name: pName, tags } of inits) {
    const fragments = new Map<string, TsNode>();
    for (const [fname, fm] of methods) {
      const fm2 = /^passage(\w+?)_Fragment_(\d+)$/.exec(fname);
      if (fm2 && normNum(fm2[1]!) === normNum(num)) fragments.set(fm2[2]!, fm);
    }
    passages[pName] = conv.convertPassage(pName, tags, methods.get(`passage${num}_Main`)!, fragments);
  }

  // Drop fragments nothing links to (left over from hand edits); a fragment can only be
  // reached from its own passage, so iterate until no more are removed.
  for (const p of Object.values(passages)) {
    for (const id of Object.keys(p.fragments)) {
      if (!conv.usedFragments.has(`${p.name}#${id}`)) {
        delete p.fragments[id];
        conv.report.deadFragments.push(`${p.name}#${id}`);
      }
    }
  }

  // Manual nodes that survived dead-fragment removal.
  conv.report.manual = [];
  const collect = (nodes: Node[], from: string) => {
    for (const n of nodes) {
      if (n.t === 'manual') conv.report.manual.push({ passage: from, line: n.source?.line ?? 0, reason: n.reason, code: n.code.slice(0, 200) });
      if (n.t === 'block') collect(n.body, from);
      if (n.t === 'if') n.branches.forEach((b) => collect(b.body, from));
    }
  };
  for (const p of Object.values(passages)) {
    collect(p.body, p.name);
    Object.values(p.fragments).forEach((f) => collect(f, p.name));
  }

  // Static link/goto targets that don't exist.
  const visit = (nodes: Node[], from: string) => {
    for (const n of nodes) {
      const target = n.t === 'link' || n.t === 'goto' ? n.to : n.t === 'include' ? n.passage : undefined;
      if (target && 'lit' in target && !passages[String(target.lit)]) conv.report.brokenTargets.push({ passage: from, target: String(target.lit) });
      if (n.t === 'block' && n.next && 'lit' in n.next && !passages[String(n.next.lit)]) conv.report.brokenTargets.push({ passage: from, target: String(n.next.lit) });
      if (n.t === 'block') visit(n.body, from);
      if (n.t === 'if') n.branches.forEach((b) => visit(b.body, from));
    }
  };
  for (const p of Object.values(passages)) {
    visit(p.body, p.name);
    Object.values(p.fragments).forEach((f) => visit(f, p.name));
  }

  conv.strings[SETUP_CONTINUE_KEY] = { full: 'Continue' };
  const scenario: Scenario = { format: FORMAT_VERSION, id, start, variables: { ...variables(cls, mainData.rootNode), ...fieldInit }, passages };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(scenario, null, 1));
  writeFileSync(join(outDir, `${id}.strings.json`), JSON.stringify(conv.strings, null, 1));
  writeFileSync(join(outDir, `${id}.report.json`), JSON.stringify(conv.report, null, 1));

  const r = conv.report;
  const reasons: Record<string, number> = {};
  for (const m of r.manual) reasons[m.reason.replace(/(call|assignment to|unknown style) .*/, '$1 …')] = (reasons[m.reason.replace(/(call|assignment to|unknown style) .*/, '$1 …')] ?? 0) + 1;
  const words = Object.values(conv.strings).reduce((n, s) => n + s.full.split(/\s+/).length, 0);
  console.log(`${id}: ${Object.keys(passages).length} passages, start "${start}", ${Object.keys(scenario.variables).length} variables`);
  console.log(`strings: ${Object.keys(conv.strings).length} (${new Set(Object.values(conv.strings).map((s) => s.full)).size} unique), ~${words} words`);
  console.log(`text kinds:`, r.kinds);
  console.log(`manual nodes: ${r.manual.length}`, reasons);
  console.log(`unknown expressions: ${r.unknownExprs.length}`);
  console.log(`dead fragments dropped: ${r.deadFragments.length}`);
  console.log(`broken static targets: ${r.brokenTargets.length}`);
  console.log(`ignored (UI plumbing):`, r.ignored);
}

await main();
