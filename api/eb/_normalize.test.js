import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  chooseBalance,
  normalizeAccount,
  normalizeBankTransaction,
  redactBankPayload,
} from './_normalize.js'

test('riconosce gli Space N26 disabilitati', () => {
  assert.equal(
    normalizeAccount(
      {
        uid: 'space-inattivo',
        identification_hash: 'hash',
        details: 'Vecchio Space',
        psu_status: 'disabled',
      },
      'N26',
    ).active,
    false,
  )
  assert.equal(
    normalizeAccount(
      {
        uid: 'conto-principale',
        identification_hash: 'hash-2',
        details: 'Conto principale',
        psu_status: 'enabled',
      },
      'N26',
    ).active,
    true,
  )
})

test('prioritizza il saldo disponibile e supporta ITBD di ING', () => {
  assert.equal(
    chooseBalance({
      balances: [
        { balance_type: 'XPCD', balance_amount: { amount: '120', currency: 'EUR' } },
        { balance_type: 'ITBD', balance_amount: { amount: '95', currency: 'EUR' } },
      ],
    }).amount,
    95,
  )
})

test('mantiene anche gli entry_reference brevi restituiti da ING', () => {
  const transaction = normalizeBankTransaction(
    {
      entry_reference: '9127',
      transaction_id: null,
      transaction_amount: { amount: '12.40', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      booking_date: '2026-07-12',
      value_date: '2026-07-11',
      remittance_information: ['Pagamento carta presso BAR CENTRALE'],
    },
    'conto-ing',
  )
  assert.equal(transaction.stableKey, 'entry:9127')
  assert.equal(transaction.occurredOn, '2026-07-11')
  assert.equal(transaction.category, 'Bar e ristoranti')
})

test('usa un fingerprint idempotente nei payload CRBZ senza identificativi', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('./raw_payload/26.08.07 - Raw Payload CRBZ.json', import.meta.url)),
  )
  const raw = fixture.transactions.raw.transactions[0]
  const first = normalizeBankTransaction(raw, fixture.selectedAccount.identificationHash || 'crbz')
  const second = normalizeBankTransaction(raw, fixture.selectedAccount.identificationHash || 'crbz')
  assert.match(first.stableKey, /^fingerprint:/)
  assert.equal(first.stableKey, second.stableKey)
  assert.equal(first.description, 'Matteo La Mendola')
  assert.equal(first.transferHint, true)
  assert.equal(first.kind, 'income')
})

test('oscura gli IBAN anche dentro payload annidati', () => {
  assert.deepEqual(
    redactBankPayload({ debtor_account: { iban: 'IT60J0347501605CC0011934970' } }),
    { debtor_account: { iban: '••••4970' } },
  )
})

test('distingue tredicesima e rimborso dalle entrate ordinarie', () => {
  const base = {
    transaction_amount: { amount: '1000', currency: 'EUR' },
    credit_debit_indicator: 'CRDT',
    status: 'BOOK',
    booking_date: '2026-12-18',
  }
  const thirteenth = normalizeBankTransaction(
    { ...base, remittance_information: ['Erogazione tredicesima'] },
    'conto',
  )
  const reimbursement = normalizeBankTransaction(
    { ...base, remittance_information: ['Rimborso spese trasferta'] },
    'conto',
  )
  assert.equal(thirteenth.category, 'Tredicesima')
  assert.equal(reimbursement.category, 'Rimborso spese')
  assert.equal(reimbursement.refundHint, true)
})

test('riconosce i supermercati presenti negli import reali', () => {
  const transaction = normalizeBankTransaction(
    {
      transaction_amount: { amount: '34.20', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      booking_date: '2026-08-10',
      remittance_information: ['Pagamento POS supermercati Orvea'],
    },
    'conto',
  )
  assert.equal(transaction.category, 'Cibo e Spesa')
})
