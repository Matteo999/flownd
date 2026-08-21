import { randomUUID } from 'node:crypto'

import clientErrorHandler from './_client-error.js'
import transactionImportHandler from './_transaction-import.js'
import transactionScanHandler from './_transaction-scan.js'

const handlers = {
  error: clientErrorHandler,
  import: transactionImportHandler,
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
