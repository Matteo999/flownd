import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAccountsInspector, getStoredAccountsInspector } from '../lib/accountInspector.js'
import { getBanks, startAuth } from '../lib/enablebanking.js'

export default function BankConnect() {
  const navigate = useNavigate()
  const [banks, setBanks] = useState([])
  const [rememberedConnection, setRememberedConnection] = useState(() => {
    const accounts = JSON.parse(localStorage.getItem('eb_accounts') || '[]')
    return {
      account: accounts[0] || null,
      validUntil: localStorage.getItem('eb_consent_valid_until'),
    }
  })
  const [accountsInspector, setAccountsInspector] = useState(() => getStoredAccountsInspector())
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Carico le banche italiane...')
  const [error, setError] = useState('')
  const [selectedBank, setSelectedBank] = useState('')

  useEffect(() => {
    getBanks('IT')
      .then((items) => {
        setBanks(Array.isArray(items) ? items : [])
        setStatus('')
      })
      .catch((err) => {
        setStatus('')
        setError(err.message)
      })
  }, [])

  const filteredBanks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return banks
    return banks.filter((bank) => `${bank.name || ''} ${bank.bic || ''}`.toLowerCase().includes(normalizedQuery))
  }, [banks, query])

  async function handleConnect(bank) {
    setSelectedBank(bank.name)
    setError('')

    try {
      const { url, authorizationId, validUntil } = await startAuth(bank.name, bank.country || 'IT')
      if (authorizationId) localStorage.setItem('eb_authorization_id', authorizationId)
      if (validUntil) localStorage.setItem('eb_consent_valid_until', validUntil)
      window.location.assign(url)
    } catch (err) {
      setSelectedBank('')
      setError(err.message)
    }
  }

  function clearRememberedConnection() {
    localStorage.removeItem('eb_session_id')
    localStorage.removeItem('eb_accounts')
    localStorage.removeItem('eb_session_raw')
    localStorage.removeItem('eb_authorization_id')
    localStorage.removeItem('eb_consent_valid_until')
    clearAccountsInspector()
    setRememberedConnection({ account: null, validUntil: null })
    setAccountsInspector(null)
  }

  return (
    <main className="app-shell connect-shell">
      <section className="hero-panel">
        <div className="brand-row">
          <span className="brand-mark">F</span>
          <span>Flownd</span>
        </div>
        <h1>Collega il tuo conto con Enable Banking.</h1>
        <p>
          Le chiamate verso Enable Banking passano dalle funzioni serverless Vercel:
          la chiave privata RSA resta sempre lato server.
        </p>
      </section>

      <section className="surface-panel">
        {rememberedConnection.account && (
          <div className="remembered-connection">
            <div>
              <span className="eyebrow">Conto gia collegato</span>
              <strong>
                {rememberedConnection.account.iban
                  || rememberedConnection.account.identification_hash
                  || rememberedConnection.account.uid}
              </strong>
              {rememberedConnection.validUntil && (
                <small>
                  Consenso richiesto fino al{' '}
                  {new Date(rememberedConnection.validUntil).toLocaleDateString('it-IT')}
                </small>
              )}
            </div>
            <div className="panel-actions">
              <button className="secondary-button" type="button" onClick={() => navigate('/dashboard')}>
                Continua
              </button>
              <button className="secondary-button muted-button" type="button" onClick={clearRememberedConnection}>
                Dimentica
              </button>
            </div>
          </div>
        )}

        {accountsInspector && (
          <div className="accounts-inspector">
            <div className="section-head compact-head">
              <div>
                <h2>Account restituiti</h2>
                <p>Vista sanitizzata della sessione Enable Banking.</p>
              </div>
            </div>
            <pre>{JSON.stringify(accountsInspector, null, 2)}</pre>
          </div>
        )}

        <div className="section-head">
          <div>
            <h2>Scegli banca</h2>
            <p>Sandbox o production dipendono dalle credenziali configurate su Vercel.</p>
          </div>
        </div>

        <label className="field-label" htmlFor="bank-search">Cerca banca o BIC</label>
        <input
          id="bank-search"
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ING, Intesa, UniCredit..."
        />

        {status && <div className="notice">{status}</div>}
        {error && <div className="error">{error}</div>}

        <div className="bank-list">
          {filteredBanks.map((bank) => (
            <button
              className="bank-row"
              disabled={Boolean(selectedBank)}
              key={`${bank.name}-${bank.bic || bank.country}`}
              type="button"
              onClick={() => handleConnect(bank)}
            >
              <span className="bank-logo">
                {bank.logo ? <img alt="" src={bank.logo} /> : <span>{(bank.name || '?').slice(0, 1)}</span>}
              </span>
              <span className="bank-copy">
                <strong>{bank.name}</strong>
                <small>{bank.bic || bank.country || 'IT'}</small>
              </span>
              <span className="chevron">{selectedBank === bank.name ? '...' : '>'}</span>
            </button>
          ))}
        </div>

        {!status && !error && filteredBanks.length === 0 && (
          <div className="empty-state">Nessuna banca trovata.</div>
        )}
      </section>

      <footer className="legal-links">
        <a href="/privacy">Privacy</a>
        <span>·</span>
        <a href="/terms">Termini</a>
      </footer>
    </main>
  )
}
