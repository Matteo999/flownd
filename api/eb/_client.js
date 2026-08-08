import { generateJWT } from './_jwt.js'
import { ApiError } from './_supabase.js'

const EB_BASE = 'https://api.enablebanking.com'

export async function enableBankingRequest(path, options = {}) {
  const jwt = await generateJWT()
  const response = await fetch(`${EB_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${jwt}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const providerMessage = data?.detail || data?.message || text.slice(0, 500)
    throw new ApiError(502, `Enable Banking ${response.status}: ${providerMessage}`)
  }
  return data
}

export async function fetchAllTransactions(accountUid, { dateFrom, dateTo }) {
  const transactions = []
  const seenPageKeys = new Set()
  let continuationKey = null
  let pages = 0

  do {
    const params = new URLSearchParams()
    if (continuationKey) {
      params.set('continuation_key', continuationKey)
    } else {
      params.set('strategy', 'default')
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
