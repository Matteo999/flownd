import { useEffect, useState } from 'react'
import './ComingSoonPage.css'

const RELEASE_DATE = new Date('2026-10-01T00:00:00+02:00')

function getTimeLeft() {
  const distance = Math.max(0, RELEASE_DATE.getTime() - Date.now())

  return {
    days: Math.floor(distance / 86_400_000),
    hours: Math.floor((distance / 3_600_000) % 24),
    minutes: Math.floor((distance / 60_000) % 60),
    seconds: Math.floor((distance / 1_000) % 60),
  }
}

function CounterUnit({ label, value }) {
  return (
    <div className="countdown-unit">
      <strong>{String(value).padStart(2, '0')}</strong>
      <span>{label}</span>
    </div>
  )
}

export default function ComingSoonPage() {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft)

  useEffect(() => {
    const interval = window.setInterval(() => setTimeLeft(getTimeLeft()), 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const released = Object.values(timeLeft).every((value) => value === 0)

  return (
    <main className="coming-soon" aria-labelledby="coming-soon-title">
      <div className="coming-soon__glow coming-soon__glow--one" />
      <div className="coming-soon__glow coming-soon__glow--two" />
      <section className="coming-soon__content">
        <img className="coming-soon__logo" src="/flownd-alpha.png" alt="Flownd" />
        <h1 id="coming-soon-title">Stiamo arrivando.</h1>
        <p className="coming-soon__intro">
          Flownd ti aiuterà a vedere con chiarezza dove vanno i tuoi soldi.
          Ci vediamo il 1° ottobre.
        </p>

        {released ? (
          <p className="coming-soon__released">Flownd è disponibile.</p>
        ) : (
          <div className="countdown" aria-label="Conto alla rovescia al lancio del 1 ottobre 2026">
            <CounterUnit label="giorni" value={timeLeft.days} />
            <CounterUnit label="ore" value={timeLeft.hours} />
            <CounterUnit label="minuti" value={timeLeft.minutes} />
            <CounterUnit label="secondi" value={timeLeft.seconds} />
          </div>
        )}
      </section>
      <p className="coming-soon__footer">© 2026 Flownd · Made in Italy</p>
    </main>
  )
}
