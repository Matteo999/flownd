import assert from 'node:assert/strict'
import test from 'node:test'

import { DETECTION_LOOKBACK_DAYS, detectRecurringCandidates, nextRecurringDate } from './_recurring-payments.js'

test('le frequenze preservano il giorno e limitano la fine del mese', () => {
  assert.equal(nextRecurringDate('2026-01-31', 'monthly', 31), '2026-02-28')
  assert.equal(nextRecurringDate('2028-01-31', 'monthly', 31), '2028-02-29')
  assert.equal(nextRecurringDate('2028-02-29', 'annual', 29), '2029-02-28')
  assert.equal(nextRecurringDate('2026-09-01', 'weekly'), '2026-09-08')
  assert.equal(nextRecurringDate('2026-09-01', 'biweekly'), '2026-09-15')
})

test('rileva tre bollette mensili con importo variabile entro il 25%', () => {
  const common = {
    description: 'Energia Verde', merchant_name: null, counterparty_name: 'Energia Verde',
    category: 'Casa e utenze', kind: 'expense', financial_account_id: 'account-a',
    source: 'open_banking', bank_status: 'booked', internal_transfer: false,
    excluded_from_totals: false,
  }
  const candidates = detectRecurringCandidates([
    { ...common, id: '1', amount: 100, occurred_at: '2026-05-10T12:00:00Z' },
    { ...common, id: '2', amount: 118, occurred_at: '2026-06-16T12:00:00Z' },
    { ...common, id: '3', amount: 105, occurred_at: '2026-07-12T12:00:00Z' },
  ])
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].frequency, 'monthly')
  assert.equal(candidates[0].amount, 105)
})

test('rileva una ricorrenza annuale con due campioni', () => {
  const common = {
    description: 'Assicurazione casa', category: 'Assicurazioni e Finanza', kind: 'expense',
    financial_account_id: null, source: 'manual', bank_status: null,
    internal_transfer: false, excluded_from_totals: false,
  }
  const candidates = detectRecurringCandidates([
    { ...common, id: '1', amount: 250, occurred_at: '2025-08-28T12:00:00Z' },
    { ...common, id: '2', amount: 255, occurred_at: '2026-08-30T12:00:00Z' },
  ])
  assert.equal(candidates[0]?.frequency, 'annual')
})

test('non ricrea una serie rilevata che l’utente ha eliminato', () => {
  const common = {
    description: 'Palestra Centro', category: 'Cure sanitarie e Farmacia', kind: 'expense',
    financial_account_id: 'account-a', source: 'open_banking', bank_status: 'booked',
    internal_transfer: false, excluded_from_totals: false,
  }
  const rows = ['2026-05-01', '2026-06-01', '2026-07-01'].map((date, index) => ({
    ...common, id: String(index), amount: 45, occurred_at: `${date}T12:00:00Z`,
  }))
  const detected = detectRecurringCandidates(rows)
  assert.equal(detected.length, 1)
  assert.equal(detectRecurringCandidates(rows, new Set([detected[0].signature])).length, 0)
})

test('il backfill copre due anni per intercettare le ricorrenze annuali', () => {
  assert.equal(DETECTION_LOOKBACK_DAYS, 730)
})

test('ignora trasferimenti e movimenti generati dal motore', () => {
  const rows = ['2026-05-01', '2026-06-01', '2026-07-01'].map((date, index) => ({
    id: String(index), description: 'Ricorrenza falsa', amount: 50,
    category: 'Altro', kind: 'expense', occurred_at: `${date}T12:00:00Z`,
    source: 'recurring_generated', internal_transfer: false, excluded_from_totals: false,
  }))
  assert.deepEqual(detectRecurringCandidates(rows), [])
})
