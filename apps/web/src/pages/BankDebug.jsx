import { useEffect, useState } from 'react'

function tokenFromHash() {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || ''
}

function downloadJson(payload, accountName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `enable-banking-${accountName || 'account'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function BankDebug() {
  const [token] = useState(tokenFromHash)
  const [accounts, setAccounts] = useState([])
  const [selectedUid, setSelectedUid] = useState('')
  const [dateFrom, setDateFrom] = useState('2026-09-01')
  const [dateTo, setDateTo] = useState('2026-09-04')
  const [strategy, setStrategy] = useState('default')
  const [transactionStatus, setTransactionStatus] = useState('')
  const [continuationKey, setContinuationKey] = useState('')
  const [output, setOutput] = useState(() => token ? 'Caricamento conti…' : 'Token diagnostico mancante.')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch('/api/eb/raw?action=accounts', {
      headers: { 'x-debug-token': token },
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
        return data
      })
      .then((data) => {
        setAccounts(data.accounts || [])
        setSelectedUid(data.accounts?.[0]?.uid || '')
        setOutput('Seleziona un conto e scarica la risposta raw.')
      })
      .catch((error) => setOutput(`Errore: ${error.message}`))
  }, [token])

  async function request(action, download = false) {
    if (!selectedUid || loading) return
    setLoading(true)
    setOutput('Richiesta a Enable Banking in corso…')
    const params = new URLSearchParams({ action, uid: selectedUid })
    if (action === 'transactions') {
      if (continuationKey) {
        params.set('continuationKey', continuationKey)
      } else {
        if (dateFrom) params.set('dateFrom', dateFrom)
        if (dateTo) params.set('dateTo', dateTo)
        if (strategy) params.set('strategy', strategy)
        if (transactionStatus) params.set('transactionStatus', transactionStatus)
      }
    }
    try {
      const response = await fetch(`/api/eb/raw?${params}`, {
        headers: { 'x-debug-token': token },
      })
      const data = await response.json()
      setOutput(JSON.stringify({ httpStatus: response.status, ...data }, null, 2))
      if (response.ok && download) {
        const account = accounts.find((item) => item.uid === selectedUid)
        downloadJson(data, `${account?.bank || 'bank'}-${account?.name || 'account'}`)
      }
    } catch (error) {
      setOutput(`Errore: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell dashboard-shell">
      <section className="surface-panel raw-api-panel">
        <div className="section-head">
          <div>
            <h1>Enable Banking inspector</h1>
            <p>Accesso temporaneo. Le risposte non vengono salvate sul server.</p>
          </div>
        </div>

        <div className="raw-api-grid">
          <label className="field-label raw-api-wide" htmlFor="debug-account">
            Conto
            <select
              id="debug-account"
              className="input"
              value={selectedUid}
              onChange={(event) => setSelectedUid(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.uid}>
                  {account.bank} · {account.name}{account.ibanLast4 ? ` · •${account.ibanLast4}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label" htmlFor="debug-from">
            Date from
            <input id="debug-from" className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="field-label" htmlFor="debug-to">
            Date to
            <input id="debug-to" className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <label className="field-label" htmlFor="debug-strategy">
            Strategy
            <select id="debug-strategy" className="input" value={strategy} onChange={(event) => setStrategy(event.target.value)}>
              <option value="default">default</option>
              <option value="longest">longest</option>
            </select>
          </label>
          <label className="field-label" htmlFor="debug-status">
            Transaction status
            <input id="debug-status" className="input" value={transactionStatus} onChange={(event) => setTransactionStatus(event.target.value)} placeholder="BOOK / PDNG (opzionale)" />
          </label>
          <label className="field-label raw-api-wide" htmlFor="debug-continuation">
            Continuation key
            <input id="debug-continuation" className="input" value={continuationKey} onChange={(event) => setContinuationKey(event.target.value)} placeholder="Se presente, sostituisce gli altri parametri" />
          </label>
        </div>

        <div className="raw-api-actions">
          <button className="secondary-button" disabled={loading || !selectedUid} type="button" onClick={() => request('details')}>Account details</button>
          <button className="secondary-button" disabled={loading || !selectedUid} type="button" onClick={() => request('balances')}>Balances</button>
          <button className="secondary-button" disabled={loading || !selectedUid} type="button" onClick={() => request('transactions')}>Mostra transactions</button>
          <button className="primary-button" disabled={loading || !selectedUid} type="button" onClick={() => request('transactions', true)}>Scarica JSON transactions</button>
        </div>

        <textarea className="raw-api-output" readOnly value={output} aria-label="Risposta raw Enable Banking" />
      </section>
    </main>
  )
}
