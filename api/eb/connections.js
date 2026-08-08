import {
  ApiError,
  authenticateRequest,
  sendApiError,
} from './_supabase.js'
import { enableBankingRequest } from './_client.js'

export default async function handler(req, res) {
  if (!['GET', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  try {
    const { user, service } = await authenticateRequest(req)
    if (req.method === 'DELETE') {
      const connectionId = String(req.query.id || '')
      if (!connectionId) throw new ApiError(400, 'Collegamento bancario mancante')
      const { data: connection, error: connectionError } = await service
        .from('open_banking_connections')
        .select('id,provider_session_id,status')
        .eq('id', connectionId)
        .eq('user_id', user.id)
        .single()
      if (connectionError || !connection) {
        throw new ApiError(404, 'Collegamento bancario non trovato')
      }
      if (connection.status === 'authorized') {
        try {
          await enableBankingRequest(
            `/sessions/${encodeURIComponent(connection.provider_session_id)}`,
            { method: 'DELETE' },
          )
        } catch (providerError) {
          if (![404, 410].includes(Number(providerError?.providerStatus))) {
            throw providerError
          }
        }
      }
      const { data: accounts, error: accountsError } = await service
        .from('open_banking_accounts')
        .select('id')
        .eq('connection_id', connection.id)
        .eq('user_id', user.id)
      if (accountsError) throw accountsError
      const accountIds = (accounts || []).map((account) => account.id)
      if (accountIds.length) {
        const { error: financialError } = await service
          .from('financial_accounts')
          .update({ active: false, last_synced_at: new Date().toISOString() })
          .in('open_banking_account_id', accountIds)
        if (financialError) throw financialError
      }
      const { error: bankAccountsError } = await service
        .from('open_banking_accounts')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('connection_id', connection.id)
        .eq('user_id', user.id)
      if (bankAccountsError) throw bankAccountsError
      const { error: revokeError } = await service
        .from('open_banking_connections')
        .update({
          status: 'revoked',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
      if (revokeError) throw revokeError
      return res.status(200).json({ removed: true })
    }

    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('plan_tier')
      .eq('id', user.id)
      .single()
    if (profileError) throw profileError
    const plan = profile.plan_tier || 'free'
    const entitlement = {
      plan,
      maxConnections: plan === 'max' ? 10 : plan === 'pro' ? 2 : 0,
    }
    const { data: connections, error } = await service
      .from('open_banking_connections')
      .select('id,aspsp_name,aspsp_country,status,valid_until,last_synced_at,last_error')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    const { data: bankAccounts, error: accountError } = await service
      .from('open_banking_accounts')
      .select('id,connection_id')
      .eq('user_id', user.id)
      .eq('active', true)
    if (accountError) throw accountError
    const accountIds = (bankAccounts || []).map((account) => account.id)
    const { data: financialAccounts, error: financialError } = accountIds.length
      ? await service
          .from('financial_accounts')
          .select('open_banking_account_id,current_balance,currency')
          .eq('user_id', user.id)
          .eq('active', true)
          .in('open_banking_account_id', accountIds)
      : { data: [], error: null }
    if (financialError) throw financialError
    const connectionByAccount = new Map(
      (bankAccounts || []).map((account) => [account.id, account.connection_id]),
    )
    const balances = new Map()
    for (const account of financialAccounts || []) {
      const connectionId = connectionByAccount.get(account.open_banking_account_id)
      if (!connectionId) continue
      balances.set(
        connectionId,
        (balances.get(connectionId) || 0) + Number(account.current_balance),
      )
    }
    return res.status(200).json({
      plan: entitlement.plan,
      maxConnections: entitlement.maxConnections,
      connections: (connections || []).map((connection) => ({
        ...connection,
        balance: balances.get(connection.id) || 0,
        currency: 'EUR',
      })),
    })
  } catch (error) {
    return sendApiError(res, error)
  }
}
