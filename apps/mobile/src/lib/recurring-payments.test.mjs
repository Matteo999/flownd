import assert from 'node:assert/strict';
import test from 'node:test';

import { significantUpcomingPayments } from './recurring-payments-core.ts';

function series(overrides = {}) {
  return {
    id: Math.random().toString(), name: 'Ricorrenza', amount: 10,
    direction: 'expense', origin: 'manual', status: 'active', frequency: 'monthly',
    category: 'Altro', anchorOn: '2026-09-01', nextDueOn: '2026-09-03',
    financialAccountId: null, settlementMode: 'manual_post', loanId: null,
    ...overrides,
  };
}

const now = new Date('2026-09-01T09:00:00+02:00');

test('le entrate imminenti sono sempre significative', () => {
  const result = significantUpcomingPayments([
    series({ direction: 'income', amount: 1, nextDueOn: '2026-09-08' }),
  ], 2_000, now);
  assert.equal(result.length, 1);
});

test('somma le uscite dello stesso giorno per superare il 3% del budget', () => {
  const result = significantUpcomingPayments([
    series({ id: 'a', amount: 35 }),
    series({ id: 'b', amount: 30 }),
    series({ id: 'c', amount: 40, nextDueOn: '2026-09-04' }),
  ], 2_000, now);
  assert.deepEqual(result.map((item) => item.id), ['a', 'b']);
});

test('con budget zero ogni uscita è significativa e oltre sette giorni è esclusa', () => {
  const result = significantUpcomingPayments([
    series({ id: 'inside', amount: 1 }),
    series({ id: 'outside', nextDueOn: '2026-09-09' }),
  ], 0, now);
  assert.deepEqual(result.map((item) => item.id), ['inside']);
});
