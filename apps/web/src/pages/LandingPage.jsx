import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './LandingPage.css'

const DEMO_FEED = [
  { e: '🍕', desc: 'Esselunga Milano', amount: '-€87,43', cat: 'Cibo', color: '#FCEBEB' },
  { e: '💰', desc: 'Stipendio Maggio', amount: '+€2.800', cat: 'Entrate', color: '#E1F5EE' },
  { e: '🚆', desc: 'Trenitalia MI→RM', amount: '-€45,00', cat: 'Trasporti', color: '#E6F1FB' },
  { e: '🎬', desc: 'Netflix', amount: '-€15,99', cat: 'Svago', color: '#FAECE7' },
  { e: '⚡', desc: 'A2A Energia', amount: '-€65,00', cat: 'Bollette', color: '#FAEEDA' },
  { e: '🛍', desc: 'Zara CityLife', amount: '-€79,95', cat: 'Shopping', color: '#FBEAF0' },
  { e: '❤️', desc: 'Farmacia Centrale', amount: '-€28,70', cat: 'Salute', color: '#EEEDFE' },
  { e: '🚆', desc: 'ATM Abbonamento', amount: '-€35,00', cat: 'Trasporti', color: '#E6F1FB' },
  { e: '🍕', desc: 'Pizzeria da Mario', amount: '-€32,50', cat: 'Cibo', color: '#FCEBEB' },
  { e: '💰', desc: 'Freelance Progetto', amount: '+€500,00', cat: 'Entrate', color: '#E1F5EE' },
]

const FAQS = [
  ['La mia banca è supportata?', 'Flownd supporta oltre 160 banche italiane. La lista completa sarà presto disponibile; la copertura può variare in base al tipo di conto.'],
  ['Flownd vede le mie credenziali bancarie?', 'No. Il collegamento avviene tramite il flusso OAuth previsto dalla PSD2. Flownd riceve un accesso in sola lettura e non vede né conserva le tue credenziali.'],
  ['Posso usarlo senza collegare la banca?', 'Sì. Puoi inserire le spese manualmente oppure importare un estratto conto. Il collegamento bancario resta sempre una scelta.'],
  ['Cosa succede ai miei dati se annullo?', 'Puoi esportare i dati prima di chiudere l’account. Quando chiedi la cancellazione, eliminiamo i dati personali secondo i tempi indicati nell’informativa privacy.'],
  ['Funziona con una banca piccola?', 'La copertura bancaria varia. Se la tua Cassa Rurale o banca locale non è ancora supportata, puoi continuare a usare Flownd importando il tuo estratto conto.'],
]

function useInViewOnce(options = {}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current || visible) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { threshold: 0.25, ...options })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [visible, options])
  return [ref, visible]
}

function LivingFeed({ compact = false }) {
  const [offset, setOffset] = useState(0)
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => {
      setOffset((value) => (value + 1) % DEMO_FEED.length)
      setFresh(true)
      window.setTimeout(() => setFresh(false), 240)
    }, 2500)
    return () => window.clearInterval(id)
  }, [])
  const items = [...DEMO_FEED.slice(offset), ...DEMO_FEED.slice(0, offset)].slice(0, compact ? 4 : 7)
  return (
    <div className={`living-feed ${compact ? 'living-feed--compact' : ''}`} role="img" aria-label="Esempio animato del feed delle transazioni">
      <div className="feed-topline"><span>Ultime transazioni</span><span>MAG 2026</span></div>
      <div className="feed-list">
        {items.map((item, index) => (
          <div className={`feed-row ${index === 0 && fresh ? 'feed-row--fresh' : ''}`} key={`${item.desc}-${offset}-${index}`}>
            <span className="feed-emoji" style={{ background: item.color }}>{item.e}</span>
            <span className="feed-copy"><strong>{item.desc}</strong><small>{item.cat}</small></span>
            <span className={item.amount.startsWith('+') ? 'feed-amount positive' : 'feed-amount'}>{item.amount}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ end, prefix = '', suffix = '', decimals = 0, visible }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!visible) return undefined
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      const reducedFrame = requestAnimationFrame(() => setValue(end))
      return () => cancelAnimationFrame(reducedFrame)
    }
    const start = performance.now()
    let frame
    const tick = (now) => {
      const progress = Math.min((now - start) / 1500, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(end * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [end, visible])
  return <span>{prefix}{value.toFixed(decimals)}{suffix}</span>
}

function Plan({ name, price, subtitle, features, featured = false, note }) {
  return (
    <article className={`price-card ${featured ? 'price-card--featured' : ''}`}>
      {featured && <span className="plan-badge">Più scelto</span>}
      <p className="plan-name">{name}</p>
      <div className="plan-price"><strong>€{price}</strong>{price !== '0' && <span>/mese</span>}</div>
      <p className="plan-subtitle">{subtitle}</p>
      <ul className="plan-features">
        {features.map(([available, text]) => <li className={available ? '' : 'unavailable'} key={text}><span>{available ? '✓' : '×'}</span>{text}</li>)}
      </ul>
      <Link className={`button plan-button ${featured ? 'button--accent' : 'button--outline'}`} to="/connect">
        {featured ? 'Inizia gratis 14 giorni' : 'Scegli ' + name}
      </Link>
      <small className="plan-note">{note}</small>
    </article>
  )
}

export default function LandingPage() {
  const [statsRef, statsVisible] = useInViewOnce()
  const [aiRef, aiVisible] = useInViewOnce()
  const [groupRef, groupVisible] = useInViewOnce()
  const [openFaq, setOpenFaq] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-container nav-inner">
          <a className="wordmark" href="#top" aria-label="Flownd, torna all'inizio">FLOWND</a>
          <button className="nav-toggle" type="button" aria-label="Apri il menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? '×' : '☰'}</button>
          <nav className={menuOpen ? 'nav-links nav-links--open' : 'nav-links'} aria-label="Navigazione principale">
            <a href="#funzionalita" onClick={() => setMenuOpen(false)}>Funzionalità</a>
            <a href="#prezzi" onClick={() => setMenuOpen(false)}>Prezzi</a>
            <a href="#footer" onClick={() => setMenuOpen(false)}>Blog</a>
            <Link className="nav-cta" to="/connect">Inizia gratis →</Link>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero landing-container">
          <div className="hero-copy">
            <p className="overline">Gestione finanziaria personale</p>
            <h1>SMETTI<br />DI CHIEDERTI<br />DOVE VANNO<br />I <em>SOLDI.</em></h1>
            <p className="hero-intro">Flownd collega il tuo conto corrente, categorizza le spese automaticamente e ti mostra esattamente dove stai spendendo — e dove puoi risparmiare.</p>
            <div className="hero-actions">
              <Link className="button button--accent" to="/connect">Inizia gratis</Link>
              <a className="text-link" href="#funzionalita">Vedi come funziona →</a>
            </div>
            <div className="proof-row" aria-label="Dati principali del servizio">
              <span><i />Beta privata</span><span><i />160+ banche italiane</span><span><i />GDPR compliant</span>
            </div>
          </div>
          <div className="hero-feed"><LivingFeed /></div>
          <div className="hero-feed-mobile"><LivingFeed compact /></div>
        </section>

        <section className="truth-section" ref={statsRef}>
          <div className="landing-container">
            <p className="section-index">01 — IL PROBLEMA</p>
            <h2>HAI GIÀ APERTO L’APP DELLA BANCA<br />STAMATTINA. NON HAI CAPITO NIENTE.</h2>
            <div className="truth-list">
              <div><strong><Stat end={47} suffix="%" visible={statsVisible} /></strong><p>degli italiani non sa quanto spende mensilmente in cibo e ristoranti.<small>Dato dimostrativo</small></p></div>
              <div><strong><Stat end={3.2} decimals={1} visible={statsVisible} /></strong><p>abbonamenti in media vengono pagati senza accorgersene ogni mese.<small>Dato dimostrativo</small></p></div>
              <div><strong><Stat end={340} prefix="€" visible={statsVisible} /></strong><p>è la differenza media tra quello che si pensa di spendere e quanto si spende.<small>Dato dimostrativo</small></p></div>
            </div>
          </div>
        </section>

        <section className="steps-section landing-container" id="funzionalita">
          <p className="section-index">02 — COME FUNZIONA</p>
          <h2 className="center-title">DA ZERO A TUTTO CHIARO<br />IN TRE MINUTI</h2>
          <div className="steps-grid">
            <article className="step-card"><span className="step-number">01</span><p className="overline">Collega il conto</p><h3>La tua banca in 2 tap</h3><p>Supportiamo oltre 160 banche italiane via Open Banking PSD2. Nessuna credenziale condivisa, accesso in sola lettura.</p><div className="bank-checks"><span>✓ ING</span><span>✓ Intesa Sanpaolo</span><span>✓ UniCredit</span></div></article>
            <article className="step-card"><span className="step-number">02</span><p className="overline">Categorie</p><h3>Le spese si ordinano da sole</h3><p>Ogni transazione viene categorizzata automaticamente. L’AI corregge i casi incerti. Tu correggi il resto con un tap.</p><div className="donut-wrap" role="img" aria-label="Grafico delle categorie di spesa"><div className="donut" /><div><span><i className="dot dot-1" />Casa 38%</span><span><i className="dot dot-2" />Cibo 32%</span><span><i className="dot dot-3" />Altro 30%</span></div></div></article>
            <article className="step-card"><span className="step-number">03</span><p className="overline">Controlla</p><h3>Budget e risparmi sotto controllo</h3><p>Imposta un budget per categoria. Flownd ti avvisa quando ti avvicini al limite. A fine mese sai dove hai risparmiato.</p><div className="mini-budgets"><label>Spesa alimentare <span>€340 / €500</span></label><i><b style={{ width: '68%' }} /></i><label>Tempo libero <span>€92 / €200</span></label><i><b style={{ width: '46%' }} /></i></div></article>
          </div>
        </section>

        <section className="ai-section" ref={aiRef}>
          <div className="landing-container">
            <p className="section-index">03 — INTELLIGENZA ARTIFICIALE</p>
            <h2>L’AI CHE CAPISCE<br />I TUOI SOLDI</h2>
            <div className={`feature-row ${aiVisible ? 'is-visible' : ''}`}>
              <div className="feature-copy"><p className="overline">Solo piano Premium</p><h3>Fotografa. Fatto.</h3><p>Uno screenshot della notifica bancaria, di un’email di conferma o di uno scontrino. Flownd estrae importo, data e categoria in automatico. Nessun inserimento manuale.</p></div>
              <div className="phone-mock" role="img" aria-label="Notifica bancaria analizzata da Flownd"><div className="phone-speaker" /><p className="notification-label">BANCA · ADESSO</p><strong>Pagamento di €26,80</strong><span>Mercato Centrale Milano</span><div className="parse-card"><p>Importo <b>€26,80</b></p><p>Categoria <b>Spesa</b></p><p>Data <b>Oggi</b></p></div></div>
            </div>
            <div className={`feature-row feature-row--reverse ${aiVisible ? 'is-visible' : ''}`}>
              <div className="feature-copy"><h3>Di’ quanto hai speso.</h3><p>“Ho speso venti euro al supermercato ieri.” Flownd capisce, categorizza e aggiunge la transazione. Conferma con un tap.</p></div>
              <div className="voice-mock" role="img" aria-label="Registrazione vocale di una spesa"><div className="waveform">{[1,2,3,4,5].map((item) => <i key={item} />)}</div><p>“Ho speso venti euro<br />al supermercato ieri.”</p><span>€20,00 · Cibo · Ieri</span></div>
            </div>
            <div className={`feature-row ${aiVisible ? 'is-visible' : ''}`}>
              <div className="feature-copy"><h3>Carica il PDF della banca.</h3><p>Qualunque banca, qualunque formato. L’AI analizza l’estratto conto e importa le transazioni con le categorie già assegnate. Il file viene eliminato subito dopo l’import.</p></div>
              <div className="pdf-mock" role="img" aria-label="Estratto conto PDF trasformato in transazioni"><div className="pdf-icon">PDF<small>MAG 2026</small></div><div className="pdf-lines"><p><span>Esselunga</span><b>−€87,43</b></p><p><span>Stipendio</span><b className="positive">+€2.800</b></p><p><span>Trenitalia</span><b>−€45,00</b></p></div></div>
            </div>
          </div>
        </section>

        <section className="group-section landing-container" ref={groupRef}>
          <div className="group-copy"><p className="overline">Famiglia · Coinquilini · Coppia</p><h2>TRE PERSONE.<br />UN BUDGET.<br />ZERO DISCUSSIONI.</h2><p>Crea un gruppo, invita chi vuoi. Ogni membro vede le spese condivise e il budget si aggiorna in tempo reale. Le spese personali restano private.</p><ul><li>— Budget condivisi con contributi per membro</li><li>— Split spese automatico</li><li>— Profili separati: personale e gruppo</li><li>— Fino a 6 persone nel piano Famiglia</li></ul></div>
          <div className={`group-mock ${groupVisible ? 'is-visible' : ''}`} role="img" aria-label="Budget condiviso fra tre persone"><div className="group-head"><span>Budget di casa</span><strong>MAGGIO</strong></div><div className="avatars"><i>MA</i><i>LU</i><i>GI</i><span>3 membri</span></div><p className="budget-total"><strong>€1.284</strong><span>di €1.800</span></p><div className="shared-bar"><i /></div><div className="member-row"><i className="avatar-small">MA</i><span>Marta</span><b>€542</b></div><div className="member-row"><i className="avatar-small alt">LU</i><span>Luca</span><b>€418</b></div><div className="member-row"><i className="avatar-small third">GI</i><span>Giulia</span><b>€324</b></div></div>
        </section>

        <section className="pricing-section" id="prezzi">
          <div className="landing-container"><p className="section-index">04 — PREZZI</p><h2 className="center-title">SCEGLI IL TUO PIANO</h2><div className="pricing-grid">
            <Plan name="Free" price="0" subtitle="Per sempre" features={[[true,'Inserimento manuale spese'],[true,'Budget per 3 categorie'],[true,'Grafici del mese'],[true,'Storico 3 mesi'],[false,'Collegamento bancario'],[false,'Funzionalità AI']]} note="Include pubblicità non invasiva" />
            <Plan featured name="Premium" price="4,99" subtitle="Mensile · Disdici quando vuoi" features={[[true,'Tutto il piano Free'],[true,'Collegamento a 160+ banche'],[true,'Sync e categorizzazione AI'],[true,'Import PDF, voce e screenshot'],[true,'Storico illimitato'],[true,'Gruppo fino a 2 persone']]} note="Nessuna carta per iniziare" />
            <Plan name="Famiglia" price="9,99" subtitle="Fino a 6 persone" features={[[true,'Tutto il piano Premium'],[true,'Fino a 6 persone'],[true,'Profili personali separati'],[true,'Budget familiari'],[true,'Split spese automatico'],[true,'Dashboard famiglia']]} note="Un solo abbonamento per tutti" />
          </div><p className="security-note">Tutti i piani includono: crittografia end-to-end · GDPR compliant · accesso bancario in sola lettura · dati mai venduti a terzi</p></div>
        </section>

        <section className="faq-section landing-container"><p className="section-index">05 — DOMANDE, RISPOSTE</p><h2>PRIMA CHE TU<br />CE LO CHIEDA.</h2><div className="faq-list">{FAQS.map(([question, answer], index) => { const open = openFaq === index; return <div className={`faq-item ${open ? 'is-open' : ''}`} key={question}><button type="button" aria-expanded={open} onClick={() => setOpenFaq(open ? -1 : index)}><span>{question}</span><i>{open ? '−' : '+'}</i></button><div className="faq-answer"><p>{answer}</p></div></div> })}</div></section>

        <section className="final-cta"><div className="landing-container"><h2>INIZIA OGGI.</h2><p>Gratis. Nessuna carta richiesta. 14 giorni di Premium inclusi.</p><Link className="button button--dark" to="/connect">Crea il tuo account →</Link></div></section>
      </main>

      <footer className="landing-footer" id="footer"><div className="landing-container"><div className="footer-top"><a className="wordmark wordmark--light" href="#top">FLOWND</a><nav aria-label="Link nel footer"><a href="#funzionalita">Funzionalità</a><a href="#prezzi">Prezzi</a><a href="#footer">Chi siamo</a><a href="#footer">Blog</a><Link to="/privacy">Privacy</Link><Link to="/terms">Termini</Link></nav><div className="socials"><a href="#footer" aria-label="Instagram">◎</a><a href="#footer" aria-label="LinkedIn">in</a></div></div><div className="footer-bottom"><span>© 2026 Flownd · Made in Italy · P.IVA 00000000000</span><span>Aggregazione dati bancari conforme PSD2 · Dati protetti con crittografia AES-256</span></div></div></footer>
    </div>
  )
}
