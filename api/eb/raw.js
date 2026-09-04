import { timingSafeEqual } from 'node:crypto'

import { enableBankingRequest } from './_client.js'
import { serviceClient } from './_supabase.js'

function authorized(req) {
  const expected = process.env.ENABLE_BANKING_DEBUG_EXPORT_TOKEN || ''
  const received = String(req.headers['x-debug-token'] || '')
  if (!expected || !received) return false
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer)
}

function transactionPath(uid, query) {
  const params = new URLSearchParams()
  if (query.continuationKey) {
    params.set('continuation_key', String(query.continuationKey))
  } else {
    if (query.dateFrom) params.set('date_from', String(query.dateFrom))
    if (query.dateTo) params.set('date_to', String(query.dateTo))
    if (query.strategy) params.set('strategy', String(query.strategy))
    if (query.transactionStatus) {
      params.set('transaction_status', String(query.transactionStatus))
    }
  }
  const search = params.toString()
  return `/accounts/${encodeURIComponent(uid)}/transactions${search ? `?${search}` : ''}`
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non supportato' })
  if (!authorized(req)) return res.status(404).json({ error: 'Non disponibile' })

  const userId = process.env.ENABLE_BANKING_DEBUG_EXPORT_USER_ID
  if (!userId) return res.status(503).json({ error: 'Utente debug non configurato' })

  try {
    const service = serviceClient()
    const action = String(req.query.action || 'accounts')

    if (action === 'accounts') {
      const { data: accounts, error } = await service
        .from('open_banking_accounts')
        .select('id,connection_id,provider_account_uid,name,iban_last4,product')
        .eq('user_id', userId)
        .eq('active', true)
        .order('created_at')
      if (error) throw error

      const connectionIds = [...new Set((accounts || []).map((item) => item.connection_id))]
      const { data: connections, error: connectionError } = connectionIds.length
        ? await service
            .from('open_banking_connections')
            .select('id,aspsp_name')
            .eq('user_id', userId)
            .in('id', connectionIds)
        : { data: [], error: null }
      if (connectionError) throw connectionError
      const bankNames = new Map((connections || []).map((item) => [item.id, item.aspsp_name]))

      return res.status(200).json({
        accounts: (accounts || []).map((account) => ({
          id: account.id,
          uid: account.provider_account_uid,
          name: account.name,
          bank: bankNames.get(account.connection_id) || 'Banca',
          ibanLast4: account.iban_last4,
          product: account.product,
        })),
      })
    }

    const uid = String(req.query.uid || '')
    const { data: account, error: accountError } = await service
      .from('open_banking_accounts')
      .select('id,provider_account_uid,name,iban_last4,product')
      .eq('user_id', userId)
      .eq('provider_account_uid', uid)
      .eq('active', true)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) return res.status(404).json({ error: 'Conto non disponibile' })

    let path
    if (action === 'details') {
      path = `/accounts/${encodeURIComponent(uid)}/details`
    } else if (action === 'balances') {
      path = `/accounts/${encodeURIComponent(uid)}/balances`
    } else if (action === 'transactions') {
      path = transactionPath(uid, req.query)
    } else {
      return res.status(400).json({ error: 'Azione non supportata' })
    }

    const raw = await enableBankingRequest(path)
    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      provider: 'enable-banking',
      account: {
        name: account.name,
        ibanLast4: account.iban_last4,
        product: account.product,
      },
      request: { action, path },
      raw,
    })
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({
      error: error?.publicMessage || error?.message || 'Esportazione non disponibile',
      providerStatus: error?.providerStatus || null,
      retryAfter: error?.retryAfter || null,
    })
  }
}
