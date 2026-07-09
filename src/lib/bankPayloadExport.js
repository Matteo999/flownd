const LAST_PAYLOAD_KEY = 'flownd_last_bank_payload_json'
const EXPORTED_SESSION_KEY = 'flownd_exported_bank_payload_session'

function makeFileName(sessionId) {
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const suffix = sessionId ? `-${sessionId.slice(0, 8)}` : ''
  return `flownd-bank-payload${suffix}-${date}.json`
}

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = makeFileName(payload.session?.sessionId)
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function buildBankPayloadDocument({
  account,
  balanceData,
  transactionData,
  sessionId,
  sessionRaw,
  requestedRange,
}) {
  return {
    generatedAt: new Date().toISOString(),
    provider: 'enable-banking',
    note: 'Documento locale di debug per analizzare la struttura dei dati bancari ricevuti da Enable Banking.',
    session: {
      sessionId,
      raw: sessionRaw || null,
    },
    selectedAccount: account || null,
    requestedRange: requestedRange || null,
    balances: {
      normalized: {
        amount: balanceData?.amount ?? null,
        currency: balanceData?.currency ?? null,
      },
      raw: balanceData?.raw || { balances: balanceData?.balances || [] },
    },
    transactions: {
      normalized: transactionData?.transactions || [],
      raw: transactionData?.raw || null,
    },
  }
}

export function exportBankPayloadDocument(payload, { autoDownload = false } = {}) {
  const serialized = JSON.stringify(payload, null, 2)

  try {
    localStorage.setItem(LAST_PAYLOAD_KEY, serialized)
  } catch {
    // Il payload bancario puo' essere grande: il download resta disponibile anche se localStorage e' pieno.
  }

  if (!autoDownload) return

  const sessionId = payload.session?.sessionId || 'unknown-session'
  if (localStorage.getItem(EXPORTED_SESSION_KEY) === sessionId) return

  downloadJson(payload)
  localStorage.setItem(EXPORTED_SESSION_KEY, sessionId)
}

export function downloadLatestBankPayload() {
  const serialized = localStorage.getItem(LAST_PAYLOAD_KEY)
  if (!serialized) return false
  downloadJson(JSON.parse(serialized))
  return true
}

export function clearBankPayloadExportState() {
  localStorage.removeItem(LAST_PAYLOAD_KEY)
  localStorage.removeItem(EXPORTED_SESSION_KEY)
}
