import { describe, expect, it } from 'vitest';
import { ROUNDS, roundPosition } from './rounds';

describe('roundPosition', () => {
  it('places each round of the game in its generation', () => {
    expect(ROUNDS).toBe(9);
    expect(roundPosition(1)).toEqual({ generation: 1, round: 1 });
    expect(roundPosition(3)).toEqual({ generation: 1, round: 3 });
    expect(roundPosition(4)).toEqual({ generation: 2, round: 1 });
    expect(roundPosition(9)).toEqual({ generation: 3, round: 3 });
  });
});
