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

const aiInstructions = `Sei il motore di importazione bancaria di Flownd. Ricevi una porzione di CSV, XLSX o PDF bancario, potenzialmente con colonne e formati non standard. Estrai ogni movimento reale senza inventare dati. Escludi saldi iniziali/finali, totali e intestazioni. Usa la descrizione più informativa disponibile (esercente, beneficiario o causale specifica), non una voce generica come "Pagamento carta" se è visibile un dettaglio migliore. amount deve essere positivo, kind deve essere expense o income, occurredAt deve essere ISO 8601 e category deve appartenere alle categorie consentite.`

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

function candidate(description, signedAmount, occurredAt) {
  const cleanDescription = String(description ?? '').replace(/\s+/g, ' ').trim()
  const amount = Number(signedAmount)
  if (!cleanDescription || !occurredAt || !Number.isFinite(amount) || amount === 0) return null
  return {
    description: cleanDescription.slice(0, 180),
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
  const descriptionIndex = headerIndex(headers, DESCRIPTION_HEADERS)
  const amountIndex = headerIndex(headers, AMOUNT_HEADERS)
  const debitIndex = headerIndex(headers, DEBIT_HEADERS)
  const creditIndex = headerIndex(headers, CREDIT_HEADERS)
  if (descriptionIndex < 0) throw new Error('Non trovo una colonna descrizione o causale.')

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
    return candidate(row[descriptionIndex], amount, occurredAt)
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

function parseModelJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('AI response contains no JSON object')
  return JSON.parse(clean.slice(start, end + 1))
}

function aiTransactions(value) {
  const items = Array.isArray(value?.transactions) ? value.transactions : []
  return items.flatMap((item) => {
    const rawAmount = Number(item?.amount)
    const date = new Date(item?.occurredAt)
    if (!item?.description || !Number.isFinite(rawAmount) || rawAmount === 0 || Number.isNaN(date.getTime())) return []
    return [{
      description: String(item.description).replace(/\s+/g, ' ').trim().slice(0, 180),
      amount: Math.abs(rawAmount),
      kind: item.kind === 'income' || rawAmount > 0 && item.kind !== 'expense' ? 'income' : 'expense',
      occurredAt: date.toISOString(),
      category: CATEGORIES.includes(item.category) ? item.category : 'Altro',
    }]
  })
}

async function openAIExtract(chunk) {
  const response = await fetch('https://api.openai.com/v1/responses', {
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
      text: { format: { type: 'json_schema', name: 'transaction_import', strict: true, schema: {
        type: 'object',
        properties: { transactions: { type: 'array', items: { type: 'object', properties: {
          description: { type: 'string' }, amount: { type: 'number' }, kind: { type: 'string', enum: ['expense', 'income'] },
          occurredAt: { type: 'string' }, category: { type: 'string', enum: CATEGORIES },
        }, required: ['description', 'amount', 'kind', 'occurredAt', 'category'], additionalProperties: false } } },
        required: ['transactions'], additionalProperties: false,
      } } },
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
  return aiTransactions(parseModelJson(output))
}

async function geminiExtract(chunk) {
  const model = process.env.GEMINI_IMPORT_MODEL || process.env.GEMINI_COACH_MODEL || 'gemini-3.6-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 30000 },
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
  return aiTransactions(parseModelJson(output))
}

export async function fileChunks(buffer, extension) {
  if (extension === 'csv') {
    const rows = delimitedRows(buffer.toString('utf8').replace(/^\uFEFF/, ''))
    const chunks = []
    for (let index = 0; index < rows.length; index += 60) {
      chunks.push({ text: `Formato CSV. Righe in JSON:\n${JSON.stringify(rows.slice(index, index + 60))}` })
    }
    return chunks
  }
  if (extension === 'xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file/node')
    const rows = await readXlsxFile(buffer)
    const chunks = []
    for (let index = 0; index < rows.length; index += 60) {
      chunks.push({ text: `Formato foglio di calcolo. Righe in JSON:\n${JSON.stringify(rows.slice(index, index + 60))}` })
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
  return [429, 500, 502, 503, 504].includes(status)
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

export async function extractFileWithAI(buffer, extension) {
  const provider = process.env.AI_PROVIDER?.toLowerCase() === 'gemini' || (!process.env.OPENAI_API_KEY && process.env.GEMINI_API_KEY)
    ? 'gemini' : 'openai'
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')
  const chunks = await fileChunks(buffer, extension)
  if (!chunks.length) throw new Error('File contains no analyzable content')
  // Limita i picchi di richieste e ritenta soltanto gli errori temporanei del provider.
  const batches = await mapWithConcurrency(chunks, 2, (chunk) =>
    withAiRetry(() => provider === 'gemini' ? geminiExtract(chunk) : openAIExtract(chunk)),
  )
  return batches.flat()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  const reportId = randomUUID()
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
    return res.status(200).json({ transactions: transactions.slice(0, 500) })
  } catch (error) {
    const transient = isTransientAiError(error)
    console.error('Flownd transaction import failed', {
      reportId,
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
