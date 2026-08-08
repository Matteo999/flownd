import { createClient } from '@supabase/supabase-js'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const MUTATION_TOOLS = new Set([
  'add_transaction',
  'create_goal',
  'update_goal',
  'update_budget',
])

const coachInstructions = [
  'Sei il Money Coach di Flownd. Rispondi in italiano, con tono calmo, concreto e non giudicante.',
  'Usa get_spending_summary prima di fare affermazioni sui dati finanziari dell’utente.',
  'Prima di update_goal usa get_spending_summary e passa sempre il goal_id restituito.',
  'Per registrare spese o creare/modificare obiettivi e budget, chiama il tool appropriato.',
  'Non dire mai che un’azione è stata salvata: i tool di modifica creano solo una proposta che l’utente deve confermare.',
  'Non sostituire consulenza finanziaria professionale e non presentare stime come garanzie.',
  'Sii sintetico: normalmente 2–5 frasi.',
].join('\n')

const tools = [
  {
    type: 'function',
    name: 'get_spending_summary',
    description: 'Legge entrate, uscite, budget e obiettivo attivo dell’utente per un periodo.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'year'],
          description: 'Periodo richiesto dall’utente.',
        },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'add_transaction',
    description: 'Propone una nuova spesa. Non salva: richiede sempre conferma nell’app.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        amount: { type: 'number' },
        category: { type: 'string' },
        occurred_at: {
          type: ['string', 'null'],
          description: 'Data ISO, oppure null per oggi.',
        },
      },
      required: ['description', 'amount', 'category', 'occurred_at'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_goal',
    description: 'Propone un nuovo obiettivo. Non salva: richiede sempre conferma nell’app.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target_amount: { type: 'number' },
        deadline: {
          type: ['string', 'null'],
          description: 'Data ISO o null.',
        },
      },
      required: ['name', 'target_amount', 'deadline'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_goal',
    description: 'Propone modifiche all’obiettivo attivo. Usa prima get_spending_summary per recuperare il goal_id. Non salva senza conferma.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        goal_id: { type: ['string', 'null'] },
        name: { type: ['string', 'null'] },
        target_amount: { type: ['number', 'null'] },
        deadline: { type: ['string', 'null'] },
      },
      required: ['goal_id', 'name', 'target_amount', 'deadline'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_budget',
    description: 'Propone la modifica di una quota budget. Non salva senza conferma.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        category_key: {
          type: 'string',
          enum: ['needs', 'wants', 'savings'],
        },
        monthly_limit: { type: 'number' },
      },
      required: ['category_key', 'monthly_limit'],
      additionalProperties: false,
    },
  },
]

// Gemini supports the OpenAPI subset used by function declarations, but not
// OpenAI's `strict` / `additionalProperties` options or union `type` arrays.
const geminiTools = [
  {
    functionDeclarations: [
      {
        name: 'get_spending_summary',
        description: 'Legge entrate, uscite, budget e obiettivo attivo dell’utente per un periodo.',
        parameters: {
          type: 'object',
          properties: { period: { type: 'string', enum: ['week', 'month', 'year'] } },
          required: ['period'],
        },
      },
      {
        name: 'add_transaction',
        description: 'Propone una nuova spesa. Non salva: richiede sempre conferma nell’app.',
        parameters: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            amount: { type: 'number' },
            category: { type: 'string' },
            occurred_at: { type: 'string', nullable: true, description: 'Data ISO, oppure null per oggi.' },
          },
          required: ['description', 'amount', 'category', 'occurred_at'],
        },
      },
      {
        name: 'create_goal',
        description: 'Propone un nuovo obiettivo. Non salva: richiede sempre conferma nell’app.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            target_amount: { type: 'number' },
            deadline: { type: 'string', nullable: true, description: 'Data ISO o null.' },
          },
          required: ['name', 'target_amount', 'deadline'],
        },
      },
      {
        name: 'update_goal',
        description: 'Propone modifiche all’obiettivo attivo. Usa prima get_spending_summary per recuperare il goal_id. Non salva senza conferma.',
        parameters: {
          type: 'object',
          properties: {
            goal_id: { type: 'string', nullable: true },
            name: { type: 'string', nullable: true },
            target_amount: { type: 'number', nullable: true },
            deadline: { type: 'string', nullable: true },
          },
          required: ['goal_id', 'name', 'target_amount', 'deadline'],
        },
      },
      {
        name: 'update_budget',
        description: 'Propone la modifica di una quota budget. Non salva senza conferma.',
        parameters: {
          type: 'object',
          properties: {
            category_key: { type: 'string', enum: ['needs', 'wants', 'savings'] },
            monthly_limit: { type: 'number' },
          },
          required: ['category_key', 'monthly_limit'],
        },
      },
    ],
  },
]

function getSupabaseConfig() {
  return {
    url:
      process.env.SUPABASE_URL
      || process.env.EXPO_PUBLIC_SUPABASE_URL
      || process.env.VITE_SUPABASE_URL,
    anonKey:
      process.env.SUPABASE_ANON_KEY
      || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      || process.env.EXPO_PUBLIC_SUPABASE_KEY
      || process.env.VITE_SUPABASE_ANON_KEY,
  }
}

function startForPeriod(period) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === 'week') start.setDate(start.getDate() - 6)
  if (period === 'month') start.setDate(1)
  if (period === 'year') start.setMonth(0, 1)
  return start
}

function outputText(response) {
  return (response.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('\n')
    .trim()
}

function geminiOutputText(response) {
  return (response.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim()
}

function coachProvider() {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (configured === 'gemini' || configured === 'openai') return configured
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return null
}

async function callOpenAI(input) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_COACH_MODEL || 'gpt-5.6-sol',
      reasoning: { effort: 'low' },
      instructions: coachInstructions,
      input,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'OpenAI Responses API non disponibile')
  }
  return data
}

async function callGemini(contents) {
  const model = process.env.GEMINI_COACH_MODEL || 'gemini-3.6-flash'
  const response = await fetch(
    `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: coachInstructions }] },
        contents,
        tools: geminiTools,
      }),
    },
  )
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gemini API non disponibile')
  }
  return data
}

async function getSpendingSummary(client, userId, period) {
  const start = startForPeriod(period)
  const [transactionsResult, budgetsResult, goalResult] = await Promise.all([
    client
      .from('transactions')
      .select('amount,kind,category,occurred_at')
      .eq('user_id', userId)
      .eq('excluded_from_totals', false)
      .gte('occurred_at', start.toISOString()),
    client
      .from('budget_categories')
      .select('category_key,name,monthly_limit,is_macro')
      .eq('user_id', userId),
    client
      .from('goals')
      .select('id,name,target_amount,saved_amount,deadline_label')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const error =
    transactionsResult.error || budgetsResult.error || goalResult.error
  if (error) throw new Error('Dati finanziari temporaneamente non disponibili')

  const transactions = transactionsResult.data || []
  const income = transactions
    .filter((item) => item.kind === 'income')
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const expense = transactions
    .filter((item) => item.kind !== 'income')
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const categories = transactions
    .filter((item) => item.kind !== 'income')
    .reduce((summary, item) => {
      const category = item.category || 'Altro'
      summary[category] = (summary[category] || 0) + Number(item.amount)
      return summary
    }, {})

  return {
    period,
    income,
    expense,
    net: income - expense,
    categories,
    budgets: (budgetsResult.data || [])
      .filter((item) => item.is_macro || ['needs', 'wants', 'savings'].includes(item.category_key))
      .map((item) => ({
        id: item.category_key,
        name: item.name,
        monthly_limit: Number(item.monthly_limit),
      })),
    active_goal: goalResult.data
      ? {
          id: goalResult.data.id,
          name: goalResult.data.name,
          target_amount: Number(goalResult.data.target_amount),
          saved_amount: Number(goalResult.data.saved_amount),
          deadline: goalResult.data.deadline_label,
        }
      : null,
  }
}

async function runGeminiCoach(messages, client, userId) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))

  for (let turn = 0; turn < 3; turn += 1) {
    const response = await callGemini(contents)
    const modelContent = response.candidates?.[0]?.content
    const calls = (modelContent?.parts || [])
      .filter((part) => part.functionCall)
      .map((part) => part.functionCall)
    const mutation = calls.find((call) => MUTATION_TOOLS.has(call.name))

    if (mutation) {
      return {
        message: 'Ho preparato una proposta. Controllala prima di salvarla.',
        pendingAction: {
          type: mutation.name,
          arguments: mutation.args || {},
        },
      }
    }

    if (!calls.length) {
      return {
        message:
          geminiOutputText(response)
          || 'Non sono riuscito a formulare una risposta utile. Prova a riformulare.',
        pendingAction: null,
      }
    }

    if (!modelContent) throw new Error('Risposta Gemini non valida')
    // Return Gemini's complete model turn verbatim: this preserves any thought
    // signature required by thinking/function-calling models on the next turn.
    contents.push(modelContent)
    const functionResponses = []
    for (const call of calls) {
      let result
      if (call.name === 'get_spending_summary') {
        result = await getSpendingSummary(client, userId, call.args?.period)
      } else {
        result = { error: 'Tool non supportato' }
      }
      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: { result },
          ...(call.id ? { id: call.id } : {}),
        },
      })
    }
    contents.push({ role: 'user', parts: functionResponses })
  }

  return {
    error: 'Il Coach ha richiesto troppi passaggi. Riprova con una domanda più diretta.',
    status: 422,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  const provider = coachProvider()
  if (
    !provider
    || (provider === 'gemini' && !process.env.GEMINI_API_KEY)
    || (provider === 'openai' && !process.env.OPENAI_API_KEY)
  ) {
    return res.status(503).json({
      error: 'Il Coach non è ancora configurato sul server.',
    })
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Sessione mancante' })

  const { url, anonKey } = getSupabaseConfig()
  if (!url || !anonKey) {
    return res.status(503).json({ error: 'Supabase non configurato sul server' })
  }
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Sessione non valida' })
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : []
  const safeMessages = messages
    .filter(
      (message) =>
        ['user', 'assistant'].includes(message?.role)
        && typeof message?.content === 'string',
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000),
    }))
  if (!safeMessages.length || safeMessages.at(-1)?.role !== 'user') {
    return res.status(400).json({ error: 'Messaggio utente mancante' })
  }

  try {
    if (provider === 'gemini') {
      const result = await runGeminiCoach(safeMessages, client, userData.user.id)
      if (result.error) return res.status(result.status).json({ error: result.error })
      return res.status(200).json(result)
    }

    const input = [...safeMessages]
    for (let turn = 0; turn < 3; turn += 1) {
      const response = await callOpenAI(input)
      const calls = (response.output || []).filter(
        (item) => item.type === 'function_call',
      )
      const mutation = calls.find((call) => MUTATION_TOOLS.has(call.name))
      if (mutation) {
        return res.status(200).json({
          message: 'Ho preparato una proposta. Controllala prima di salvarla.',
          pendingAction: {
            type: mutation.name,
            arguments: JSON.parse(mutation.arguments || '{}'),
          },
        })
      }

      if (!calls.length) {
        return res.status(200).json({
          message:
            outputText(response)
            || 'Non sono riuscito a formulare una risposta utile. Prova a riformulare.',
          pendingAction: null,
        })
      }

      input.push(...response.output)
      for (const call of calls) {
        let result
        if (call.name === 'get_spending_summary') {
          const args = JSON.parse(call.arguments || '{}')
          result = await getSpendingSummary(
            client,
            userData.user.id,
            args.period,
          )
        } else {
          result = { error: 'Tool non supportato' }
        }
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(result),
        })
      }
    }
    return res.status(422).json({
      error: 'Il Coach ha richiesto troppi passaggi. Riprova con una domanda più diretta.',
    })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Flownd coach failed', error)
    }
    return res.status(500).json({
      error: 'Il Coach non è disponibile in questo momento. Riprova tra poco.',
    })
  }
}
