import { randomUUID } from 'node:crypto'

import clientErrorHandler from './_client-error.js'
import groupInvitesHandler from './_group-invites.js'
import transactionImportHandler from './_transaction-import.js'
import transactionScanHandler from './_transaction-scan.js'
import { refreshDetectedRecurringPayments } from './_recurring-payments.js'
import { authenticateRequest } from './eb/_supabase.js'

const CURRENT_RECURRING_DETECTION_VERSION = 2

// HOBBY_CONSOLIDATION(pro-split:recurring-payments)
// Con Vercel Pro questa action torna nell'entrypoint /api/recurring-payments.
async function recurringRefreshHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non supportato' })
  const { service, user } = await authenticateRequest(req)
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const reason = body.reason === 'startup' ? 'startup' : 'activity'
  if (reason === 'startup') {
    const { data: profile, error: profileError } = await service.from('profiles')
      .select('recurring_detection_version').eq('id', user.id).single()
    if (profileError) throw profileError
    if (Number(profile.recurring_detection_version) >= CURRENT_RECURRING_DETECTION_VERSION) {
      return res.status(200).json({ detected: 0, skipped: true })
    }
  }
  const transactionId = typeof body.transactionId === 'string' ? body.transactionId : null
  const detected = await refreshDetectedRecurringPayments(service, user.id, { transactionId })
  if (reason === 'startup') {
    const { error: updateError } = await service.from('profiles').update({
      recurring_detection_version: CURRENT_RECURRING_DETECTION_VERSION,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (updateError) throw updateError
  }
  return res.status(200).json({ detected, skipped: false })
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
