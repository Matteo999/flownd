import assert from 'node:assert/strict'
import test from 'node:test'

import fs from 'node:fs'

import {
  extractFileWithAI,
  fileChunks,
  pdfCandidates,
  rowsCandidates,
  spreadsheetCandidates,
} from './transaction-import.js'

test('riconosce entrate e uscite da un CSV bancario italiano', async () => {
  const csv = [
    'Data;Descrizione;Importo',
    '20/08/2026;Supermercato;-45,90',
    '21/08/2026;Stipendio;2.100,00',
  ].join('\n')
  const transactions = await spreadsheetCandidates(Buffer.from(csv), 'csv')
  assert.deepEqual(
    transactions.map(({ description, amount, kind, occurredAt }) => ({
      description,
      amount,
      kind,
      day: occurredAt.slice(0, 10),
    })),
    [
      { description: 'Supermercato', amount: 45.9, kind: 'expense', day: '2026-08-20' },
      { description: 'Stipendio', amount: 2100, kind: 'income', day: '2026-08-21' },
    ],
  )
})

test('riconosce colonne dare e avere da righe XLSX', () => {
  const transactions = rowsCandidates([
    ['Data operazione', 'Causale', 'Addebito', 'Accredito'],
    ['19/08/2026', 'Bolletta luce', '82,40', ''],
    ['20/08/2026', 'Rimborso', '', '15,00'],
  ], 'xlsx')
  assert.deepEqual(transactions.map(({ amount, kind }) => ({ amount, kind })), [
    { amount: 82.4, kind: 'expense' },
    { amount: 15, kind: 'income' },
  ])
})

test('estrae una riga da PDF testuale senza usare IA', () => {
  const transactions = pdfCandidates('20/08/2026 21/08/2026 PAGAMENTO CARTA SUPERMERCATO -45,90 EUR')
  assert.equal(transactions.length, 1)
  assert.equal(transactions[0].description, 'PAGAMENTO CARTA SUPERMERCATO')
  assert.equal(transactions[0].amount, 45.9)
  assert.equal(transactions[0].kind, 'expense')
})

test('suddivide il CSV reale in blocchi adatti alla IA', async () => {
  const chunks = await fileChunks(
    fs.readFileSync(new URL('../prompt/2147483647.csv', import.meta.url)),
    'csv',
  )
  assert.equal(chunks.length, 4)
  assert.ok(chunks.every((chunk) => chunk.text.startsWith('Formato CSV.')))
})

test('ricompone risposte IA JSON da più blocchi senza esporre errori di parsing', async () => {
  const previousFetch = globalThis.fetch
  const previousProvider = process.env.AI_PROVIDER
  const previousKey = process.env.GEMINI_API_KEY
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-key'
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      transactions: [{
        description: 'Movimento di test',
        amount: 12.34,
        kind: 'expense',
        occurredAt: '2026-08-21T12:00:00.000Z',
        category: 'Altro',
      }],
    }) }] } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  try {
    const transactions = await extractFileWithAI(
      fs.readFileSync(new URL('../prompt/2147483647.csv', import.meta.url)),
      'csv',
    )
    assert.equal(transactions.length, 4)
    assert.ok(transactions.every((item) => item.amount === 12.34))
  } finally {
    globalThis.fetch = previousFetch
    if (previousProvider == null) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = previousProvider
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})
