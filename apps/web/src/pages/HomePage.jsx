import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import WaitlistForm from '../components/WaitlistForm.jsx'
import './HomePage.css'

// Estratto conto di esempio: le stesse righe alimentano il muro dell'hero e la
// classifica, così i totali mostrati sono coerenti con i movimenti visibili.
const STATEMENT = [
  ['27/10', 'STIPENDIO OTTOBRE', 1850, 'entrate'],
  ['27/10', 'SDD AFFITTO RIF. 10/26', -750, 'casa'],
  ['26/10', 'POS ESSELUNGA MI VIALE', -87.43, 'spesa'],
  ['26/10', 'SDD A2A ENERGIA SPA', -65, 'bollette'],
  ['25/10', 'PAGOBANCOMAT 0412 BAR', -3.2, 'ristoranti'],
  ['25/10', 'BONIFICO DA ROSSI M.', 40, 'entrate'],
  ['24/10', 'POS AMZN MKTP IT', -24.99, 'shopping'],
  ['24/10', 'ADDEBITO NETFLIX.COM', -13.99, 'bollette'],
  ['23/10', 'POS TRENITALIA WEB', -45, 'trasporti'],
  ['23/10', 'PRELIEVO ATM 08812', -50, 'altro'],
  ['22/10', 'POS FARMACIA CENTRALE', -28.7, 'altro'],
  ['22/10', 'POS CONAD CITY', -31.62, 'spesa'],
  ['21/10', 'SDD FASTWEB SPA', -29.95, 'bollette'],
  ['21/10', 'POS ZARA ITALIA', -79.95, 'shopping'],
  ['20/10', 'POS IP STAZIONE 221', -60, 'trasporti'],
  ['20/10', 'POS PIZZERIA DA MARIO', -32.5, 'ristoranti'],
  ['19/10', 'ADDEBITO SPOTIFY AB', -11.99, 'bollette'],
  ['19/10', 'POS LIDL ITALIA', -42.18, 'spesa'],
  ['18/10', 'POS DECATHLON', -54.9, 'shopping'],
  ['18/10', 'SATISPAY BAR SPORT', -2.8, 'ristoranti'],
  ['17/10', 'POS ESSELUNGA MI VIALE', -63.1, 'spesa'],
  ['17/10', 'SDD ASSICURAZIONE AUTO', -48, 'bollette'],
  ['16/10', 'POS IKEA CARUGATE', -119, 'casa'],
  ['16/10', 'POS BAR CENTRALE', -4.5, 'ristoranti'],
  ['15/10', 'POS COOP LOMBARDIA', -38.44, 'spesa'],
  ['15/10', 'ADDEBITO PALESTRA', -45, 'bollette'],
  ['14/10', 'POS AUTOGRILL A4', -9.8, 'ristoranti'],
  ['14/10', 'POS ESSELUNGA MI VIALE', -51.27, 'spesa'],
  ['13/10', 'POS CINEMA ANTEO', -17, 'altro'],
  ['13/10', 'POS TABACCHI 118', -6, 'altro'],
  ['12/10', 'POS CARREFOUR EXPRESS', -27.35, 'spesa'],
  ['12/10', 'POS MEDIAWORLD', -89, 'shopping'],
  ['11/10', 'POS BAR STAZIONE', -3, 'ristoranti'],
  ['11/10', 'POS ENI STATION', -55, 'trasporti'],
  ['10/10', 'POS ESSELUNGA MI VIALE', -44.92, 'spesa'],
  ['10/10', 'ATM ABBONAMENTO', -35, 'trasporti'],
  ['09/10', 'POS RISTORANTE IL PORTO', -58, 'ristoranti'],
]

const CATEGORY_LABELS = {
  casa: 'Casa',
  spesa: 'Spesa',
  shopping: 'Shopping',
  bollette: 'Bollette e abbonamenti',
  trasporti: 'Trasporti',
  ristoranti: 'Ristoranti e bar',
  altro: 'Altro',
}

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const euroCents = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function useRanking() {
  return useMemo(() => {
    const totals = new Map()
    for (const [, , amount, category] of STATEMENT) {
      if (amount >= 0 || category === 'altro') continue
      totals.set(category, (totals.get(category) || 0) - amount)
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const spent = STATEMENT.reduce((sum, [, , amount]) => (amount < 0 ? sum - amount : sum), 0)
    return { top: ranked.slice(0, 4), spent }
  }, [])
}

function Icon({ name }) {
  const paths = {
    link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
    pencil: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    eye: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a9.6 9.6 0 0 1-2.3 3.3M6.6 6.6C4.3 8 3 10.3 3 12c0 2 4 7 9 7a9.4 9.4 0 0 0 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M14 9l2 2" /></>,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    sync: <><path d="M20 11a8 8 0 0 0-14.3-4.3L4 9" /><path d="M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15" /><path d="M20 20v-5h-5" /></>,
  }
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

// Ogni colonna scorre verso il basso come un estratto conto che si aggiorna.
// Il nastro contiene l'estratto tre volte: spostarlo di un terzo riporta
// esattamente alla posizione di partenza, quindi il ciclo non ha scatti.
const WALL_COLUMNS = [
  { offset: 0, duration: '140s' },
  { offset: 12, duration: '170s' },
  { offset: 24, duration: '155s' },
]

// Memoizzato: centinaia di righe che non devono riconciliarsi a ogni
// cambiamento di stato della pagina, ma solo quando cambia la categoria attiva.
const StatementWall = memo(function StatementWall({ active }) {
  const rows = [...STATEMENT, ...STATEMENT, ...STATEMENT]
  return (
    <div className={`wall ${active ? 'wall--focused' : ''}`} aria-hidden="true">
      {WALL_COLUMNS.map(({ offset, duration }) => (
        <div className="wall__column" key={offset}>
          <div className="wall__track" style={{ '--drift': duration }}>
            {rows.slice(offset).concat(rows.slice(0, offset)).map(([date, description, amount, category], index) => (
              <p className={`wall__row ${active === category ? 'is-active' : ''}`} key={index}>
                <span>{date}</span>
                <span className="wall__desc">{description}</span>
                <span>{amount > 0 ? '+' : '−'}{euroCents.format(Math.abs(amount))}</span>
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
})

function Ranking({ active, onActivate }) {
  const { top, spent } = useRanking()
  const max = top[0][1]
  return (
    <div className="ranking">
      <div className="ranking__head">
        <span>Uscite di ottobre</span>
        <strong>{euro.format(spent)}</strong>
      </div>
      <ul className="ranking__list">
        {top.map(([category, total], index) => (
          <li key={category}>
            <button
              type="button"
              className={`ranking__row ${active === category ? 'is-active' : ''}`}
              style={{ '--share': total / max, '--delay': `${index * 90}ms` }}
              aria-pressed={active === category}
              onMouseEnter={() => onActivate(category)}
              onMouseLeave={() => onActivate(null)}
              onFocus={() => onActivate(category)}
              onBlur={() => onActivate(null)}
              onClick={() => onActivate(active === category ? null : category)}
            >
              <span className="ranking__label">{CATEGORY_LABELS[category]}</span>
              <span className="ranking__track"><span className="ranking__bar" /></span>
              <span className="ranking__value">{euro.format(total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlanBand() {
  const bands = [
    { key: 'needs', label: 'Necessità', share: 50, budget: 925, spent: 668 },
    { key: 'wants', label: 'Desideri', share: 30, budget: 555, spent: 372 },
    { key: 'save', label: 'Risparmio', share: 20, budget: 370, spent: 250 },
  ]
  return (
    <div className="plan-band" role="img" aria-label="Esempio di piano mensile su 1.850 euro: Necessità 925 euro, Desideri 555 euro, Risparmio 370 euro">
      {bands.map((band) => (
        <div className={`plan-band__part plan-band__part--${band.key}`} style={{ flexGrow: band.share }} key={band.key}>
          <div className="plan-band__fill" style={{ '--used': band.spent / band.budget }} />
          <span className="plan-band__label">{band.label} · {band.share}%</span>
          <strong className="plan-band__value">{euro.format(band.budget)}</strong>
          <span className="plan-band__used">{band.key === 'save' ? `${euro.format(band.spent)} già da parte` : `${euro.format(band.spent)} usati`}</span>
        </div>
      ))}
    </div>
  )
}

function Budgets() {
  const rows = [
    ['Spesa', 386, 450],
    ['Ristoranti e bar', 114, 150],
    ['Shopping', 249, 220],
    ['Trasporti', 195, 210],
  ]
  return (
    <ul className="budgets">
      {rows.map(([label, spent, limit]) => {
        const over = spent > limit
        return (
          <li className={over ? 'budgets__row is-over' : 'budgets__row'} key={label}>
            <span className="budgets__label">{label}</span>
            <span className="budgets__track"><span style={{ '--used': Math.min(spent / limit, 1) }} /></span>
            <span className="budgets__value">{euro.format(spent)} <small>di {euro.format(limit)}</small></span>
            {over ? <span className="budgets__note">{euro.format(spent - limit)} oltre il previsto: si recupera dai Desideri</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

export default function HomePage() {
  const [active, setActive] = useState(null)
  const [heroFormVisible, setHeroFormVisible] = useState(true)
  const root = useRef(null)
  const header = useRef(null)
  const hero = useRef(null)
  const heroForm = useRef(null)

  useEffect(() => {
    document.title = 'Flownd — Dove vanno i tuoi soldi, finalmente chiaro'
  }, [])

  // Il pulsante nella nav compare solo quando il modulo dell'hero non è più
  // visibile: una sola azione primaria per schermata.
  useEffect(() => {
    if (!heroForm.current || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => setHeroFormVisible(entry.isIntersecting))
    observer.observe(heroForm.current)
    return () => observer.disconnect()
  }, [])

  // Estratto conto e chip si muovono solo mentre l'hero è sullo schermo. La
  // classe si cambia direttamente, senza rieseguire il render della pagina.
  useEffect(() => {
    const section = hero.current
    if (!section || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      section.classList.toggle('is-offscreen', !entry.isIntersecting)
    })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  // La barra parte sospesa e, nei primi 140px di scroll, si allarga fino ad
  // agganciarsi al bordo superiore. Il progresso è una variabile CSS (0 → 1),
  // aggiornata una volta per frame senza passare dallo stato React.
  useEffect(() => {
    let frame = 0
    let last = -1
    const update = () => {
      frame = 0
      const progress = Math.round(Math.min(Math.max(window.scrollY / 140, 0), 1) * 100) / 100
      // Oltre i primi 140px il valore resta 1: nessuna scrittura, nessun ricalcolo.
      if (progress === last) return
      last = progress
      header.current?.style.setProperty('--dock', String(progress))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Le sezioni entrano quando arrivano nella finestra. Le posizioni si misurano
  // solo al caricamento e quando cambia l'altezza della pagina: durante lo
  // scroll si confronta un numero con scrollY, senza leggere il layout, così
  // anche uno scroll veloce resta fluido e un salto oltre una sezione la rivela.
  // Con riduzione del movimento tutto resta visibile.
  useEffect(() => {
    const container = root.current
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let pending = [...container.querySelectorAll('[data-reveal]')].map((target) => ({ target, top: 0 }))
    let frame = 0
    const measure = () => {
      const offset = window.scrollY
      for (const item of pending) item.top = item.target.getBoundingClientRect().top + offset
    }
    const check = () => {
      frame = 0
      const line = window.scrollY + window.innerHeight * 0.88
      pending = pending.filter((item) => {
        if (item.top >= line) return true
        item.target.classList.add('is-in')
        return false
      })
      if (!pending.length) stop()
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    const resizeObserver = new ResizeObserver(() => {
      measure()
      onScroll()
    })
    function stop() {
      window.removeEventListener('scroll', onScroll)
      resizeObserver.disconnect()
    }
    measure()
    check()
    container.classList.add('reveal-ready')
    window.addEventListener('scroll', onScroll, { passive: true })
    resizeObserver.observe(container)
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="home" ref={root}>
      <header className="home-nav" ref={header}>
        <div className="home-nav__bar">
          <Link to="/" className="home-nav__brand" aria-label="Flownd, torna all'inizio">
            <picture>
              <source srcSet="/brand/lockup-scuro.webp" media="(prefers-color-scheme: dark)" />
              <img src="/brand/lockup-chiaro.webp" alt="Flownd" width="128" height="24" />
            </picture>
          </Link>
          <nav aria-label="Sezioni">
            <a href="#movimenti">Movimenti</a>
            <a href="#piano">Piano</a>
            <a href="#obiettivi">Obiettivi</a>
            <a href="#coach">Coach</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <a className={`home-nav__cta ${heroFormVisible ? 'is-hidden' : ''}`} href="#iscriviti" tabIndex={heroFormVisible ? -1 : undefined} aria-hidden={heroFormVisible || undefined}>Avvisami</a>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title" ref={hero}>
          <StatementWall active={active} />
          <div className="hero__stage">
          <div className="hero__card">
            <h1 id="hero-title">Fai crescere i tuoi risparmi, un mese alla volta.</h1>
            <p className="hero__lead">
              Flownd trasforma il tuo stipendio in un piano mensile, ti mostra dove va ogni euro
              e ti aiuta a metterne da parte di più, mese dopo mese.
            </p>
            <div id="iscriviti" className="hero__form" ref={heroForm}>
              <WaitlistForm />
            </div>
            <Ranking active={active} onActivate={setActive} />
          </div>
          <figure className="hero__device">
            <div className="device">
              <span className="device__key device__key--action" aria-hidden="true" />
              <span className="device__key device__key--volume-up" aria-hidden="true" />
              <span className="device__key device__key--volume-down" aria-hidden="true" />
              <span className="device__key device__key--side" aria-hidden="true" />
              <span className="device__key device__key--camera" aria-hidden="true" />
              <div className="device__body">
                <div className="device__screen">
                  <picture>
                    <source srcSet="/app/dashboard-dark.webp" media="(prefers-color-scheme: dark)" />
                    <img src="/app/dashboard.webp" alt="La Dashboard di Flownd su iPhone: budget disponibile del ciclo e budget per categoria" width="720" height="1561" fetchPriority="high" />
                  </picture>
                  <span className="device__island" aria-hidden="true" />
                </div>
              </div>
            </div>
            <span className="float-chip float-chip--spend" aria-hidden="true"><i />Spesa<b>386 €</b></span>
            <span className="float-chip float-chip--cycle" aria-hidden="true">A fine ciclo<b>+310 €</b></span>
            <span className="float-chip float-chip--goal" aria-hidden="true">Vacanza in Giappone<b>24%</b></span>
          </figure>
          </div>
        </section>

        <section className="steps" aria-labelledby="steps-title">
          <div className="steps__inner">
            <h2 id="steps-title" data-reveal>Dal primo giorno, in tre passi.</h2>
            <ol className="steps__list" data-reveal="rows">
              <li>
                <span className="steps__num" aria-hidden="true">1</span>
                <h3>Scarica Flownd</h3>
                <p>Su iPhone o Android, appena esce. Ti avvisiamo noi con una sola email.</p>
              </li>
              <li>
                <span className="steps__num" aria-hidden="true">2</span>
                <h3>Dai un piano allo stipendio</h3>
                <p>Dici quanto entra e quando: Flownd lo divide tra Necessità, Desideri e Risparmio.</p>
              </li>
              <li>
                <span className="steps__num" aria-hidden="true">3</span>
                <h3>Guarda dove vanno i soldi</h3>
                <p>Aggiungi o importa i movimenti e scopri subito dove spendi di più e quanto metti da parte.</p>
              </li>
            </ol>
          </div>
        </section>

        <section id="movimenti" className="section sources" aria-labelledby="sources-title">
          <div className="section__intro" data-reveal>
            <h2 id="sources-title">Ogni movimento al suo posto, in pochi secondi.</h2>
            <p>Scrivi a mano o importa l’estratto conto dell’home banking: tutto finisce nella stessa timeline, e si vede sempre da dove arriva ogni cifra.</p>
          </div>
          <ol className="sources__list" data-reveal="rows">
            <li className="source">
              <div className="source__text">
                <h3><Icon name="pencil" />Aggiungi a mano</h3>
                <p>Importo, categoria, fatto. Per il caffè pagato in contanti o la cena divisa con gli amici.</p>
              </div>
              <div className="source__ui source__ui--manual" aria-hidden="true">
                <strong className="source__amount">4,50 €</strong>
                <span className="chip">Ristoranti e bar</span>
                <span className="source__key">Salva</span>
              </div>
            </li>
            <li className="source">
              <div className="source__text">
                <h3><Icon name="file" />Importa un estratto conto</h3>
                <p>Carichi il file scaricato dall’home banking e Flownd ne ricava i movimenti, che controlli prima di salvarli.</p>
              </div>
              <div className="source__ui source__ui--import" aria-hidden="true">
                <span className="source__file">estratto_ottobre.pdf</span>
                <span className="source__arrow"><Icon name="arrow" /></span>
                <strong>37 movimenti trovati</strong>
              </div>
            </li>
            <li className="source source--soon">
              <div className="source__text">
                <h3><Icon name="link" />Collega il conto<span className="soon">In arrivo</span></h3>
                <p>Presto potrai collegare il conto con l’Open Banking europeo (PSD2): Flownd riceverà saldo e movimenti in sola lettura, e le credenziali le inserirai solo sul sito della tua banca.</p>
              </div>
              <div className="source__ui source__ui--bank" aria-hidden="true">
                <span className="chip"><Icon name="sync" />Conto corrente</span>
                <span>Sincronizzazione automatica</span>
                <strong>Presto</strong>
              </div>
            </li>
          </ol>
          <p className="sources__rule" data-reveal>
            Le categorie imparano da te: correggi una volta <span className="mono">POS ESSELUNGA</span> in Spesa e la prossima volta è già al suo posto.
          </p>
        </section>

        <section id="piano" className="section plan" aria-labelledby="plan-title">
          <div className="section__intro section__intro--wide" data-reveal>
            <h2 id="plan-title">Un piano per il mese, non una lista di divieti.</h2>
            <p>Dici quanto entra e quando arriva lo stipendio. Flownd divide il reddito tra Necessità, Desideri e Risparmio, partendo dalla regola 50/30/20 che puoi adattare come vuoi.</p>
          </div>
          <div className="plan__panel" data-reveal="panel">
            <div className="plan__meta">
              <span>Reddito di ottobre <strong>1.850 €</strong></span>
              <span>Ciclo dal 27 al 26 · giorno 18 di 30</span>
            </div>
            <PlanBand />
            <div className="plan__detail">
              <div>
                <h3>Sotto-budget</h3>
                <Budgets />
              </div>
              <div className="plan__projection">
                <h3>A fine ciclo</h3>
                <p className="plan__projection-value">+310 €</p>
                <p>È la proiezione se continui con il ritmo di questi giorni. Se qualcosa sfora, Flownd te lo dice con calma e ti mostra dove recuperare.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="obiettivi" className="section goals" aria-labelledby="goals-title">
          <div className="goals__copy" data-reveal>
            <h2 id="goals-title">Mettere da parte, con un nome e una data.</h2>
            <p>Crei un obiettivo, scegli quanto e per quando. Ogni mese Flownd distribuisce il risparmio tra i tuoi obiettivi, in ordine di priorità oppure in percentuale, e ti dice se sei in linea.</p>
          </div>
          <div className="goals__flow" data-reveal="flow" aria-label="Esempio: 370 euro di risparmio distribuiti tra due obiettivi">
            <div className="goals__source">
              <span>Risparmio di ottobre</span>
              <strong>370 €</strong>
            </div>
            <div className="goal">
              <div className="goal__head"><h3>Fondo emergenze</h3><span>+250 €</span></div>
              <div className="goal__track"><span style={{ '--progress': 0.61 }} /></div>
              <p>920 € di 1.500 € · priorità 1</p>
            </div>
            <div className="goal">
              <div className="goal__head"><h3>Vacanza in Giappone</h3><span>+120 €</span></div>
              <div className="goal__track"><span style={{ '--progress': 0.24 }} /></div>
              <p>480 € di 2.000 € entro marzo 2027 · servono 304 € al mese per arrivarci</p>
            </div>
          </div>
        </section>

        <section id="coach" className="section coach" aria-labelledby="coach-title">
          <div className="coach__copy" data-reveal>
            <h2 id="coach-title">Un coach che propone. Decidi sempre tu.</h2>
            <p>Il Money Coach risponde in italiano partendo dai tuoi dati: quanto hai speso, dove, come va il piano. Quando suggerisce una modifica ti mostra una proposta da confermare o correggere. Senza il tuo sì, non salva niente.</p>
          </div>
          <div className="chat" data-reveal="chat" aria-label="Esempio di conversazione con il Money Coach">
            <p className="chat__bubble chat__bubble--me">Quanto ho speso fuori casa questo mese?</p>
            <p className="chat__bubble">114 € tra ristoranti e bar, 36 € in meno di settembre. La voce più grande è la cena del 9 ottobre da 58 €.</p>
            <p className="chat__bubble chat__bubble--me">Vorrei mettere da parte qualcosa per il regalo di Natale.</p>
            <div className="proposal">
              <p className="proposal__title">Nuovo obiettivo proposto</p>
              <dl>
                <div><dt>Nome</dt><dd>Regali di Natale</dd></div>
                <div><dt>Importo</dt><dd>300 €</dd></div>
                <div><dt>Entro</dt><dd>15 dicembre</dd></div>
              </dl>
              <div className="proposal__actions">
                <span className="proposal__button proposal__button--ghost">Modifica</span>
                <span className="proposal__button"><Icon name="check" />Conferma</span>
              </div>
            </div>
          </div>
        </section>

        <section id="gruppi" className="groups" aria-labelledby="groups-title">
          <div className="groups__inner">
            <div className="groups__copy" data-reveal>
              <h2 id="groups-title">Risparmiare insieme è più facile.</h2>
              <p>Crea un gruppo per la casa, la coppia o la famiglia. Ognuno tiene le sue spese personali e decide cosa condividere: il budget comune, le spese da dividere, il patrimonio, gli obiettivi.</p>
              <ul className="groups__points" data-reveal="rows">
                <li><Icon name="check" />Un budget comune, con il contributo di ciascuno</li>
                <li><Icon name="check" />Le spese divise in automatico, senza calcoli a fine mese</li>
                <li><Icon name="check" />Obiettivi da raggiungere insieme, come il divano nuovo o le vacanze</li>
              </ul>
            </div>
            <div className="group-card" data-reveal="flow" aria-label="Esempio di gruppo Casa con due membri">
              <div className="group-card__head">
                <div>
                  <p className="group-card__name">Casa</p>
                  <p className="group-card__meta">Budget e spese comuni</p>
                </div>
                <span className="group-card__members" aria-hidden="true"><span>G</span><span>M</span></span>
              </div>
              <div className="group-card__module">
                <div className="group-card__row"><span>Budget comune di novembre</span><strong>612 € <small>di 900 €</small></strong></div>
                <div className="goal__track"><span style={{ '--progress': 0.68 }} /></div>
              </div>
              <div className="group-card__module">
                <p className="group-card__label">Spese da dividere</p>
                <ul className="balances">
                  <li><span>Spesa del sabato</span><span>pagata da Giulia</span><strong>64,20 €</strong></li>
                  <li><span>Bolletta luce</span><span>pagata da Marco</span><strong>65,00 €</strong></li>
                  <li className="balances__total"><span>Saldo</span><span>Giulia deve a Marco</span><strong>18,00 €</strong></li>
                </ul>
              </div>
              <div className="group-card__module">
                <div className="group-card__row"><span>Obiettivo · Divano nuovo</span><strong>640 € <small>di 1.200 €</small></strong></div>
                <div className="goal__track"><span style={{ '--progress': 0.53 }} /></div>
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" className="trust" aria-labelledby="trust-title">
          <div className="trust__inner">
            <h2 id="trust-title" data-reveal>I tuoi dati restano tuoi.</h2>
            <ul className="trust__list" data-reveal="rows">
              <li><Icon name="file" /><div><h3>File non conservati</h3><p>L’estratto conto che importi serve solo a leggere i movimenti: il suo contenuto viene cancellato appena l’elaborazione finisce.</p></div></li>
              <li><Icon name="lock" /><div><h3>Banca in sola lettura</h3><p>Quando arriverà il collegamento al conto potrà leggere saldo e movimenti, mai disporre pagamenti. E la password la inserirai solo sul sito della banca.</p></div></li>
              <li><Icon name="eye" /><div><h3>Importi nascosti</h3><p>Un tocco e tutte le cifre spariscono dallo schermo, per quando sei in pubblico.</p></div></li>
              <li><Icon name="check" /><div><h3>Niente di silenzioso</h3><p>Né il Coach né le importazioni salvano qualcosa senza che tu l’abbia visto e confermato.</p></div></li>
            </ul>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title" data-reveal>
          <h2 id="closing-title">Flownd sta arrivando su iOS e Android.</h2>
          <p>Lascia la tua email: ti scriviamo una sola volta, il giorno in cui puoi scaricarla.</p>
          <WaitlistForm variant="closing" />
        </section>
      </main>

      <footer className="home-footer">
        <span>© 2026 Flownd · Fatto in Italia</span>
        <nav aria-label="Informazioni legali">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Termini</Link>
        </nav>
      </footer>
    </div>
  )
}
