import { createHash } from 'crypto'

import { enableBankingRequest } from './_client.js'
import { normalizeAccount } from './_normalize.js'
import { serviceClient } from './_supabase.js'

function withResult(returnUrl, values) {
  const url = new URL(returnUrl)
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}

function redirect(res, location) {
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non supportato' })

  const state = String(req.query.state || '')
  const code = String(req.query.code || '')
  const stateHash = createHash('sha256').update(state).digest('hex')
  const service = serviceClient()
  const { data: attempt } = await service
    .from('open_banking_authorizations')
    .select('id,user_id,return_url,status,expires_at,requested_valid_until')
    .eq('state_hash', stateHash)
    .maybeSingle()
  if (!attempt) return res.status(400).json({ error: 'Autorizzazione non riconosciuta' })
  if (
    attempt.status !== 'pending'
    || new Date(attempt.expires_at).getTime() < Date.now()
    || !code
  ) {
    await service
      .from('open_banking_authorizations')
      .update({ status: 'expired' })
      .eq('id', attempt.id)
    return redirect(res, withResult(attempt.return_url, { status: 'error' }))
  }

  try {
    const session = await enableBankingRequest('/sessions', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    const { data: connection, error: connectionError } = await service
      .from('open_banking_connections')
      .insert({
        user_id: attempt.user_id,
        provider_session_id: session.session_id,
        aspsp_name: session.aspsp?.name || 'Banca collegata',
        aspsp_country: session.aspsp?.country || 'IT',
        valid_until: session.access?.valid_until || attempt.requested_valid_until,
      })
      .select('id')
      .single()
    if (connectionError) throw connectionError

    for (const rawAccount of session.accounts || []) {
      const account = normalizeAccount(rawAccount, session.aspsp?.name)
      if (!account.providerAccountUid || !account.identificationHash) continue
      const { data: savedAccount, error: accountError } = await service
        .from('open_banking_accounts')
        .upsert(
          {
            user_id: attempt.user_id,
            connection_id: connection.id,
            provider_account_uid: account.providerAccountUid,
            identification_hash: account.identificationHash,
            iban_last4: account.ibanLast4,
            name: account.name,
            currency: account.currency,
            account_type: account.accountType,
            product: account.product,
            active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,identification_hash' },
        )
        .select('id')
        .single()
      if (accountError) throw accountError
      const { error: financialError } = await service
        .from('financial_accounts')
        .upsert(
          {
            user_id: attempt.user_id,
            open_banking_account_id: savedAccount.id,
            name: account.name,
            source: 'open_banking',
            institution_name: session.aspsp?.name || null,
            currency: account.currency,
            active: true,
          },
          { onConflict: 'open_banking_account_id' },
        )
      if (financialError) throw financialError
    }
    await service
      .from('open_banking_authorizations')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)
    return redirect(
      res,
      withResult(attempt.return_url, {
        status: 'connected',
        connectionId: connection.id,
      }),
    )
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Enable Banking callback failed', error)
    }
    await service
      .from('open_banking_authorizations')
      .update({ status: 'failed' })
      .eq('id', attempt.id)
    return redirect(res, withResult(attempt.return_url, { status: 'error' }))
  }
}
