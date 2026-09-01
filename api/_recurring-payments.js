import { createHash } from 'crypto'

const DAY_MS = 86_400_000
export const DETECTION_LOOKBACK_DAYS = 730
const FREQUENCIES = [
  { id: 'weekly', days: 7, tolerance: 2, samples: 3 },
  { id: 'biweekly', days: 14, tolerance: 3, samples: 3 },
  { id: 'monthly', days: 30.44, tolerance: 10, samples: 3 },
  { id: 'bimonthly', days: 60.88, tolerance: 10, samples: 3 },
  { id: 'quarterly', days: 91.31, tolerance: 10, samples: 3 },
  { id: 'semiannual', days: 182.62, tolerance: 10, samples: 2 },
  { id: 'annual', days: 365.25, tolerance: 10, samples: 2 },
]

function dateOnly(value) {
  return String(value || '').slice(0, 10)
}

function dateAtNoon(value) {
  return `${dateOnly(value)}T12:00:00.000Z`
}

function dayDistance(first, second) {
  return Math.round(Math.abs(new Date(dateAtNoon(first)) - new Date(dateAtNoon(second))) / DAY_MS)
}

function normalizedIdentity(row) {
  return String(row.merchant_name || row.counterparty_name || row.description || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:pagamento|bonifico|addebito|accredito|sepa|carta|card)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 90)
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function nextRecurringDate(value, frequency, anchorDay = null) {
  const current = new Date(`${dateOnly(value)}T12:00:00Z`)
  if (frequency === 'weekly' || frequency === 'biweekly') {
    current.setUTCDate(current.getUTCDate() + (frequency === 'weekly' ? 7 : 14))
    return current.toISOString().slice(0, 10)
  }
  const months = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 }[frequency]
  if (!months) throw new Error('Invalid recurring frequency')
  const wantedDay = anchorDay || current.getUTCDate()
  current.setUTCDate(1)
  current.setUTCMonth(current.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0, 12)).getUTCDate()
  current.setUTCDate(Math.min(wantedDay, lastDay))
  return current.toISOString().slice(0, 10)
}

function detectedFrequency(rows) {
  if (rows.length < 2) return null
  const gaps = rows.slice(1).map((row, index) => dayDistance(rows[index].occurred_at, row.occurred_at))
  const typical = median(gaps)
  return FREQUENCIES.find((candidate) =>
    rows.length >= candidate.samples && Math.abs(typical - candidate.days) <= candidate.tolerance,
  ) || null
}

export function detectRecurringCandidates(rows, dismissedSignatures = new Set()) {
  const clusters = new Map()
  for (const row of rows) {
    if (
      row.internal_transfer || row.excluded_from_totals
      || row.source === 'manual_balance_adjustment'
      || row.source === 'recurring_generated'
      || row.recurring_payment_id
      || (row.bank_status && row.bank_status !== 'booked')
    ) continue
    const identity = normalizedIdentity(row)
    if (!identity || Number(row.amount) <= 0) continue
    const key = `${row.financial_account_id || 'none'}:${row.kind || 'expense'}:${row.category}:${identity}`
    const existing = clusters.get(key) || []
    existing.push(row)
    clusters.set(key, existing)
  }
  const candidates = []
  for (const [key, unordered] of clusters) {
    const rowsForKey = [...unordered].sort((a, b) => dateOnly(a.occurred_at).localeCompare(dateOnly(b.occurred_at)))
    const amount = median(rowsForKey.map((row) => Number(row.amount)))
    const amountRows = rowsForKey.filter((row) => Math.abs(Number(row.amount) - amount) <= amount * 0.25)
    const frequency = detectedFrequency(amountRows)
    if (!frequency) continue
    const last = amountRows.at(-1)
    let nextDueOn = nextRecurringDate(last.occurred_at, frequency.id, new Date(dateAtNoon(amountRows[0].occurred_at)).getUTCDate())
    while (nextDueOn < new Date().toISOString().slice(0, 10)) {
      nextDueOn = nextRecurringDate(nextDueOn, frequency.id, new Date(dateAtNoon(amountRows[0].occurred_at)).getUTCDate())
    }
    const signature = createHash('sha256').update(`${key}:${frequency.id}:${Math.round(amount * 4)}`).digest('hex')
    if (dismissedSignatures.has(signature)) continue
    candidates.push({
      signature,
      name: last.merchant_name || last.counterparty_name || last.description,
      amount: Math.round(amount * 100) / 100,
      direction: last.kind || 'expense',
      category: last.category,
      frequency: frequency.id,
      anchorOn: dateOnly(amountRows[0].occurred_at),
      nextDueOn,
      financialAccountId: last.financial_account_id || null,
      transactionIds: amountRows.map((row) => row.id),
    })
  }
  return candidates
}

export async function refreshDetectedRecurringPayments(service, userId, { transactionId = null } = {}) {
  const since = new Date(Date.now() - DETECTION_LOOKBACK_DAYS * DAY_MS).toISOString()
  let transactionQuery = service
    .from('transactions')
    .select('id,description,amount,category,kind,occurred_at,source,financial_account_id,bank_status,internal_transfer,excluded_from_totals,merchant_name,counterparty_name,recurring_payment_id')
    .eq('user_id', userId)
    .gte('occurred_at', since)
    .order('occurred_at')
  if (transactionId) {
    const { data: seed, error: seedError } = await service.from('transactions')
      .select('id,kind,category,financial_account_id')
      .eq('id', transactionId).eq('user_id', userId).single()
    if (seedError) throw seedError
    transactionQuery = transactionQuery.eq('kind', seed.kind).eq('category', seed.category)
    transactionQuery = seed.financial_account_id
      ? transactionQuery.eq('financial_account_id', seed.financial_account_id)
      : transactionQuery.is('financial_account_id', null)
  }
  const { data, error } = await transactionQuery
  if (error) throw error
  const { data: dismissalRows, error: dismissalError } = await service
    .from('recurring_payment_dismissals')
    .select('detection_signature')
    .eq('user_id', userId)
  if (dismissalError) throw dismissalError
  const dismissedSignatures = new Set((dismissalRows || []).map((row) => row.detection_signature))
  const candidates = detectRecurringCandidates(data || [], dismissedSignatures)
    .filter((candidate) => !transactionId || candidate.transactionIds.includes(transactionId))
  for (const candidate of candidates) {
    const { data: account } = candidate.financialAccountId
      ? await service.from('financial_accounts').select('source').eq('id', candidate.financialAccountId).maybeSingle()
      : { data: null }
    let { data: series, error: seriesError } = await service
      .from('recurring_payments')
      .select('id,status')
      .eq('user_id', userId)
      .eq('detection_signature', candidate.signature)
      .maybeSingle()
    if (seriesError) throw seriesError
    if (!series) {
      const inserted = await service.from('recurring_payments').insert({
        user_id: userId,
        name: candidate.name,
        amount: candidate.amount,
        next_due_at: `${candidate.nextDueOn}T12:00:00.000Z`,
        series_type: 'custom',
        direction: candidate.direction,
        origin: 'detected',
        status: 'active',
        frequency: candidate.frequency,
        category: candidate.category,
        anchor_on: candidate.anchorOn,
        next_due_on: candidate.nextDueOn,
        financial_account_id: candidate.financialAccountId,
        settlement_mode: account?.source === 'open_banking' ? 'bank_match' : 'manual_post',
        detection_signature: candidate.signature,
        updated_at: new Date().toISOString(),
      }).select('id,status').single()
      series = inserted.data
      seriesError = inserted.error
      if (seriesError?.code === '23505') {
        const concurrent = await service.from('recurring_payments')
          .select('id,status').eq('user_id', userId)
          .eq('detection_signature', candidate.signature).single()
        series = concurrent.data
        seriesError = concurrent.error
      }
      if (seriesError) throw seriesError
    }
    if (!series || series.status !== 'active') continue
    await service.rpc('ensure_recurring_occurrence', { p_series_id: series.id })
    const { data: linkedRows } = await service
      .from('transactions')
      .select('id,occurred_at,amount')
      .in('id', candidate.transactionIds)
      .is('recurring_payment_id', null)
    for (const transaction of linkedRows || []) {
      const due = dateOnly(transaction.occurred_at)
      const { data: occurrence } = await service
        .from('recurring_payment_occurrences')
        .upsert({ user_id: userId, recurring_payment_id: series.id, expected_due_on: due,
          expected_amount: Number(transaction.amount), transaction_id: transaction.id,
          status: 'matched', match_confidence: 0.9, resolved_at: new Date().toISOString() },
        { onConflict: 'recurring_payment_id,expected_due_on' })
        .select('id').single()
      if (occurrence) await service.from('transactions').update({
        recurring_payment_id: series.id, recurring_occurrence_id: occurrence.id,
      }).eq('id', transaction.id).is('recurring_payment_id', null)
    }
  }
  return candidates.length
}

export async function reconcileRecurringTransaction(service, userId, transactionId) {
  const { data: transaction, error } = await service.from('transactions')
    .select('id,amount,kind,occurred_at,financial_account_id,merchant_name,counterparty_name,description,recurring_payment_id')
    .eq('id', transactionId).eq('user_id', userId).single()
  if (error) throw error
  if (transaction.recurring_payment_id) return false
  const occurredOn = dateOnly(transaction.occurred_at)
  const from = new Date(`${occurredOn}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 10)
  const through = new Date(`${occurredOn}T12:00:00Z`); through.setUTCDate(through.getUTCDate() + 10)
  let query = service.from('recurring_payment_occurrences')
    .select('id,status,expected_due_on,expected_amount,recurring_payment_id,recurring_payments!inner(direction,status,settlement_mode,financial_account_id,amount_tolerance,date_tolerance_days,name)')
    .eq('user_id', userId).in('status', ['projected', 'missed'])
    .gte('expected_due_on', from.toISOString().slice(0, 10))
    .lte('expected_due_on', through.toISOString().slice(0, 10))
  const { data: occurrences, error: occurrenceError } = await query
  if (occurrenceError) throw occurrenceError
  const identity = normalizedIdentity(transaction)
  const candidates = (occurrences || []).flatMap((occurrence) => {
    const series = occurrence.recurring_payments
    if (series.status !== 'active' || series.settlement_mode !== 'bank_match') return []
    if (series.direction !== transaction.kind) return []
    if (series.financial_account_id && series.financial_account_id !== transaction.financial_account_id) return []
    const dateGap = dayDistance(occurredOn, occurrence.expected_due_on)
    if (dateGap > Number(series.date_tolerance_days)) return []
    const amountGap = Math.abs(Number(transaction.amount) - Number(occurrence.expected_amount)) / Number(occurrence.expected_amount)
    if (amountGap > Number(series.amount_tolerance)) return []
    const name = normalizedIdentity({ description: series.name })
    const identityMatch = identity.includes(name) || name.includes(identity)
    if (!identityMatch) return []
    return [{ ...occurrence, score: 1 - amountGap - dateGap / 100 }]
  }).sort((a, b) => b.score - a.score)
  if (!candidates[0] || (candidates[1] && candidates[0].score - candidates[1].score < 0.08)) return false
  const selected = candidates[0]
  const { error: claimError } = await service.from('recurring_payment_occurrences').update({
    transaction_id: transactionId, status: 'matched', match_confidence: selected.score,
    resolved_at: new Date().toISOString(),
  }).eq('id', selected.id).in('status', ['projected', 'missed']).is('transaction_id', null)
  if (claimError) throw claimError
  await service.from('transactions').update({
    recurring_payment_id: selected.recurring_payment_id, recurring_occurrence_id: selected.id,
  }).eq('id', transactionId)
  if (selected.status !== 'missed') {
    await service.rpc('advance_recurring_payment', { p_series_id: selected.recurring_payment_id })
  }
  return true
}

async function findExistingManualOccurrence(service, occurrence, series) {
  const due = new Date(`${occurrence.expected_due_on}T12:00:00Z`)
  const from = new Date(due); from.setUTCDate(from.getUTCDate() - series.date_tolerance_days)
  const through = new Date(due); through.setUTCDate(through.getUTCDate() + series.date_tolerance_days + 1)
  const lower = Number(occurrence.expected_amount) * (1 - Number(series.amount_tolerance))
  const upper = Number(occurrence.expected_amount) * (1 + Number(series.amount_tolerance))
  const { data } = await service.from('transactions').select('id,amount,occurred_at,description,merchant_name,counterparty_name')
    .eq('user_id', occurrence.user_id).eq('kind', series.direction)
    .gte('amount', lower).lte('amount', upper).gte('occurred_at', from.toISOString())
    .lt('occurred_at', through.toISOString()).is('recurring_payment_id', null)
    .neq('source', 'recurring_generated').limit(2)
  const wantedIdentity = normalizedIdentity({ description: series.name })
  const matching = (data || []).filter((row) => {
    const identity = normalizedIdentity(row)
    return identity.includes(wantedIdentity) || wantedIdentity.includes(identity)
  })
  return matching.length === 1 ? matching[0] : null
}

export async function processDueRecurringPayments(service, today = new Date().toISOString().slice(0, 10)) {
  const { data, error } = await service.from('recurring_payment_occurrences')
    .select('id,user_id,expected_due_on,expected_amount,recurring_payment_id,recurring_payments!inner(name,direction,category,status,settlement_mode,financial_account_id,amount_tolerance,date_tolerance_days)')
    .eq('status', 'projected').lte('expected_due_on', today).limit(500)
  if (error) throw error
  const results = { materialized: 0, matched: 0, missed: 0 }
  for (const occurrence of data || []) {
    const series = occurrence.recurring_payments
    if (series.status !== 'active' || series.settlement_mode === 'review') continue
    const lateDays = dayDistance(today, occurrence.expected_due_on)
    if (series.settlement_mode === 'bank_match') {
      if (lateDays <= series.date_tolerance_days) continue
      const { data: missed } = await service.from('recurring_payment_occurrences')
        .update({ status: 'missed', resolved_at: new Date().toISOString() })
        .eq('id', occurrence.id).eq('status', 'projected').select('id').maybeSingle()
      if (missed) { await service.rpc('advance_recurring_payment', { p_series_id: occurrence.recurring_payment_id }); results.missed += 1 }
      continue
    }
    const existing = await findExistingManualOccurrence(service, occurrence, series)
    let transactionId = existing?.id
    let status = 'matched'
    if (!transactionId) {
      let newlyCreated = false
      const { data: created, error: createError } = await service.from('transactions').insert({
        user_id: occurrence.user_id, description: series.name,
        amount: occurrence.expected_amount, category: series.category,
        occurred_at: dateAtNoon(occurrence.expected_due_on), source: 'recurring_generated',
        kind: series.direction, financial_account_id: series.financial_account_id,
        recurring_payment_id: occurrence.recurring_payment_id, recurring_occurrence_id: occurrence.id,
      }).select('id').single()
      if (createError?.code === '23505') {
        const { data: existingGenerated } = await service.from('transactions')
          .select('id').eq('recurring_occurrence_id', occurrence.id).maybeSingle()
        transactionId = existingGenerated?.id
      } else if (createError) throw createError
      else { transactionId = created.id; newlyCreated = true }
      if (!transactionId) throw new Error('Recurring transaction idempotency claim failed')
      status = 'materialized'
      if (newlyCreated && series.financial_account_id) {
        const { data: account } = await service.from('financial_accounts').select('current_balance,source')
          .eq('id', series.financial_account_id).single()
        if (account?.source === 'manual') {
          const delta = Number(occurrence.expected_amount) * (series.direction === 'income' ? 1 : -1)
          await service.rpc('apply_recurring_account_delta', {
            p_account_id: series.financial_account_id,
            p_delta: delta,
          })
        }
      }
      if (newlyCreated) {
        await service.from('goal_notifications').insert({
          user_id: occurrence.user_id, title: 'Movimento ricorrente registrato',
          body: `${series.name} è stato aggiunto automaticamente.`,
          action_route: `/(tabs)/timeline?transactionId=${transactionId}`,
        })
        results.materialized += 1
      }
    } else results.matched += 1
    const { data: resolved } = await service.from('recurring_payment_occurrences').update({
      transaction_id: transactionId, status, match_confidence: existing ? 0.8 : 1,
      resolved_at: new Date().toISOString(),
    }).eq('id', occurrence.id).eq('status', 'projected').select('id').maybeSingle()
    if (resolved) {
      await service.from('transactions').update({ recurring_payment_id: occurrence.recurring_payment_id,
        recurring_occurrence_id: occurrence.id }).eq('id', transactionId)
      await service.rpc('advance_recurring_payment', { p_series_id: occurrence.recurring_payment_id })
    }
  }
  return results
}

export async function runRecurringMaintenance(
  service,
  _options = {},
) {
  return processDueRecurringPayments(service)
}
