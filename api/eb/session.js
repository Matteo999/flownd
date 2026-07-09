import { generateJWT } from './_jwt.js'

const EB_BASE = 'https://api.enablebanking.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { code } = req.body || {}
  if (!code) return res.status(400).json({ error: 'Il parametro code è obbligatorio' })

  try {
    const jwt = await generateJWT()
    const response = await fetch(`${EB_BASE}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    })

    if (!response.ok) {
      throw new Error(`Enable Banking error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    res.status(200).json({
      sessionId: data.session_id,
      accounts: data.accounts || [],
      raw: data,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
