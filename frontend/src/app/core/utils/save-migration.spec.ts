import { FORMAT_VERSION, type Scenario, type StorySnapshot } from '@chronicle/engine';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, type SavedGame } from '../services/save-store';
import { migrateSave } from './save-migration';

const scenario: Scenario = {
  format: FORMAT_VERSION,
  id: 'cost-of-disease',
  start: 'A',
  variables: { count: 0 },
  passages: {
    A: {
      name: 'A',
      tags: [],
      fragments: {},
      body: [
        { t: 'text', key: 'A.1', kind: 'command', role: 'handover' },
        { t: 'link', key: 'common.continue', to: { lit: 'B' }, role: 'continue' },
      ],
    },
    B: { name: 'B', tags: [], fragments: {}, body: [] },
  },
};

const snapshot = (passage = 'A', to = 'B'): StorySnapshot => ({
  passage,
  history: [passage],
  vars: { count: 1 },
  output: [
    { t: 'text', key: 'A.1', kind: 'command', args: [] },
    { t: 'link', id: 1, key: 'common.continue', args: [] },
  ],
  links: [{ id: 1, passage, to, replace: false }],
  nextLinkId: 2,
});

/** A save as 0.6.0 wrote it: no version, no undo, no round count. */
const v0 = {
  scenario: 'cost-of-disease',
  setup: { players: 2, names: ['Ada', 'Bram'], village: 'Testville' },
  snapshot: snapshot(),
  log: ['A'],
  savedAt: 1,
};

describe('migrateSave', () => {
  it('ignores what is not a save', () => {
    expect(migrateSave(undefined, scenario)).toBeUndefined();
    expect(migrateSave({ scenario: 'cost-of-disease' }, scenario)).toBeUndefined();
  });

  it('brings a save from before versioning up to date', () => {
    const loaded = migrateSave(v0, scenario);
    expect(loaded?.status).toBe('ok');
    const save = (loaded as { save: SavedGame }).save;
    expect(save).toMatchObject({ version: SAVE_VERSION, playTime: 0, roundsDone: 0, undo: [] });
    expect(save.carried).toEqual([]);
    // The saved page gets the roles the content has since.
    expect(save.snapshot.output).toEqual([
      { t: 'text', key: 'A.1', kind: 'command', role: 'handover', args: [] },
      { t: 'link', id: 1, key: 'common.continue', role: 'continue', args: [] },
    ]);
  });

  it('refuses a save the changed story cannot continue', () => {
    const loaded = migrateSave({ ...v0, snapshot: snapshot('Gone') }, scenario);
    expect(loaded).toEqual({ status: 'changed', problems: ['unknown passage "Gone"'] });
  });

  it('refuses a save from a newer version of the app', () => {
    expect(migrateSave({ ...v0, version: SAVE_VERSION + 1 }, scenario)?.status).toBe('newer');
  });

  it('drops undo steps that no longer fit, and every older one', () => {
    const step = (s: StorySnapshot) => ({ snapshot: s, log: [], roundsDone: 0, carried: [] });
    const save: SavedGame = {
      ...v0,
      version: SAVE_VERSION,
      scenario: 'cost-of-disease',
      log: [],
      playTime: 0,
      roundsDone: 0,
      carried: [],
      undo: [step(snapshot()), step(snapshot('A', 'Gone')), step(snapshot()), step(snapshot())],
    };
    const loaded = migrateSave(save, scenario) as { save: SavedGame };
    expect(loaded.save.undo).toHaveLength(2);
  });
});
