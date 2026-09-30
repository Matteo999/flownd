import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildForecastEvents,
  computeSavingsBaseline,
  forecastBand,
  monthsToReach,
  nextNetWorthMilestone,
  projectNetWorth,
} from './wealth-forecast.ts';

const now = new Date('2026-09-15T10:00:00');

function transaction(overrides = {}) {
  return {
    description: 'Movimento',
    amount: 100,
    category: 'Altro',
    kind: 'expense',
    financialAccountId: 'account-1',
    bankStatus: 'booked',
    occurredAt: '2026-08-10T12:00:00.000Z',
    ...overrides,
  };
}

function series(overrides = {}) {
  return {
    id: 'insurance',
    name: 'Assicurazione auto',
    amount: 600,
    direction: 'expense',
    origin: 'manual',
    status: 'active',
    frequency: 'annual',
    category: 'Auto',
    anchorOn: '2026-01-20',
    nextDueOn: '2027-01-20',
    financialAccountId: 'account-1',
    settlementMode: 'review',
    loanId: null,
    ...overrides,
  };
}

test('baseline averages complete months and skips the first partial month', () => {
  const transactions = [
    transaction({ occurredAt: '2026-05-20T12:00:00.000Z', kind: 'income', amount: 5_000 }),
    transaction({ occurredAt: '2026-06-05T12:00:00.000Z', kind: 'income', amount: 2_000 }),
    transaction({ occurredAt: '2026-06-10T12:00:00.000Z', amount: 1_500 }),
    transaction({ occurredAt: '2026-07-05T12:00:00.000Z', kind: 'income', amount: 2_000 }),
    transaction({ occurredAt: '2026-07-10T12:00:00.000Z', amount: 1_300 }),
    transaction({ occurredAt: '2026-08-05T12:00:00.000Z', kind: 'income', amount: 2_000 }),
    transaction({ occurredAt: '2026-08-10T12:00:00.000Z', amount: 1_700 }),
    // Mese corrente: ignorato.
    transaction({ occurredAt: '2026-09-02T12:00:00.000Z', amount: 900 }),
    // Altro conto e giroconti: ignorati.
    transaction({ occurredAt: '2026-07-12T12:00:00.000Z', amount: 999, financialAccountId: 'other' }),
    transaction({ occurredAt: '2026-07-12T12:00:00.000Z', amount: 999, internalTransfer: true }),
  ];
  const baseline = computeSavingsBaseline({
    transactions,
    financialAccountIds: ['account-1'],
    recurringPayments: [],
    now,
  });
  assert.equal(baseline.months, 3);
  assert.equal(baseline.monthly, 500);
  assert.equal(Math.round(baseline.sigma), 200);
});

test('baseline excludes movements counted as forecast events', () => {
  const transactions = [
    transaction({ occurredAt: '2026-05-01T12:00:00.000Z' }),
    transaction({ occurredAt: '2026-06-05T12:00:00.000Z', kind: 'income', amount: 1_000 }),
    transaction({ occurredAt: '2026-07-05T12:00:00.000Z', kind: 'income', amount: 1_000 }),
    transaction({ occurredAt: '2026-07-20T12:00:00.000Z', amount: 600, recurringPaymentId: 'insurance' }),
    transaction({ occurredAt: '2026-08-05T12:00:00.000Z', kind: 'income', amount: 1_000 }),
    transaction({ occurredAt: '2026-08-06T12:00:00.000Z', kind: 'income', amount: 1_500, incomeType: 'extra_salary' }),
  ];
  const baseline = computeSavingsBaseline({
    transactions,
    financialAccountIds: ['account-1'],
    recurringPayments: [series()],
    now,
  });
  assert.equal(baseline.monthly, 1_000);
  assert.equal(baseline.sigma, 0);
});

test('baseline needs at least two complete months', () => {
  const baseline = computeSavingsBaseline({
    transactions: [transaction({ occurredAt: '2026-07-20T12:00:00.000Z' })],
    financialAccountIds: ['account-1'],
    recurringPayments: [],
    now,
  });
  assert.equal(baseline, null);
});

test('events place yearly recurring payments and extra salaries in the horizon', () => {
  const events = buildForecastEvents({
    recurringPayments: [series(), series({ id: 'monthly', frequency: 'monthly' })],
    transactions: [
      transaction({ occurredAt: '2025-12-15T12:00:00.000Z', kind: 'income', amount: 1_800, incomeType: 'extra_salary' }),
    ],
    financialAccountIds: ['account-1'],
    horizon: 24,
    now,
  });
  assert.deepEqual(events.map((event) => [event.name, event.amount, event.offsets]), [
    ['Tredicesima', 1_800, [3, 15]],
    ['Assicurazione auto', -600, [4, 16]],
  ]);
});

test('projection adds monthly saving and enabled events only', () => {
  const events = [{ id: 'a', name: 'A', icon: 'x', amount: -300, offsets: [2], cadence: 'ogni anno' }];
  assert.deepEqual(
    projectNetWorth({ netWorth: 1_000, monthlySaving: 100, events, enabledEventIds: new Set(['a']), months: 3 }),
    [1_000, 1_100, 900, 1_000],
  );
  assert.deepEqual(
    projectNetWorth({ netWorth: 1_000, monthlySaving: 100, events, enabledEventIds: new Set(), months: 3 }),
    [1_000, 1_100, 1_200, 1_300],
  );
});

test('band widens with the square root of time', () => {
  const { low, high } = forecastBand([100, 100, 100, 100, 100], 100);
  assert.equal(low[0], 100);
  assert.equal(high[4] - 100, 256);
});

test('milestones and months to reach', () => {
  assert.equal(nextNetWorthMilestone(24_842), 25_000);
  assert.equal(nextNetWorthMilestone(1_200_000), 2_000_000);
  const options = { netWorth: 24_000, monthlySaving: 500, events: [], enabledEventIds: new Set() };
  assert.equal(monthsToReach(25_000, options), 2);
  assert.equal(monthsToReach(25_000, { ...options, monthlySaving: -10 }), null);
});
