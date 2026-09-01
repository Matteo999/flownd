import { authenticateRequest, serviceClient } from './eb/_supabase.js'
import {
  processDueRecurringPayments,
  refreshDetectedRecurringPayments,
} from './_recurring-payments.js'

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!cronAuthorized(req)) return res.status(401).json({ error: 'Cron non autorizzato' })
      const service = serviceClient()
      const result = await processDueRecurringPayments(service)
      const since = new Date(Date.now() - 370 * 86_400_000).toISOString()
      const { data: activeRows, error: activeError } = await service.from('transactions')
        .select('user_id').gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(5000)
      if (activeError) throw activeError
      const userIds = [...new Set((activeRows || []).map((row) => row.user_id))]
      let detected = 0
      for (let index = 0; index < userIds.length; index += 4) {
        const counts = await Promise.all(userIds.slice(index, index + 4)
          .map((userId) => refreshDetectedRecurringPayments(service, userId)))
        detected += counts.reduce((sum, count) => sum + count, 0)
      }
      return res.status(200).json({ ...result, scannedUsers: userIds.length, detected })
    }
    if (req.method === 'POST') {
      const { service, user } = await authenticateRequest(req)
      const detected = await refreshDetectedRecurringPayments(service, user.id)
      return res.status(200).json({ detected })
    }
    return res.status(405).json({ error: 'Metodo non supportato' })
  } catch (error) {
    console.error('Flownd recurring payment handler failed', error)
    return res.status(error?.status || 500).json({ error: 'Impossibile aggiornare i pagamenti ricorrenti' })
  }
}
