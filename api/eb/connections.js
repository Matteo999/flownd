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
      .select('id,connection_id,name,currency,account_type,product,iban_last4,active')
      .eq('user_id', user.id)
    if (accountError) throw accountError
    const activeBankAccounts = (bankAccounts || []).filter((account) => account.active)
    const accountIds = activeBankAccounts.map((account) => account.id)
    const { data: financialAccounts, error: financialError } = accountIds.length
      ? await service
          .from('financial_accounts')
          .select('open_banking_account_id,current_balance,previous_month_balance,currency,last_synced_at')
          .eq('user_id', user.id)
          .eq('active', true)
          .in('open_banking_account_id', accountIds)
      : { data: [], error: null }
    if (financialError) throw financialError
    const connectionByAccount = new Map(
      activeBankAccounts.map((account) => [account.id, account.connection_id]),
    )
    const financialByAccount = new Map(
      (financialAccounts || []).map((account) => [account.open_banking_account_id, account]),
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
    const decoratedConnections = (connections || []).map((connection) => ({
      ...connection,
      balance: balances.get(connection.id) || 0,
      currency: 'EUR',
    }))
    const requestedConnectionId = String(req.query.id || '')
    if (requestedConnectionId) {
      const connection = decoratedConnections.find(
        (item) => item.id === requestedConnectionId,
      )
      if (!connection) throw new ApiError(404, 'Collegamento bancario non trovato')
      const resources = activeBankAccounts.filter(
        (account) => account.connection_id === connection.id,
      )
      const resourceIds = resources.map((account) => account.id)
      const { data: imports, error: importsError } = resourceIds.length
        ? await service
            .from('open_banking_transaction_imports')
            .select('bank_account_id,status')
            .eq('user_id', user.id)
            .in('bank_account_id', resourceIds)
        : { data: [], error: null }
      if (importsError) throw importsError
      const importsByAccount = new Map()
      for (const item of imports || []) {
        const summary = importsByAccount.get(item.bank_account_id)
          || { imported: 0, pending: 0 }
        summary.imported += 1
        if (item.status === 'pending') summary.pending += 1
        importsByAccount.set(item.bank_account_id, summary)
      }
      const detailedResources = resources.map((account) => {
        const financial = financialByAccount.get(account.id)
        const importSummary = importsByAccount.get(account.id)
          || { imported: 0, pending: 0 }
        return {
          id: account.id,
          name: account.name,
          product: account.product,
          accountType: account.account_type,
          ibanLast4: account.iban_last4,
          balance: Number(financial?.current_balance || 0),
          previousMonthBalance:
            financial?.previous_month_balance == null
              ? null
              : Number(financial.previous_month_balance),
          currency: financial?.currency || account.currency || 'EUR',
          lastSyncedAt: financial?.last_synced_at || null,
          importedTransactions: importSummary.imported,
          pendingTransactions: importSummary.pending,
        }
      })
      return res.status(200).json({
        ...connection,
        resources: detailedResources,
        importedTransactions: detailedResources.reduce(
          (sum, resource) => sum + resource.importedTransactions,
          0,
        ),
        pendingTransactions: detailedResources.reduce(
          (sum, resource) => sum + resource.pendingTransactions,
          0,
        ),
      })
    }
    return res.status(200).json({
      plan: entitlement.plan,
      maxConnections: entitlement.maxConnections,
      connections: decoratedConnections,
    })
  } catch (error) {
    return sendApiError(res, error)
  }
}
