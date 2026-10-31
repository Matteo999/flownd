import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './HomePage.css'

const COPY = {
  loading: ['Un attimo…', 'Stiamo confermando la tua email.'],
  done: ['Sei in lista.', 'Ti scriveremo una sola volta, il giorno in cui Flownd sarà disponibile su iOS e Android.'],
}

export default function WaitlistConfirmPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : 'Il link di conferma è incompleto. Aprilo di nuovo dall’email che ti abbiamo mandato.')
  const sent = useRef(false)

  useEffect(() => {
    document.title = 'Conferma email — Flownd'
    // StrictMode monta due volte: il token si può usare una sola volta.
    if (!token || sent.current) return
    sent.current = true
    fetch('/api/transaction-tools?action=waitlist-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Conferma non riuscita. Riprova tra poco.')
        setState('done')
      })
      .catch((error) => {
        setState('error')
        setMessage(error instanceof TypeError
          ? 'Sembra che la connessione sia caduta. Ricarica la pagina per riprovare.'
          : error.message)
      })
  }, [token])

  const [title, body] = state === 'error' ? ['Qualcosa non torna.', message] : COPY[state]

  return (
    <div className="home confirm">
      <main className="confirm__card" aria-live="polite">
        <img src="/brand/lockup-chiaro.webp" alt="Flownd" width="128" height="24" className="confirm__logo" />
        <h1>{title}</h1>
        <p>{body}</p>
        <Link to="/" className="confirm__back">{state === 'error' ? 'Torna alla pagina di Flownd' : 'Scopri cosa sa fare Flownd'}</Link>
      </main>
    </div>
  )
}
