import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

import {
  coachMutationToolNames,
  coachTools,
  executeCoachReadTool,
  geminiCoachTools,
} from './_coach-data.js'
import { serviceClient } from './eb/_supabase.js'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MODEL_CONTEXT_MESSAGES = 20
const DEFAULT_DAILY_LIMITS = { free: 10, pro: 60, max: 150 }
const DEFAULT_MINUTE_LIMIT = 6

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function coachQuotaLimits(plan, env = process.env) {
  const tier = ['pro', 'max'].includes(plan) ? plan : 'free'
  return {
    daily: positiveInteger(env[`COACH_DAILY_LIMIT_${tier.toUpperCase()}`], DEFAULT_DAILY_LIMITS[tier]),
    minute: positiveInteger(env.COACH_MINUTE_LIMIT, DEFAULT_MINUTE_LIMIT),
  }
}

async function consumeCoachQuota(userId) {
  const service = serviceClient()
  const { data: profile, error: profileError } = await service.from('profiles')
    .select('plan_tier').eq('id', userId).maybeSingle()
  if (profileError) throw profileError
  const limits = coachQuotaLimits(profile?.plan_tier)
  const { data, error } = await service.rpc('consume_coach_quota', {
    p_user_id: userId, p_daily_limit: limits.daily, p_minute_limit: limits.minute,
  })
  if (error) throw error
  return data
}

function cleanLogText(value, limit = 4000) {
  if (value == null) return null
  return String(value)
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/((?:api[_-]?key|authorization|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .slice(0, limit)
}

function coachError(error, context) {
  const normalized = error instanceof Error
    ? error
    : Object.assign(new Error(error?.message || String(error)), error && typeof error === 'object' ? error : {})
  normalized.coachContext = { ...context, ...(normalized.coachContext || {}) }
  return normalized
}

export function coachErrorLog(error, context = {}) {
  const source = error && typeof error === 'object' ? error : { message: String(error) }
  const tagged = source.coachContext || {}
  const cause = source.cause && typeof source.cause === 'object' ? source.cause : null
  return {
    requestId: context.requestId || null,
    method: context.method || null,
    userId: context.userId || null,
    conversationId: context.conversationId || null,
    messageId: context.messageId || null,
    phase: tagged.phase || context.phase || 'request_handler',
    provider: tagged.provider || context.provider || null,
    model: tagged.model || null,
    tool: tagged.tool || null,
    error: {
      name: cleanLogText(source.name, 120) || 'Error',
      message: cleanLogText(source.message, 1000) || 'Unknown error',
      code: cleanLogText(source.code, 120),
      status: Number(source.status || source.statusCode) || null,
      details: cleanLogText(source.details, 1500),
      hint: cleanLogText(source.hint, 1000),
      stack: cleanLogText(source.stack, 4000),
      cause: cause ? {
        name: cleanLogText(cause.name, 120),
        message: cleanLogText(cause.message, 1000),
        code: cleanLogText(cause.code, 120),
      } : null,
    },
  }
}

const coachInstructions = [
  'Sei il Money Coach di Flownd. Rispondi in italiano, con tono calmo, concreto e non giudicante.',
  'Prima di fare affermazioni sui dati finanziari dell’utente, usa il tool di lettura più pertinente.',
  'Distingui sempre in modo esplicito dati personali e dati di gruppo. Non dedurre dati che i tool non restituiscono.',
  'Per dettagli sui movimenti usa get_transactions; per obiettivi e prestiti usa get_goals_and_debts; per gruppi usa get_group_finances.',
  'La panoramica del ciclo include fino a 6 cicli completati e la loro media: usa historical_comparison per confronti storici e dichiara sempre il numero di cicli disponibili.',
  'Prima di update_goal usa get_goals_and_debts e passa sempre il goal_id restituito.',
  'Per registrare spese o creare/modificare obiettivi e budget, chiama il tool appropriato.',
  'Non dire mai che un’azione è stata salvata: i tool di modifica creano solo una proposta che l’utente deve confermare.',
  'Non sostituire consulenza finanziaria professionale e non presentare stime come garanzie.',
  'Sii sintetico: normalmente 2–5 frasi.',
].join('\n')

function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      || process.env.EXPO_PUBLIC_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  }
}

function coachProvider() {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (configured === 'gemini' || configured === 'openai') return configured
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return null
}

function providerIsConfigured(provider) {
  return (provider === 'gemini' && Boolean(process.env.GEMINI_API_KEY))
    || (provider === 'openai' && Boolean(process.env.OPENAI_API_KEY))
}

function outputText(response) {
  return (response.output || []).filter((item) => item.type === 'message')
    .flatMap((item) => item.content || []).filter((item) => item.type === 'output_text')
    .map((item) => item.text).join('\n').trim()
}

function geminiOutputText(response) {
  return (response.candidates || []).flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '').join('\n').trim()
}

async function callOpenAI(input) {
  const model = process.env.OPENAI_COACH_MODEL || 'gpt-5.6-sol'
  let response
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'low' }, instructions: coachInstructions,
        input, tools: coachTools, tool_choice: 'auto', parallel_tool_calls: false,
        store: false,
      }),
    })
  } catch (error) {
    throw coachError(error, { phase: 'provider_request', provider: 'openai', model })
  }
  let data
  try {
    data = await response.json()
  } catch (error) {
    error.status = response.status
    throw coachError(error, { phase: 'provider_response_parse', provider: 'openai', model })
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'OpenAI Responses API non disponibile')
    error.code = data?.error?.code || data?.error?.type || null
    error.status = response.status
    throw coachError(error, { phase: 'provider_request', provider: 'openai', model })
  }
  return data
}

async function callGemini(contents) {
  const model = process.env.GEMINI_COACH_MODEL || 'gemini-3.6-flash'
  let response
  try {
    response = await fetch(`${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: coachInstructions }] }, contents, tools: geminiCoachTools }),
    })
  } catch (error) {
    throw coachError(error, { phase: 'provider_request', provider: 'gemini', model })
  }
  let data
  try {
    data = await response.json()
  } catch (error) {
    error.status = response.status
    throw coachError(error, { phase: 'provider_response_parse', provider: 'gemini', model })
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Gemini API non disponibile')
    error.code = data?.error?.status || data?.error?.code || null
    error.status = response.status
    throw coachError(error, { phase: 'provider_request', provider: 'gemini', model })
  }
  return data
}

export function conversationTitle(content) {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim()
  return (normalized.slice(0, 59) + (normalized.length > 59 ? '…' : '')) || 'Nuova conversazione'
}

function publicConversation(row) {
  return {
    id: row.id,
    title: row.title,
    pinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function publicMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    pendingAction: row.pending_action,
    actionStatus: row.action_status,
    createdAt: row.created_at,
  }
}

async function authenticatedClient(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sessione mancante', status: 401 }
  const { url, anonKey } = getSupabaseConfig()
  if (!url || !anonKey) return { error: 'Supabase non configurato sul server', status: 503 }
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { error: 'Sessione non valida', status: 401 }
  return { client, user: data.user }
}

async function ownedConversation(client, userId, conversationId) {
  if (!UUID_PATTERN.test(conversationId || '')) return null
  const { data, error } = await client.from('coach_conversations').select('*')
    .eq('id', conversationId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

async function listHistory(client, userId) {
  const { data, error } = await client.from('coach_conversations')
    .select('id,title,is_pinned,created_at,updated_at').eq('user_id', userId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(10)
  if (error) throw error
  return (data || []).map(publicConversation)
}

async function loadMessages(client, userId, conversationId, limit = 100) {
  const { data, error } = await client.from('coach_messages')
    .select('id,conversation_id,role,content,pending_action,action_status,created_at')
    .eq('conversation_id', conversationId).eq('user_id', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

async function runOpenAICoach(messages, client, userId) {
  const input = messages.map(({ role, content }) => ({ role, content }))
  for (let turn = 0; turn < 5; turn += 1) {
    const response = await callOpenAI(input)
    const calls = (response.output || []).filter((item) => item.type === 'function_call')
    const mutation = calls.find((call) => coachMutationToolNames.has(call.name))
    if (mutation) {
      return {
        content: 'Ho preparato una proposta. Controllala prima di salvarla.',
        pendingAction: { type: mutation.name, arguments: JSON.parse(mutation.arguments || '{}') },
      }
    }
    if (!calls.length) {
      return { content: outputText(response) || 'Non sono riuscito a formulare una risposta utile. Prova a riformulare.', pendingAction: null }
    }
    input.push(...response.output)
    for (const call of calls) {
      const args = JSON.parse(call.arguments || '{}')
      let result
      try {
        result = await executeCoachReadTool(client, userId, call.name, args)
      } catch (error) {
        throw coachError(error, { phase: 'read_tool', provider: 'openai', tool: call.name })
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) })
    }
  }
  throw new Error('Il Coach ha richiesto troppi passaggi')
}

async function runGeminiCoach(messages, client, userId) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
  }))
  for (let turn = 0; turn < 5; turn += 1) {
    const response = await callGemini(contents)
    const modelContent = response.candidates?.[0]?.content
    const calls = (modelContent?.parts || []).filter((part) => part.functionCall).map((part) => part.functionCall)
    const mutation = calls.find((call) => coachMutationToolNames.has(call.name))
    if (mutation) {
      return {
        content: 'Ho preparato una proposta. Controllala prima di salvarla.',
        pendingAction: { type: mutation.name, arguments: mutation.args || {} },
      }
    }
    if (!calls.length) {
      return { content: geminiOutputText(response) || 'Non sono riuscito a formulare una risposta utile. Prova a riformulare.', pendingAction: null }
    }
    if (!modelContent) throw new Error('Risposta Gemini non valida')
    contents.push(modelContent)
    const functionResponses = []
    for (const call of calls) {
      let result
      try {
        result = await executeCoachReadTool(client, userId, call.name, call.args || {})
      } catch (error) {
        throw coachError(error, { phase: 'read_tool', provider: 'gemini', tool: call.name })
      }
      functionResponses.push({ functionResponse: { name: call.name, response: { result }, ...(call.id ? { id: call.id } : {}) } })
    }
    contents.push({ role: 'user', parts: functionResponses })
  }
  throw new Error('Il Coach ha richiesto troppi passaggi')
}

async function insertUserMessage(client, userId, conversationId, messageId, content) {
  const { data: existing, error: lookupError } = await client.from('coach_messages')
    .select('*').eq('id', messageId).eq('user_id', userId).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) {
    if (existing.conversation_id !== conversationId || existing.role !== 'user' || existing.content !== content) {
      throw new Error('Identificatore messaggio già utilizzato')
    }
    return existing
  }
  const { data, error } = await client.from('coach_messages').insert({
    id: messageId, conversation_id: conversationId, user_id: userId, role: 'user', content,
  }).select('*').single()
  if (error) {
    if (error.code === '23505') return insertUserMessage(client, userId, conversationId, messageId, content)
    throw error
  }
  return data
}

async function replyForMessage(client, userId, messageId) {
  const { data, error } = await client.from('coach_messages').select('*')
    .eq('reply_to_message_id', messageId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

async function saveAssistantReply(client, userId, conversationId, userMessageId, result) {
  // Le risposte dell'assistente (e le proposte di modifica) sono scritte solo dal
  // backend: le policy impediscono al token utente di inserire messaggi 'assistant'.
  const { data, error } = await serviceClient().from('coach_messages').insert({
    conversation_id: conversationId, user_id: userId, role: 'assistant',
    content: result.content, reply_to_message_id: userMessageId,
    pending_action: result.pendingAction,
    action_status: result.pendingAction ? 'pending' : null,
  }).select('*').single()
  if (error) {
    if (error.code === '23505') return replyForMessage(client, userId, userMessageId)
    throw error
  }
  return data
}

async function handleGet(req, res, client, user) {
  const conversationId = String(req.query?.conversationId || '')
  if (!conversationId) return res.status(200).json({ conversations: await listHistory(client, user.id) })
  const conversation = await ownedConversation(client, user.id, conversationId)
  if (!conversation) return res.status(404).json({ error: 'Conversazione non trovata' })
  const messages = await loadMessages(client, user.id, conversation.id)
  return res.status(200).json({ conversation: publicConversation(conversation), messages: messages.map(publicMessage) })
}

async function handlePost(req, res, client, user) {
  const provider = coachProvider()
  if (!provider || !providerIsConfigured(provider)) {
    return res.status(503).json({ error: 'Il Coach non è ancora configurato sul server.' })
  }
  const messageId = String(req.body?.message?.id || '')
  const content = String(req.body?.message?.content || '').trim().slice(0, 4000)
  if (!UUID_PATTERN.test(messageId) || !content) return res.status(400).json({ error: 'Messaggio utente non valido' })

  let conversation = null
  const requestedId = String(req.body?.conversationId || '')
  if (requestedId) conversation = await ownedConversation(client, user.id, requestedId)
  if (requestedId && !conversation) return res.status(404).json({ error: 'Conversazione non trovata' })
  if (!conversation) {
    const { data: existingMessage, error: existingMessageError } = await client
      .from('coach_messages').select('conversation_id,role,content')
      .eq('id', messageId).eq('user_id', user.id).maybeSingle()
    if (existingMessageError) throw existingMessageError
    if (existingMessage) {
      if (existingMessage.role !== 'user' || existingMessage.content !== content) {
        return res.status(409).json({ error: 'Identificatore messaggio già utilizzato' })
      }
      conversation = await ownedConversation(client, user.id, existingMessage.conversation_id)
    }
  }
  if (!conversation) {
    const { data, error } = await client.from('coach_conversations').insert({
      user_id: user.id, title: conversationTitle(content),
    }).select('*').single()
    if (error) throw error
    conversation = data
  }

  try {
    await insertUserMessage(client, user.id, conversation.id, messageId, content)
  } catch (error) {
    throw coachError(error, { phase: 'persist_user_message', provider })
  }
  const existingReply = await replyForMessage(client, user.id, messageId)
  if (existingReply) {
    return res.status(200).json({ conversation: publicConversation(conversation), message: publicMessage(existingReply) })
  }
  let quota
  try {
    quota = await consumeCoachQuota(user.id)
  } catch (error) {
    throw coachError(error, { phase: 'quota', provider })
  }
  if (!quota?.allowed) {
    return res.status(429).json({
      code: quota?.reason === 'minute' ? 'COACH_RATE_LIMIT' : 'COACH_DAILY_LIMIT',
      error: quota?.reason === 'minute'
        ? 'Stai scrivendo molto velocemente. Attendi un minuto e riprova.'
        : 'Hai raggiunto il limite giornaliero di domande al Coach. Riprova domani.',
    })
  }
  let context
  try {
    context = await loadMessages(client, user.id, conversation.id, MODEL_CONTEXT_MESSAGES)
  } catch (error) {
    throw coachError(error, { phase: 'load_model_context', provider })
  }
  let result
  try {
    result = provider === 'gemini'
      ? await runGeminiCoach(context, client, user.id)
      : await runOpenAICoach(context, client, user.id)
  } catch (error) {
    throw coachError(error, { phase: 'model_execution', provider })
  }
  let reply
  try {
    reply = await saveAssistantReply(client, user.id, conversation.id, messageId, result)
  } catch (error) {
    throw coachError(error, { phase: 'persist_assistant_message', provider })
  }
  return res.status(200).json({ conversation: publicConversation(conversation), message: publicMessage(reply) })
}

async function handleDelete(req, res, client, user) {
  const conversationId = String(req.query?.conversationId || '')
  if (!UUID_PATTERN.test(conversationId)) return res.status(400).json({ error: 'Conversazione non valida' })
  const { data, error } = await client.from('coach_conversations').delete()
    .eq('id', conversationId).eq('user_id', user.id).select('id')
  if (error) throw error
  if (!data?.length) return res.status(404).json({ error: 'Conversazione non trovata' })
  return res.status(200).json({ deleted: true })
}

async function handlePatch(req, res, client, user) {
  const conversationId = String(req.body?.conversationId || '')
  const operation = String(req.body?.operation || '')
  if (conversationId || operation) {
    if (!UUID_PATTERN.test(conversationId) || !['pin', 'rename'].includes(operation)) {
      return res.status(400).json({ error: 'Modifica conversazione non valida' })
    }
    const conversation = await ownedConversation(client, user.id, conversationId)
    if (!conversation) return res.status(404).json({ error: 'Conversazione non trovata' })
    const updates = operation === 'pin'
      ? { is_pinned: Boolean(req.body?.pinned) }
      : { title: String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, 60) }
    if (operation === 'rename' && !updates.title) {
      return res.status(400).json({ error: 'Il titolo non può essere vuoto' })
    }
    const { data, error } = await client.from('coach_conversations').update(updates)
      .eq('id', conversationId).eq('user_id', user.id).select('*').single()
    if (error) throw error
    return res.status(200).json({ conversation: publicConversation(data) })
  }
  const messageId = String(req.body?.messageId || '')
  const resolution = String(req.body?.resolution || '')
  if (!UUID_PATTERN.test(messageId) || !['confirmed', 'cancelled'].includes(resolution)) {
    return res.status(400).json({ error: 'Risoluzione proposta non valida' })
  }
  const argumentsValue = req.body?.arguments
  if (argumentsValue != null && (typeof argumentsValue !== 'object' || Array.isArray(argumentsValue))) {
    return res.status(400).json({ error: 'Argomenti proposta non validi' })
  }
  const { data, error } = await client.rpc('resolve_coach_action', {
    p_message_id: messageId, p_resolution: resolution, p_arguments: argumentsValue ?? null,
  })
  if (error) throw error
  return res.status(200).json(data)
}

export default async function handler(req, res) {
  const requestId = randomUUID()
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  let auth
  try {
    auth = await authenticatedClient(req)
    if (auth.error) return res.status(auth.status).json({ error: auth.error, requestId })
    if (req.method === 'GET') return await handleGet(req, res, auth.client, auth.user)
    if (req.method === 'POST') return await handlePost(req, res, auth.client, auth.user)
    if (req.method === 'PATCH') return await handlePatch(req, res, auth.client, auth.user)
    return await handleDelete(req, res, auth.client, auth.user)
  } catch (error) {
    const conversationId = UUID_PATTERN.test(String(req.body?.conversationId || req.query?.conversationId || ''))
      ? String(req.body?.conversationId || req.query?.conversationId)
      : null
    const messageId = UUID_PATTERN.test(String(req.body?.message?.id || req.body?.messageId || ''))
      ? String(req.body?.message?.id || req.body?.messageId)
      : null
    console.error('Flownd coach failed', coachErrorLog(error, {
      requestId,
      method: req.method,
      userId: auth?.user?.id || null,
      conversationId,
      messageId,
      provider: coachProvider(),
      phase: auth ? 'request_handler' : 'authentication',
    }))
    const tooManySteps = error?.message === 'Il Coach ha richiesto troppi passaggi'
    return res.status(tooManySteps ? 422 : 500).json({
      requestId,
      error: tooManySteps
        ? 'Il Coach ha richiesto troppi passaggi. Riprova con una domanda più diretta.'
        : 'Il Coach non è disponibile in questo momento. Riprova tra poco.',
    })
  }
}
