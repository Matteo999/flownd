async function readJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : null

  if (!response.ok) {
    throw new Error(data?.error || fallbackMessage)
  }

  if (!data) {
    throw new Error(`${fallbackMessage}. In locale avvia l'app con vercel dev per emulare /api/*.`)
  }

  return data
}

export async function getBanks(country = 'IT') {
  const response = await fetch(`/api/eb/banks?country=${encodeURIComponent(country)}`)
  return readJson(response, 'Errore nel caricamento delle banche')
}

export async function startAuth(bankName, bankCountry) {
  const redirectUrl = `${window.location.origin}/callback`
  const response = await fetch('/api/eb/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankName, bankCountry, redirectUrl }),
  })
  return readJson(response, "Errore nell'avvio dell'autenticazione")
}

export async function createSession(code) {
  const response = await fetch('/api/eb/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return readJson(response, 'Errore nella creazione della sessione')
}

export async function getBalances(uid) {
  const response = await fetch(`/api/eb/balances?uid=${encodeURIComponent(uid)}`)
  return readJson(response, 'Errore nel recupero del saldo')
}

export async function getTransactions(uid, dateFrom, dateTo, strategy = 'longest') {
  const params = new URLSearchParams({ uid })
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo) params.set('dateTo', dateTo)
  if (strategy) params.set('strategy', strategy)

  const response = await fetch(`/api/eb/transactions?${params}`)
  return readJson(response, 'Errore nel recupero delle transazioni')
}

export async function callRawBankApi(kind, options = {}) {
  const params = new URLSearchParams({ kind, uid: options.uid })
  if (options.dateFrom) params.set('dateFrom', options.dateFrom)
  if (options.dateTo) params.set('dateTo', options.dateTo)
  if (options.strategy) params.set('strategy', options.strategy)
  if (options.transactionStatus) params.set('transactionStatus', options.transactionStatus)
  if (options.continuationKey) params.set('continuationKey', options.continuationKey)
  if (options.transactionId) params.set('transactionId', options.transactionId)

  const response = await fetch(`/api/eb/raw?${params}`)
  const text = await response.text()

  return {
    ok: response.ok,
    status: response.status,
    text,
  }
}
