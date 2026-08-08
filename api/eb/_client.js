import { generateJWT } from './_jwt.js'
import { ApiError } from './_supabase.js'

const EB_BASE = 'https://api.enablebanking.com'

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const DAY_MS = 24 * 60 * 60 * 1000

function shiftDate(value, days) {
  return new Date(
    new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS,
  ).toISOString().slice(0, 10)
}

function transactionDate(transaction) {
  return transaction.value_date
    || transaction.transaction_date
    || transaction.booking_date
    || null
}

function transactionKey(transaction) {
  return transaction.entry_reference
    || transaction.transaction_id
    || JSON.stringify([
      transactionDate(transaction),
      transaction.credit_debit_indicator,
      transaction.transaction_amount?.amount,
      transaction.transaction_amount?.currency,
      transaction.remittance_information,
    ])
}

export async function enableBankingRequest(path, options = {}) {
  let response
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const jwt = await generateJWT()
    response = await fetch(`${EB_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${jwt}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
    if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
      break
    }
    await response.arrayBuffer()
    await wait(250 * (attempt + 1))
  }
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const providerMessage = data?.detail || data?.message || text.slice(0, 500)
    const error = new ApiError(
      502,
      `Enable Banking ${response.status}: ${providerMessage}`,
      'ENABLE_BANKING_PROVIDER_ERROR',
    )
    error.providerStatus = response.status
    error.publicMessage =
      `Enable Banking non ha completato la richiesta (codice ${response.status}).`
    throw error
  }
  return data
}

async function fetchTransactionsWithStrategy(
  accountUid,
  { dateFrom, dateTo, strategy },
) {
  const transactions = []
  const seenPageKeys = new Set()
  let continuationKey = null
  let pages = 0

  do {
    const params = new URLSearchParams()
    if (continuationKey) {
      params.set('continuation_key', continuationKey)
    } else {
      params.set('strategy', strategy)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
    }
    let data
    try {
      data = await enableBankingRequest(
        `/accounts/${encodeURIComponent(accountUid)}/transactions?${params}`,
      )
    } catch (error) {
      if (!transactions.length) throw error
      Object.defineProperty(transactions, 'partial', {
        value: true,
        enumerable: false,
      })
      Object.defineProperty(transactions, 'partialProviderStatus', {
        value: error?.providerStatus || null,
        enumerable: false,
      })
      break
    }
    transactions.push(...(data?.transactions || []))
    const next = data?.continuation_key || null
    if (next && seenPageKeys.has(next)) break
    if (next) seenPageKeys.add(next)
    continuationKey = next
    pages += 1
  } while (continuationKey && pages < 40)

  return transactions
}

async function fetchTransactionsByDateWindows(
  accountUid,
  { dateFrom, dateTo },
) {
  const transactions = []
  const seen = new Set()
  const ranges = []
  let partial = false
  let requests = 0

  for (let windowEnd = dateTo; windowEnd >= dateFrom;) {
    const proposedStart = shiftDate(windowEnd, -89)
    const windowStart = proposedStart < dateFrom ? dateFrom : proposedStart
    ranges.push({ start: windowStart, end: windowEnd })
    windowEnd = shiftDate(windowStart, -1)
  }

  while (ranges.length && requests < 80) {
    const range = ranges.shift()
    const params = new URLSearchParams({
      strategy: 'default',
      date_from: range.start,
      date_to: range.end,
    })
    let data
    try {
      requests += 1
      data = await enableBankingRequest(
        `/accounts/${encodeURIComponent(accountUid)}/transactions?${params}`,
      )
    } catch (error) {
      partial = true
      Object.defineProperty(transactions, 'partialProviderStatus', {
        value: error?.providerStatus || null,
        enumerable: false,
        configurable: true,
      })
      continue
    }
    const page = data?.transactions || []

    // Some N26 connections return a valid first page but cannot consume the
    // continuation key. Split the requested period until each response fits in
    // one page, so the complete history does not depend on that key.
    if (data?.continuation_key && range.start < range.end) {
      const startTime = new Date(`${range.start}T12:00:00Z`).getTime()
      const endTime = new Date(`${range.end}T12:00:00Z`).getTime()
      const middle = new Date(startTime + Math.floor((endTime - startTime) / 2))
        .toISOString()
        .slice(0, 10)
      ranges.unshift(
        { start: shiftDate(middle, 1), end: range.end },
        { start: range.start, end: middle },
      )
      continue
    }

    for (const transaction of page) {
      const key = transactionKey(transaction)
      if (seen.has(key)) continue
      seen.add(key)
      transactions.push(transaction)
    }

    // More than one page for a single date cannot be split any further.
    if (data?.continuation_key) partial = true
  }
  if (ranges.length) partial = true
  if (partial) {
    Object.defineProperty(transactions, 'partial', {
      value: true,
      enumerable: false,
    })
  }
  return transactions
}

export async function fetchAllTransactions(
  accountUid,
  { dateFrom, dateTo, preferredStrategy = 'default' },
) {
  const fallbackStrategy = preferredStrategy === 'longest' ? 'default' : 'longest'
  try {
    const transactions = await fetchTransactionsWithStrategy(accountUid, {
      dateFrom,
      dateTo,
      strategy: preferredStrategy,
    })
    if (preferredStrategy !== 'longest') {
      return transactions
    }
    const dates = transactions.map(transactionDate).filter(Boolean).sort()
    const oldest = dates[0] || dateTo
    // Include the boundary day: a capped page can contain only part of that
    // day's movements. Stable-key deduplication removes the overlap.
    const olderDateTo = oldest
    if (olderDateTo < dateFrom) {
      return transactions
    }
    const olderTransactions = await fetchTransactionsByDateWindows(
      accountUid,
      { dateFrom, dateTo: olderDateTo },
    )
    const combined = []
    const seen = new Set()
    for (const transaction of [...transactions, ...olderTransactions]) {
      const key = transactionKey(transaction)
      if (seen.has(key)) continue
      seen.add(key)
      combined.push(transaction)
    }
    if (olderTransactions.partial) {
      Object.defineProperty(combined, 'partial', {
        value: true,
        enumerable: false,
      })
      Object.defineProperty(combined, 'partialProviderStatus', {
        value: olderTransactions.partialProviderStatus || null,
        enumerable: false,
      })
    }
    return combined
  } catch (error) {
    if (![400, 404, 409, 422].includes(Number(error?.providerStatus))) throw error
    return fetchTransactionsWithStrategy(accountUid, {
      dateFrom,
      dateTo,
      strategy: fallbackStrategy,
    })
  }
}
