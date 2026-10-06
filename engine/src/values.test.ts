import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { binary, compare, indexArray, toText } from './values.ts';

describe('compare (Cradle semantics)', () => {
  it('unset equals only unset', () => {
    assert.equal(compare('==', null, null), true);
    assert.equal(compare('==', null, 0), false);
    assert.equal(compare('==', null, ''), false);
    assert.equal(compare('!=', null, 0), true);
  });

  it('compares numbers with numeric strings numerically', () => {
    assert.equal(compare('==', 3, '3'), true);
    assert.equal(compare('==', '3', 3), true);
    assert.equal(compare('>', '10', 9), true);
    assert.equal(compare('==', 0, ''), false);
  });

  it('falls back to string comparison', () => {
    assert.equal(compare('==', 'evil', 'evil'), true);
    assert.equal(compare('==', 'Ada', 0), false);
    assert.equal(compare('!=', 'Ada', 0), true);
  });
});

describe('binary', () => {
  it('treats an unset left operand as the right operand type', () => {
    assert.equal(binary('+', null, 2), 2);
    assert.equal(binary('+', null, 'x'), 'x');
  });

  it('adds numeric strings numerically and concatenates other strings', () => {
    assert.equal(binary('+', '2', 3), 5);
    assert.equal(binary('+', 'VP: ', 3), 'VP: 3');
  });

  it('subtracts arrays element-wise', () => {
    assert.deepEqual(binary('-', [1, 2, 3, 4], [2, 4]), [1, 3]);
  });
});

describe('indexArray', () => {
  it('supports Harlowe ordinals', () => {
    const a = [10, 20, 30];
    assert.equal(indexArray(a, '1st'), 10);
    assert.equal(indexArray(a, '3rd'), 30);
    assert.equal(indexArray(a, 'last'), 30);
    assert.equal(indexArray(a, '2ndlast'), 20);
    assert.equal(indexArray(a, 2), 20);
    assert.throws(() => indexArray(a, '4th'), RangeError);
  });
});

describe('toText', () => {
  it('renders unset as empty', () => {
    assert.equal(toText(null), '');
    assert.equal(toText(5), '5');
  });
});
