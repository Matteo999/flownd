import { randomUUID } from 'node:crypto'

import clientErrorHandler from './_client-error.js'
import groupInvitesHandler from './_group-invites.js'
import transactionImportHandler from './_transaction-import.js'
import transactionScanHandler from './_transaction-scan.js'
import {
  RECURRING_DETECTOR_VERSION,
  refreshDetectedRecurringPayments,
} from './_recurring-payments.js'
import { authenticateRequest } from './eb/_supabase.js'

// HOBBY_CONSOLIDATION(pro-split:recurring-payments)
// Con Vercel Pro questa action torna nell'entrypoint /api/recurring-payments.
async function recurringRefreshHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non supportato' })
  const { service, user } = await authenticateRequest(req)
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const reason = body.reason === 'startup' ? 'startup' : 'activity'
  let profile = null
  if (reason === 'startup') {
    const { data, error: profileError } = await service.from('profiles')
      .select('recurring_detection_version,recurring_detection_next_scan_at')
      .eq('id', user.id).single()
    if (profileError) throw profileError
    profile = data
    const scheduledAt = profile.recurring_detection_next_scan_at
      ? new Date(profile.recurring_detection_next_scan_at).getTime()
      : 0
    if (
      Number(profile.recurring_detection_version) >= RECURRING_DETECTOR_VERSION
      && scheduledAt > Date.now()
    ) {
      return res.status(200).json({ detected: 0, skipped: true })
    }
    const { error: runningError } = await service.from('profiles').update({
      recurring_detection_status: 'running',
      recurring_detection_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (runningError) throw runningError
  }
  const transactionId = typeof body.transactionId === 'string' ? body.transactionId : null
  try {
    const detected = await refreshDetectedRecurringPayments(service, user.id, { transactionId })
    if (reason === 'startup') {
      const uuidPrefix = Number.parseInt(user.id.replaceAll('-', '').slice(0, 8), 16) || 0
      const nextScanAt = new Date(Date.now() + (60 + uuidPrefix % 31) * 86_400_000)
      const completedAt = new Date().toISOString()
      const { error: updateError } = await service.from('profiles').update({
        recurring_detection_version: RECURRING_DETECTOR_VERSION,
        recurring_detection_status: 'completed',
        recurring_detection_completed_at: completedAt,
        recurring_detection_next_scan_at: nextScanAt.toISOString(),
        updated_at: completedAt,
      }).eq('id', user.id)
      if (updateError) throw updateError
    }
    return res.status(200).json({ detected, skipped: false })
  } catch (error) {
    if (reason === 'startup') {
      const retryAt = new Date(Date.now() + 86_400_000).toISOString()
      const { error: failureUpdateError } = await service.from('profiles').update({
        recurring_detection_status: 'failed',
        recurring_detection_next_scan_at: retryAt,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)
      if (failureUpdateError) console.error('Flownd recurring detection status update failed', failureUpdateError)
    }
    throw error
  }
}

const handlers = {
  error: clientErrorHandler,
  'group-invite': groupInvitesHandler,
  import: transactionImportHandler,
  'recurring-refresh': recurringRefreshHandler,
  scan: transactionScanHandler,
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '')
  const actionHandler = handlers[action]

  if (!actionHandler) {
    return res.status(404).json({ error: 'Operazione non disponibile' })
  }

  try {
    return await actionHandler(req, res)
  } catch (error) {
    const reportId = randomUUID()
    console.error('Flownd transaction tool failed to load', {
      reportId,
      action,
      error,
    })
    return res.status(500).json({
      error: 'Si è verificato un errore. Il resoconto è stato inviato agli sviluppatori.',
      reportId,
    })
  }
}
