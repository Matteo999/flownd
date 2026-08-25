import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNetWorthHistory } from './wealth-history.ts';

function transaction(overrides = {}) {
  return {
    id: 'salary',
    description: 'Stipendio',
    amount: 2_000,
    category: 'Stipendio',
    kind: 'income',
    financialAccountId: 'account-1',
    bankStatus: 'booked',
    occurredAt: '2026-08-25T12:00:00.000Z',
    ...overrides,
  };
}

test('an Open Banking movement from today with no known time creates a jump', () => {
  const points = buildNetWorthHistory({
    currentNetWorth: 5_000,
    financialAccountIds: ['account-1'],
    transactions: [transaction()],
    now: new Date('2026-08-25T08:00:00+02:00'),
  });

  assert.equal(points.at(-2)?.value, 3_000);
  assert.equal(points.at(-1)?.value, 5_000);
});

test('a movement with a real future time is not included prematurely', () => {
  const points = buildNetWorthHistory({
    currentNetWorth: 3_000,
    financialAccountIds: ['account-1'],
    transactions: [transaction({ occurredTime: '18:00:00' })],
    now: new Date('2026-08-25T08:00:00+02:00'),
  });

  assert.ok(points.every((point) => point.value === 3_000));
});
