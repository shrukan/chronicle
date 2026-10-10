import { TestBed } from '@angular/core/testing';
import {
  FORMAT_VERSION,
  type Scenario,
  type ScenarioExtras,
  type StringTable,
} from '@chronicle/engine';
import { Game } from './game';
import { SaveStore, type SavedGame } from './save-store';

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

class MemorySaves implements Pick<SaveStore, 'load' | 'save' | 'remove'> {
  saved?: SavedGame;
  async load() {
    return this.saved;
  }
  async save(g: SavedGame) {
    this.saved = structuredClone(g);
  }
  async remove() {
    this.saved = undefined;
  }
}

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
    await Promise.resolve();
    expect(saves.saved?.snapshot.passage).toBe('B');

    const again = TestBed.inject(Game);
    expect(await again.resume()).toBe(true);
    expect(again.view()?.passage).toBe('B');
    expect(again.setup()?.names[0]).toBe('Ada');
  });
});
