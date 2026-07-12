import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { storeAccountsInspector } from '../lib/accountInspector.js'
import { createSession } from '../lib/enablebanking.js'

export default function Callback() {
  const [status, setStatus] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (error) return `Autorizzazione annullata: ${params.get('error_description') || error}`
    if (!params.get('code')) return 'Codice di autorizzazione mancante.'
    return 'Completamento connessione bancaria...'
  })
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error) {
      window.setTimeout(() => navigate('/connect'), 3000)
      return
    }

    if (!code) return

    createSession(code)
      .then(({ sessionId, accounts, raw }) => {
        localStorage.setItem('eb_session_id', sessionId)
        localStorage.setItem('eb_accounts', JSON.stringify(accounts))
        storeAccountsInspector(accounts)
        localStorage.setItem('eb_session_raw', JSON.stringify(raw || null))
        navigate('/dashboard')
      })
      .catch((err) => {
        setStatus(`Errore: ${err.message}`)
      })
  }, [navigate])

  return (
    <main className="app-shell compact">
      <section className="surface-panel callback-panel">
        <div className="callback-icon">B</div>
        <h1>Enable Banking</h1>
        <p>{status}</p>
      </section>
    </main>
  )
}
