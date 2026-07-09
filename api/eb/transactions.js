import { randomUUID } from 'crypto'
import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'
const MAX_TRANSACTION_PAGES = 40

function getContinuationKey(data) {
  return data.continuation_key
    || data.continuationKey
    || data.next_continuation_key
    || data.nextContinuationKey
    || null
}

function getDescription(transaction) {
  return transaction.description
    || transaction.bank_transaction_code?.description
    || transaction.creditor_name
    || transaction.debtor_name
    || transaction.remittance_information?.join(' ')
    || transaction.remittance_information_unstructured
    || 'Transazione'
}

function getSignedAmount(transaction) {
  const amount = Math.abs(parseFloat(transaction.transaction_amount?.amount || 0))
  const indicator = String(transaction.credit_debit_indicator || '').toUpperCase()

  if (indicator.includes('DBIT') || indicator.includes('DEBIT')) return -amount
  if (indicator.includes('CRDT') || indicator.includes('CREDIT')) return amount

  return parseFloat(transaction.transaction_amount?.amount || 0)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { uid, dateFrom, dateTo } = req.query
  if (!uid) return res.status(400).json({ error: 'uid obbligatorio' })

  try {
    const jwt = await generateJWT()
    const pages = []
    const allTransactions = []
    let continuationKey = null
    let pageCount = 0

    do {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (continuationKey) params.set('continuation_key', continuationKey)

      const query = params.toString()
      const response = await fetch(
        `${EB_BASE}/accounts/${encodeURIComponent(uid)}/transactions${query ? `?${query}` : ''}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      )

      if (!response.ok) {
        throw new Error(`Enable Banking error: ${response.status} ${await response.text()}`)
      }

      const data = await response.json()
      pages.push(data)
      allTransactions.push(...(data.transactions || []))
      pageCount += 1

      const nextContinuationKey = getContinuationKey(data)
      continuationKey = nextContinuationKey !== continuationKey ? nextContinuationKey : null
    } while (continuationKey && pageCount < MAX_TRANSACTION_PAGES)

    const normalized = allTransactions
      .map((transaction) => ({
        id: transaction.transaction_id || randomUUID(),
        date: transaction.booking_date || transaction.transaction_date || transaction.value_date,
        description: getDescription(transaction),
        amount: getSignedAmount(transaction),
        currency: transaction.transaction_amount?.currency || 'EUR',
        category: null,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))

    res.status(200).json({
      transactions: normalized,
      raw: {
        request: { dateFrom, dateTo, pagesFetched: pageCount, hitPageLimit: Boolean(continuationKey) },
        pages,
        transactions: allTransactions,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
