import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { binary, equals, indexList, toNumber, toText, ValueError, zeroOf } from './values.ts';

describe('equals', () => {
  it('compares values of the same type', () => {
    assert.equal(equals(3, 3), true);
    assert.equal(equals('evil', 'evil'), true);
    assert.equal(equals([1, 2], [1, 2]), true);
    assert.equal(equals([1, 2], [2, 1]), false);
  });

  it('rejects comparing different types instead of guessing', () => {
    assert.throws(() => equals(3, '3'), ValueError);
    assert.throws(() => equals('', 0), ValueError);
  });
});

describe('binary', () => {
  it('does arithmetic on numbers and joins text', () => {
    assert.equal(binary('+', 2, 3), 5);
    assert.equal(binary('+', 'VP: ', '3'), 'VP: 3');
    assert.throws(() => binary('+', 'VP: ', 3), ValueError);
  });

  it('orders numbers and text', () => {
    assert.equal(binary('>', 10, 9), true);
    assert.equal(binary('<', 'a', 'b'), true);
    assert.throws(() => binary('>', '10', 9), ValueError);
  });

  it('adds and removes list elements', () => {
    assert.deepEqual(binary('+', [1, 2], [3]), [1, 2, 3]);
    assert.deepEqual(binary('-', [1, 2, 3, 4], [2, 4]), [1, 3]);
  });

  it('requires true/false for logic', () => {
    assert.equal(binary('&&', true, false), false);
    assert.throws(() => binary('||', 0, true), ValueError);
  });
});

describe('conversions', () => {
  it('converts explicitly', () => {
    assert.equal(toNumber(' 12 '), 12);
    assert.throws(() => toNumber(''), ValueError);
    assert.equal(toText(5), '5');
    assert.equal(toText([1, 2]), '1, 2');
  });

  it('knows each type’s starting value', () => {
    assert.equal(zeroOf('number'), 0);
    assert.equal(zeroOf('string'), '');
    assert.deepEqual(zeroOf('list'), []);
  });
});

describe('indexList', () => {
  it('supports numbers and ordinals', () => {
    const a = [10, 20, 30];
    assert.equal(indexList(a, '1st'), 10);
    assert.equal(indexList(a, '3rd'), 30);
    assert.equal(indexList(a, 'last'), 30);
    assert.equal(indexList(a, '2ndlast'), 20);
    assert.equal(indexList(a, 2), 20);
    assert.throws(() => indexList(a, '4th'), RangeError);
  });
});
