import assert from 'node:assert/strict'
import test from 'node:test'

import fs from 'node:fs'

import {
  configuredImportTimeoutMs,
  enrichedTransactions,
  extractFileWithAI,
  fileChunks,
  isTransientAiError,
  parseModelJson,
  pdfCandidates,
  processImportJob,
  rowsCandidates,
  spreadsheetCandidates,
} from './_transaction-import.js'

test('usa quattro minuti per il job IA e limita valori fuori soglia', () => {
  const previous = process.env.AI_IMPORT_TIMEOUT_MS
  try {
    delete process.env.AI_IMPORT_TIMEOUT_MS
    assert.equal(configuredImportTimeoutMs(), 240_000)
    process.env.AI_IMPORT_TIMEOUT_MS = '5000'
    assert.equal(configuredImportTimeoutMs(), 30_000)
    process.env.AI_IMPORT_TIMEOUT_MS = '999999'
    assert.equal(configuredImportTimeoutMs(), 270_000)
  } finally {
    if (previous == null) delete process.env.AI_IMPORT_TIMEOUT_MS
    else process.env.AI_IMPORT_TIMEOUT_MS = previous
  }
})

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

test('mantiene ore e minuti presenti nella colonna data', () => {
  const [transaction] = rowsCandidates([
    ['Data operazione', 'Causale', 'Importo'],
    ['05/03/2026 07:38', 'Biglietto treno', '-2,95'],
  ], 'xlsx')
  assert.equal(transaction.occurredAt, '2026-03-05T07:38:00.000Z')
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

test('analizza tutto il CSV con una sola richiesta IA', async () => {
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
          occurredTime: null,
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
    assert.equal(requests.length, 1)
    assert.equal(JSON.parse(requests[0].contents[0].parts[0].text).length, 235)
    assert.equal(requests[0].generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON')
    assert.equal(requests[0].generationConfig.thinkingConfig.thinkingLevel, 'LOW')
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
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
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
    assert.equal(calls, 1)
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
          occurredTime: null,
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

test('riconosce gli errori temporanei senza avviare retry automatici', () => {
  assert.equal(isTransientAiError(new Error('high demand')), true)
  assert.equal(isTransientAiError(Object.assign(new Error('unavailable'), { providerStatus: 503 })), true)
})

test('conserva l’orario esplicito per distinguere movimenti uguali nello stesso giorno', () => {
  const base = {
    description: 'Operazione carta',
    rawDescription: 'Operazione carta alle ore 07:38 presso OPENMOVE.COM',
    amount: 2.95,
    kind: 'expense',
    occurredAt: '2026-03-05T12:00:00.000Z',
  }
  const [transaction] = enrichedTransactions({
    rows: [{
      sourceIndex: 0,
      include: true,
      description: 'OPENMOVE.COM',
      identityType: 'merchant',
      occurredTime: '07:38',
      category: 'Trasporti',
      confidence: 0.98,
    }],
  }, [base])
  assert.equal(transaction.occurredAt, '2026-03-05T07:38:00.000Z')
})

test('completa un job persistente e crea la notifica che apre la revisione', async () => {
  const operations = []
  const service = {
    from(table) {
      return {
        insert(values) {
          operations.push({ table, type: 'insert', values })
          return Promise.resolve({ error: null })
        },
        update(values) {
          operations.push({ table, type: 'update', values })
          const query = {
            eq() { return query },
            then(resolve) { resolve({ error: null }) },
          }
          return query
        },
      }
    },
  }
  await processImportJob({
    service,
    job: {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      name: 'movimenti.csv',
      extension: 'csv',
      base64: Buffer.from('file').toString('base64'),
    },
    reportId: '33333333-3333-4333-8333-333333333333',
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    extract: async () => [{ description: 'Openmove', amount: 2.95 }],
  })
  const completion = operations.find(
    (item) => item.table === 'transaction_import_jobs' && item.values.status === 'completed',
  )
  assert.equal(completion.values.file_base64, null)
  assert.equal(completion.values.result.transactions[0].description, 'Openmove')
  const notification = operations.find((item) => item.table === 'goal_notifications')
  assert.match(notification.values.action_route, /jobId=11111111/)
})
