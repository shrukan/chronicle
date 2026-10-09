import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keepVariants } from './variants.ts';

describe('keepVariants', () => {
  it('keeps easy and short texts, reviewed only while the original is unchanged', () => {
    const previous = {
      same: {
        full: 'Long.',
        easy: 'Easy.',
        easyReviewed: true,
        short: 'S.',
        shortReviewed: true,
      },
      changed: { full: 'Old.', short: 'S.', shortReviewed: true },
      gone: { full: 'Gone.', short: 'G.' },
    };
    const converted = {
      same: { full: 'Long.' },
      changed: { full: 'New.' },
      added: { full: 'Added.' },
    };
    assert.deepEqual(keepVariants(converted, previous), {
      same: {
        full: 'Long.',
        easy: 'Easy.',
        easyReviewed: true,
        short: 'S.',
        shortReviewed: true,
      },
      changed: { full: 'New.', short: 'S.' },
      added: { full: 'Added.' },
    });
  });
});
