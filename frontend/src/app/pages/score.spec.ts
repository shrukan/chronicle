import { rankPlayers } from './score';

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
