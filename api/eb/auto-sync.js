import { serviceClient } from './_supabase.js'
import { nextAutomaticSyncAt } from './_sync-schedule.js'
import { syncConnection } from './sync.js'

function authorizedCronRequest(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

async function releaseFailedSync(service, connectionId, error) {
  const now = new Date()
  const { error: updateError } = await service
    .from('open_banking_connections')
    .update({
      sync_locked_until: null,
      next_sync_at: nextAutomaticSyncAt(connectionId, now).toISOString(),
      last_error: error?.code || `provider:${error?.providerStatus || 'unknown'}`,
      updated_at: now.toISOString(),
    })
    .eq('id', connectionId)
  if (updateError) throw updateError
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  if (!authorizedCronRequest(req)) {
    return res.status(401).json({ error: 'Cron non autorizzato' })
  }

  const service = serviceClient()
  const now = new Date().toISOString()
  const { error: expirationError } = await service
    .from('open_banking_connections')
    .update({ status: 'expired', sync_locked_until: null, updated_at: now })
    .eq('status', 'authorized')
    .lte('valid_until', now)
  if (expirationError) {
    console.error('Flownd expired connection cleanup failed', expirationError)
    return res.status(500).json({ error: 'Impossibile aggiornare i consensi scaduti' })
  }
  const startedAt = Date.now()
  const results = []
  while (Date.now() - startedAt < 4 * 60 * 1000) {
    const { data: claimed, error: claimError } = await service.rpc(
      'claim_open_banking_sync_batch',
      { p_limit: 2, p_lock_minutes: 15 },
    )
    if (claimError) {
      console.error('Flownd automatic sync claim failed', claimError)
      if (!results.length) {
        return res.status(500).json({ error: 'Impossibile avviare il sync automatico' })
      }
      break
    }
    if (!claimed?.length) break

    const batchResults = await Promise.all(
      claimed.map(async (connection) => {
        try {
          const result = await syncConnection({
            service,
            userId: connection.user_id,
            connectionId: connection.connection_id,
            automatic: true,
          })
          return { connectionId: connection.connection_id, ok: true, ...result }
        } catch (error) {
          console.error('Flownd automatic connection sync failed', {
            connectionId: connection.connection_id,
            code: error?.code || null,
            providerStatus: error?.providerStatus || null,
          })
          try {
            await releaseFailedSync(service, connection.connection_id, error)
          } catch (releaseError) {
            console.error('Flownd automatic sync lock release failed', releaseError)
          }
          return {
            connectionId: connection.connection_id,
            ok: false,
            code: error?.code || 'SYNC_FAILED',
          }
        }
      }),
    )
    results.push(...batchResults)
    if (claimed.length < 2) break
  }

  return res.status(200).json({ claimed: results.length, results })
}
