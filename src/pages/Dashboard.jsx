import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  buildBankPayloadDocument,
  clearBankPayloadExportState,
  downloadLatestBankPayload,
  exportBankPayloadDocument,
} from '../lib/bankPayloadExport.js'
import { getBalances, getTransactions } from '../lib/enablebanking.js'

const currencyFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
})

function formatMoney(value) {
  return currencyFormatter.format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Data non disponibile'
  return new Date(`${value}T12:00:00`).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
  })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [account] = useState(() => JSON.parse(localStorage.getItem('eb_accounts') || '[]')[0] || null)
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [hasDebugPayload, setHasDebugPayload] = useState(false)
  const [status, setStatus] = useState('Carico saldo e transazioni...')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!account?.uid) {
      navigate('/connect')
      return
    }

    const today = new Date()
    const dateTo = today.toISOString().slice(0, 10)
    const dateFrom = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().slice(0, 10)

    Promise.all([getBalances(account.uid), getTransactions(account.uid, dateFrom, dateTo)])
      .then(([balanceData, transactionData]) => {
        const sessionId = localStorage.getItem('eb_session_id')
        const sessionRaw = JSON.parse(localStorage.getItem('eb_session_raw') || 'null')
        const payload = buildBankPayloadDocument({
          account,
          balanceData,
          transactionData,
          sessionId,
          sessionRaw,
        })

        exportBankPayloadDocument(payload, { autoDownload: true })
        setBalance(balanceData)
        setTransactions(transactionData.transactions || [])
        setHasDebugPayload(true)
        setStatus('')
      })
      .catch((err) => {
        setStatus('')
        setError(err.message)
      })
  }, [account, navigate])

  const totals = useMemo(() => {
    return transactions.reduce(
      (acc, transaction) => {
        if (transaction.amount > 0) acc.income += transaction.amount
        if (transaction.amount < 0) acc.expenses += Math.abs(transaction.amount)
        return acc
      },
      { income: 0, expenses: 0 },
    )
  }, [transactions])

  function disconnect() {
    localStorage.removeItem('eb_session_id')
    localStorage.removeItem('eb_accounts')
    localStorage.removeItem('eb_session_raw')
    localStorage.removeItem('eb_authorization_id')
    clearBankPayloadExportState()
    navigate('/connect')
  }

  function handleDownloadDebugPayload() {
    if (!downloadLatestBankPayload()) {
      setError('Nessun JSON debug disponibile. Ricarica i dati del conto e riprova.')
    }
  }

  return (
    <main className="app-shell dashboard-shell">
      <section className="balance-card">
        <div className="top-actions">
          <span>Flownd</span>
          <button className="ghost-button" type="button" onClick={disconnect}>Esci</button>
        </div>
        <p>{account?.iban || account?.identification_hash || 'Conto collegato'}</p>
        <strong>{formatMoney(balance?.amount || 0)}</strong>
      </section>

      {status && <div className="notice">{status}</div>}
      {error && <div className="error">{error}</div>}

      <section className="metrics-grid">
        <article>
          <span>Entrate periodo</span>
          <strong>{formatMoney(totals.income)}</strong>
        </article>
        <article>
          <span>Uscite periodo</span>
          <strong>{formatMoney(totals.expenses)}</strong>
        </article>
      </section>

      <section className="surface-panel">
        <div className="section-head">
          <div>
            <h2>Movimenti recenti</h2>
            <p>Normalizzati dalle serverless functions Enable Banking.</p>
          </div>
          <div className="panel-actions">
            <button
              className="secondary-button"
              disabled={!hasDebugPayload}
              type="button"
              onClick={handleDownloadDebugPayload}
            >
              Scarica JSON debug
            </button>
            <Link to="/connect">Cambia banca</Link>
          </div>
        </div>

        <div className="transactions-list">
          {transactions.slice(0, 12).map((transaction) => (
            <article className="transaction-row" key={transaction.id}>
              <span>
                <strong>{transaction.description}</strong>
                <small>{formatDate(transaction.date)}</small>
              </span>
              <strong className={transaction.amount > 0 ? 'positive' : ''}>{formatMoney(transaction.amount)}</strong>
            </article>
          ))}
        </div>

        {!status && !error && transactions.length === 0 && (
          <div className="empty-state">Nessuna transazione disponibile.</div>
        )}
      </section>
    </main>
  )
}
