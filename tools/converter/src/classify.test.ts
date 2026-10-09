import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNarrative } from './passage.ts';

const narrative = (text: string) => isNarrative(text, text);

describe('isNarrative', () => {
  it('keeps flavour prose', () => {
    assert.ok(narrative('The scud banked across the moon, enveloping the entire valley in a dismal, silvery cocoon.'));
  });

  it('treats rules that read like prose as instructions', () => {
    for (const rule of [
      'A Yay vote is a vote to contribute to the Hunt.',
      'However, if the total is equal to or greater than the number shown, ',
      'At the end of the second round, a Symposium will be held in town for everyone.',
      'When a player visits one of the three Suspicious locations, they may investigate the location.',
      'The evil activities were thwarted by our efforts. Place the tile to the side of the play area.',
      'Every scientist MUST personally visit the Hospital at least one time during this Generation.',
    ])
      assert.equal(narrative(rule), false, rule);
  });
});
