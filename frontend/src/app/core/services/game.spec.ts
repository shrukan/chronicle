import { TestBed } from '@angular/core/testing';
import {
  FORMAT_VERSION,
  type Scenario,
  type ScenarioExtras,
  type StringTable,
} from '@chronicle/engine';
import { Game } from './game';
import { SavedGames } from './saved-games';
import { SAVE_VERSION, SaveStore, type SavedGame } from './save-store';

const scenario: Scenario = {
  format: FORMAT_VERSION,
  id: 'cost-of-disease',
  start: 'A',
  variables: {
    players: 0,
    townname: '',
    nameA: '',
    nameB: '',
    nameC: '',
    nameD: '',
    nameE: '',
    winnerName: '',
    count: 0,
  },
  passages: {
    A: {
      name: 'A',
      tags: [],
      fragments: {},
      body: [
        { t: 'text', key: 'A.1', kind: 'narrative', args: [{ var: 'nameA' }] },
        { t: 'link', key: 'A.2', to: { lit: 'B' } },
      ],
    },
    B: {
      name: 'B',
      tags: [],
      fragments: {},
      body: [
        { t: 'prompt', var: 'count', input: 'number', key: 'B.1' },
        { t: 'text', key: 'B.2', kind: 'instruction', args: [{ var: 'count' }] },
      ],
    },
  },
};
const strings: StringTable = {
  'A.1': { full: 'Hello {0}' },
  'A.2': { full: 'On' },
  'B.1': { full: 'How many?' },
  'B.2': { full: 'Got {0}' },
};
const extras: ScenarioExtras = { endOfRound: {}, logBook: {}, voiceOver: {} };

class MemorySaves implements Pick<SaveStore, 'list' | 'load' | 'save' | 'remove'> {
  readonly games = new Map<string, SavedGame>();
  async list() {
    return [...this.games.values()];
  }
  async load(id: string) {
    return this.games.get(id);
  }
  async save(g: SavedGame) {
    this.games.set(g.id, structuredClone(g));
  }
  async remove(id: string) {
    this.games.delete(id);
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('Game', () => {
  let saves: MemorySaves;

  beforeEach(() => {
    saves = new MemorySaves();
    const files: Record<string, unknown> = {
      'scenario.json': scenario,
      'strings.en.json': strings,
      'extras.json': extras,
    };
    vi.stubGlobal(
      'fetch',
      async (url: string) => new Response(JSON.stringify(files[url.split('/').pop()!])),
    );
    TestBed.configureTestingModule({ providers: [{ provide: SaveStore, useValue: saves }] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('starts a game with the setup and plays through a prompt', async () => {
    const game = TestBed.inject(Game);
    await game.newGame({ players: 2, names: ['Ada', 'Bram', '', '', ''], village: 'Ravensbrück' });
    expect(game.view()?.passage).toBe('A');
    expect(game.text('A.1')).toBe('Hello {0}');

    const link = game.view()!.links[0]!;
    game.click(link);
    expect(game.view()?.prompt?.key).toBe('B.1');

    game.answer('x');
    expect(game.error()).toContain('Not a number');
    game.answer('4');
    expect(game.view()?.prompt).toBeUndefined();
    expect(game.error()).toBeUndefined();
  });

  it('undoes a step the app took for the players together with the choice before it', async () => {
    const page = (name: string, to: string) => ({
      name,
      tags: [],
      fragments: {},
      body: [{ t: 'link' as const, key: 'A.2', to: { lit: to } }],
    });
    const chain = {
      ...scenario,
      passages: { A: page('A', 'H'), H: page('H', 'S'), S: page('S', 'A') },
    };
    const files: Record<string, unknown> = {
      'scenario.json': chain,
      'strings.en.json': strings,
      'extras.json': extras,
    };
    vi.stubGlobal(
      'fetch',
      async (url: string) => new Response(JSON.stringify(files[url.split('/').pop()!])),
    );
    const game = TestBed.inject(Game);
    await game.newGame({ players: 2, names: ['Ada', 'Bram', '', '', ''], village: 'Ravensbrück' });
    game.click(game.view()!.links[0]!);
    game.click(game.view()!.links[0]!, undefined, false);
    expect(game.view()?.passage).toBe('S');

    game.undo();
    expect(game.view()?.passage).toBe('A');
    expect(game.canUndo()).toBe(false);
  });

  it('saves after each step and resumes', async () => {
    const game = TestBed.inject(Game);
    await game.newGame({ players: 2, names: ['Ada', 'Bram', '', '', ''], village: 'Ravensbrück' });
    game.click(game.view()!.links[0]!);
    game.answer('4');
    await settle();
    const id = game.saveId()!;
    expect(saves.games.get(id)?.snapshot.passage).toBe('B');
    expect(saves.games.get(id)?.version).toBe(SAVE_VERSION);

    game.close();
    expect(game.view()).toBeUndefined();
    expect(await game.resume(id)).toBe('resumed');
    expect(game.view()?.passage).toBe('B');
    expect(game.setup()?.names[0]).toBe('Ada');
  });

  it('keeps several games, the one played last first', async () => {
    const game = TestBed.inject(Game);
    const list = TestBed.inject(SavedGames);
    await game.newGame({ players: 2, names: ['Ada', 'Bram'], village: 'Ravensbrück' });
    await settle();
    const first = game.saveId()!;
    await game.newGame({ players: 3, names: ['Cosima', 'Dara', 'Emil'], village: 'Testville' });
    await settle();
    // The first one is played again: it moves to the top.
    expect(await game.resume(first)).toBe('resumed');
    game.click(game.view()!.links[0]!);
    await settle();

    const saved = await list.list();
    expect(saved.map((s) => s.village)).toEqual(['Ravensbrück', 'Testville']);
    expect(saved[1]).toMatchObject({ names: ['Cosima', 'Dara', 'Emil'], status: 'ok' });

    await list.remove(first);
    expect(game.view()).toBeUndefined();
    expect((await list.list()).map((s) => s.village)).toEqual(['Testville']);
  });

  it('does not continue a save the changed story cannot continue', async () => {
    const game = TestBed.inject(Game);
    await game.newGame({ players: 2, names: ['Ada', 'Bram', '', '', ''], village: 'Ravensbrück' });
    await settle();
    const id = game.saveId()!;
    const saved = saves.games.get(id)!;
    saves.games.set(id, { ...saved, snapshot: { ...saved.snapshot, passage: 'Gone' } });

    expect(await game.resume(id)).toBe('changed');
    const [summary] = await TestBed.inject(SavedGames).list();
    expect(summary).toMatchObject({ village: 'Ravensbrück', status: 'changed' });
  });
});
