import assert from 'node:assert/strict'
import test from 'node:test'

import { findManualMatch, syncDateFrom } from './sync.js'

function transactionService(rows) {
  const filters = []
  const query = {
    select() { return this },
    eq(column, value) { filters.push(['eq', column, value]); return this },
    in(column, values) { filters.push(['in', column, values]); return this },
    is(column, value) { filters.push(['is', column, value]); return this },
    gte(column, value) { filters.push(['gte', column, value]); return this },
    lt(column, value) {
      filters.push(['lt', column, value])
      const data = rows.filter((row) => filters.every(([operator, key, expected]) => {
        if (operator === 'eq') return row[key] === expected
        if (operator === 'in') return expected.includes(row[key])
        if (operator === 'is') return row[key] === expected
        if (operator === 'gte') return row[key] >= expected
        if (operator === 'lt') return row[key] < expected
        return true
      }))
      return Promise.resolve({ data, error: null })
    },
  }
  return { from: () => query }
}

test('il matching bancario considera solo le transazioni in modalità Automatico', async () => {
  const common = {
    user_id: 'user-a',
    kind: 'expense',
    amount: 12.5,
    source: 'manual',
    occurred_at: '2026-08-20T12:00:00.000Z',
  }
  const match = await findManualMatch(
    transactionService([
      { ...common, id: 'wallet', description: 'Bar', financial_account_id: 'manual-account' },
      { ...common, id: 'automatic', description: 'Bar', financial_account_id: null },
    ]),
    'user-a',
    {
      kind: 'expense',
      amount: 12.5,
      occurredOn: '2026-08-20',
      description: 'Bar',
    },
  )
  assert.equal(match?.id, 'automatic')
})

test('una connessione già sincronizzata resta incrementale anche dopo un warning', () => {
  assert.equal(
    syncDateFrom({
      dateTo: '2026-09-04',
      lastSyncedAt: '2026-09-04T09:56:15.893Z',
      automatic: false,
    }),
    '2026-08-21',
  )
})

test('solo la prima sincronizzazione manuale richiede lo storico completo', () => {
  assert.equal(
    syncDateFrom({ dateTo: '2026-09-04', lastSyncedAt: null, automatic: false }),
    '2024-09-04',
  )
  assert.equal(
    syncDateFrom({ dateTo: '2026-09-04', lastSyncedAt: null, automatic: true }),
    '2026-08-21',
  )
})
