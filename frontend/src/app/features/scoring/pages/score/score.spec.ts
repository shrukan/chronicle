import { rankPlayers, tieBreak } from './score';

const players = (...scores: number[]) =>
  scores.map((score, index) => ({ index, name: `P${index}`, score }));

describe('rankPlayers', () => {
  it('ranks by score, a single leader winning alone', () => {
    const r = rankPlayers(players(5, 9, 7));
    expect(r.ranking.map((p) => p.score)).toEqual([9, 7, 5]);
    expect(r.places).toEqual([1, 2, 3]);
    expect(r.familyWins).toBe(false);
  });

  it('gives equal scores the same place', () => {
    const r = rankPlayers(players(9, 9, 4, 4, 2));
    expect(r.places).toEqual([1, 1, 3, 3, 5]);
    expect(r.winners).toBe(2);
    expect(r.familyWins).toBe(true);
  });
});

describe('tieBreak', () => {
  const none = new Set<number>();

  it('adds nothing without a tie among the leaders', () => {
    expect(tieBreak(players(9, 9, 12), new Set([0, 1]), {})).toEqual({});
  });

  it('gives the only tied leader with a completed Masterwork one point', () => {
    expect(tieBreak(players(9, 9, 4), new Set([1, 2]), {})).toEqual({ 1: 1 });
  });

  it('lets the Estate Upgrades decide when several completed it', () => {
    expect(tieBreak(players(9, 9, 9), new Set([0, 2]), { 0: 3, 2: 5 })).toEqual({ 0: 3, 2: 5 });
  });

  it('leaves the leaders tied when none completed it', () => {
    expect(tieBreak(players(9, 9), none, {})).toEqual({});
  });
});
