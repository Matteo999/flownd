import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'

function buildTransactionsQuery(query) {
  const params = new URLSearchParams()

  if (query.continuationKey) {
    params.set('continuation_key', query.continuationKey)
    return params
  }

  if (query.dateFrom) params.set('date_from', query.dateFrom)
  if (query.dateTo) params.set('date_to', query.dateTo)
  if (query.transactionStatus) params.set('transaction_status', query.transactionStatus)
  if (query.strategy) params.set('strategy', query.strategy)

  return params
}

function getRawPath(query) {
  const { kind, uid, transactionId } = query
  if (!uid) throw new Error('uid obbligatorio')

  if (kind === 'details') return `/accounts/${encodeURIComponent(uid)}/details`
  if (kind === 'balances') return `/accounts/${encodeURIComponent(uid)}/balances`

  if (kind === 'transactions') {
    const params = buildTransactionsQuery(query)
    const search = params.toString()
    return `/accounts/${encodeURIComponent(uid)}/transactions${search ? `?${search}` : ''}`
  }

  if (kind === 'transaction-details') {
    if (!transactionId) throw new Error('transactionId obbligatorio')
    return `/accounts/${encodeURIComponent(uid)}/transactions/${encodeURIComponent(transactionId)}`
  }

  throw new Error('kind non supportato')
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const jwt = await generateJWT()
    const path = getRawPath(req.query)
    const response = await fetch(`${EB_BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    })
    const text = await response.text()

    res.status(response.status)
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}
