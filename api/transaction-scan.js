import { authenticateRequest, ApiError } from './eb/_supabase.js'
import { randomUUID } from 'node:crypto'

const CATEGORIES = [
  'Spesa', 'Casa', 'Bollette', 'Trasporti', 'Salute', 'Ristoranti',
  'Shopping', 'Tempo libero', 'Viaggi', 'Abbonamenti', 'Educazione',
  'Assicurazioni', 'Investimenti', 'Regali', 'Stipendio', 'Rimborsi', 'Altro',
]

const instructions = `Analizza una foto di scontrino o uno screenshot bancario italiano. Estrai solo transazioni chiaramente visibili. Restituisci JSON con transactions. amount deve essere positivo; kind è expense o income; occurredAt è ISO 8601; category deve essere una delle categorie consentite. Non inventare dati. Se la data non è visibile usa null e se non ci sono transazioni restituisci un array vuoto.`

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
    return [{
      description: String(item.description).trim().slice(0, 180),
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
      text: { format: { type: 'json_schema', name: 'transaction_scan', strict: true, schema: {
        type: 'object',
        properties: { transactions: { type: 'array', items: { type: 'object', properties: {
          description: { type: 'string' }, amount: { type: 'number' }, kind: { type: 'string', enum: ['expense', 'income'] },
          occurredAt: { type: ['string', 'null'] }, category: { type: 'string', enum: CATEGORIES },
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
  if (!response.ok) throw new Error(data?.error?.message || 'Riconoscimento IA non disponibile')
  const text = (data.output || []).flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text
  return parseModelJson(text)
}

async function gemini(dataUrl) {
  const [meta, base64] = dataUrl.split(',', 2)
  const mimeType = meta.match(/^data:([^;]+)/)?.[1] || 'image/jpeg'
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: 'Estrai le transazioni presenti.' }, { inlineData: { mimeType, data: base64 } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })
  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(`Gemini returned non-JSON (${response.status}): ${body.slice(0, 200)}`)
  }
  if (!response.ok) throw new Error(data?.error?.message || 'Riconoscimento IA non disponibile')
  return parseModelJson(data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(''))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  const reportId = randomUUID()
  try {
    const { user, service } = await authenticateRequest(req)
    await assertPaidPlan(service, user.id)
    const dataUrl = String(req.body?.dataUrl || '')
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl) || dataUrl.length > 3_000_000) {
      throw new ApiError(400, 'Invalid or oversized image')
    }
    const provider = process.env.AI_PROVIDER?.toLowerCase() === 'gemini' || (!process.env.OPENAI_API_KEY && process.env.GEMINI_API_KEY)
      ? 'gemini' : 'openai'
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) throw new ApiError(503, 'Riconoscimento IA non configurato')
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY) throw new ApiError(503, 'Riconoscimento IA non configurato')
    const parsed = provider === 'gemini' ? await gemini(dataUrl) : await openAI(dataUrl)
    const transactions = safeTransactions(parsed)
    if (!transactions.length) throw new ApiError(422, 'AI extracted zero transactions')
    return res.status(200).json({ transactions })
  } catch (error) {
    console.error('Flownd transaction scan failed', { reportId, error })
    return res.status(Number(error?.status) || 500).json({
      error: 'Si è verificato un errore. Il resoconto è stato inviato agli sviluppatori.',
      reportId,
    })
  }
}
