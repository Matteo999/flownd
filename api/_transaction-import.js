import { randomUUID } from 'node:crypto'
import { waitUntil } from '@vercel/functions'

import { geminiStructuredGenerationConfig } from './_gemini-config.js'
import { authenticateRequest } from './eb/_supabase.js'

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
  'Assicurazioni', 'Investimenti', 'Regali', 'Stipendio', 'Rimborsi', 'Giroconto', 'Altro',
]

const aiInstructions = `Sei il motore multilingue di importazione bancaria di Flownd. Ricevi una porzione di CSV, XLSX o PDF bancario, potenzialmente con colonne e formati non standard e in qualsiasi lingua. Estrai ogni movimento reale senza inventare dati. Escludi saldi, totali e intestazioni. Se è presente sourceIndex, riportalo invariato. Seleziona semanticamente merchantName, counterpartyName, memo e bankReference; usa null quando il dato non è esplicito. description deve essere una breve etichetta leggibile derivata in ordine da merchantName, counterpartyName o memo, senza formule tecniche della banca, date, orari, numeri carta, importi o IBAN. Mantieni i nomi propri nella lingua originale. rawDescription deve contenere il testo originale rilevante solo quando sourceIndex non è disponibile. Usa Giroconto solo quando il testo indica esplicitamente un trasferimento fra conti dello stesso titolare, mai per un normale bonifico a terzi. confidence è un numero tra 0 e 1. amount deve essere positivo, kind deve essere expense o income. occurredAt deve contenere la data della transazione in ISO 8601. Se nel documento o nella causale è presente un orario esplicito, riportalo separatamente come occurredTime nel formato HH:mm; altrimenti occurredTime deve essere null. Non inventare mai 00:00, 01:00 o un altro orario predefinito. category deve appartenere alle categorie consentite.`

const enrichmentInstructions = `Sei il livello semantico multilingue di Flownd. Ricevi movimenti già validati per data, importo e tipo, quindi non devi rigenerare questi dati. Per ogni sourceIndex restituisci esattamente una decisione. Usa include=false per saldi iniziali/finali, disponibilità, totali, intestazioni o righe che non sono movimenti reali; include=true per le transazioni. description deve essere una sola etichetta breve, idealmente il nome dell'esercente o della controparte, mai l'intera causale bancaria e mai più di 60 caratteri. Rimuovi formule tecniche, tipo di operazione, date, orari, numeri carta, importi, valuta, IBAN e riferimenti. Mantieni i nomi propri nella lingua originale e non inventare dati. Indica con identityType se l'etichetta rappresenta merchant, counterparty, memo oppure unknown. Usa Giroconto solo quando la causale indica esplicitamente un trasferimento fra conti dello stesso titolare, mai per un normale bonifico a terzi. Se nella causale è esplicitamente presente un orario, restituiscilo come occurredTime nel formato HH:mm; altrimenti usa null. Esempi: "Operazione Mastercard ... presso OPENMOVE.COM" diventa "OPENMOVE.COM"; "Prelievo carta ... presso CASSA RURALE ALTOGARD" diventa "CASSA RURALE ALTOGARD"; "Card purchase ... at STARBUCKS" diventa "STARBUCKS". category deve appartenere alle categorie consentite e confidence deve essere tra 0 e 1.`

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
          description: { type: 'string', maxLength: 60 },
          identityType: { type: 'string', enum: ['merchant', 'counterparty', 'memo', 'unknown'] },
          occurredTime: { type: ['string', 'null'] },
          category: { type: 'string', enum: CATEGORIES },
          confidence: { type: 'number' },
        },
        required: ['sourceIndex', 'include', 'description', 'identityType', 'occurredTime', 'category', 'confidence'],
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
          occurredTime: { type: ['string', 'null'] },
          category: { type: 'string', enum: CATEGORIES },
        },
        required: ['sourceIndex', 'rawDescription', 'description', 'merchantName', 'counterpartyName', 'memo', 'bankReference', 'confidence', 'amount', 'kind', 'occurredAt', 'occurredTime', 'category'],
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
  const italian = text.match(
    /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\s+(?:alle\s+ore\s+)?([01]?\d|2[0-3])[:.]([0-5]\d))?\b/i,
  )
  if (italian) {
    const year = Number(italian[3].length === 2 ? `20${italian[3]}` : italian[3])
    const hour = italian[4] == null ? 12 : Number(italian[4])
    const minute = italian[5] == null ? 0 : Number(italian[5])
    const date = new Date(
      Date.UTC(year, Number(italian[2]) - 1, Number(italian[1]), hour, minute),
    )
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

function explicitTime(value) {
  const match = String(value ?? '').match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/)
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}:00` : null
}

function calendarDateAtNoon(value) {
  const raw = String(value ?? '')
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}T12:00:00.000Z`
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, '0'),
    String(parsed.getUTCDate()).padStart(2, '0'),
  ].join('-') + 'T12:00:00.000Z'
}

export function normalizedImportedTime(transaction) {
  const occurredAt = calendarDateAtNoon(transaction?.occurredAt)
  const occurredTime = explicitTime(transaction?.occurredTime)
    || explicitTime(transaction?.rawDescription)
  return {
    ...transaction,
    ...(occurredAt ? { occurredAt } : {}),
    occurredTime,
    occurredTimeSource: occurredTime
      ? transaction?.occurredTimeSource || 'narrative'
      : null,
  }
}

function semanticLabel(value, rawDescription) {
  const description = cleanImportedText(value, 180)
  const raw = cleanImportedText(rawDescription, 1000)
  const identity = normalized(description).replace(/[^a-z0-9]+/g, '')
  const rawIdentity = normalized(raw).replace(/[^a-z0-9]+/g, '')
  const rawLooksLikeNarrative = raw.length > 60 || raw.split(/\s+/).length > 8
  if (!description) return ''
  if (
    description.length > 60
    || identity === rawIdentity && rawLooksLikeNarrative
    || identity.length > 40 && rawIdentity.startsWith(identity)
  ) {
    throw new SyntaxError('AI returned a bank narrative instead of a semantic label')
  }
  return description
}

function candidate(
  description,
  signedAmount,
  occurredAt,
  occurredTime = null,
  occurredTimeSource = null,
) {
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
    occurredTime,
    occurredTimeSource,
  }
}

function structuredTime(value) {
  if (typeof value === 'string') return explicitTime(value)
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hour = value.getUTCHours()
    const minute = value.getUTCMinutes()
    return hour || minute
      ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
      : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const minutes = Math.round((value - Math.floor(value)) * 24 * 60) % (24 * 60)
    return minutes
      ? `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`
      : null
  }
  return null
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
    const occurredTime = structuredTime(row[dateIndex])
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
    return candidate(
      description,
      amount,
      occurredAt,
      occurredTime,
      occurredTime ? 'structured' : null,
    )
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
    const occurredAt = calendarDateAtNoon(item?.occurredAt)
    if (!item?.description || !Number.isFinite(rawAmount) || rawAmount === 0 || !occurredAt) return []
    const sourceRow = Number.isInteger(item?.sourceIndex)
      ? chunk?.sourceRows?.find((row) => row.sourceIndex === item.sourceIndex)
      : null
    const merchantName = cleanImportedText(item.merchantName, 180) || null
    const counterpartyName = cleanImportedText(item.counterpartyName, 180) || null
    const memo = cleanImportedText(item.memo, 500) || null
    const rawDescription = sourceRow?.rawDescription
      || cleanImportedText(item.rawDescription, 1000)
      || cleanImportedText(item.description, 1000)
    const occurredTime = explicitTime(item.occurredTime) || explicitTime(rawDescription)
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
      occurredAt,
      occurredTime,
      occurredTimeSource: occurredTime ? 'narrative' : null,
      category: CATEGORIES.includes(item.category) ? item.category : 'Altro',
    }]
  })
}

export function enrichedTransactions(value, candidates) {
  const rows = Array.isArray(value?.rows) ? value.rows : []
  const byIndex = new Map(rows.map((row) => [Number(row?.sourceIndex), row]))
  if (byIndex.size !== candidates.length) {
    throw new SyntaxError(`AI enrichment returned ${byIndex.size}/${candidates.length} rows`)
  }
  let rejectedNarratives = 0
  const transactions = candidates.flatMap((candidate, sourceIndex) => {
    const row = byIndex.get(sourceIndex)
    if (!row?.include) return []
    let description
    let invalidDescription = false
    try {
      description = semanticLabel(
        row.description,
        candidate.rawDescription || candidate.description,
      )
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      rejectedNarratives += 1
      invalidDescription = true
      description = 'Transazione da verificare'
    }
    if (!description) return []
    const identityType = !invalidDescription
      && ['merchant', 'counterparty', 'memo'].includes(row.identityType)
      ? row.identityType
      : 'unknown'
    const occurredTime = explicitTime(candidate.occurredTime)
      || explicitTime(row.occurredTime)
      || explicitTime(candidate.rawDescription)
    const occurredAt = calendarDateAtNoon(candidate.occurredAt)
    if (!occurredAt) return []
    return [{
      ...candidate,
      occurredAt,
      occurredTime,
      occurredTimeSource: occurredTime
        ? candidate.occurredTimeSource || 'narrative'
        : null,
      description,
      merchantName: identityType === 'merchant' ? description : null,
      counterpartyName: identityType === 'counterparty' ? description : null,
      memo: identityType === 'memo' ? description : null,
      category: CATEGORIES.includes(row.category) ? row.category : 'Altro',
      importConfidence: invalidDescription
        ? 0
        : Math.max(0, Math.min(1, Number(row.confidence) || 0)),
    }]
  })
  if (rejectedNarratives) {
    console.warn('Flownd AI enrichment rejected narrative labels', {
      rejectedNarratives,
      reviewTransactions: rejectedNarratives,
      totalTransactions: transactions.length,
    })
  }
  return transactions
}

function enrichmentPrompt(candidates) {
  return JSON.stringify(candidates.map((candidate, sourceIndex) => ({
    sourceIndex,
    rawDescription: candidate.rawDescription || candidate.description,
    kind: candidate.kind,
    occurredAt: candidate.occurredAt,
    occurredTime: candidate.occurredTime ?? null,
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
      generationConfig: geminiStructuredGenerationConfig(model, enrichmentSchema, 20000),
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
        ...(chunk.files || []).map((file) => ({
          type: 'input_file',
          filename: file.filename,
          file_data: file.dataUrl,
        })),
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
        ...[...(chunk.files || []).map((file) => file.dataUrl), ...(chunk.images || [])].map((dataUrl) => {
          const [meta, data] = dataUrl.split(',', 2)
          return { inlineData: { mimeType: meta.match(/^data:([^;]+)/)?.[1] || 'image/png', data } }
        }),
      ] }],
      generationConfig: geminiStructuredGenerationConfig(model, transactionExtractionSchema, 30000),
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
  if (extension === 'pdf') {
    return [{
      text: 'Formato PDF bancario. Analizza tutte le pagine del documento allegato ed estrai esclusivamente i movimenti reali.',
      files: [{
        filename: 'estratto-conto.pdf',
        dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
      }],
    }]
  }
  throw new Error('Unsupported file format')
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

export function configuredImportTimeoutMs() {
  const configured = Number(process.env.AI_IMPORT_TIMEOUT_MS)
  if (!Number.isFinite(configured) || configured <= 0) return 240_000
  return Math.max(30_000, Math.min(270_000, Math.round(configured)))
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
  const fileParts = localFallback.length ? [] : await fileChunks(buffer, extension)
  if (!localFallback.length && !fileParts.length) throw new Error('File contains no analyzable content')
  const input = localFallback.length
    ? localFallback
    : {
        text: fileParts.map((part) => part.text).join('\n\n'),
        files: fileParts.flatMap((part) => part.files || []),
        images: fileParts.flatMap((part) => part.images || []),
        sourceRows: fileParts.flatMap((part) => part.sourceRows || []),
      }
  const controller = new AbortController()
  const timeoutMs = configuredImportTimeoutMs()
  const requestStartedAt = Date.now()
  const deadline = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Una sola richiesta per file. Eventuali retry sono lasciati all'utente per
    // evitare chiamate fatturate multiple quando il provider è saturo.
    return localFallback.length
      ? provider === 'gemini'
        ? await geminiEnrich(input, controller.signal)
        : await openAIEnrich(input, controller.signal)
      : provider === 'gemini'
        ? await geminiExtract(input, controller.signal)
        : await openAIExtract(input, controller.signal)
  } catch (error) {
    // Non presentare come risultato IA il parser locale: una causale integrale
    // sembrerebbe un riconoscimento riuscito e potrebbe essere importata per errore.
    if (error && typeof error === 'object') {
      error.aiElapsedMs = Date.now() - requestStartedAt
      error.aiTimeoutMs = timeoutMs
    }
    throw error
  } finally {
    clearTimeout(deadline)
  }
}

async function notifyImport(service, userId, title, body, actionRoute = null) {
  const { error } = await service.from('goal_notifications').insert({
    user_id: userId,
    title,
    body,
    action_route: actionRoute,
  })
  if (error) throw error
}

export async function processImportJob({
  service,
  job,
  reportId,
  provider,
  model,
  extract = extractFileWithAI,
}) {
  const jobStartedAt = Date.now()
  const startedAt = new Date().toISOString()
  try {
    const { error: startError } = await service
      .from('transaction_import_jobs')
      .update({ status: 'processing', started_at: startedAt })
      .eq('id', job.id)
      .eq('status', 'queued')
    if (startError) throw startError

    const buffer = Buffer.from(job.base64, 'base64')
    const transactions = await extract(buffer, job.extension)
    if (!transactions.length) throw new Error('AI extracted zero transactions')
    const completedAt = new Date().toISOString()
    const { error: completeError } = await service
      .from('transaction_import_jobs')
      .update({
        status: 'completed',
        result: { transactions: transactions.slice(0, 500) },
        file_base64: null,
        completed_at: completedAt,
      })
      .eq('id', job.id)
    if (completeError) throw completeError
    try {
      await notifyImport(
        service,
        job.userId,
        'Importazione pronta',
        `${transactions.length} transazioni riconosciute da ${job.name}. Tocca per controllarle.`,
        `/transaction-import?mode=file&jobId=${encodeURIComponent(job.id)}`,
      )
    } catch (notificationError) {
      console.error('Flownd import completion notification failed', { reportId, notificationError })
    }
    console.info('Flownd transaction import job completed', {
      reportId,
      jobId: job.id,
      provider,
      model,
      transactions: transactions.length,
      elapsedMs: Date.now() - jobStartedAt,
    })
  } catch (error) {
    const transient = isTransientAiError(error)
    await service
      .from('transaction_import_jobs')
      .update({
        status: 'failed',
        file_base64: null,
        report_id: reportId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    try {
      await notifyImport(
        service,
        job.userId,
        'Importazione non completata',
        'Il provider IA non ha completato l’elaborazione. Puoi riprovare quando vuoi.',
      )
    } catch (notificationError) {
      console.error('Flownd import failure notification failed', { reportId, notificationError })
    }
    console.error('Flownd transaction import job failed', {
      reportId,
      jobId: job.id,
      provider,
      model,
      providerStatus: error?.providerStatus || null,
      providerCode: error?.providerCode || null,
      transient,
      elapsedMs: error?.aiElapsedMs || Date.now() - jobStartedAt,
      timeoutMs: error?.aiTimeoutMs || configuredImportTimeoutMs(),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    })
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  const reportId = randomUUID()
  const provider = configuredAiProvider()
  const model = configuredImportModel(provider)
  try {
    const { user, client, service } = await authenticateRequest(req)
    if (req.method === 'GET') {
      const jobId = String(req.query?.jobId || '')
      if (!jobId) return res.status(400).json({ error: 'Job mancante' })
      const { data, error } = await client
        .from('transaction_import_jobs')
        .select('id,status,result,file_name,created_at,completed_at')
        .eq('id', jobId)
        .single()
      if (error || !data) return res.status(404).json({ error: 'Importazione non disponibile' })
      return res.status(200).json({
        id: data.id,
        status: data.status,
        fileName: data.file_name,
        transactions: data.status === 'completed'
          ? (data.result?.transactions || []).map(normalizedImportedTime)
          : [],
      })
    }
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

    const { data: created, error: createError } = await service
      .from('transaction_import_jobs')
      .insert({
        user_id: user.id,
        file_name: name.slice(0, 255),
        file_extension: extension,
        file_base64: base64,
        status: 'queued',
        provider,
        model,
        report_id: reportId,
      })
      .select('id')
      .single()
    if (createError || !created) throw createError || new Error('Import job creation failed')
    const task = processImportJob({
      service,
      job: { id: created.id, userId: user.id, name, extension, base64 },
      reportId,
      provider,
      model,
    })
    if (process.env.VERCEL) waitUntil(task)
    else void task
    return res.status(202).json({ id: created.id, status: 'queued' })
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
