import { randomUUID } from 'crypto'
import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { uid, dateFrom, dateTo } = req.query
  if (!uid) return res.status(400).json({ error: 'uid obbligatorio' })

  try {
    const jwt = await generateJWT()
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    const query = params.toString()
    const response = await fetch(
      `${EB_BASE}/accounts/${encodeURIComponent(uid)}/transactions${query ? `?${query}` : ''}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    )

    if (!response.ok) {
      throw new Error(`Enable Banking error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    const normalized = (data.transactions || [])
      .map((transaction) => ({
        id: transaction.transaction_id || randomUUID(),
        date: transaction.booking_date || transaction.value_date,
        description:
          transaction.creditor_name ||
          transaction.debtor_name ||
          transaction.remittance_information_unstructured ||
          'Transazione',
        amount: parseFloat(transaction.transaction_amount?.amount || 0),
        currency: transaction.transaction_amount?.currency || 'EUR',
        category: null,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))

    res.status(200).json({ transactions: normalized, raw: data })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
