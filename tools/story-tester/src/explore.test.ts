import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FORMAT_VERSION, type IfNode, type Passage, type Scenario } from '@chronicle/engine';
import { promptCandidates } from './candidates.ts';
import { controlVariables } from './control.ts';
import { explore } from './explore.ts';
import { closedDomains, isImpossibleFallthrough } from './infeasible.ts';

function scenario(passages: Record<string, Partial<Passage> & Pick<Passage, 'body'>>, variables: Scenario['variables']): Scenario {
  const ps: Record<string, Passage> = {};
  for (const [name, p] of Object.entries(passages)) ps[name] = { name, tags: [], fragments: {}, ...p };
  return { format: FORMAT_VERSION, id: 'test', start: 'Start', variables, passages: ps };
}

/**
 * Start → prompt "count"; 7 leads to a hidden error, 3 to an ending, anything else to a
 * dead end. A random coin decides between two routes to the prompt.
 */
const SCENARIO = scenario(
  {
    Start: {
      body: [
        { t: 'set', var: 'coin', value: { fn: 'either', args: [{ lit: 'heads' }, { lit: 'tails' }] } },
        { t: 'link', key: 'go', to: { lit: 'Ask' } },
      ],
    },
    Ask: {
      body: [
        { t: 'prompt', var: 'count', input: 'number', key: 'q' },
        {
          t: 'if',
          branches: [
            { cond: { op: '==', a: { var: 'count' }, b: { lit: 7 } }, body: [{ t: 'goto', to: { lit: 'Broken' } }] },
            { cond: { op: '==', a: { var: 'count' }, b: { lit: 3 } }, body: [{ t: 'link', key: 'end', to: { lit: 'End' } }] },
            { body: [{ t: 'link', key: 'stuck', to: { lit: 'Stuck' } }] },
          ],
        },
      ],
    },
    Broken: { body: [{ t: 'set', var: 'count', value: { lit: 'seven' } }] },
    End: { body: [], tags: ['ending'] },
    Stuck: { body: [] },
  },
  { coin: '', count: 0, players: 2 },
);

describe('story tester', () => {
  it('derives prompt answers from the comparisons in the story', () => {
    const c = promptCandidates(SCENARIO).get('count')!;
    assert.ok(c.includes(7) && c.includes(3) && c.includes(6) && c.includes(8));
  });

  it('knows which variables decide the path', () => {
    assert.deepEqual([...controlVariables(SCENARIO)].sort(), ['count']);
  });

  it('finds endings, dead ends and errors', () => {
    const r = explore(SCENARIO, {
      setup: { players: 2 }, setupChoices: new Map(), candidates: promptCandidates(SCENARIO), control: controlVariables(SCENARIO),
      branches: new Map(), timeLimitMs: 5000, plateauMs: 500, maxOutcomesPerAction: 100, sampleRangeAbove: 6, maxStepsPerWalk: 50, seed: 1,
    });
    assert.deepEqual([...r.endings.keys()], ['End']);
    assert.deepEqual([...r.deadEnds.keys()], ['Stuck']);
    assert.equal(r.errors.size, 1);
    assert.match([...r.errors.values()][0]!.message, /Cannot store string/);
    assert.deepEqual([...r.visited].sort(), ['Ask', 'Broken', 'End', 'Start', 'Stuck']);
  });

  it('recognises impossible fall-throughs', () => {
    const ladder: IfNode = {
      t: 'if',
      branches: [2, 3, 4, 5].map((n) => ({ cond: { op: '==' as const, a: { var: 'players' }, b: { lit: n } }, body: [] })),
    };
    const domains = closedDomains(SCENARIO, { players: [2, 3, 4, 5] });
    assert.equal(isImpossibleFallthrough(ladder, 4, domains), true);
    assert.equal(isImpossibleFallthrough(ladder, 3, domains), false);
  });
});
