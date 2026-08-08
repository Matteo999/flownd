import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  chooseBalance,
  normalizeBankTransaction,
  redactBankPayload,
} from './_normalize.js'

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
