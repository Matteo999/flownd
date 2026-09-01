import assert from 'node:assert/strict'
import test from 'node:test'

import { DETECTION_LOOKBACK_DAYS, detectRecurringCandidates, nextRecurringDate } from './_recurring-payments.js'

const DETECTION_TODAY = new Date('2026-09-01T12:00:00Z')

function detect(rows, dismissedSignatures = new Set()) {
  return detectRecurringCandidates(rows, dismissedSignatures, new Set(), DETECTION_TODAY)
}

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
  const candidates = detect([
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
  const candidates = detect([
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
  const detected = detect(rows)
  assert.equal(detected.length, 1)
  assert.equal(detect(rows, new Set([detected[0].signature])).length, 0)
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
  assert.deepEqual(detect(rows), [])
})

test('ignora acquisti discrezionali anche quando cadono a intervalli regolari', () => {
  const common = {
    description: 'Supermercato Centrale', category: 'Cibo e Spesa', kind: 'expense',
    financial_account_id: 'account-a', source: 'open_banking', bank_status: 'booked',
    internal_transfer: false, excluded_from_totals: false,
  }
  const rows = ['2026-05-10', '2026-06-10', '2026-07-10'].map((date, index) => ({
    ...common, id: String(index), amount: 80 + index, occurred_at: `${date}T12:00:00Z`,
  }))
  assert.deepEqual(detect(rows), [])
})

test('non proietta una serie mensile terminata da diversi mesi', () => {
  const common = {
    description: 'Servizio terminato', category: 'Casa e utenze', kind: 'expense',
    financial_account_id: 'account-a', source: 'open_banking', bank_status: 'booked',
    internal_transfer: false, excluded_from_totals: false,
  }
  const rows = ['2026-01-05', '2026-02-05', '2026-03-05'].map((date, index) => ({
    ...common, id: String(index), amount: 60, occurred_at: `${date}T12:00:00Z`,
  }))
  assert.deepEqual(detect(rows), [])
})

test('rileva assicurazioni mensili con riferimenti numerici variabili', () => {
  const common = {
    category: 'Assicurazioni e Finanza', kind: 'expense', financial_account_id: 'account-a',
    source: 'open_banking', bank_status: 'booked', internal_transfer: false,
    excluded_from_totals: false, merchant_name: null, counterparty_name: null,
  }
  const rows = ['2026-06-02', '2026-07-02', '2026-08-03'].map((date, index) => ({
    ...common, id: String(index), description: `Assicurazione Aurora rata ${9000 + index}`,
    amount: 118.5, occurred_at: `${date}T12:00:00Z`,
  }))
  assert.equal(detect(rows)[0]?.frequency, 'monthly')
})

test('ignora gruppi con importi prevalentemente incompatibili', () => {
  const common = {
    description: 'Fornitore variabile', category: 'Casa e utenze', kind: 'expense',
    financial_account_id: 'account-a', source: 'open_banking', bank_status: 'booked',
    internal_transfer: false, excluded_from_totals: false,
  }
  const amounts = [20, 95, 210, 35, 170]
  const rows = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']
    .map((date, index) => ({ ...common, id: String(index), amount: amounts[index], occurred_at: `${date}T12:00:00Z` }))
  assert.deepEqual(detect(rows), [])
})
