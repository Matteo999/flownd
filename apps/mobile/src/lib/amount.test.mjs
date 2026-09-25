import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDecimalInput, parseEuroAmount } from './amount.ts';

test('formato italiano e internazionale', () => {
  assert.equal(parseEuroAmount('12,50'), 12.5);
  assert.equal(parseEuroAmount('12.50'), 12.5);
  assert.equal(parseEuroAmount('1.250'), 1250);
  assert.equal(parseEuroAmount('1.250,50'), 1250.5);
  assert.equal(parseEuroAmount('1,250.50'), 1250.5);
  assert.equal(parseEuroAmount('1.250.000'), 1250000);
  assert.equal(parseEuroAmount('1,250,000'), 1250000);
  assert.equal(parseEuroAmount(' 1 250,00 € '), 1250);
  assert.equal(parseEuroAmount('0.125'), 0.13);
  assert.equal(parseEuroAmount('-45,10'), -45.1);
});

test('input non valido', () => {
  assert.equal(parseEuroAmount(''), 0);
  assert.equal(parseEuroAmount('abc'), 0);
  assert.equal(parseEuroAmount('1,2,3,4'), 0);
  assert.ok(Number.isNaN(parseDecimalInput('12,5a')));
  assert.ok(Number.isNaN(parseDecimalInput('')));
});
