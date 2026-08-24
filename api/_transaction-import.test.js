import assert from 'node:assert/strict'
import test from 'node:test'

import fs from 'node:fs'

import {
  extractFileWithAI,
  fileChunks,
  isTransientAiError,
  parseModelJson,
  pdfCandidates,
  rowsCandidates,
  spreadsheetCandidates,
  withAiRetry,
} from './_transaction-import.js'

test('accetta più oggetti JSON consecutivi restituiti dal modello', () => {
  const parsed = parseModelJson([
    '```json',
    '{"transactions":[{"description":"Prima"}]}',
    '{"transactions":[{"description":"Seconda"}]}',
    '```',
  ].join('\n'))
  assert.deepEqual(
    parsed.transactions.map((transaction) => transaction.description),
    ['Prima', 'Seconda'],
  )
})

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
  assert.equal(chunks.length, 2)
  assert.ok(chunks.every((chunk) => chunk.text.startsWith('Formato CSV.')))
})

test('ricompone risposte IA JSON da più blocchi senza esporre errori di parsing', async () => {
  const previousFetch = globalThis.fetch
  const previousProvider = process.env.AI_PROVIDER
  const previousKey = process.env.GEMINI_API_KEY
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-key'
  const requests = []
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    requests.push(request)
    const inputRows = JSON.parse(request.contents[0].parts[0].text)
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        rows: inputRows.map((row) => ({
          sourceIndex: row.sourceIndex,
          include: !/^Saldo/i.test(row.rawDescription),
          description: 'Openmove',
          identityType: 'merchant',
          category: 'Trasporti',
          confidence: 0.98,
        })),
      }) }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const transactions = await extractFileWithAI(
      fs.readFileSync(new URL('../prompt/2147483647.csv', import.meta.url)),
      'csv',
    )
    assert.ok(transactions.length > 200)
    assert.ok(transactions.every((item) => item.description === 'Openmove'))
    assert.ok(transactions.every((item) => item.merchantName === 'Openmove'))
    assert.ok(transactions.every((item) => item.rawDescription))
    assert.ok(transactions.every((item) => item.category === 'Trasporti'))
    assert.ok(transactions.every((item) => item.importConfidence === 0.98))
    assert.ok(transactions.every((item) => !/^Saldo/i.test(item.rawDescription)))
    assert.equal(requests.length, 3)
    assert.equal(requests[0].generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON')
    assert.equal(requests[0].generationConfig.responseFormat.text.schema.required[0], 'rows')
  } finally {
    globalThis.fetch = previousFetch
    if (previousProvider == null) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = previousProvider
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('non presenta il riconoscimento locale come risultato IA se il provider non risponde', async () => {
  const previousFetch = globalThis.fetch
  const previousProvider = process.env.AI_PROVIDER
  const previousKey = process.env.GEMINI_API_KEY
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-key'
  globalThis.fetch = async () => {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    throw error
  }
  try {
    await assert.rejects(
      extractFileWithAI(
        fs.readFileSync(new URL('../prompt/2147483647.csv', import.meta.url)),
        'csv',
      ),
      /aborted/,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousProvider == null) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = previousProvider
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('rifiuta una causale bancaria integrale restituita come descrizione IA', async () => {
  const previousFetch = globalThis.fetch
  const previousProvider = process.env.AI_PROVIDER
  const previousKey = process.env.GEMINI_API_KEY
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-key'
  const narrative = 'Operazione Mastercard del 05/03/2026 alle ore 07:38 con Carta xxxxxxxxxxxx0593 presso OPENMOVE.COM'
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    const inputRows = JSON.parse(request.contents[0].parts[0].text)
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        rows: inputRows.map((row) => ({
          sourceIndex: row.sourceIndex,
          include: true,
          description: narrative,
          identityType: 'merchant',
          category: 'Trasporti',
          confidence: 0.9,
        })),
      }) }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    await assert.rejects(
      extractFileWithAI(
        Buffer.from(`Data;Descrizione;Importo\n05/03/2026;${narrative};-2,95`),
        'csv',
      ),
      /bank narrative/,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousProvider == null) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = previousProvider
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('ritenta gli errori temporanei di capacità del provider', async () => {
  let calls = 0
  const result = await withAiRetry(async () => {
    calls += 1
    if (calls < 3) throw new Error('This model is currently experiencing high demand.')
    return 'ok'
  }, { delay: async () => {} })
  assert.equal(result, 'ok')
  assert.equal(calls, 3)
  assert.equal(isTransientAiError(new Error('high demand')), true)
})

test('ritenta una risposta JSON malformata del modello', async () => {
  let calls = 0
  const result = await withAiRetry(async () => {
    calls += 1
    if (calls === 1) JSON.parse('{"transactions":')
    return 'ok'
  }, { delay: async () => {} })
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})

test('non ritenta gli errori permanenti del provider', async () => {
  let calls = 0
  await assert.rejects(
    withAiRetry(async () => {
      calls += 1
      throw new Error('API key not valid')
    }, { delay: async () => {} }),
    /API key not valid/,
  )
  assert.equal(calls, 1)
})
