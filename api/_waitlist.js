import { createHash, randomBytes } from 'node:crypto'

import { renderEmail } from './_email.js'
import { ApiError, serviceClient } from './eb/_supabase.js'

// Versione del testo informativo mostrato accanto al campo email. Va aggiornata
// quando cambia la promessa fatta all'utente (cosa riceve e perché).
const CONSENT_VERSION = 'landing-2026-10-31'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const TOKEN_TTL_MS = 7 * 86_400_000
const RESEND_COOLDOWN_MS = 2 * 60_000
const MIN_FILL_MS = 2_500
const IP_WINDOW_MS = 60 * 60_000
const IP_MAX_ATTEMPTS = 5

function isProduction() {
  return process.env.VERCEL_ENV === 'production'
}

function readBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}')
    } catch {
      throw new ApiError(400, 'Richiesta non valida')
    }
  }
  return req.body || {}
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.socket?.remoteAddress || 'unknown'
}

function siteUrl() {
  const configured = process.env.PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/+$/, '')
  // Il link di conferma non deve mai dipendere da header controllati dal client.
  if (isProduction()) throw new ApiError(503, 'Iscrizione temporaneamente non disponibile')
  return 'http://localhost:5173'
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) throw new ApiError(503, 'Iscrizione temporaneamente non disponibile')
  if (!token || typeof token !== 'string' || token.length > 2048) return false
  const form = new URLSearchParams({ secret, response: token })
  if (ip !== 'unknown') form.set('remoteip', ip)
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new ApiError(503, 'Verifica anti-bot non disponibile, riprova tra poco')
  const outcome = await response.json()
  return outcome.success === true && (!outcome.action || outcome.action === 'waitlist')
}

async function sendConfirmationEmail(email, link) {
  const resendKey = process.env.RESEND_API_KEY
  const from = process.env.WAITLIST_FROM_EMAIL || process.env.GROUP_INVITE_FROM_EMAIL
  if (!resendKey || !from) {
    if (isProduction()) throw new ApiError(503, 'Iscrizione temporaneamente non disponibile')
    console.info('Flownd waitlist: email non configurata, link di conferma locale', link)
    return
  }
  const subject = 'Conferma la tua email per Flownd'
  const { html, text } = renderEmail({
    subject,
    preheader: 'Un clic e sei in lista per il lancio di Flownd.',
    title: 'Manca solo un clic',
    body: 'Conferma la tua email e ti scriveremo una volta sola, quando Flownd sarà disponibile su iOS e Android.',
    cta: { label: 'Conferma la mia email', url: link },
    footnote: 'Il link scade tra 7 giorni. Se non hai chiesto tu l’iscrizione, ignora questo messaggio: senza conferma non ti scriveremo più.',
  })
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, text, html }),
  })
  if (!response.ok) {
    console.error('Flownd waitlist email failed', {
      status: response.status,
      body: (await response.text()).slice(0, 500),
    })
    throw new ApiError(502, 'Non siamo riusciti a inviare l’email di conferma. Riprova tra qualche minuto.')
  }
}

async function signup(req, res) {
  const body = readBody(req)
  // Campo trappola compilato o modulo inviato troppo in fretta: risposta
  // identica a un successo, così un bot non impara nulla.
  const startedAt = Number(body.startedAt)
  if (body.website || !Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    return res.status(200).json({ ok: true })
  }

  const email = String(body.email || '').trim().toLowerCase()
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, 'Controlla l’indirizzo email: sembra incompleto.')
  }

  const ip = clientIp(req)
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    throw new ApiError(403, 'Verifica anti-bot non riuscita. Ricarica la pagina e riprova.')
  }

  const service = serviceClient()
  const ipHash = sha256(`${process.env.WAITLIST_HASH_SALT || 'flownd-waitlist'}:${ip}`)
  const windowStart = new Date(Date.now() - IP_WINDOW_MS).toISOString()
  const { count, error: countError } = await service
    .from('waitlist_signups')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('confirmation_sent_at', windowStart)
  if (countError) throw countError
  if ((count || 0) >= IP_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Troppi tentativi da questa rete. Riprova tra un’ora.')
  }

  const { data: existing, error: existingError } = await service
    .from('waitlist_signups')
    .select('id,status,confirmation_sent_at')
    .eq('email', email)
    .maybeSingle()
  if (existingError) throw existingError
  // Stessa risposta per indirizzi nuovi, già confermati o appena contattati:
  // il modulo non rivela chi è già in lista.
  if (existing?.status === 'confirmed') return res.status(200).json({ ok: true })
  const lastSent = existing?.confirmation_sent_at ? new Date(existing.confirmation_sent_at).getTime() : 0
  if (existing && Date.now() - lastSent < RESEND_COOLDOWN_MS) return res.status(200).json({ ok: true })

  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const fields = {
    email,
    status: 'pending',
    token_hash: sha256(token),
    token_expires_at: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
    confirmation_sent_at: now.toISOString(),
    ip_hash: ipHash,
    consent_version: CONSENT_VERSION,
    updated_at: now.toISOString(),
  }
  const { error: writeError } = existing
    ? await service.from('waitlist_signups').update(fields).eq('id', existing.id)
    : await service.from('waitlist_signups').insert(fields)
  if (writeError) throw writeError

  await sendConfirmationEmail(email, `${siteUrl()}/lista-attesa/conferma?token=${token}`)
  return res.status(200).json({ ok: true })
}

async function confirm(req, res) {
  const token = String(readBody(req).token || '')
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new ApiError(400, 'Il link di conferma non è valido.')
  }
  const service = serviceClient()
  const { data: signupRow, error } = await service
    .from('waitlist_signups')
    .select('id,token_expires_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()
  if (error) throw error
  if (!signupRow) {
    throw new ApiError(404, 'Questo link è già stato usato oppure non è valido.', 'TOKEN_NOT_FOUND')
  }
  if (new Date(signupRow.token_expires_at) <= new Date()) {
    throw new ApiError(410, 'Il link è scaduto. Lascia di nuovo la tua email per riceverne uno nuovo.', 'TOKEN_EXPIRED')
  }
  const confirmedAt = new Date().toISOString()
  const { error: updateError } = await service.from('waitlist_signups').update({
    status: 'confirmed',
    confirmed_at: confirmedAt,
    token_hash: null,
    token_expires_at: null,
    updated_at: confirmedAt,
  }).eq('id', signupRow.id)
  if (updateError) throw updateError
  return res.status(200).json({ ok: true })
}

export default async function waitlistHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  try {
    return req.query?.action === 'waitlist-confirm' ? await confirm(req, res) : await signup(req, res)
  } catch (error) {
    const status = Number(error?.status) || 500
    if (status >= 500) console.error('Flownd waitlist failed', error)
    return res.status(status).json({
      error: status >= 500 && !(error instanceof ApiError)
        ? 'Iscrizione temporaneamente non disponibile. Riprova tra poco.'
        : error.message,
      code: error?.code || undefined,
    })
  }
}
