import { enableBankingRequest, fetchAllTransactions } from './_client.js'
import {
  chooseBalance,
  descriptionSimilarity,
  normalizeAccount,
  normalizeBankTransaction,
  redactBankPayload,
} from './_normalize.js'
import {
  ApiError,
  authenticateRequest,
  paidEntitlement,
  sendApiError,
} from './_supabase.js'
import { nextAutomaticSyncAt } from './_sync-schedule.js'

const DAY_MS = 24 * 60 * 60 * 1000

function dateOnly(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10)
}

function shiftDate(value, days) {
  return dateOnly(new Date(new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS))
}

function occurredAt(value) {
  return `${value}T12:00:00.000Z`
}

async function linkedTransaction(service, importId) {
  const { data, error } = await service
    .from('open_banking_transaction_links')
    .select('transaction_id')
    .eq('bank_import_id', importId)
    .maybeSingle()
  if (error) throw error
  return data?.transaction_id || null
}

async function createLink(service, values) {
  const { error } = await service
    .from('open_banking_transaction_links')
    .upsert(values, { onConflict: 'bank_import_id' })
  if (error) throw error
}

async function findManualMatch(service, userId, normalized) {
  const from = occurredAt(shiftDate(normalized.occurredOn, -2))
  const through = occurredAt(shiftDate(normalized.occurredOn, 3))
  const { data, error } = await service
    .from('transactions')
    .select('id,description,occurred_at,source')
    .eq('user_id', userId)
    .eq('kind', normalized.kind)
    .eq('amount', normalized.amount)
    .in('source', ['manual', 'onboarding'])
    .gte('occurred_at', from)
    .lt('occurred_at', through)
  if (error) throw error
  const candidates = (data || []).map((item) => {
    const sameDay = dateOnly(item.occurred_at) === normalized.occurredOn
    const similarity = descriptionSimilarity(item.description, normalized.description)
    return {
      ...item,
      confidence: sameDay ? Math.max(0.86, similarity) : similarity,
      sameDay,
    }
  })
  const sameDay = candidates.filter((item) => item.sameDay)
  if (sameDay.length === 1) return sameDay[0]
  const strong = candidates
    .filter((item) => item.confidence >= 0.72)
    .sort((first, second) => second.confidence - first.confidence)
  if (strong.length === 1 || (strong[0] && strong[0].confidence - (strong[1]?.confidence || 0) >= 0.18)) {
    return strong[0]
  }
  return null
}

async function reconcileTransaction({
  service,
  userId,
  bankAccountId,
  financialAccountId,
  raw,
  normalized,
}) {
  const { data: imported, error: importError } = await service
    .from('open_banking_transaction_imports')
    .upsert(
      {
        user_id: userId,
        bank_account_id: bankAccountId,
        stable_key: normalized.stableKey,
        entry_reference: normalized.entryReference,
        provider_transaction_id: normalized.providerTransactionId,
        content_fingerprint: normalized.contentFingerprint,
        status: normalized.status,
        direction: normalized.direction,
        amount: normalized.amount,
        currency: normalized.currency,
        booking_date: normalized.bookingDate,
        value_date: normalized.valueDate,
        transaction_date: normalized.transactionDate,
        occurred_on: normalized.occurredOn,
        description: normalized.description,
        counterparty: normalized.counterparty,
        bank_code: normalized.bankCode,
        bank_sub_code: normalized.bankSubCode,
        merchant_category_code: normalized.merchantCategoryCode,
        transfer_hint: normalized.transferHint,
        refund_hint: normalized.refundHint,
        raw_payload: redactBankPayload(raw),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'bank_account_id,stable_key' },
    )
    .select('id,match_status')
    .single()
  if (importError) throw importError

  let transactionId = await linkedTransaction(service, imported.id)
  if (transactionId) {
    const linkedUpdate = {
      bank_status: normalized.status,
      financial_account_id: financialAccountId,
      ...(normalized.status !== 'booked' ? { excluded_from_totals: true } : {}),
    }
    const { error } = await service
      .from('transactions')
      .update(linkedUpdate)
      .eq('id', transactionId)
    if (error) throw error
    return { imported: 0, linked: 0, pending: normalized.status === 'booked' ? 0 : 1 }
  }

  if (normalized.status !== 'booked') {
    return { imported: 0, linked: 0, pending: 1 }
  }

  const manualMatch = await findManualMatch(service, userId, normalized)
  if (manualMatch) {
    const { data: claimed, error } = await service
      .from('transactions')
      .update({
        source: 'manual_open_banking',
        financial_account_id: financialAccountId,
        bank_status: 'booked',
      })
      .eq('id', manualMatch.id)
      .in('source', ['manual', 'onboarding'])
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (claimed) {
      transactionId = claimed.id
      await createLink(service, {
        user_id: userId,
        bank_import_id: imported.id,
        transaction_id: transactionId,
        relation: 'manual_match',
        confidence: manualMatch.confidence,
      })
      await service
        .from('open_banking_transaction_imports')
        .update({ match_status: 'auto_linked' })
        .eq('id', imported.id)
      return { imported: 0, linked: 1, pending: 0 }
    }
  }

  const { data: created, error: transactionError } = await service
    .from('transactions')
    .insert({
      user_id: userId,
      description: normalized.description,
      amount: normalized.amount,
      category: normalized.category,
      occurred_at: occurredAt(normalized.occurredOn),
      source: 'open_banking',
      kind: normalized.kind,
      income_type:
        normalized.kind !== 'income'
          ? null
          : normalized.refundHint
            ? 'reimbursement'
            : normalized.category === 'Tredicesima'
              ? 'extra_salary'
              : normalized.category === 'Stipendio'
                ? 'salary'
                : 'other_income',
      excluded_from_budget:
        normalized.kind === 'income' &&
        (normalized.refundHint || normalized.category === 'Tredicesima'),
      financial_account_id: financialAccountId,
      bank_status: 'booked',
    })
    .select('id')
    .single()
  if (transactionError) throw transactionError
  transactionId = created.id
  await createLink(service, {
    user_id: userId,
    bank_import_id: imported.id,
    transaction_id: transactionId,
    relation: 'bank_created',
    confidence: 1,
  })
  return { imported: 1, linked: 0, pending: 0 }
}

async function markInternalTransfers(service, userId) {
  const { data, error } = await service
    .from('open_banking_transaction_imports')
    .select('id,bank_account_id,direction,amount,currency,occurred_on')
    .eq('user_id', userId)
    .eq('status', 'booked')
    .eq('transfer_hint', true)
    .order('occurred_on', { ascending: false })
    .limit(300)
  if (error) throw error
  const rows = data || []
  const pairs = []
  const used = new Set()
  for (let index = 0; index < rows.length; index += 1) {
    const first = rows[index]
    if (used.has(first.id)) continue
    const match = rows.slice(index + 1).find((second) =>
      !used.has(second.id)
      && first.bank_account_id !== second.bank_account_id
      && first.direction !== second.direction
      && Number(first.amount) === Number(second.amount)
      && first.currency === second.currency
      && Math.abs(
        new Date(first.occurred_on).getTime() - new Date(second.occurred_on).getTime(),
      ) <= 2 * DAY_MS,
    )
    if (match) {
      used.add(first.id)
      used.add(match.id)
      pairs.push([first.id, match.id])
    }
  }
  for (const pair of pairs) {
    const { data: links, error: linkError } = await service
      .from('open_banking_transaction_links')
      .select('transaction_id')
      .in('bank_import_id', pair)
    if (linkError) throw linkError
    if (links?.length !== 2) continue
    const { error: updateError } = await service
      .from('transactions')
      .update({
        internal_transfer: true,
        excluded_from_totals: true,
        excluded_from_budget: true,
        income_type: 'internal_transfer',
      })
      .in('id', links.map((item) => item.transaction_id))
    if (updateError) throw updateError
  }
  return pairs.length
}

async function syncAccount({ service, userId, connection, savedAccount, dateFrom, dateTo }) {
  const uid = savedAccount.provider_account_uid
  const skipN26SpaceTransactions =
    /n26/i.test(connection.aspsp_name) && !savedAccount.iban_last4
  const [detailsResult, balancesResult, transactionsResult] = await Promise.allSettled([
    enableBankingRequest(`/accounts/${encodeURIComponent(uid)}/details`),
    enableBankingRequest(`/accounts/${encodeURIComponent(uid)}/balances`),
    skipN26SpaceTransactions
      ? Promise.resolve([])
      : fetchAllTransactions(uid, {
          dateFrom,
          dateTo,
          preferredStrategy: /n26/i.test(connection.aspsp_name)
            ? 'longest'
            : 'default',
        }),
  ])
  const successfulResources = [detailsResult, balancesResult, transactionsResult]
    .filter((result) => result.status === 'fulfilled').length
  if (!successfulResources) {
    throw detailsResult.reason || balancesResult.reason || transactionsResult.reason
  }
  const details = detailsResult.status === 'fulfilled' ? detailsResult.value : null
  const balances = balancesResult.status === 'fulfilled' ? balancesResult.value : null
  const rawTransactions = transactionsResult.status === 'fulfilled'
    ? transactionsResult.value
    : []
  const normalizedAccount = normalizeAccount(
    {
      name: savedAccount.name,
      currency: savedAccount.currency,
      cash_account_type: savedAccount.account_type,
      product: savedAccount.product,
      ...(details || {}),
      uid,
      identification_hash: savedAccount.identification_hash,
    },
    connection.aspsp_name,
  )
  if (!normalizedAccount.active) {
    const inactiveError = new ApiError(409, 'Conto bancario non più attivo')
    inactiveError.code = 'INACTIVE_BANK_ACCOUNT'
    inactiveError.providerStatus = 410
    throw inactiveError
  }
  const selectedBalance = chooseBalance(balances)
  const now = new Date().toISOString()
  const { error: accountError } = await service
    .from('open_banking_accounts')
    .update({
      name: normalizedAccount.name,
      iban_last4: normalizedAccount.ibanLast4,
      currency: normalizedAccount.currency,
      account_type: normalizedAccount.accountType,
      product: normalizedAccount.product,
      active: true,
      updated_at: now,
    })
    .eq('id', savedAccount.id)
  if (accountError) throw accountError

  const { data: financial, error: financialError } = await service
    .from('financial_accounts')
    .select('id,previous_month_balance')
    .eq('open_banking_account_id', savedAccount.id)
    .single()
  if (financialError) throw financialError
  const historicalDate = shiftDate(dateTo, -28)
  const { data: oldSnapshot } = await service
    .from('financial_account_balance_snapshots')
    .select('balance')
    .eq('financial_account_id', financial.id)
    .lte('captured_on', historicalDate)
    .order('captured_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  const financialUpdate = {
    name: normalizedAccount.name,
    institution_name: connection.aspsp_name,
    currency: selectedBalance?.currency || normalizedAccount.currency,
    last_synced_at: now,
    active: true,
    ...(selectedBalance ? { current_balance: selectedBalance.amount } : {}),
    ...(oldSnapshot ? { previous_month_balance: Number(oldSnapshot.balance) } : {}),
  }
  const { error: financialUpdateError } = await service
    .from('financial_accounts')
    .update(financialUpdate)
    .eq('id', financial.id)
  if (financialUpdateError) throw financialUpdateError
  if (selectedBalance) {
    const { error: snapshotError } = await service
      .from('financial_account_balance_snapshots')
      .upsert(
        {
          user_id: userId,
          financial_account_id: financial.id,
          balance: selectedBalance.amount,
          currency: selectedBalance.currency,
          balance_type: selectedBalance.type,
          captured_on: dateTo,
        },
        { onConflict: 'financial_account_id,captured_on' },
      )
    if (snapshotError) throw snapshotError
  }

  const uniqueTransactions = new Map()
  for (const raw of rawTransactions) {
    const normalized = normalizeBankTransaction(raw, savedAccount.identification_hash)
    if (!normalized.occurredOn || normalized.amount <= 0) continue
    uniqueTransactions.set(normalized.stableKey, { raw, normalized })
  }
  const totals = { imported: 0, linked: 0, pending: 0 }
  const transactions = [...uniqueTransactions.values()]
  for (let index = 0; index < transactions.length; index += 8) {
    const results = await Promise.all(
      transactions.slice(index, index + 8).map(({ raw, normalized }) =>
        reconcileTransaction({
          service,
          userId,
          bankAccountId: savedAccount.id,
          financialAccountId: financial.id,
          raw,
          normalized,
        }),
      ),
    )
    for (const result of results) {
      totals.imported += result.imported
      totals.linked += result.linked
      totals.pending += result.pending
    }
  }
  return {
    ...totals,
    warnings:
      3 - successfulResources
      + (rawTransactions.partial ? 1 : 0),
    warningCodes: rawTransactions.partial
      ? [`transactions:${rawTransactions.partialProviderStatus || 'unknown'}`]
      : [],
  }
}

function shouldDeactivateAccount(error) {
  return error?.code === 'INACTIVE_BANK_ACCOUNT'
    || [400, 403, 404, 409, 410, 422].includes(Number(error?.providerStatus))
}

async function deactivateAccount(service, accountId) {
  const now = new Date().toISOString()
  const { error: accountError } = await service
    .from('open_banking_accounts')
    .update({ active: false, updated_at: now })
    .eq('id', accountId)
  if (accountError) throw accountError
  const { error: financialError } = await service
    .from('financial_accounts')
    .update({ active: false, last_synced_at: now })
    .eq('open_banking_account_id', accountId)
  if (financialError) throw financialError
}

export async function syncConnection({
  service,
  userId,
  connectionId,
  automatic = false,
}) {
    const { data: connection, error } = await service
      .from('open_banking_connections')
      .select('id,provider_session_id,aspsp_name,aspsp_country,status,valid_until,last_synced_at,last_error')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .single()
    if (error || !connection) throw new ApiError(404, 'Connessione bancaria non trovata')
    if (connection.status !== 'authorized' || new Date(connection.valid_until).getTime() <= Date.now()) {
      await service
        .from('open_banking_connections')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', connection.id)
      throw new ApiError(409, 'Il consenso bancario è scaduto. Collega nuovamente la banca.')
    }
    const { data: accounts, error: accountError } = await service
      .from('open_banking_accounts')
      .select('id,provider_account_uid,identification_hash,name,currency,account_type,product,iban_last4')
      .eq('connection_id', connection.id)
      .eq('user_id', userId)
      .eq('active', true)
    if (accountError) throw accountError
    const dateTo = dateOnly()
    const accountIds = (accounts || []).map((account) => account.id)
    const { count: existingImportCount, error: importCountError } = accountIds.length
      ? await service
          .from('open_banking_transaction_imports')
          .select('id', { count: 'exact', head: true })
          .in('bank_account_id', accountIds)
      : { count: 0, error: null }
    if (importCountError) throw importCountError
    const n26SinglePageImport =
      /n26/i.test(connection.aspsp_name)
      && (existingImportCount || 0) <= 10
    const incrementalSync =
      connection.last_synced_at
      && !connection.last_error
      && (existingImportCount || 0) > 0
      && !n26SinglePageImport
    const dateFrom = automatic && !connection.last_synced_at
      ? shiftDate(dateTo, -14)
      : incrementalSync
        ? shiftDate(dateOnly(connection.last_synced_at), -14)
        : shiftDate(dateTo, -370)
    const totals = { imported: 0, linked: 0, pending: 0 }
    let syncedAccounts = 0
    let skippedAccounts = 0
    let resourceWarnings = 0
    const warningCodes = new Set()
    const transientFailures = []
    const activeAccounts = accounts || []
    for (let index = 0; index < activeAccounts.length; index += 3) {
      const results = await Promise.all(
        activeAccounts.slice(index, index + 3).map(async (account) => {
          try {
            const result = await syncAccount({
              service,
              userId,
              connection,
              savedAccount: account,
              dateFrom,
              dateTo,
            })
            return { result, skipped: false, failure: null }
          } catch (accountSyncError) {
            console.warn('Enable Banking account sync incomplete', {
              connectionId: connection.id,
              accountId: account.id,
              code: accountSyncError?.code || null,
              providerStatus: accountSyncError?.providerStatus || null,
            })
            if (shouldDeactivateAccount(accountSyncError)) {
              await deactivateAccount(service, account.id)
              return { result: null, skipped: true, failure: null }
            }
            return { result: null, skipped: false, failure: accountSyncError }
          }
        }),
      )
      for (const item of results) {
        if (item.result) {
          totals.imported += item.result.imported
          totals.linked += item.result.linked
          totals.pending += item.result.pending
          resourceWarnings += item.result.warnings
          item.result.warningCodes.forEach((code) => warningCodes.add(code))
          syncedAccounts += 1
        }
        if (item.skipped) skippedAccounts += 1
        if (item.failure) transientFailures.push(item.failure)
      }
    }
    if (!syncedAccounts && transientFailures.length) {
      const unavailable = new ApiError(
        502,
        'Nessuna risorsa bancaria sincronizzabile',
        'BANK_RESOURCES_UNAVAILABLE',
      )
      unavailable.publicMessage =
        'La banca non ha restituito alcuna risorsa sincronizzabile. Riprova tra poco o rimuovi e ricollega il conto.'
      throw unavailable
    }
    const internalTransfers = await markInternalTransfers(service, userId)
    const syncedAt = new Date()
    const { error: connectionUpdateError } = await service
      .from('open_banking_connections')
      .update({
        last_synced_at: syncedAt.toISOString(),
        ...(automatic ? { last_auto_sync_at: syncedAt.toISOString() } : {}),
        next_sync_at: nextAutomaticSyncAt(connection.id, syncedAt).toISOString(),
        sync_locked_until: null,
        last_error:
          skippedAccounts || resourceWarnings || transientFailures.length
            ? `${skippedAccounts} conti ignorati, ${resourceWarnings} risorse non disponibili, ${transientFailures.length} errori temporanei${warningCodes.size ? ` (${[...warningCodes].join(', ')})` : ''}`
            : null,
        updated_at: syncedAt.toISOString(),
      })
      .eq('id', connection.id)
    if (connectionUpdateError) throw connectionUpdateError
    return {
      accounts: syncedAccounts,
      skippedAccounts,
      warnings: resourceWarnings + transientFailures.length,
      ...totals,
      internalTransfers,
    }
}

async function claimManualSync(service, userId, connectionId) {
  const { data, error } = await service.rpc('claim_open_banking_connection_sync', {
    p_connection_id: connectionId,
    p_user_id: userId,
    p_lock_minutes: 15,
  })
  if (error) throw error
  return Boolean(data)
}

async function releaseFailedSync(service, connectionId, error) {
  const now = new Date()
  const nextSync = nextAutomaticSyncAt(connectionId, now)
  const { error: updateError } = await service
    .from('open_banking_connections')
    .update({
      sync_locked_until: null,
      next_sync_at: nextSync.toISOString(),
      last_error: error?.code || `provider:${error?.providerStatus || 'unknown'}`,
      updated_at: now.toISOString(),
    })
    .eq('id', connectionId)
  if (updateError) throw updateError
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non supportato' })
  let service = null
  let connectionId = ''
  try {
    const authenticated = await authenticateRequest(req)
    service = authenticated.service
    await paidEntitlement(service, authenticated.user.id)
    connectionId = String(req.body?.connectionId || '')
    if (!connectionId) throw new ApiError(400, 'Connessione bancaria mancante')
    const claimed = await claimManualSync(service, authenticated.user.id, connectionId)
    if (!claimed) {
      throw new ApiError(409, 'Sincronizzazione già in corso.', 'SYNC_IN_PROGRESS')
    }
    const result = await syncConnection({
      service,
      userId: authenticated.user.id,
      connectionId,
    })
    return res.status(200).json(result)
  } catch (error) {
    if (service && connectionId && error?.code !== 'SYNC_IN_PROGRESS') {
      try {
        await releaseFailedSync(service, connectionId, error)
      } catch (releaseError) {
        console.error('Flownd sync lock release failed', releaseError)
      }
    }
    console.error('Enable Banking connection sync failed', {
      code: error?.code || null,
      status: error?.status || null,
      providerStatus: error?.providerStatus || null,
    })
    return sendApiError(res, error)
  }
}
