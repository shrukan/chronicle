/**
 * Chronicle story data format.
 *
 * A scenario is pure data: passages contain a tree of nodes (logic + references to
 * translatable text), and all human-readable text lives in per-language string tables.
 * The same data drives the app, the story tester and any exporter.
 */

export const FORMAT_VERSION = 1;

/** Story values are strictly typed; a variable keeps the type of its initial value. */
export type Value = string | number | boolean | Value[];

export interface Scenario {
  format: typeof FORMAT_VERSION;
  id: string;
  /** Passage the story starts in. */
  start: string;
  /** Initial value of every story variable; it also fixes the variable's type. */
  variables: Record<string, Value>;
  passages: Record<string, Passage>;
}

export interface Passage {
  name: string;
  /** Tags from the original, plus `ending` for passages that end the story. */
  tags: string[];
  body: Node[];
  /** Named sub-threads revealed by hook links (Harlowe hooks / Cradle fragments). */
  fragments: Record<string, Node[]>;
  source?: SourceRef;
}

export interface SourceRef {
  file: string;
  line: number;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export type Node =
  | TextNode
  | BreakNode
  | BlockNode
  | IfNode
  | SetNode
  | LinkNode
  | GotoNode
  | IncludeNode
  | PromptNode
  | UiNode
  | ManualNode;

/** What a piece of text is for. Reading modes may only rewrite `narrative`. */
export type TextKind = 'narrative' | 'instruction' | 'title';

/**
 * A run of inline rich text. The string table entry may contain:
 *   **bold**  *italic*  {icon:NAME}  {0} {1} … (placeholders filled from `args`)
 */
export interface TextNode {
  t: 'text';
  key: string;
  kind: TextKind;
  args?: Expr[];
}

export interface BreakNode {
  t: 'br';
}

/** Visually grouped content, e.g. a setup box or a hub section. */
export interface BlockNode {
  t: 'block';
  style: BlockStyle;
  body: Node[];
  /** Setup pop-ups: passage to continue with once the players confirm. */
  next?: Expr;
}

/** String key for the button that confirms a setup pop-up. */
export const SETUP_CONTINUE_KEY = 'common.setupContinue';

export type BlockStyle = 'setup' | 'setupEvent' | 'hubTitle' | 'hubDetails' | 'heading';

export interface IfNode {
  t: 'if';
  /** Evaluated in order; a branch without `cond` is the `else`. */
  branches: { cond?: Expr; body: Node[] }[];
}

export interface SetNode {
  t: 'set';
  var: string;
  value: Expr;
}

/**
 * A clickable link. It either navigates to a passage (`to`) or reveals a fragment of
 * the current passage in place (`reveal`). A reveal link works once: with `replace: true`
 * the fragment's output takes its place, otherwise the output follows the link, which
 * stays visible as plain text.
 */
export interface LinkNode {
  t: 'link';
  key: string;
  /** Placeholder values for the label, as in TextNode. */
  args?: Expr[];
  to?: Expr;
  reveal?: string;
  /** Passage that owns the revealed fragment, when it isn't the current one. */
  revealFrom?: string;
  replace?: boolean;
}

/** Immediately leave the current passage. */
export interface GotoNode {
  t: 'goto';
  to: Expr;
}

/** Render another passage inline (Harlowe `(display:)`). */
export interface IncludeNode {
  t: 'include';
  passage: Expr;
}

/** Ask the players for a value and store it. */
export interface PromptNode {
  t: 'prompt';
  var: string;
  input: 'number' | 'text';
  key: string;
  /** Placeholder values for the question, as in TextNode. */
  args?: Expr[];
}

/**
 * App screen that is not story text, e.g. the end-of-round screen. With a `next` argument
 * the story waits until the app reports the screen as done (see `Story.click`).
 */
export interface UiNode {
  t: 'ui';
  ui: string;
  args?: Record<string, Expr>;
}

/** Source code the converter could not interpret. Must be resolved by hand. */
export interface ManualNode {
  t: 'manual';
  reason: string;
  code: string;
  source?: SourceRef;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type Expr =
  | { lit: Value }
  | { var: string }
  | { op: BinaryOp; a: Expr; b: Expr }
  | { op: 'not' | 'neg'; a: Expr }
  | { fn: FnName; args: Expr[] }
  /** List element; `key` is 1-based or an ordinal ("1st", "2nd", "last", "2ndlast"). */
  | { at: Expr; key: Expr }
  /** First matching case wins; used for values that depend on a condition. */
  | { cases: { cond?: Expr; value: Expr }[] }
  | { unknown: string };

export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||' | '+' | '-' | '*' | '/' | '%';

/**
 * Built-in functions. `either` picks one argument, `random` an integer in a range,
 * `num`/`str` convert between text and numbers, `array` builds a list, `count(list, x)`
 * counts entries equal to x, `max`/`min` take numbers or one list.
 */
export type FnName = 'either' | 'random' | 'num' | 'str' | 'array' | 'shuffled' | 'max' | 'min' | 'count';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type ReadingMode = 'full' | 'short';

export interface StringEntry {
  full: string;
  short?: string;
  /** Shortened text is only shown once a human reviewed it. */
  shortReviewed?: boolean;
}

/** One language: key → text. */
export type StringTable = Record<string, StringEntry>;

// ---------------------------------------------------------------------------
// Extras (`extras.json`): data the app shows outside the story text
// ---------------------------------------------------------------------------

export interface ScenarioExtras {
  /** Keyed by the `progress` argument of the end-of-round screen; values are string keys. */
  endOfRound: Record<string, { round: number; text: string; then: string }>;
  /** Log book entry per passage; values are string keys. */
  logBook: Record<string, { title: string; location: string; summary: string }>;
  /** Voice-over clips per passage, as paths of the original Unity assets. */
  voiceOver: Record<string, { male?: string; female?: string }>;
}

// ---------------------------------------------------------------------------
// Assets (`assets/manifest.json`) and screen texts (`ui.en.json`)
// ---------------------------------------------------------------------------

/** Paths are relative to the assets folder. */
export interface AssetManifest {
  /** Icon name as used in `{icon:NAME}`. */
  icons: Record<string, string>;
  /** Setup picture name as set in `_SetupImage`. */
  setup: Record<string, string>;
  /** UI art, keyed by its path in the original (lower-case, dashes). */
  ui: Record<string, string>;
  /** Story music per scenario; a scenario without its own track uses the title music. */
  music: { title: string; scenario: Record<string, string> };
  effects: Record<string, string>;
  /** Passage → voice-over clips. */
  voiceOver: Record<string, { male?: string; female?: string }>;
  /** Source files that were not available when the assets were extracted. */
  missing: string[];
}

/**
 * Screen texts of the original app: object paths (`UI/MainMenu/…`) → text, and
 * `@Script.field` → text or list (texts the original's scripts assemble).
 */
export type UiText = Record<string, string | string[]>;
