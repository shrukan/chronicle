import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keepVariants } from './variants.ts';

describe('keepVariants', () => {
  it('finds a rewrite by its text when the key moved', () => {
    const previous = { 'P.1': { full: 'Story.', easy: 'Easy story.' } };
    assert.deepEqual(keepVariants({ 'P.2': { full: 'Story.' } }, previous), {
      'P.2': { full: 'Story.', easy: 'Easy story.' },
    });
  });

  it('drops the rewrites of texts that are no longer flavour text', () => {
    const previous = { rule: { full: 'Place it.', easy: 'Put it.' } };
    assert.deepEqual(keepVariants({ rule: { full: 'Place it.' } }, previous, () => false), {
      rule: { full: 'Place it.' },
    });
  });

  it('keeps easy and short texts while the original is unchanged', () => {
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
      changed: { full: 'New.' },
      added: { full: 'Added.' },
    });
  });
});
