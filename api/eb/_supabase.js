import { createClient } from '@supabase/supabase-js'

export class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

function supabaseConfig() {
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
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

export function serviceClient() {
  const { url, serviceKey } = supabaseConfig()
  if (!url || !serviceKey) {
    throw new ApiError(503, 'Supabase service role non configurato sul server')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function authenticateUserRequest(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) throw new ApiError(401, 'Sessione mancante')

  const { url, anonKey } = supabaseConfig()
  if (!url || !anonKey) {
    throw new ApiError(503, 'Supabase non configurato sul server')
  }
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new ApiError(401, 'Sessione non valida')
  return { user: data.user, client }
}

export async function authenticateRequest(req) {
  const authenticated = await authenticateUserRequest(req)
  return { ...authenticated, service: serviceClient() }
}

export async function paidEntitlement(service, userId) {
  const { data, error } = await service
    .from('profiles')
    .select('plan_tier')
    .eq('id', userId)
    .single()
  if (error) throw new ApiError(503, 'Piano utente non disponibile')
  const plan = data.plan_tier || 'free'
  if (plan !== 'pro' && plan !== 'max') {
    throw new ApiError(
      403,
      'Open Banking è disponibile con i piani Pro e Max.',
      'PAID_PLAN_REQUIRED',
    )
  }
  return {
    plan,
    maxConnections: plan === 'max' ? 10 : 2,
  }
}

export function sendApiError(res, error) {
  const status = Number(error?.status) || 500
  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    console.error('Flownd Enable Banking failed', error)
  }
  return res.status(status).json({
    error:
      status >= 500
        ? error?.publicMessage || 'Open Banking non è disponibile in questo momento.'
        : error.message,
    ...(error?.code ? { code: error.code } : {}),
  })
}
