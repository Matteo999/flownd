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

function getTransactionKey(transaction) {
  const stableReference = transaction.transaction_id || transaction.entry_reference
  if (stableReference && String(stableReference).length > 8) return stableReference

  return transaction.transaction_id
    || [
      transaction.booking_date || transaction.transaction_date || transaction.value_date || '',
      transaction.transaction_amount?.amount || '',
      transaction.transaction_amount?.currency || '',
      getDescription(transaction),
      transaction.status || '',
    ].join('|')
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { uid, dateFrom, dateTo, strategy = 'longest' } = req.query
  if (!uid) return res.status(400).json({ error: 'uid obbligatorio' })

  try {
    const jwt = await generateJWT()
    const pages = []
    const allTransactions = []
    const seenTransactionKeys = new Set()
    let continuationKey = null
    let pageCount = 0
    let duplicateCount = 0
    let paginationError = null
    let stopReason = 'completed'

    do {
      const params = new URLSearchParams()
      if (continuationKey) {
        params.set('continuation_key', continuationKey)
      } else {
        if (strategy) params.set('strategy', strategy)
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo) params.set('date_to', dateTo)
      }

      const query = params.toString()
      const response = await fetch(
        `${EB_BASE}/accounts/${encodeURIComponent(uid)}/transactions${query ? `?${query}` : ''}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      )

      if (!response.ok) {
        const errorText = await response.text()
        if (pageCount > 0) {
          paginationError = {
            status: response.status,
            body: errorText,
          }
          stopReason = 'continuation-error'
          continuationKey = null
          break
        }

        throw new Error(`Enable Banking error: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      const pageTransactions = data.transactions || []
      let newTransactionsInPage = 0

      pages.push(data)
      pageTransactions.forEach((transaction) => {
        const key = getTransactionKey(transaction)
        if (seenTransactionKeys.has(key)) {
          duplicateCount += 1
          return
        }

        seenTransactionKeys.add(key)
        allTransactions.push(transaction)
        newTransactionsInPage += 1
      })
      pageCount += 1

      if (pageTransactions.length > 0 && newTransactionsInPage === 0) {
        stopReason = 'duplicate-page'
        continuationKey = null
        break
      }

      const nextContinuationKey = getContinuationKey(data)
      continuationKey = nextContinuationKey !== continuationKey ? nextContinuationKey : null
      if (!continuationKey) stopReason = 'no-continuation-key'
      if (pageCount >= MAX_TRANSACTION_PAGES) stopReason = 'page-limit'
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
        request: {
          dateFrom,
          dateTo,
          strategy,
          pagesFetched: pageCount,
          duplicateCount,
          hitPageLimit: stopReason === 'page-limit',
          stopReason,
          paginationError,
        },
        pages,
        transactions: allTransactions,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
