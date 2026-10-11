import type { Out } from '@chronicle/engine';
import { describe, expect, it } from 'vitest';
import { ROUNDS, roundPosition, roundsAfter } from './rounds';

describe('roundPosition', () => {
  it('places each round of the game in its generation', () => {
    expect(ROUNDS).toBe(9);
    expect(roundPosition(1)).toEqual({ generation: 1, round: 1 });
    expect(roundPosition(3)).toEqual({ generation: 1, round: 3 });
    expect(roundPosition(4)).toEqual({ generation: 2, round: 1 });
    expect(roundPosition(9)).toEqual({ generation: 3, round: 3 });
  });
});

describe('roundsAfter', () => {
  const endOfRound = {
    second: { round: 2, text: '', then: '' },
    third: { round: 0, text: '', then: '' },
  };
  const screen = (progress: string): Out => ({ t: 'ui', ui: 'endOfRound', args: { progress } });

  it('moves on to the round an end-of-round screen names', () => {
    expect(roundsAfter([screen('second')], 1, endOfRound)).toBe(2);
  });

  it('takes round 0 as the third round of the generation being played', () => {
    expect(roundsAfter([{ t: 'group', children: [screen('third')] }], 4, endOfRound)).toBe(6);
  });

  it('counts the end of a generation, but never goes back', () => {
    const end: Out = { t: 'ui', ui: 'endOfGeneration', args: { generation: 3 } };
    expect(roundsAfter([end], 2, endOfRound)).toBe(3);
    expect(roundsAfter([screen('second')], 5, endOfRound)).toBe(5);
  });
});
