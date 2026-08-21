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

  return actionHandler(req, res)
}
