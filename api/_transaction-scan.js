import { authenticateRequest, ApiError } from './eb/_supabase.js'
import { randomUUID } from 'node:crypto'

const CATEGORIES = [
  'Spesa', 'Casa', 'Bollette', 'Trasporti', 'Salute', 'Ristoranti',
  'Shopping', 'Tempo libero', 'Viaggi', 'Abbonamenti', 'Educazione',
  'Assicurazioni', 'Investimenti', 'Regali', 'Stipendio', 'Rimborsi', 'Altro',
]

const instructions = `Analizza una foto di scontrino o uno screenshot bancario in qualsiasi lingua. Estrai solo transazioni chiaramente visibili. Per ogni transazione separa semanticamente merchantName, counterpartyName, memo e bankReference, usando null quando il dato non è esplicito. description è una breve etichetta leggibile derivata in ordine da merchantName, counterpartyName o memo; rawDescription conserva il testo originale rilevante. Mantieni i nomi propri nella lingua originale e non inventare dati. confidence è tra 0 e 1; amount è positivo; kind è expense o income; occurredAt è ISO 8601; category deve essere una delle categorie consentite. Se la data non è visibile usa null e se non ci sono transazioni restituisci un array vuoto.`

const scanSchema = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rawDescription: { type: 'string' },
          description: { type: 'string' },
          merchantName: { type: ['string', 'null'] },
          counterpartyName: { type: ['string', 'null'] },
          memo: { type: ['string', 'null'] },
          bankReference: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          amount: { type: 'number' },
          kind: { type: 'string', enum: ['expense', 'income'] },
          occurredAt: { type: ['string', 'null'] },
          category: { type: 'string', enum: CATEGORIES },
        },
        required: ['rawDescription', 'description', 'merchantName', 'counterpartyName', 'memo', 'bankReference', 'confidence', 'amount', 'kind', 'occurredAt', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['transactions'],
  additionalProperties: false,
}

function cleanText(value, limit = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}

function parseModelJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('AI response contains no JSON object')
  return JSON.parse(clean.slice(start, end + 1))
}

async function assertPaidPlan(service, userId) {
  const { data, error } = await service.from('profiles').select('plan_tier').eq('id', userId).single()
  if (error) throw new ApiError(503, 'Piano utente non disponibile')
  if (!['pro', 'max'].includes(data.plan_tier)) {
    throw new ApiError(403, 'Il riconoscimento da foto e screenshot è disponibile con Pro e Max.', 'PAID_PLAN_REQUIRED')
  }
}

function safeTransactions(value) {
  const items = Array.isArray(value?.transactions) ? value.transactions : []
  return items.flatMap((item) => {
    const amount = Number(item?.amount)
    const occurredAt = item?.occurredAt ? new Date(item.occurredAt) : new Date()
    if (!item?.description || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(occurredAt.getTime())) return []
    const merchantName = cleanText(item.merchantName, 180) || null
    const counterpartyName = cleanText(item.counterpartyName, 180) || null
    const memo = cleanText(item.memo, 500) || null
    return [{
      description: cleanText(merchantName || counterpartyName || item.description || memo, 180),
      rawDescription: cleanText(item.rawDescription || item.description, 1000),
      merchantName,
      counterpartyName,
      memo,
      bankReference: cleanText(item.bankReference, 180) || null,
      importConfidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      amount,
      kind: item.kind === 'income' ? 'income' : 'expense',
      occurredAt: occurredAt.toISOString(),
      category: CATEGORIES.includes(item.category) ? item.category : 'Altro',
    }]
  }).slice(0, 100)
}

async function openAI(dataUrl) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-5.6-sol',
      reasoning: { effort: 'low' },
      instructions,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'Estrai le transazioni presenti in questa immagine.' },
        { type: 'input_image', image_url: dataUrl, detail: 'high' },
      ] }],
      text: { format: { type: 'json_schema', name: 'transaction_scan', strict: true, schema: scanSchema } },
    }),
  })
  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(`OpenAI returned non-JSON (${response.status}): ${body.slice(0, 200)}`)
  }
  if (!response.ok) throw new Error(data?.error?.message || 'Riconoscimento IA non disponibile')
  const text = (data.output || []).flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text
  return parseModelJson(text)
}

async function gemini(dataUrl) {
  const [meta, base64] = dataUrl.split(',', 2)
  const mimeType = meta.match(/^data:([^;]+)/)?.[1] || 'image/jpeg'
  const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_COACH_MODEL || 'gemini-3.7-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: 'Estrai le transazioni presenti.' }, { inlineData: { mimeType, data: base64 } }] }],
      generationConfig: {
        responseFormat: {
          text: { mimeType: 'application/json', schema: scanSchema },
        },
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
    const providerError = new Error(data?.error?.message || 'Riconoscimento IA non disponibile')
    providerError.providerStatus = response.status
    providerError.providerCode = data?.error?.status || null
    throw providerError
  }
  return parseModelJson(data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(''))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  const reportId = randomUUID()
  let stage = 'authenticate_user'
  let provider = null
  try {
    const { user, service } = await authenticateRequest(req)
    stage = 'check_paid_plan'
    await assertPaidPlan(service, user.id)
    stage = 'validate_image'
    const dataUrl = String(req.body?.dataUrl || '')
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl) || dataUrl.length > 3_000_000) {
      throw new ApiError(400, 'Invalid or oversized image')
    }
    stage = 'select_provider'
    provider = process.env.AI_PROVIDER?.toLowerCase() === 'gemini' || (!process.env.OPENAI_API_KEY && process.env.GEMINI_API_KEY)
      ? 'gemini' : 'openai'
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) throw new ApiError(503, 'Riconoscimento IA non configurato')
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY) throw new ApiError(503, 'Riconoscimento IA non configurato')
    stage = provider === 'gemini' ? 'call_gemini' : 'call_openai'
    const parsed = provider === 'gemini' ? await gemini(dataUrl) : await openAI(dataUrl)
    stage = 'validate_ai_response'
    const transactions = safeTransactions(parsed)
    if (!transactions.length) throw new ApiError(422, 'AI extracted zero transactions')
    return res.status(200).json({ transactions })
  } catch (error) {
    console.error('Flownd transaction scan failed', {
      reportId,
      stage,
      provider,
      model: provider === 'gemini'
        ? process.env.GEMINI_VISION_MODEL || process.env.GEMINI_COACH_MODEL || 'gemini-3.7-flash'
        : process.env.OPENAI_VISION_MODEL || 'gpt-5.6-sol',
      status: Number(error?.status) || null,
      code: error?.code || error?.providerCode || null,
      providerStatus: error?.providerStatus || null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    })
    return res.status(Number(error?.status) || 500).json({
      error: 'Si è verificato un errore. Il resoconto è stato inviato agli sviluppatori.',
      reportId,
    })
  }
}
