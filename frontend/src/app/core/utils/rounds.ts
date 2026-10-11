/** Every scenario is played over three generations of three rounds: a rule of the board game. */
export const ROUNDS_PER_GENERATION = 3;
export const GENERATIONS = 3;
export const ROUNDS = GENERATIONS * ROUNDS_PER_GENERATION;

/** Generation numerals as the original shows them (I-1 … III-3). */
export const ROMAN = ['I', 'II', 'III'] as const;

/** Where a round of the whole game (from 1) falls: its generation and its round in it, from 1. */
export function roundPosition(round: number): { generation: number; round: number } {
  return {
    generation: Math.floor((round - 1) / ROUNDS_PER_GENERATION) + 1,
    round: ((round - 1) % ROUNDS_PER_GENERATION) + 1,
  };
}
