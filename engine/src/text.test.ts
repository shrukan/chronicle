import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeMarkup, parseMarkup, resolveText } from './text.ts';

describe('parseMarkup', () => {
  it('parses bold, italic, icons and placeholders', () => {
    assert.deepEqual(parseMarkup('Give **{0}** a {icon:Heart} *now*', ['Ada']), [
      { t: 'text', text: 'Give ', bold: false, italic: false },
      { t: 'text', text: 'Ada', bold: true, italic: false },
      { t: 'text', text: ' a ', bold: false, italic: false },
      { t: 'icon', name: 'Heart', bold: false, italic: false },
      { t: 'text', text: ' ', bold: false, italic: false },
      { t: 'text', text: 'now', bold: false, italic: true },
    ]);
  });

  it('round-trips escaped characters', () => {
    const raw = 'a * b {c} \\ d';
    assert.deepEqual(parseMarkup(escapeMarkup(raw)), [{ t: 'text', text: raw, bold: false, italic: false }]);
  });
});

describe('resolveText', () => {
  const table = {
    n: { full: 'Long story.', short: 'Short.', shortReviewed: true, easy: 'Easy.' },
    u: { full: 'Long story.' },
    i: { full: 'Gain 5VP.', short: '5VP', shortReviewed: true },
  };

  it('uses short text, reviewed or not, for narrative only', () => {
    assert.equal(resolveText(table, 'n', 'short', 'narrative'), 'Short.');
    assert.equal(resolveText(table, 'u', 'short', 'narrative'), 'Long story.');
    assert.equal(resolveText(table, 'i', 'short', 'instruction'), 'Gain 5VP.');
    assert.equal(resolveText(table, 'n', 'full', 'narrative'), 'Long story.');
  });

  it('uses easy text, reviewed or not, for narrative only', () => {
    assert.equal(resolveText(table, 'n', 'easy', 'narrative'), 'Easy.');
    assert.equal(resolveText(table, 'u', 'easy', 'narrative'), 'Long story.');
    assert.equal(resolveText(table, 'i', 'easy', 'instruction'), 'Gain 5VP.');
  });
});
