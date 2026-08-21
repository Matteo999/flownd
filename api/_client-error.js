import { randomUUID } from 'node:crypto'

import { authenticateUserRequest } from './eb/_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  const reportId = randomUUID()
  try {
    const { user } = await authenticateUserRequest(req)
    const context = String(req.body?.context || 'unknown').slice(0, 80)
    const message = String(req.body?.message || 'No message').slice(0, 1000)
    const stack = String(req.body?.stack || '').slice(0, 4000)
    const platform = String(req.body?.platform || 'unknown').slice(0, 30)
    console.error('Flownd client error report', {
      reportId,
      userId: user.id,
      context,
      message,
      stack,
      platform,
    })
    return res.status(202).json({ reportId })
  } catch (error) {
    console.error('Flownd client error report rejected', { reportId, error })
    return res.status(Number(error?.status) || 500).json({ reportId })
  }
}
