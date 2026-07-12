import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  clearAccountsInspector,
  getStoredAccountsInspector,
  moveAccountToFirst,
  storeAccounts,
} from '../lib/accountInspector.js'
import {
  buildBankPayloadDocument,
  clearBankPayloadExportState,
  downloadLatestBankPayload,
  exportBankPayloadDocument,
} from '../lib/bankPayloadExport.js'
import { callRawBankApi, getBalances, getTransactions } from '../lib/enablebanking.js'

const currencyFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
})

const TRANSACTION_LOOKBACK_MONTHS = 120

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
  const [accountsInspector, setAccountsInspector] = useState(() => getStoredAccountsInspector())
  const [rawApiState, setRawApiState] = useState({
    dateFrom: '',
    dateTo: '',
    strategy: 'longest',
    transactionStatus: '',
    continuationKey: '',
    transactionId: '',
    output: 'Seleziona una chiamata API per vedere qui la risposta raw della banca.',
    loadingKind: '',
  })
  const [status, setStatus] = useState('Carico saldo e transazioni...')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!account?.uid) {
      navigate('/connect')
      return
    }

    const today = new Date()
    const dateTo = today.toISOString().slice(0, 10)
    const dateFrom = new Date(
      today.getFullYear(),
      today.getMonth() - TRANSACTION_LOOKBACK_MONTHS,
      1,
    ).toISOString().slice(0, 10)

    Promise.allSettled([
      getBalances(account.uid),
      getTransactions(account.uid, dateFrom, null, 'longest'),
    ])
      .then(([balanceResult, transactionResult]) => {
        const balanceData = balanceResult.status === 'fulfilled'
          ? balanceResult.value
          : null
        const transactionData = transactionResult.status === 'fulfilled'
          ? transactionResult.value
          : { transactions: [], raw: { error: transactionResult.reason.message } }
        const sessionId = localStorage.getItem('eb_session_id')
        const sessionRaw = JSON.parse(localStorage.getItem('eb_session_raw') || 'null')
        const payload = buildBankPayloadDocument({
          account,
          balanceData,
          transactionData,
          sessionId,
          sessionRaw,
          requestedRange: { dateFrom, dateTo },
        })

        exportBankPayloadDocument(payload, { autoDownload: true })
        if (balanceData) setBalance(balanceData)
        setTransactions(transactionData.transactions || [])
        setHasDebugPayload(true)
        setStatus('')

        const errors = [
          balanceResult.status === 'rejected' ? `Saldo: ${balanceResult.reason.message}` : '',
          transactionResult.status === 'rejected' ? `Transazioni: ${transactionResult.reason.message}` : '',
        ].filter(Boolean)
        setError(errors.join(' · '))
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
    localStorage.removeItem('eb_consent_valid_until')
    clearAccountsInspector()
    clearBankPayloadExportState()
    navigate('/connect')
  }

  function selectAccount(index) {
    const accounts = JSON.parse(localStorage.getItem('eb_accounts') || '[]')
    const selectedAccount = accounts[index]
    if (!selectedAccount) return

    const orderedAccounts = moveAccountToFirst(accounts, index)
    setAccountsInspector(storeAccounts(orderedAccounts))
    window.location.reload()
  }

  function handleDownloadDebugPayload() {
    if (!downloadLatestBankPayload()) {
      setError('Nessun JSON debug disponibile. Ricarica i dati del conto e riprova.')
    }
  }

  async function handleRawApiCall(kind) {
    if (!account?.uid) return

    setRawApiState((current) => ({
      ...current,
      loadingKind: kind,
      output: `Chiamata ${kind} in corso...`,
    }))

    try {
      const result = await callRawBankApi(kind, {
        uid: account.uid,
        dateFrom: rawApiState.dateFrom,
        dateTo: rawApiState.dateTo,
        strategy: rawApiState.strategy,
        transactionStatus: rawApiState.transactionStatus,
        continuationKey: rawApiState.continuationKey,
        transactionId: rawApiState.transactionId,
      })
      const prettyText = (() => {
        try {
          return JSON.stringify(JSON.parse(result.text), null, 2)
        } catch {
          return result.text
        }
      })()

      setRawApiState((current) => ({
        ...current,
        loadingKind: '',
        output: `HTTP ${result.status}\n\n${prettyText}`,
      }))
    } catch (err) {
      setRawApiState((current) => ({
        ...current,
        loadingKind: '',
        output: `Errore locale: ${err.message}`,
      }))
    }
  }

  function updateRawApiField(field, value) {
    setRawApiState((current) => ({ ...current, [field]: value }))
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

      {accountsInspector && (
        <section className="surface-panel accounts-inspector">
          <div className="section-head">
            <div>
              <h2>Account sessione</h2>
              <p>Lista sanitizzata degli account ricevuti da Enable Banking.</p>
            </div>
          </div>
          <div className="account-choice-list">
            {accountsInspector.accounts.map((item) => (
              <button
                className="account-choice"
                key={`${item.index}-${item.uidPreview}`}
                type="button"
                onClick={() => selectAccount(item.index)}
              >
                <span>
                  <strong>{item.product || item.name || `Account ${item.index + 1}`}</strong>
                  <small>
                    status: {item.psuStatus || 'n/d'} · iban: {item.hasIban ? 'si' : 'no'} · uid: {item.uidPreview}
                  </small>
                </span>
                <span className="chevron">{item.index === 0 ? 'attivo' : 'usa'}</span>
              </button>
            ))}
          </div>
          <pre>{JSON.stringify(accountsInspector, null, 2)}</pre>
        </section>
      )}

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

      <section className="surface-panel raw-api-panel">
        <div className="section-head">
          <div>
            <h2>API raw inspector</h2>
            <p>Chiamate dirette Enable Banking per analizzare le risposte della banca.</p>
          </div>
        </div>

        <div className="raw-api-grid">
          <label className="field-label" htmlFor="raw-date-from">
            Date from
            <input
              id="raw-date-from"
              className="input"
              type="date"
              value={rawApiState.dateFrom}
              onChange={(event) => updateRawApiField('dateFrom', event.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="raw-date-to">
            Date to
            <input
              id="raw-date-to"
              className="input"
              type="date"
              value={rawApiState.dateTo}
              onChange={(event) => updateRawApiField('dateTo', event.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="raw-strategy">
            Strategy
            <input
              id="raw-strategy"
              className="input"
              value={rawApiState.strategy}
              onChange={(event) => updateRawApiField('strategy', event.target.value)}
              placeholder="longest"
            />
          </label>

          <label className="field-label" htmlFor="raw-status">
            Transaction status
            <input
              id="raw-status"
              className="input"
              value={rawApiState.transactionStatus}
              onChange={(event) => updateRawApiField('transactionStatus', event.target.value)}
              placeholder="BOOK / PDNG"
            />
          </label>

          <label className="field-label raw-api-wide" htmlFor="raw-continuation">
            Continuation key
            <input
              id="raw-continuation"
              className="input"
              value={rawApiState.continuationKey}
              onChange={(event) => updateRawApiField('continuationKey', event.target.value)}
              placeholder="Se presente, viene inviata da sola per /transactions"
            />
          </label>

          <label className="field-label raw-api-wide" htmlFor="raw-transaction-id">
            Transaction ID
            <input
              id="raw-transaction-id"
              className="input"
              value={rawApiState.transactionId}
              onChange={(event) => updateRawApiField('transactionId', event.target.value)}
              placeholder="Obbligatorio per transaction details"
            />
          </label>
        </div>

        <div className="raw-api-actions">
          <button className="secondary-button" type="button" onClick={() => handleRawApiCall('details')}>
            Account details
          </button>
          <button className="secondary-button" type="button" onClick={() => handleRawApiCall('balances')}>
            Balances
          </button>
          <button className="secondary-button" type="button" onClick={() => handleRawApiCall('transactions')}>
            Transactions
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!rawApiState.transactionId || Boolean(rawApiState.loadingKind)}
            onClick={() => handleRawApiCall('transaction-details')}
          >
            Transaction details
          </button>
        </div>

        <textarea
          className="raw-api-output"
          readOnly
          value={rawApiState.output}
          aria-label="Risposta raw Enable Banking"
        />
      </section>
    </main>
  )
}
