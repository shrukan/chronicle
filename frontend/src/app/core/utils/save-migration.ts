import {
  snapshotProblems,
  type LinkRole,
  type Node,
  type Out,
  type Scenario,
  type StorySnapshot,
  type TextRole,
} from '@chronicle/engine';
import { SAVE_VERSION, type SavedGame, type UndoStep } from '../services/save-store';

/**
 * A save read back: ready to continue, or why it can't be – the story changed in an update
 * (`changed`), or a newer version of the app wrote it (`newer`, e.g. an old cached app).
 */
export type LoadedSave =
  { status: 'ok'; save: SavedGame } | { status: 'changed' | 'newer'; problems: string[] };

/** Saves from before versioning (0.6.0 and earlier): several fields were added over time. */
interface SaveV0 extends Omit<
  SavedGame,
  'version' | 'log' | 'playTime' | 'undo' | 'roundsDone' | 'carried'
> {
  version?: undefined;
  log?: string[];
  playTime?: number;
  undo?: (Omit<UndoStep, 'roundsDone' | 'carried'> & Partial<UndoStep>)[];
  roundsDone?: number;
  carried?: Out[];
}

function isSave(raw: unknown): raw is SaveV0 | SavedGame {
  if (!raw || typeof raw !== 'object') return false;
  const save = raw as Partial<SavedGame>;
  return !!save.setup && !!save.snapshot && typeof save.snapshot.passage === 'string';
}

/**
 * Brings a stored save up to the current format and checks it against the current story. Undo
 * steps that no longer fit are dropped (with every older one), so undo stops there.
 */
export function migrateSave(raw: unknown, scenario: Scenario): LoadedSave | undefined {
  if (!isSave(raw)) return undefined;
  if ((raw.version ?? 0) > SAVE_VERSION)
    return { status: 'newer', problems: [`save format ${raw.version}`] };
  const save = raw.version === SAVE_VERSION ? raw : fromV0(raw, scenario);

  const problems = snapshotProblems(scenario, save.snapshot);
  if (problems.length) return { status: 'changed', problems };
  let kept = save.undo.length;
  while (kept > 0 && !snapshotProblems(scenario, save.undo[kept - 1]!.snapshot).length) kept--;
  return { status: 'ok', save: { ...save, undo: save.undo.slice(kept) } };
}

function fromV0(save: SaveV0, scenario: Scenario): SavedGame {
  // Continue links and hand-overs were marked in the content later: the saved pages get them.
  const roles = contentRoles(scenario);
  const snapshot = (s: StorySnapshot): StorySnapshot => ({
    ...s,
    output: withRoles(s.output, roles),
  });
  return {
    ...save,
    version: SAVE_VERSION,
    snapshot: snapshot(save.snapshot),
    log: save.log ?? [],
    playTime: save.playTime ?? 0,
    roundsDone: save.roundsDone ?? 0,
    carried: withRoles(save.carried ?? [], roles),
    undo: (save.undo ?? []).map((step) => ({
      ...step,
      snapshot: snapshot(step.snapshot),
      roundsDone: step.roundsDone ?? 0,
      carried: withRoles(step.carried ?? [], roles),
    })),
  };
}

/** String key → role of the text or link that uses it. */
function contentRoles(scenario: Scenario): Map<string, LinkRole | TextRole> {
  const roles = new Map<string, LinkRole | TextRole>();
  const visit = (nodes: Node[]): void => {
    for (const n of nodes) {
      if ((n.t === 'text' || n.t === 'link') && n.role) roles.set(n.key, n.role);
      if (n.t === 'block') visit(n.body);
      if (n.t === 'if') n.branches.forEach((b) => visit(b.body));
    }
  };
  for (const p of Object.values(scenario.passages)) {
    visit(p.body);
    Object.values(p.fragments).forEach(visit);
  }
  return roles;
}

function withRoles(out: Out[], roles: Map<string, LinkRole | TextRole>): Out[] {
  return out.map((o): Out => {
    if (o.t === 'block' || o.t === 'group') return { ...o, children: withRoles(o.children, roles) };
    const role = o.t === 'text' || o.t === 'link' ? roles.get(o.key) : undefined;
    if (o.t === 'link' && role === 'continue') return { ...o, role };
    if (o.t === 'text' && role === 'handover') return { ...o, role };
    return o;
  });
}
