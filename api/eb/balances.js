import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'

const BALANCE_TYPE_PRIORITY = {
  CLAV: 100,
  ITAV: 90,
  CLBD: 80,
  XPCD: 70,
  OTHR: 10,
  interimAvailable: 100,
  interimBooked: 90,
  closingBooked: 80,
  expected: 70,
}

function getBalanceScore(balance, index) {
  const type = balance.balance_type || ''
  const name = balance.name || ''
  const amount = Math.abs(parseFloat(balance.balance_amount?.amount || 0))
  const priority = BALANCE_TYPE_PRIORITY[type] || BALANCE_TYPE_PRIORITY[name] || 0

  return {
    balance,
    score: priority,
    amount,
    index,
  }
}

function chooseDisplayBalance(balances = []) {
  return balances
    .map(getBalanceScore)
    .sort((a, b) => b.score - a.score || b.amount - a.amount || a.index - b.index)[0]?.balance
}

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
    const available = chooseDisplayBalance(data.balances || [])

    res.status(200).json({
      amount: parseFloat(available?.balance_amount?.amount || 0),
      currency: available?.balance_amount?.currency || 'EUR',
      selectedBalanceType: available?.balance_type || null,
      selectedBalanceName: available?.name || null,
      balances: data.balances || [],
      raw: data,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
