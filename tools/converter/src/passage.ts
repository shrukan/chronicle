/**
 * Converts the methods of one Cradle passage (main body + fragments) into story nodes,
 * collecting all text into the string table.
 */
import {
  escapeMarkup,
  type BlockStyle,
  type Expr,
  type FnName,
  type Node,
  type Passage,
  type StringTable,
  type TextKind,
  type Value,
} from '@chronicle/engine';
import { argNamed, args, calleeName, concatParts, constString, decodeString, field, named, opOf, varName, walk, type TsNode } from './csharp.ts';

/** Cradle's "unset"; only exists until `normalize()` gives every variable a type. */
export const NULL = null as unknown as Value;

export interface ConvertIssue {
  passage: string;
  line: number;
  reason: string;
  code: string;
}

export interface PassageConverterOptions {
  file: string;
  /** Private fields of the story class used as extra state (e.g. `ispopup`). */
  fields: Set<string>;
  /** Generated method number ("28", "04") → passage name. */
  passageByNumber: Map<string, string>;
  /** App screens opened via `ViewController.ChangeView` and the passage they continue with. */
  screens: Record<string, { next?: string }>;
}

const FNS: Record<string, FnName> = {
  either: 'either', random: 'random', num: 'num', a: 'array', shuffled: 'shuffled', max: 'max', min: 'min',
};

/** Story-wide globals of the original app that mirror story variables. */
const GLOBALS: Record<string, string> = { townName: 'townname', playerCount: 'players' };

const BLOCK_STYLES: Record<string, BlockStyle> = {
  setupStyle: 'setup', setupStyleEvnt: 'setupEvent', hubTitle: 'hubTitle', hubDetails: 'hubDetails', heading: 'heading',
};

interface Style { bold: boolean; italic: boolean; block: BlockStyle | undefined }
interface TextItem extends Style { k: 'text'; text: string }
interface ExprItem extends Style { k: 'expr'; expr: Expr }
type Item =
  | TextItem
  | ExprItem
  | { k: 'node'; node: Node }
  | { k: 'block'; style: BlockStyle; items: Item[]; next?: Expr }
  | { k: 'if'; branches: { cond?: Expr; items: Item[] }[] };

const PLAIN: Style = { bold: false, italic: false, block: undefined };

export class PassageConverter {
  readonly strings: StringTable = {};
  readonly kinds = new Map<string, TextKind>();
  readonly unknownExprs: ConvertIssue[] = [];
  readonly ignored: Record<string, number> = {};
  /** "Passage#id" of every fragment referenced from live code. */
  readonly usedFragments = new Set<string>();

  private readonly opts: PassageConverterOptions;
  private passage = '';
  private counter = 0;
  private setupNext: Expr | undefined;
  private locals = new Map<string, Expr>();

  constructor(opts: PassageConverterOptions) {
    this.opts = opts;
  }

  convert(name: string, tags: string[], main: TsNode, fragments: Map<string, TsNode>): Passage {
    this.passage = name;
    this.counter = 0;
    const p: Passage = {
      name,
      tags,
      body: this.body(main, true),
      fragments: {},
      source: { file: this.opts.file, line: main.startPosition.row + 1 },
    };
    for (const [id, f] of fragments) p.fragments[id] = this.body(f, false);
    return p;
  }

  // -------------------------------------------------------------------------
  // Expressions
  // -------------------------------------------------------------------------

  expr(n: TsNode): Expr {
    switch (n.type) {
      case 'integer_literal':
      case 'real_literal':
        return { lit: Number(n.text.replace(/[fFdDmM]$/, '')) };
      case 'boolean_literal':
        return { lit: n.text === 'true' };
      case 'null_literal':
        return { lit: NULL };
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
        if (this.locals.has(n.text)) return this.locals.get(n.text)!;
        if (this.opts.fields.has(n.text)) return { var: n.text };
        break;
      case 'member_access_expression': {
        const v = varName(n);
        if (v) return { var: v };
        if (field(n, 'expression')?.text === 'GLOBALS') {
          const g = field(n, 'name')!.text;
          return { var: GLOBALS[g] ?? g };
        }
        break;
      }
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
      // `new List<int>(new int[] { a, b })` and `new int[] { a, b }` → array
      case 'object_creation_expression':
        if (/^List</.test(field(n, 'type')?.text ?? '') && args(n).length === 1) return this.expr(args(n)[0]!);
        break;
      case 'array_creation_expression':
      case 'implicit_array_creation_expression': {
        const init = named(n).find((c) => c.type === 'initializer_expression');
        if (init) return { fn: 'array', args: named(init).map((c) => this.expr(c)) };
        break;
      }
      case 'invocation_expression':
        return this.call(n);
    }
    return this.unknown(n);
  }

  private call(n: TsNode): Expr {
    const name = calleeName(n);
    const a = args(n);
    const m = /^macros\d*\.(\w+)$/.exec(name);
    const fn = m && FNS[m[1]!];
    if (fn) return { fn, args: a.map((x) => this.expr(x)) };
    if (name.endsWith('.ToString') && a.length === 0) return { fn: 'str', args: [this.expr(field(field(n, 'function')!, 'expression')!)] };
    if (name === 'int.Parse' || name === 'float.Parse') return { fn: 'num', args: [this.expr(a[0]!)] };
    if (name === 'Mathf.Max' || name === 'Math.Max') return { fn: 'max', args: a.map((x) => this.expr(x)) };
    if (name === 'String.IsNullOrEmpty' || name === 'string.IsNullOrEmpty') {
      const v = this.expr(a[0]!);
      return { op: '||', a: { op: '==', a: v, b: { lit: NULL } }, b: { op: '==', a: v, b: { lit: '' } } };
    }
    // `list.Where(v => v == list.Max()).Count()` – how many entries share the maximum.
    const count = /^(\w+)\.Where\(\s*(\w+)\s*=>\s*\2\s*==\s*\1\.Max\(\)\s*\)\.Count\(\)$/.exec(n.text.replace(/\s+/g, ' ').replace(/ ?([().=>]) ?/g, '$1'));
    if (count && this.locals.has(count[1]!)) {
      const list = this.locals.get(count[1]!)!;
      return { fn: 'count', args: [list, { fn: 'max', args: [list] }] };
    }
    return this.unknown(n);
  }

  private unknown(n: TsNode): Expr {
    this.unknownExprs.push({ passage: this.passage, line: n.startPosition.row + 1, reason: 'unknown expression', code: n.text });
    return { unknown: n.text };
  }

  // -------------------------------------------------------------------------
  // Statements → items (inline pieces and nodes), then grouped into text runs
  // -------------------------------------------------------------------------

  private body(method: TsNode, isMain: boolean): Node[] {
    this.locals = new Map();
    this.setupNext = undefined;
    const stmts = named(field(method, 'body')!);
    const prompt = this.findPrompt(method);
    const items: Item[] = [];
    let promptPlaced = false;

    stmts.forEach((s, i) => {
      // A trailing `yield break;` just ends the method.
      if (s.type === 'yield_statement' && s.text === 'yield break;' && i === stmts.length - 1) return;
      if (prompt && s.text.includes('ViewPopupPanel.instance')) {
        // The whole hand-written pop-up dance becomes one prompt; anything else those
        // statements do (e.g. jump on afterwards) runs once the players answered.
        if (!promptPlaced) items.push(prompt);
        promptPlaced = true;
        for (const r of this.popupResiduals(s)) items.push(...this.stmt(r, PLAIN));
        this.ignore('pop-up plumbing');
        return;
      }
      items.push(...this.stmt(s, PLAIN));
    });
    return this.group(items, isMain);
  }

  /**
   * Finds the pop-up prompt in a method. Two hand-written patterns exist, e.g.:
   *   if (ViewPopupPanel.instance.PassageValueNumber() >= 0) { Vars.x = …PassageValueNumber(); }
   *   else { ViewPopupPanel.instance.OnGenerationBtn("Passage", "Question", "number", 1f); }
   * and a flag-guarded variant (`if (ispopup && …) { …OnGenerationBtn(…) }`).
   */
  private findPrompt(method: TsNode): Item | undefined {
    let call: TsNode | undefined, variable: string | undefined;
    walk(method, (n) => {
      if (n.type === 'invocation_expression' && calleeName(n).endsWith('ViewPopupPanel.instance.OnGenerationBtn')) call ??= n;
      if (n.type === 'assignment_expression' && field(n, 'right')!.text.includes('ViewPopupPanel.instance.PassageValue')) {
        variable ??= varName(field(n, 'left'));
      }
    });
    if (!call) return undefined;
    const [, question, type] = args(call);
    if (!variable || !question) return this.manual(call, 'pop-up prompt without a target variable');

    const parts = concatParts(question);
    let text = '';
    const promptArgs: Expr[] = [];
    for (const p of parts) {
      if (typeof p === 'string') text += toMarkup(p);
      else {
        text += `{${promptArgs.length}}`;
        promptArgs.push(this.expr(p));
      }
    }
    const node: Node = { t: 'prompt', var: variable, input: constString(type!) === 'number' ? 'number' : 'text', key: this.str(text, 'instruction', true) };
    if (promptArgs.length) node.args = promptArgs;
    return { k: 'node', node };
  }

  /** Statements inside pop-up code that are not pop-up plumbing. */
  private popupResiduals(s: TsNode): TsNode[] {
    if (s.type === 'if_statement') {
      return [field(s, 'consequence'), field(s, 'alternative')].flatMap((c) => (c ? this.popupResiduals(c) : []));
    }
    if (s.type === 'block' || s.type === 'else_clause') return named(s).flatMap((c) => this.popupResiduals(c));
    if (s.type === 'expression_statement') {
      const e = named(s)[0]!;
      if (e.type === 'invocation_expression' && /^(ViewPopupPanel\.|Debug\.Log)/.test(calleeName(e))) return [];
      if (e.type === 'assignment_expression') {
        const left = field(e, 'left')!, right = field(e, 'right')!;
        if (right.text.includes('ViewPopupPanel.instance.PassageValue')) return [];
        if (left.text.startsWith('ViewPopupPanel.')) return [];
        if (left.type === 'identifier' && this.opts.fields.has(left.text)) return [];
      }
    }
    return [s];
  }

  private stmts(list: TsNode[], st: Style): Item[] {
    return list.flatMap((s) => this.stmt(s, st));
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
        return this.exprStmt(named(s)[0]!);
      case 'empty_statement':
        return [];
      case 'local_declaration_statement':
        return this.local(s);
    }
    return [this.manual(s, `unsupported statement: ${s.type}`)];
  }

  /** Locals are inlined where used, so they must be free of random choices. */
  private local(s: TsNode): Item[] {
    const decl = named(s)[0]!;
    for (const d of named(decl).filter((c) => c.type === 'variable_declarator')) {
      const name = field(d, 'name')!.text;
      const init = named(d).at(-1)!;
      const before = this.unknownExprs.length;
      const e = this.expr(init);
      if (this.unknownExprs.length > before || /"fn":"(either|random|shuffled)"/.test(JSON.stringify(e))) {
        return [this.manual(s, 'local variable that cannot be inlined')];
      }
      this.locals.set(name, e);
    }
    return [];
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
        const node: Node = { t: 'link', key: this.str(label === undefined ? '{0}' : toMarkup(label), 'instruction', true) };
        if (label === undefined) node.args = [this.expr(a[0]!)];
        if (a[1] && a[1].type !== 'null_literal') node.to = this.expr(a[1]);
        const action = a[2];
        if (action && action.type !== 'null_literal') {
          const inner = action.type === 'lambda_expression' ? field(action, 'body') : null;
          if (inner?.type !== 'invocation_expression' || calleeName(inner) !== 'enchantHook') return [this.manual(s, 'link with unknown action')];
          const [, cmd, frag] = args(inner);
          const ref = this.fragmentRef(frag!.text);
          node.reveal = ref.id;
          if (ref.passage !== this.passage) node.revealFrom = ref.passage;
          node.replace = cmd!.text.endsWith('Replace');
        }
        return [{ k: 'node', node }];
      }
      case 'abort':
        return [{ k: 'node', node: { t: 'goto', to: this.expr((argNamed(call, 'goToPassage') ?? a[0])!) } }];
      case 'passage':
        return [{ k: 'node', node: { t: 'include', passage: this.expr(a[0]!) } }];
      case 'enchant':
      case 'enchantIntoLink':
        // Leftovers: the originals were replaced by hook links in hand edits.
        this.fragmentRef(a.at(-1)!.text);
        return [this.manual(s, `${name} (Harlowe text enchantment)`)];
    }
    return [this.manual(s, `unknown yield return ${name}`)];
  }

  private usingStmt(s: TsNode, st: Style): Item[] {
    const res = named(s)[0]!;
    const body = field(s, 'body')!;
    if (res.type !== 'invocation_expression' || calleeName(res) !== 'styleScope') return [this.manual(s, 'unknown using()')];
    const [kind, val] = args(res).map((a) => constString(a) ?? a.text);
    switch (kind) {
      case 'bold': return this.stmt(body, { ...st, bold: true });
      case 'italic': return this.stmt(body, { ...st, italic: true });
      case 'hook': return this.stmt(body, st); // the link inside references its fragment directly
    }
    const style = BLOCK_STYLES[kind!];
    if (!style) return [this.manual(s, `unknown style ${kind}=${val}`)];
    const block: Item = { k: 'block', style, items: this.stmt(body, { ...st, block: st.block ?? style }) };
    // The pop-up's continue target belongs to the outermost setup block (some are nested).
    if (style === 'setupEvent' && this.setupNext && !st.block) {
      block.next = this.setupNext;
      this.setupNext = undefined;
    }
    return [block];
  }

  private ifStmt(s: TsNode, st: Style): Item[] {
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
      const cases = branches.map((b) => ({
        ...(b.cond ? { cond: b.cond } : {}),
        value: b.items.length ? (b.items[0] as ExprItem).expr : { lit: '' },
      }));
      if (branches.at(-1)!.cond) cases.push({ value: { lit: '' } });
      return [{ ...first, expr: { cases } }];
    }
    return [{ k: 'if', branches }];
  }

  private exprStmt(e: TsNode): Item[] {
    if (e.type === 'assignment_expression') return this.assignment(e);
    if (e.type === 'invocation_expression') return this.callStmt(e);
    return [this.manual(e, `expression ${e.type}`)];
  }

  private assignment(e: TsNode): Item[] {
    const left = field(e, 'left')!, right = field(e, 'right')!;
    const op = opOf(e);
    const v = varName(left) ?? (left.type === 'identifier' && this.opts.fields.has(left.text) ? left.text : undefined);
    if (v) {
      let value = this.expr(right);
      if (op !== '=') value = { op: op.slice(0, -1) as never, a: { var: v }, b: value };
      return [{ k: 'node', node: { t: 'set', var: v, value } }];
    }
    const target = left.text.replace(/\s+/g, '');
    if (target === 'ViewItemObtain.SetupPassagename') {
      this.setupNext = this.expr(right);
      return [];
    }
    return [this.manual(e, `assignment to ${target}`)];
  }

  private callStmt(e: TsNode): Item[] {
    const name = calleeName(e);
    const a = args(e);
    const arg = (i: number): Expr => (a[i] ? this.expr(a[i]) : { lit: NULL });
    const ui = (screen: string, uiArgs?: Record<string, Expr>): Item[] => [{ k: 'node', node: { t: 'ui', ui: screen, ...(uiArgs ? { args: uiArgs } : {}) } }];
    switch (name) {
      case 'PassageTracker.instance.CheckProgress':
        return ui('endOfRound', { progress: arg(0), next: arg(1) });
      case 'ViewSpecialEvent.instance.ShowEventPopup':
        return ui('specialEvent');
      case 'ViewBiddingSystem.instance.OnShowBidding':
        return ui('bidding', { next: arg(0), mode: { lit: a[1]!.text.split('.').pop()! } });
      case 'ViewGenerationEnding.instance.EnableDisableContinueBtn':
        return ui('generationEndingContinue', { enabled: arg(0) });
      case 'ViewEndOfGeneration.S_OnEndOfGeneration?.Invoke': {
        const text = this.expr(a[0]!);
        if (!('lit' in text) || typeof text.lit !== 'string') break;
        return ui('endOfGeneration', { text: { lit: this.str(toMarkup(text.lit), 'instruction', true) }, generation: arg(1) });
      }
      case 'ViewController.instance.ChangeView': {
        const screen = a[0]!.text.split('.').pop()!;
        const next = this.opts.screens[screen]?.next;
        return ui(screen, next ? { next: { lit: next } } : undefined);
      }
      case 'Debug.Log':
        this.ignore(name);
        return [];
    }
    return [this.manual(e, `call ${name}`)];
  }

  // -------------------------------------------------------------------------
  // Grouping and text
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
            branches: it.branches.map((b) => ({ ...(b.cond ? { cond: b.cond } : {}), body: this.group(b.items, false, inBlock) })),
          });
          break;
      }
    }
    flush();
    return nodes;
  }

  private textNode(run: (TextItem | ExprItem)[], first: boolean, inBlock?: BlockStyle): Node | undefined {
    let out = '', bold = false, italic = false, plain = '';
    const textArgs: Expr[] = [];
    for (const piece of run) {
      if (piece.k === 'text' && piece.text === '') continue;
      // Markers only where the style changes.
      if (bold !== piece.bold) { out += '**'; bold = piece.bold; }
      if (italic !== piece.italic) { out += '*'; italic = piece.italic; }
      if (piece.k === 'text') {
        out += toMarkup(piece.text);
        plain += piece.text;
      } else {
        out += `{${textArgs.length}}`;
        textArgs.push(piece.expr);
      }
    }
    if (italic) out += '*';
    if (bold) out += '**';
    out = out.replace(/\*\*\*\*/g, '').replace(/(?<!\*)\*\*(?!\*)(\s*)\*\*(?!\*)/g, '$1');
    if (!out.trim()) return undefined;

    const allBold = run.every((p) => p.bold || (p.k === 'text' && !p.text.trim()));
    // App commands first: they often open a passage in bold, which would look like a title.
    const kind: TextKind =
      isAppCommand(plain) ? 'command'
      : first && allBold ? 'title'
      : inBlock === 'setup' || inBlock === 'setupEvent' || inBlock === 'hubTitle' ? 'instruction'
      : isNarrative(plain, out) ? 'narrative'
      : 'instruction';
    const node: Node = { t: 'text', key: this.str(out, kind, true), kind };
    if (textArgs.length) node.args = textArgs;
    return node;
  }

  private str(text: string, kind: TextKind, isMarkup = false): string {
    const key = `${this.passage}.${++this.counter}`;
    this.strings[key] = { full: isMarkup ? text : escapeMarkup(text) };
    this.kinds.set(key, kind);
    return key;
  }

  /** Resolves `passageN_Fragment_K` to its owning passage – hand edits reuse other passages' fragments. */
  private fragmentRef(methodName: string): { passage: string; id: string } {
    const m = /^passage(\w+?)_Fragment_(\d+)$/.exec(methodName);
    const passage = (m && this.opts.passageByNumber.get(normNum(m[1]!))) ?? this.passage;
    const id = m?.[2] ?? methodName;
    this.usedFragments.add(`${passage}#${id}`);
    return { passage, id };
  }

  private manual(n: TsNode, reason: string): Item {
    const line = n.startPosition.row + 1;
    return { k: 'node', node: { t: 'manual', reason, code: n.text, source: { file: this.opts.file, line } } };
  }

  private ignore(what: string): void {
    this.ignored[what] = (this.ignored[what] ?? 0) + 1;
  }
}

/**
 * Original text → string-table markup. The original uses TextMeshPro rich-text tags:
 * bold/italic become markup, sprites become icons, layout tags (size, align, line-height)
 * are dropped – layout is the app's job.
 */
export function toMarkup(text: string): string {
  return text
    .split(/(<\/?[a-zA-Z-]+(?:=[^>]*)?(?:\s[^>]*)?>)/)
    .map((part) => {
      const sprite = /^<sprite="([^"]+)"/.exec(part);
      if (sprite) return `{icon:${sprite[1]}}`;
      if (/^<\/?b>$/.test(part)) return '**';
      if (/^<\/?i>$/.test(part)) return '*';
      if (/^<\/?(size|align|line-height|color|font)(=[^>]*)?>$/.test(part)) return '';
      return escapeMarkup(part);
    })
    .join('');
}

/** Hand edits mix `passage4_Main` with `passage04_Fragment_0`. */
export function normNum(n: string): string {
  return /^\d+$/.test(n) ? String(Number(n)) : n;
}

const GAME_TERMS =
  /\b\d+\s?VP\b|\$\d|\bVP\b|\b(gain|gains|lose|loses|place|places|draw|draws|discard|discards|pay|pays|take|takes|return|returns|token|tokens|card|cards|marker|board|supply|Estate|Village Chronicle|Storybook|turn to|round|player|players|cost|costs|score|scores)\b/gi;

/** Rule text usually starts with an action or addresses the players. */
const IMPERATIVE =
  /^(\W*)(gain|lose|place|take|discard|pay|draw|return|move|add|remove|retrieve|give|choose|shuffle|turn to|perform|flip|put|count|reveal|collect|keep|look through|look at|search|find|roll|read|resolve|spend|donate|vote|bid|select|decide|check|score|record|write|tally|each player|all players|the player|any player|if a player|if any player|if there is|players|then,? (place|take|gain|lose|return|give|move|add|remove|each)|note:?|setup|reward:?|cost:?)\b/i;

/**
 * Rule text that reads like prose: vote explanations, conditions, what to place or visit. Found
 * while writing the Easy and Short texts; these must never be rewritten.
 */
const RULE = [
  /^\W*(a |an )?\W*(yay|nay)\b[^.]*\bvote\b/i,
  /^\W*(however,\s*)?if the (value|total)\b/i,
  /^\W*at the end of the\b[^.]{0,20}\b(round|generation)\b/i,
  /^\W*if you have joined a faction\b/i,
  /^\W*(accepting|rejecting) electricity\b/i,
  /^\W*(encouraging|not encouraging) the frenzy\b/i,
  /\bwhen a player visits\b/i,
  /\bplace the\b[^.]*\btile\b/i,
  /\byou may visit the same building\b/i,
  /\bexperiment card can be completed\b/i,
  /\bcan now take actions\b/i,
  /\bplease click on the name\b/i,
  /\bsymposium in the field of\b/i,
  /\bMUST\b/,
];

/** Instructions about the app rather than the board game: who holds the storybook, what others may see. */
const APP_COMMAND = [
  /\b(storybook device|see the screen)\b/i,
  /\b(hand|pass|give|bring)\b[^.]{0,40}\bstorybook\b(?!\s+(token|icon|track|space))/i,
  /\b(pick up|take|hold)\b[^.]{0,20}\bstorybook\b(?!\s+(token|icon|track|space))/i,
  /\bdo not (allow|let)\b[^.]{0,60}\b(see|look|read)\b/i,
  /\bclick here (to reveal|for a storybook message)\b/i,
];

export function isAppCommand(plain: string): boolean {
  return APP_COMMAND.some((r) => r.test(plain));
}

/**
 * Narrative = flavour text, the part the Easy and Short reading modes may rewrite. Rule text
 * starts with an action, contains icons, points, money or several numbers, or is dense with
 * game terms; long prose that mentions a player or a round now and then stays narrative.
 */
export function isNarrative(plain: string, markup: string): boolean {
  if (markup.includes('{icon:') || /\b\d+\s?VP\b|\$\d/.test(plain)) return false;
  // Several numbers: a cost list, a track position, a count – game material.
  if ((plain.replace(/\{\d+\}/g, ' ').match(/\b\d{1,2}\b/g) ?? []).length >= 2) return false;
  const words = plain.trim().split(/\s+/).length;
  if (words < 8 || IMPERATIVE.test(plain.trim()) || RULE.some((r) => r.test(plain))) return false;
  const hits = (plain.match(GAME_TERMS) ?? []).length;
  return hits === 0 || (words >= 20 && hits / words < 0.05);
}
