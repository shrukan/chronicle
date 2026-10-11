import type { Out, ScenarioExtras } from '@chronicle/engine';
import { eachOut } from './story-output';

/** Every scenario is played over three generations of three rounds: a rule of the board game. */
export const ROUNDS_PER_GENERATION = 3;
export const GENERATIONS = 3;
export const ROUNDS = GENERATIONS * ROUNDS_PER_GENERATION;

const ROMAN = ['I', 'II', 'III'];

/** A generation's numeral as the original shows it (I-1 … III-3). */
export function generationNumeral(generation: number): string {
  return ROMAN[generation - 1] ?? String(generation);
}

/** Where a round of the whole game (from 1) falls: its generation and its round in it, from 1. */
export function roundPosition(round: number): { generation: number; round: number } {
  return {
    generation: Math.floor((round - 1) / ROUNDS_PER_GENERATION) + 1,
    round: ((round - 1) % ROUNDS_PER_GENERATION) + 1,
  };
}

/**
 * Rounds completed after a page with end-of-round or end-of-generation screens. Each says how
 * many rounds are done (an end of round with round 0 means "this generation's third"). A screen
 * counts only when it is the next step, so showing the same page again changes nothing.
 */
export function roundsAfter(
  output: Out[],
  done: number,
  endOfRound: ScenarioExtras['endOfRound'],
): number {
  const marks: number[] = [];
  eachOut(output, (o) => {
    if (o.t === 'ui' && o.ui === 'endOfRound') {
      const round = endOfRound[String(o.args['progress'] ?? '')]?.round;
      if (round !== undefined)
        marks.push(round || roundPosition(done + 1).generation * ROUNDS_PER_GENERATION);
    } else if (o.t === 'ui' && o.ui === 'endOfGeneration') {
      marks.push(Number(o.args['generation']));
    }
  });
  return marks.filter((m) => m > done).sort((a, b) => a - b)[0] ?? done;
}
