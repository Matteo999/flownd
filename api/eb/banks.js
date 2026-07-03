import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const country = req.query.country || 'IT'

  try {
    const jwt = await generateJWT()
    const response = await fetch(`${EB_BASE}/aspsps?country=${encodeURIComponent(country)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })

    if (!response.ok) {
      throw new Error(`Enable Banking error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    res.status(200).json(data.aspsps || [])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
