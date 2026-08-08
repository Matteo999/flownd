import { generateJWT } from './_jwt.js'
import { ApiError } from './_supabase.js'

const EB_BASE = 'https://api.enablebanking.com'

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
    const data = await enableBankingRequest(
      `/accounts/${encodeURIComponent(accountUid)}/transactions?${params}`,
    )
    transactions.push(...(data?.transactions || []))
    const next = data?.continuation_key || null
    if (next && seenPageKeys.has(next)) break
    if (next) seenPageKeys.add(next)
    continuationKey = next
    pages += 1
  } while (continuationKey && pages < 40)

  return transactions
}

export async function fetchAllTransactions(
  accountUid,
  { dateFrom, dateTo, preferredStrategy = 'default' },
) {
  const fallbackStrategy = preferredStrategy === 'longest' ? 'default' : 'longest'
  try {
    return await fetchTransactionsWithStrategy(accountUid, {
      dateFrom,
      dateTo,
      strategy: preferredStrategy,
    })
  } catch (error) {
    if (![400, 404, 409, 422].includes(Number(error?.providerStatus))) throw error
    return fetchTransactionsWithStrategy(accountUid, {
      dateFrom,
      dateTo,
      strategy: fallbackStrategy,
    })
  }
}
