import { Link } from 'react-router-dom'

const legalContent = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Ultimo aggiornamento: 9 luglio 2026',
    intro:
      'Flownd permette di collegare un conto bancario tramite Enable Banking per visualizzare saldo e transazioni in sola lettura.',
    sections: [
      {
        title: 'Dati trattati',
        body:
          'L’app può trattare dati relativi al conto, come saldo, IBAN, descrizione dei movimenti, date e importi. Non trattiamo credenziali bancarie: l’autenticazione avviene sul sito della banca o di Enable Banking.',
      },
      {
        title: 'Finalità',
        body:
          'I dati sono usati per mostrare all’utente una panoramica personale delle proprie finanze. In questa fase l’app è un prototipo e non offre consulenza finanziaria.',
      },
      {
        title: 'Conservazione',
        body:
          'Le informazioni di sessione possono essere salvate nel browser dell’utente tramite localStorage. Il consenso bancario può essere revocato tramite la banca o Enable Banking.',
      },
      {
        title: 'Contatti privacy',
        body:
          'Per richieste relative alla protezione dei dati, contatta il titolare all’indirizzo email indicato nella registrazione dell’applicazione Enable Banking.',
      },
    ],
  },
  terms: {
    title: 'Termini di utilizzo',
    updated: 'Ultimo aggiornamento: 9 luglio 2026',
    intro:
      'Usando Flownd accetti questi termini provvisori. L’app è fornita per test e uso personale.',
    sections: [
      {
        title: 'Servizio',
        body:
          'Flownd consente di consultare dati bancari in sola lettura tramite Enable Banking. L’app non può eseguire pagamenti o modificare il conto corrente.',
      },
      {
        title: 'Responsabilità',
        body:
          'Le informazioni mostrate possono dipendere dai dati forniti dalla banca. L’utente resta responsabile delle proprie decisioni finanziarie.',
      },
      {
        title: 'Disponibilità',
        body:
          'Il servizio può essere modificato, sospeso o interrotto durante la fase di sviluppo e test.',
      },
      {
        title: 'Uso consentito',
        body:
          'L’app deve essere usata solo con conti propri o per cui si dispone di autorizzazione. Non è consentito tentare accessi non autorizzati.',
      },
    ],
  },
}

export default function LegalPage({ type }) {
  const content = legalContent[type]

  return (
    <main className="app-shell legal-shell">
      <section className="surface-panel legal-panel">
        <Link to="/" className="back-link">Torna a Flownd</Link>
        <h1>{content.title}</h1>
        <p className="legal-updated">{content.updated}</p>
        <p className="legal-intro">{content.intro}</p>

        {content.sections.map((section) => (
          <article className="legal-section" key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
