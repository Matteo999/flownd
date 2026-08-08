import { createHash, randomUUID } from 'crypto'

import { enableBankingRequest } from './_client.js'
import {
  ApiError,
  authenticateRequest,
  paidEntitlement,
  sendApiError,
} from './_supabase.js'

function validReturnUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'flownd:') return true
    return process.env.NODE_ENV !== 'production'
      && ['exp:', 'exps:', 'http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non supportato' })

  try {
    const { user, service } = await authenticateRequest(req)
    const entitlement = await paidEntitlement(service, user.id)
    const { bankName, bankCountry = 'IT', returnUrl } = req.body || {}
    if (!bankName || !validReturnUrl(returnUrl)) {
      throw new ApiError(400, 'Banca o URL di ritorno non validi')
    }
    const { error: expiryError } = await service
      .from('open_banking_connections')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'authorized')
      .lt('valid_until', new Date().toISOString())
    if (expiryError) throw expiryError
    const { count, error: countError } = await service
      .from('open_banking_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'authorized')
    if (countError) throw countError
    if ((count || 0) >= entitlement.maxConnections) {
      throw new ApiError(
        403,
        `Il piano ${entitlement.plan === 'pro' ? 'Pro' : 'Max'} consente fino a ${entitlement.maxConnections} connessioni bancarie.`,
        'CONNECTION_LIMIT_REACHED',
      )
    }

    const callbackUrl = process.env.ENABLE_BANKING_REDIRECT_URL
    if (!callbackUrl) {
      throw new ApiError(503, 'Callback Enable Banking non configurato')
    }
    const state = randomUUID()
    const stateHash = createHash('sha256').update(state).digest('hex')
    const consentDays = Math.max(
      1,
      Math.min(180, Number(process.env.ENABLE_BANKING_CONSENT_DAYS) || 180),
    )
    const validUntil = new Date(
      Date.now() + consentDays * 24 * 60 * 60 * 1000,
    ).toISOString()
    const data = await enableBankingRequest('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { balances: true, transactions: true, valid_until: validUntil },
        aspsp: { name: bankName, country: bankCountry },
        state,
        redirect_url: callbackUrl,
        psu_type: 'personal',
        psu_id: user.id,
      }),
    })
    const { error: insertError } = await service
      .from('open_banking_authorizations')
      .insert({
        user_id: user.id,
        state_hash: stateHash,
        authorization_id: data.authorization_id || null,
        return_url: returnUrl,
        requested_valid_until: validUntil,
        expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      })
    if (insertError) throw insertError
    return res.status(200).json({ authorizationUrl: data.url })
  } catch (error) {
    return sendApiError(res, error)
  }
}
