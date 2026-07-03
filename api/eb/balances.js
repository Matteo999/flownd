import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { uid } = req.query
  if (!uid) return res.status(400).json({ error: 'uid obbligatorio' })

  try {
    const jwt = await generateJWT()
    const response = await fetch(`${EB_BASE}/accounts/${encodeURIComponent(uid)}/balances`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })

    if (!response.ok) {
      throw new Error(`Enable Banking error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    const available = data.balances?.find((balance) => balance.balance_type === 'interimAvailable')
      || data.balances?.[0]

    res.status(200).json({
      amount: parseFloat(available?.balance_amount?.amount || 0),
      currency: available?.balance_amount?.currency || 'EUR',
      balances: data.balances || [],
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
