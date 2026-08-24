import { randomUUID } from 'node:crypto'

import { authenticateUserRequest } from './eb/_supabase.js'

// Keeps the base64 JSON request below common serverless body limits.
const MAX_FILE_BYTES = 3 * 1024 * 1024
const DATE_HEADERS = ['data', 'date', 'operation date', 'booking date', 'data operazione', 'data contabile']
const DESCRIPTION_HEADERS = ['descrizione', 'description', 'causale', 'dettagli', 'details', 'operazione', 'merchant']
const AMOUNT_HEADERS = ['importo', 'amount', 'valore', 'totale', 'transaction amount']
const DEBIT_HEADERS = ['uscite', 'addebito', 'dare', 'debit', 'debiti']
const CREDIT_HEADERS = ['entrate', 'accredito', 'avere', 'credit', 'crediti']
const CATEGORIES = [
  'Spesa', 'Casa', 'Bollette', 'Trasporti', 'Salute', 'Ristoranti',
  'Shopping', 'Tempo libero', 'Viaggi', 'Abbonamenti', 'Educazione',
  'Assicurazioni', 'Investimenti', 'Regali', 'Stipendio', 'Rimborsi', 'Altro',
]

const aiInstructions = `Sei il motore multilingue di importazione bancaria di Flownd. Ricevi una porzione di CSV, XLSX o PDF bancario, potenzialmente con colonne e formati non standard e in qualsiasi lingua. Estrai ogni movimento reale senza inventare dati. Escludi saldi, totali e intestazioni. Se è presente sourceIndex, riportalo invariato. Seleziona semanticamente merchantName, counterpartyName, memo e bankReference; usa null quando il dato non è esplicito. description deve essere una breve etichetta leggibile derivata in ordine da merchantName, counterpartyName o memo, senza formule tecniche della banca, date, orari, numeri carta, importi o IBAN. Mantieni i nomi propri nella lingua originale. rawDescription deve contenere il testo originale rilevante solo quando sourceIndex non è disponibile. confidence è un numero tra 0 e 1. amount deve essere positivo, kind deve essere expense o income, occurredAt deve essere ISO 8601 e category deve appartenere alle categorie consentite.`

const enrichmentInstructions = `Sei il livello semantico multilingue di Flownd. Ricevi movimenti già validati per data, importo e tipo, quindi non devi rigenerare questi dati. Per ogni sourceIndex restituisci esattamente una decisione. Usa include=false per saldi iniziali/finali, disponibilità, totali, intestazioni o righe che non sono movimenti reali; include=true per le transazioni. description deve essere una sola etichetta breve, idealmente il nome dell'esercente o della controparte, mai l'intera causale bancaria e mai più di 60 caratteri. Rimuovi formule tecniche, tipo di operazione, date, orari, numeri carta, importi, valuta, IBAN e riferimenti. Mantieni i nomi propri nella lingua originale e non inventare dati. Indica con identityType se l'etichetta rappresenta merchant, counterparty, memo oppure unknown. Esempi: "Operazione Mastercard ... presso OPENMOVE.COM" diventa "OPENMOVE.COM"; "Prelievo carta ... presso CASSA RURALE ALTOGARD" diventa "CASSA RURALE ALTOGARD"; "Card purchase ... at STARBUCKS" diventa "STARBUCKS". category deve appartenere alle categorie consentite e confidence deve essere tra 0 e 1.`

const enrichmentSchema = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceIndex: { type: 'integer' },
          include: { type: 'boolean' },
          description: { type: 'string' },
          identityType: { type: 'string', enum: ['merchant', 'counterparty', 'memo', 'unknown'] },
          category: { type: 'string', enum: CATEGORIES },
          confidence: { type: 'number' },
        },
        required: ['sourceIndex', 'include', 'description', 'identityType', 'category', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
}

const transactionExtractionSchema = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceIndex: { type: ['integer', 'null'] },
          rawDescription: { type: ['string', 'null'] },
          description: { type: 'string' },
          merchantName: { type: ['string', 'null'] },
          counterpartyName: { type: ['string', 'null'] },
          memo: { type: ['string', 'null'] },
          bankReference: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          amount: { type: 'number' },
          kind: { type: 'string', enum: ['expense', 'income'] },
          occurredAt: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
        },
        required: ['sourceIndex', 'rawDescription', 'description', 'merchantName', 'counterpartyName', 'memo', 'bankReference', 'confidence', 'amount', 'kind', 'occurredAt', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['transactions'],
  additionalProperties: false,
}

function normalized(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function headerIndex(row, aliases) {
  return row.findIndex((cell) => aliases.some((alias) => normalized(cell).includes(alias)))
}

function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const negative = /^\s*\(/.test(raw) || /-\s*$/.test(raw)
  let cleaned = raw.replace(/[^\d,.-]/g, '').replace(/-$/g, '')
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    const pieces = cleaned.split('.')
    cleaned = `${pieces.slice(0, -1).join('')}.${pieces.at(-1)}`
  }
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount === 0) return null
  return negative ? -Math.abs(amount) : amount
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30, 12)
    const parsed = new Date(excelEpoch + value * 86_400_000)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  const text = String(value ?? '').trim()
  const italian = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/)
  if (italian) {
    const year = Number(italian[3].length === 2 ? `20${italian[3]}` : italian[3])
    const date = new Date(Date.UTC(year, Number(italian[2]) - 1, Number(italian[1]), 12))
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function cleanImportedText(value, limit = 500) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}

function semanticLabel(value, rawDescription) {
  const description = cleanImportedText(value, 180)
  const identity = normalized(description).replace(/[^a-z0-9]+/g, '')
  const rawIdentity = normalized(rawDescription).replace(/[^a-z0-9]+/g, '')
  if (!description) return ''
  if (
    description.length > 60
    || identity === rawIdentity
    || identity.length > 40 && rawIdentity.startsWith(identity)
  ) {
    throw new SyntaxError('AI returned a bank narrative instead of a semantic label')
  }
  return description
}

function candidate(description, signedAmount, occurredAt) {
  const cleanDescription = cleanImportedText(description, 180)
  const amount = Number(signedAmount)
  if (!cleanDescription || !occurredAt || !Number.isFinite(amount) || amount === 0) return null
  return {
    description: cleanDescription.slice(0, 180),
    rawDescription: cleanImportedText(description, 1000),
    merchantName: null,
    counterpartyName: null,
    memo: null,
    bankReference: null,
    importConfidence: 0,
    amount: Math.abs(amount),
    kind: amount < 0 ? 'expense' : 'income',
    occurredAt,
  }
}

function delimitedRows(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || ''
  const delimiter = [';', '\t', ','].sort(
    (left, right) => firstLine.split(right).length - firstLine.split(left).length,
  )[0]
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else quoted = !quoted
    } else if (character === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => String(value).trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  row.push(cell)
  if (row.some((value) => String(value).trim())) rows.push(row)
  return rows
}

export function rowsCandidates(rows, extension) {
  const headerRowIndex = rows.slice(0, 25).findIndex((row) => {
    const values = row.map(normalized)
    return headerIndex(values, DATE_HEADERS) >= 0
      && (headerIndex(values, AMOUNT_HEADERS) >= 0
        || headerIndex(values, DEBIT_HEADERS) >= 0
        || headerIndex(values, CREDIT_HEADERS) >= 0)
  })
  if (headerRowIndex < 0) {
    throw new Error(`Non riconosco le colonne del file ${extension.toUpperCase()}. Servono almeno data, descrizione e importo.`)
  }
  const headers = rows[headerRowIndex].map(normalized)
  const dateIndex = headerIndex(headers, DATE_HEADERS)
  const descriptionIndexes = headers.flatMap((header, index) =>
    DESCRIPTION_HEADERS.some((alias) => header.includes(alias)) ? [index] : [],
  )
  const amountIndex = headerIndex(headers, AMOUNT_HEADERS)
  const debitIndex = headerIndex(headers, DEBIT_HEADERS)
  const creditIndex = headerIndex(headers, CREDIT_HEADERS)
  if (!descriptionIndexes.length) throw new Error('Non trovo una colonna descrizione o causale.')

  return rows.slice(headerRowIndex + 1).map((row) => {
    const occurredAt = isoDate(row[dateIndex])
    let amount = amountIndex >= 0 ? parseAmount(row[amountIndex]) : null
    if (amount == null && debitIndex >= 0) {
      const debit = parseAmount(row[debitIndex])
      if (debit != null) amount = -Math.abs(debit)
    }
    if (amount == null && creditIndex >= 0) {
      const credit = parseAmount(row[creditIndex])
      if (credit != null) amount = Math.abs(credit)
    }
    const description = descriptionIndexes
      .map((index) => String(row[index] ?? '').trim())
      .filter(Boolean)
      .sort((first, second) => second.length - first.length)[0]
    return candidate(description, amount, occurredAt)
  }).filter(Boolean)
}

export async function spreadsheetCandidates(buffer, extension) {
  let rows
  if (extension === 'csv') {
    rows = delimitedRows(buffer.toString('utf8').replace(/^\uFEFF/, ''))
  } else {
    const { default: readXlsxFile } = await import('read-excel-file/node')
    rows = await readXlsxFile(buffer)
  }
  return rowsCandidates(rows, extension)
}

export function pdfCandidates(text) {
  const datePattern = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/g
  return text.split(/\r?\n/).flatMap((line) => {
    const dates = [...line.matchAll(datePattern)]
    if (!dates.length) return []
    const start = (dates.at(-1).index ?? 0) + dates.at(-1)[0].length
    const tail = line.slice(start)
    const amountMatch = tail.match(/(?:^|\s)([-+]?\s*(?:\d{1,3}(?:[.\s]\d{3})*|\d+)[,.]\d{2}\s*-?)(?=\s|€|EUR|$)/i)
    if (!amountMatch || amountMatch.index == null) return []
    const description = tail.slice(0, amountMatch.index).replace(/^\s*[-–|]\s*/, '')
    const amount = parseAmount(amountMatch[1])
    const occurredAt = isoDate(dates[0][1])
    const item = candidate(description, amount, occurredAt)
    return item ? [item] : []
  })
}

export function parseModelJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const objects = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(JSON.parse(clean.slice(start, index + 1)))
        start = -1
      }
    }
  }
  if (!objects.length) throw new Error('AI response contains no complete JSON object')
  if (objects.length === 1) return objects[0]
  return {
    transactions: objects.flatMap((object) =>
      Array.isArray(object?.transactions) ? object.transactions : [],
    ),
  }
}

function aiTransactions(value, chunk) {
  const items = Array.isArray(value?.transactions) ? value.transactions : []
  return items.flatMap((item) => {
    const rawAmount = Number(item?.amount)
    const date = new Date(item?.occurredAt)
    if (!item?.description || !Number.isFinite(rawAmount) || rawAmount === 0 || Number.isNaN(date.getTime())) return []
    const sourceRow = Number.isInteger(item?.sourceIndex)
      ? chunk?.sourceRows?.find((row) => row.sourceIndex === item.sourceIndex)
      : null
    const merchantName = cleanImportedText(item.merchantName, 180) || null
    const counterpartyName = cleanImportedText(item.counterpartyName, 180) || null
    const memo = cleanImportedText(item.memo, 500) || null
    const rawDescription = sourceRow?.rawDescription
      || cleanImportedText(item.rawDescription, 1000)
      || cleanImportedText(item.description, 1000)
    const description = semanticLabel(
      merchantName || counterpartyName || item.description || memo,
      rawDescription,
    )
    if (!description) return []
    return [{
      description,
      rawDescription,
      merchantName,
      counterpartyName,
      memo,
      bankReference: cleanImportedText(item.bankReference, 180) || null,
      importConfidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      amount: Math.abs(rawAmount),
      kind: item.kind === 'income' || rawAmount > 0 && item.kind !== 'expense' ? 'income' : 'expense',
      occurredAt: date.toISOString(),
      category: CATEGORIES.includes(item.category) ? item.category : 'Altro',
    }]
  })
}

function enrichedTransactions(value, candidates) {
  const rows = Array.isArray(value?.rows) ? value.rows : []
  const byIndex = new Map(rows.map((row) => [Number(row?.sourceIndex), row]))
  if (byIndex.size !== candidates.length) {
    throw new SyntaxError(`AI enrichment returned ${byIndex.size}/${candidates.length} rows`)
  }
  return candidates.flatMap((candidate, sourceIndex) => {
    const row = byIndex.get(sourceIndex)
    if (!row?.include) return []
    const description = semanticLabel(
      row.description,
      candidate.rawDescription || candidate.description,
    )
    if (!description) return []
    const identityType = ['merchant', 'counterparty', 'memo'].includes(row.identityType)
      ? row.identityType
      : 'unknown'
    return [{
      ...candidate,
      description,
      merchantName: identityType === 'merchant' ? description : null,
      counterpartyName: identityType === 'counterparty' ? description : null,
      memo: identityType === 'memo' ? description : null,
      category: CATEGORIES.includes(row.category) ? row.category : 'Altro',
      importConfidence: Math.max(0, Math.min(1, Number(row.confidence) || 0)),
    }]
  })
}

function enrichmentPrompt(candidates) {
  return JSON.stringify(candidates.map((candidate, sourceIndex) => ({
    sourceIndex,
    rawDescription: candidate.rawDescription || candidate.description,
    kind: candidate.kind,
  })))
}

async function openAIEnrich(candidates, signal) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    signal,
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_COACH_MODEL || 'gpt-5.6-sol',
      reasoning: { effort: 'low' },
      instructions: enrichmentInstructions,
      input: enrichmentPrompt(candidates),
      max_output_tokens: 12000,
      text: { format: { type: 'json_schema', name: 'transaction_enrichment', strict: true, schema: enrichmentSchema } },
    }),
  })
  const data = JSON.parse(await response.text())
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI failed with ${response.status}`)
  const output = (data.output || []).flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text
  return enrichedTransactions(parseModelJson(output), candidates)
}

async function geminiEnrich(candidates, signal) {
  const model = process.env.GEMINI_IMPORT_MODEL || process.env.GEMINI_COACH_MODEL || 'gemini-3.7-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    signal,
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: enrichmentInstructions }] },
      contents: [{ role: 'user', parts: [{ text: enrichmentPrompt(candidates) }] }],
      generationConfig: {
        responseFormat: {
          text: { mimeType: 'APPLICATION_JSON', schema: enrichmentSchema },
        },
        maxOutputTokens: 12000,
      },
    }),
  })
  const data = JSON.parse(await response.text())
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini failed with ${response.status}`)
    error.providerStatus = response.status
    throw error
  }
  const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
  const transactions = enrichedTransactions(parseModelJson(output), candidates)
  console.info('Flownd Gemini import enrichment completed', {
    model,
    inputRows: candidates.length,
    outputTransactions: transactions.length,
  })
  return transactions
}

async function openAIExtract(chunk, signal) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    signal,
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_COACH_MODEL || 'gpt-5.6-sol',
      reasoning: { effort: 'low' },
      instructions: aiInstructions,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: chunk.text },
        ...(chunk.images || []).map((imageUrl) => ({ type: 'input_image', image_url: imageUrl, detail: 'high' })),
      ] }],
      max_output_tokens: 20000,
      text: { format: { type: 'json_schema', name: 'transaction_import', strict: true, schema: transactionExtractionSchema } },
    }),
  })
  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(`OpenAI returned non-JSON (${response.status}): ${body.slice(0, 200)}`)
  }
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI failed with ${response.status}`)
  const output = (data.output || []).flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text
  return aiTransactions(parseModelJson(output), chunk)
}

async function geminiExtract(chunk, signal) {
  const model = process.env.GEMINI_IMPORT_MODEL || process.env.GEMINI_COACH_MODEL || 'gemini-3.7-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    signal,
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: aiInstructions }] },
      contents: [{ role: 'user', parts: [
        { text: chunk.text },
        ...(chunk.images || []).map((dataUrl) => {
          const [meta, data] = dataUrl.split(',', 2)
          return { inlineData: { mimeType: meta.match(/^data:([^;]+)/)?.[1] || 'image/png', data } }
        }),
      ] }],
      generationConfig: {
        responseFormat: {
          text: { mimeType: 'APPLICATION_JSON', schema: transactionExtractionSchema },
        },
        maxOutputTokens: 30000,
      },
    }),
  })
  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(`Gemini returned non-JSON (${response.status}): ${body.slice(0, 200)}`)
  }
  if (!response.ok) {
    const providerError = new Error(data?.error?.message || `Gemini failed with ${response.status}`)
    providerError.providerStatus = response.status
    providerError.providerCode = data?.error?.status || null
    throw providerError
  }
  const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
  return aiTransactions(parseModelJson(output), chunk)
}

export async function fileChunks(buffer, extension) {
  if (extension === 'csv') {
    const rows = delimitedRows(buffer.toString('utf8').replace(/^\uFEFF/, ''))
    const chunks = []
    for (let index = 0; index < rows.length; index += 120) {
      const sourceRows = rows.slice(index, index + 120).map((row, offset) => ({
        sourceIndex: index + offset,
        rawDescription: cleanImportedText(row.filter((cell) => String(cell ?? '').trim()).join(' | '), 1000),
        row,
      }))
      chunks.push({ text: `Formato CSV. Righe in JSON:\n${JSON.stringify(sourceRows.map(({ sourceIndex, row }) => ({ sourceIndex, row })))}`, sourceRows })
    }
    return chunks
  }
  if (extension === 'xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file/node')
    const rows = await readXlsxFile(buffer)
    const chunks = []
    for (let index = 0; index < rows.length; index += 120) {
      const sourceRows = rows.slice(index, index + 120).map((row, offset) => ({
        sourceIndex: index + offset,
        rawDescription: cleanImportedText(row.filter((cell) => String(cell ?? '').trim()).join(' | '), 1000),
        row,
      }))
      chunks.push({ text: `Formato foglio di calcolo. Righe in JSON:\n${JSON.stringify(sourceRows.map(({ sourceIndex, row }) => ({ sourceIndex, row })))}`, sourceRows })
    }
    return chunks
  }
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    const text = result.text?.trim()
    if (text && text.length >= 100) {
      return Array.from({ length: Math.ceil(text.length / 14000) }, (_, index) => ({
        text: `Formato PDF. Testo estratto, parte ${index + 1}:\n${text.slice(index * 14000, (index + 1) * 14000)}`,
      }))
    }
    const screenshots = await parser.getScreenshot({ first: 6, desiredWidth: 1100, imageDataUrl: true, imageBuffer: false })
    if (!screenshots.pages.length) throw new Error('PDF contains no analyzable text or pages')
    const chunks = []
    for (let index = 0; index < screenshots.pages.length; index += 2) {
      chunks.push({
        text: `Formato PDF scansionato. Analizza le pagine ${index + 1}-${Math.min(index + 2, screenshots.pages.length)}.`,
        images: screenshots.pages.slice(index, index + 2).map((page) => page.dataUrl),
      })
    }
    return chunks
  } finally {
    await parser.destroy()
  }
}

export function isTransientAiError(error) {
  const status = Number(error?.providerStatus || error?.status)
  const message = String(error?.message || '').toLowerCase()
  return error instanceof SyntaxError
    || error?.name === 'AbortError'
    || [429, 500, 502, 503, 504].includes(status)
    || message.includes('high demand')
    || message.includes('temporar')
    || message.includes('overloaded')
    || message.includes('resource exhausted')
}

export async function withAiRetry(operation, {
  attempts = 3,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (!isTransientAiError(error) || attempt === attempts - 1) throw error
      await delay(700 * 2 ** attempt + Math.floor(Math.random() * 250))
    }
  }
  throw lastError
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await operation(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

function configuredAiProvider() {
  return process.env.AI_PROVIDER?.toLowerCase() === 'gemini'
    || (!process.env.OPENAI_API_KEY && process.env.GEMINI_API_KEY)
    ? 'gemini'
    : 'openai'
}

function configuredImportModel(provider) {
  return provider === 'gemini'
    ? process.env.GEMINI_IMPORT_MODEL || process.env.GEMINI_COACH_MODEL || 'gemini-3.7-flash'
    : process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_COACH_MODEL || 'gpt-5.6-sol'
}

export async function extractFileWithAI(buffer, extension) {
  const provider = configuredAiProvider()
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')
  let localFallback = []
  if (extension === 'csv' || extension === 'xlsx') {
    try {
      localFallback = await spreadsheetCandidates(buffer, extension)
    } catch {
      // I file non standard proseguono comunque con il riconoscimento IA.
    }
  }
  const chunks = localFallback.length
    ? Array.from({ length: Math.ceil(localFallback.length / 80) }, (_, index) =>
        localFallback.slice(index * 80, (index + 1) * 80),
      )
    : await fileChunks(buffer, extension)
  if (!chunks.length) throw new Error('File contains no analyzable content')
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 30_000)
  try {
    // I blocchi semantici partono insieme per restare nel limite di Vercel,
    // limitando al tempo stesso il numero di richieste e i picchi di quota.
    const batches = await mapWithConcurrency(chunks, localFallback.length ? 3 : 2, (chunk) =>
      withAiRetry(() => localFallback.length
        ? provider === 'gemini'
          ? geminiEnrich(chunk, controller.signal)
          : openAIEnrich(chunk, controller.signal)
        : provider === 'gemini'
          ? geminiExtract(chunk, controller.signal)
          : openAIExtract(chunk, controller.signal)),
    )
    return batches.flat()
  } catch (error) {
    // Non presentare come risultato IA il parser locale: una causale integrale
    // sembrerebbe un riconoscimento riuscito e potrebbe essere importata per errore.
    throw error
  } finally {
    clearTimeout(deadline)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  const reportId = randomUUID()
  const provider = configuredAiProvider()
  const model = configuredImportModel(provider)
  try {
    await authenticateUserRequest(req)
    const name = String(req.body?.name || '')
    const base64 = String(req.body?.base64 || '')
    const extension = name.split('.').at(-1)?.toLowerCase()
    if (!['csv', 'xlsx', 'pdf'].includes(extension)) {
      throw new Error(`Unsupported file extension: ${extension || 'missing'}`)
    }
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({ error: 'Il file deve essere più piccolo di 3 MB.' })
    }

    const transactions = await extractFileWithAI(buffer, extension)
    if (!transactions.length) {
      throw new Error('AI extracted zero transactions')
    }
    console.info('Flownd transaction import completed', {
      reportId,
      provider,
      model,
      extension,
      transactions: transactions.length,
    })
    return res.status(200).json({ transactions: transactions.slice(0, 500) })
  } catch (error) {
    const transient = isTransientAiError(error)
    console.error('Flownd transaction import failed', {
      reportId,
      provider,
      model,
      providerStatus: error?.providerStatus || null,
      providerCode: error?.providerCode || null,
      transient,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    })
    return res.status(Number(error?.status) || (transient ? 503 : 500)).json({
      error: 'Si è verificato un errore. Il resoconto è stato inviato agli sviluppatori.',
      reportId,
    })
  }
}
