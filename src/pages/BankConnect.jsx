import { useEffect, useMemo, useState } from 'react'
import { getBanks, startAuth } from '../lib/enablebanking.js'

export default function BankConnect() {
  const [banks, setBanks] = useState([])
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
      const { url, authorizationId } = await startAuth(bank.name, bank.country || 'IT')
      if (authorizationId) localStorage.setItem('eb_authorization_id', authorizationId)
      window.location.assign(url)
    } catch (err) {
      setSelectedBank('')
      setError(err.message)
    }
  }

  return (
    <main className="app-shell">
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
    </main>
  )
}
