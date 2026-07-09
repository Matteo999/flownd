import { randomUUID } from 'crypto'
import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { bankName, bankCountry, redirectUrl } = req.body || {}
  if (!bankName || !bankCountry || !redirectUrl) {
    return res.status(400).json({ error: 'bankName, bankCountry e redirectUrl sono obbligatori' })
  }

  try {
    const jwt = await generateJWT()
    const validUntil = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()

    const body = {
      access: {
        balances: true,
        transactions: true,
        valid_until: validUntil,
      },
      aspsp: {
        name: bankName,
        country: bankCountry,
      },
      state: randomUUID(),
      redirect_url: redirectUrl,
      psu_type: 'personal',
    }

    const response = await fetch(`${EB_BASE}/auth`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Enable Banking error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    res.status(200).json({ url: data.url, authorizationId: data.authorization_id, validUntil })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
