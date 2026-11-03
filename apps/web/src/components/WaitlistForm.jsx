import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
// Chiave di test pubblica di Cloudflare: passa sempre, utile solo in locale.
const TURNSTILE_DEV_KEY = '1x00000000000000000000AA'
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? TURNSTILE_DEV_KEY : '')

let turnstileLoader = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!turnstileLoader) {
    turnstileLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = TURNSTILE_SRC
      script.async = true
      script.onload = () => resolve(window.turnstile)
      script.onerror = () => {
        turnstileLoader = null
        reject(new Error('turnstile'))
      }
      document.head.appendChild(script)
    })
  }
  return turnstileLoader
}

export default function WaitlistForm({ variant = 'card' }) {
  const inputId = useId()
  const messageId = useId()
  const widgetHost = useRef(null)
  const widgetId = useRef(null)
  const pendingToken = useRef(null)
  const startedAt = useRef(0)
  const [email, setEmail] = useState('')
  const [trap, setTrap] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    startedAt.current = Date.now()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!siteKey) return undefined
    loadTurnstile().then((turnstile) => {
      if (cancelled || !widgetHost.current || widgetId.current !== null) return
      // Il widget resta invisibile e chiede un'interazione solo se Cloudflare
      // non è sicuro che dall'altra parte ci sia una persona.
      widgetId.current = turnstile.render(widgetHost.current, {
        sitekey: siteKey,
        action: 'waitlist',
        appearance: 'interaction-only',
        execution: 'execute',
        language: 'it',
        callback: (token) => pendingToken.current?.resolve(token),
        'error-callback': () => pendingToken.current?.reject(new Error('turnstile')),
        'timeout-callback': () => pendingToken.current?.reject(new Error('turnstile')),
      })
    }).catch(() => {})
    return () => {
      cancelled = true
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  function requestToken() {
    if (!window.turnstile || widgetId.current === null) {
      return Promise.reject(new Error('turnstile'))
    }
    return new Promise((resolve, reject) => {
      pendingToken.current = { resolve, reject }
      window.turnstile.reset(widgetId.current)
      window.turnstile.execute(widgetId.current)
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const value = email.trim()
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setStatus('error')
      setMessage('Controlla l’indirizzo email: sembra incompleto.')
      return
    }
    setStatus('submitting')
    setMessage('')
    try {
      const turnstileToken = await requestToken().catch(() => {
        throw new Error('Non riusciamo a verificare che tu non sia un bot. Ricarica la pagina e riprova.')
      })
      const response = await fetch('/api/transaction-tools?action=waitlist-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: value,
          turnstileToken,
          website: trap,
          startedAt: startedAt.current,
          locale: navigator.language,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Iscrizione non riuscita. Riprova tra poco.')
      setStatus('success')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof TypeError
        ? 'Sembra che la connessione sia caduta. Riprova tra un istante.'
        : error.message)
    }
  }

  if (status === 'success') {
    return (
      <div className={`waitlist waitlist--${variant} waitlist--done`} role="status">
        <p className="waitlist__done-title">Controlla la posta.</p>
        <p className="waitlist__done-copy">
          Ti abbiamo scritto a <strong>{email.trim()}</strong>. Apri il link per confermare: senza conferma non ti scriveremo.
        </p>
      </div>
    )
  }

  return (
    <form className={`waitlist waitlist--${variant}`} onSubmit={handleSubmit} noValidate>
      <label className="waitlist__label" htmlFor={inputId}>
        Avvisami quando esce su iOS e Android
      </label>
      <div className="waitlist__row">
        <input
          id={inputId}
          className="waitlist__input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder="nome@email.it"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (status === 'error') setStatus('idle')
          }}
          aria-invalid={status === 'error' ? 'true' : undefined}
          aria-describedby={messageId}
          disabled={status === 'submitting'}
          required
        />
        <button className="waitlist__button" type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Invio…' : 'Avvisami'}
        </button>
      </div>
      {/* Campo trappola: invisibile alle persone, compilato dai bot. */}
      <div className="waitlist__trap" aria-hidden="true">
        <label>
          Sito web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} />
        </label>
      </div>
      <div ref={widgetHost} className="waitlist__challenge" />
      <p id={messageId} className={status === 'error' ? 'waitlist__note waitlist__note--error' : 'waitlist__note'} aria-live="polite">
        {status === 'error'
          ? message
          : <>Ti scriviamo una volta, al lancio. <Link to="/privacy">Come usiamo l’email</Link></>}
      </p>
    </form>
  )
}
