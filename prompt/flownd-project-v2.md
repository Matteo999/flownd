# Flownd — Documento di Progetto v2

*Versione 2.0 — 20 agosto 2026*

---

## 0. Scopo e stato del documento

Questo documento sostituisce come riferimento operativo la versione `flownd-project.md`, che resta conservata come documento storico. La v2 descrive:

- la visione di prodotto aggiornata;
- quanto è già stato implementato nel repository;
- le modifiche architetturali e funzionali introdotte durante lo sviluppo;
- lo stato reale delle feature, distinguendo ciò che è operativo da ciò che è parziale o pianificato;
- la nuova architettura mobile, web, API e Supabase;
- le priorità di sviluppo successive.

### Legenda di stato

| Stato | Significato |
| --- | --- |
| **Implementato** | Presente nel codice e collegato al flusso applicativo. Può richiedere ulteriore QA o rifinitura prima della produzione. |
| **Parziale** | Infrastruttura o UI presenti, ma flusso non ancora completo o non ancora pronto per il rilascio pubblico. |
| **Pianificato** | Decisione di prodotto confermata, non ancora implementata nel repository. |

### Fonti di verità

In caso di divergenze, l'ordine di priorità è:

1. migrazioni in `supabase/migrations/` per schema, RPC, trigger e RLS;
2. codice in `apps/mobile`, `apps/web` e `api` per il comportamento eseguibile;
3. questo documento per visione, stato consolidato e roadmap;
4. `SCREENS-LOGICv2.md` e `DESIGNv2.md` per le specifiche UX/UI ancora da completare.

---

## 1. Visione del prodotto aggiornata

**Flownd** è un money coach multipiattaforma per la gestione finanziaria personale e, in una fase successiva, familiare. Trasforma conti, movimenti, budget e obiettivi in una rappresentazione comprensibile del flusso del denaro e in suggerimenti concreti, senza tono giudicante.

Il prodotto non è più concepito soltanto come un tracker di spese. I quattro pilastri attuali sono:

1. **Piano mensile** — reddito disponibile, allocazione tra Necessità, Desideri e Risparmio, sotto-budget e ciclo finanziario personalizzato.
2. **Movimenti** — timeline di entrate e uscite manuali o bancarie, categorizzazione, ricerca, filtri e correzioni persistenti.
3. **Patrimonio e Open Banking** — conti aggregati, saldi, storico patrimoniale e import automatico resiliente.
4. **Obiettivi e Coach** — accantonamenti virtuali, allocazione waterfall o percentuale e conversazione AI basata sui dati dell'utente.

La prima applicazione completa resta il client mobile iOS/Android sviluppato con React Native ed Expo. La web app è un client separato dello stesso prodotto: oggi espone pubblicamente una pagina “coming soon”, mentre le rotte operative restano disponibili in sviluppo o in deployment privati.

Mobile e web condividono identità Supabase, database e API server-side. I dati finanziari persistenti hanno Supabase/PostgreSQL come fonte primaria; AsyncStorage viene usato solo per preferenze locali, come la visibilità degli importi.

### Target primario

- persone tra 25 e 45 anni;
- mercato iniziale italiano;
- uno o due redditi;
- esigenza di gestire spese, budget e risparmio senza fogli di calcolo;
- utenti che vogliono collegare la banca, ma anche utenti che preferiscono l'inserimento manuale.

### Principi di prodotto

- **Calma prima di allarme:** comunicazione chiara e non colpevolizzante.
- **Smart default:** mostrare il minimo utile e rendere progressive le opzioni avanzate.
- **Una sola azione primaria per contesto:** evitare dashboard e schermate sovraccariche.
- **AI con conferma umana:** il Coach propone le mutazioni, l'utente le conferma prima del salvataggio.
- **Privacy by design:** chiavi e operazioni sensibili restano server-side; i dati visibili possono essere mascherati globalmente.
- **Dato onesto:** stime, dati manuali e dati bancari devono essere distinguibili.

---

## 2. Modello di business

Il modello resta freemium con tre livelli: **Free**, **Pro** e **Max**. Nel database il livello è già rappresentato da `profiles.plan_tier`; pagamenti, gestione abbonamenti e paywall completi sono ancora pianificati.

| Feature | Free | Pro | Max | Stato attuale |
| --- | --- | --- | --- | --- |
| Onboarding finanziario | Sì | Sì | Sì | Implementato |
| Inserimento e modifica movimenti manuali | Sì | Sì | Sì | Implementato |
| Timeline, ricerca e filtri | Sì | Sì | Sì | Implementato |
| Categorizzazione keyword e regole personali | Sì | Sì | Sì | Implementato |
| Budget 50/30/20 personalizzabile | Sì | Sì | Sì | Implementato |
| Sotto-budget e ciclo finanziario | Sì | Sì | Sì | Implementato |
| Obiettivi e versamenti manuali | Base | Completo | Completo | Implementato |
| Money Coach AI | Limiti da definire | Sì | Sì | Parziale/implementato tecnicamente |
| Collegamento Open Banking | No | Sì | Sì | Implementato con Enable Banking e gating piano |
| Sync automatico bancario | No | Sì | Sì | Implementato |
| Storico completo | 2 mesi previsti | Illimitato | Illimitato | Enforcement commerciale pianificato |
| Gruppi | No | Fino a 2 | Fino a 10 | Pianificato |
| Import estratto conto AI | No | Sì | Sì | Pianificato |
| Input vocale e screenshot AI | No | Sì | Sì | Pianificato |
| Report PDF e riconoscimento ricorrenze | No | Sì | Sì | Infrastruttura dati parziale |
| Pubblicità contestuale | Sì | No | No | Pianificato |

I prezzi di riferimento restano **4,99 €/mese per Pro** e **9,99 €/mese per Max**, ma devono essere validati prima dell'integrazione Stripe e della pubblicazione negli store.

### Pubblicità

La pubblicità è prevista soltanto per il piano Free e non è ancora integrata. Quando verrà introdotta:

- dovrà essere contestuale e non personalizzata di default;
- non dovrà comparire nella lista transazioni o accanto a saldo, IBAN e dati bancari sensibili;
- il consenso alla personalizzazione dovrà essere separato ed esplicito;
- provider e compatibilità mobile/web dovranno essere rivalutati prima dell'implementazione. AdSense resta un'opzione web, non una scelta già valida per l'app nativa.

---

## 3. Stato del prodotto

### 3.1 Autenticazione e sessione — Implementato

- Supabase Auth condiviso.
- Registrazione e accesso email/password.
- Pulsanti e flussi predisposti per Google, Apple e Facebook; la disponibilità effettiva dipende dalla configurazione provider.
- Callback OAuth/deep link dedicata.
- Sessione persistente su mobile con AsyncStorage e refresh automatico del token.
- Routing condizionale tra autenticazione, onboarding e applicazione.
- Logout e gestione errori di sessione.

### 3.2 Onboarding finanziario — Implementato

L'onboarding non raccoglie più solo tre limiti mensili. Costruisce il primo modello finanziario dell'utente e lo salva atomicamente tramite RPC Supabase.

Il flusso comprende:

- fascia di reddito mensile e valore di riferimento;
- reddito mensile pianificato;
- allocazione percentuale iniziale tra **Necessità**, **Desideri** e **Risparmio**;
- materializzazione degli importi a partire dalle percentuali;
- primo obiettivo opzionale;
- prima transazione opzionale;
- completamento atomico con `complete_flownd_onboarding_v2`;
- marcatura del profilo come `onboarding_completed`.

La stima iniziale permette di usare subito l'app. In futuro dovrà essere etichettata e sostituita, con conferma, da un reddito manuale o bancario più affidabile.

### 3.3 Dashboard — Implementato

La Dashboard è diventata un riepilogo dinamico e non una semplice lista di numeri.

Funzioni presenti:

- card principale a due pagine orizzontali:
  - budget disponibile del ciclo corrente;
  - patrimonio aggregato e variazione;
- visibilità globale degli importi tramite icona occhio;
- breakdown Necessità/Desideri/Risparmio;
- accesso diretto alla modifica dell'allocazione;
- donut delle spese per categoria con selezione della fetta;
- navigazione contestuale verso la Timeline filtrata;
- conferme e messaggi di primo accesso;
- inserimento rapido di una nuova transazione;
- card contestuali per insight Coach, scadenze, obiettivo prioritario e collegamento banca;
- rendering condizionale per evitare blocchi vuoti o irrilevanti.

### 3.4 Budget e ciclo finanziario — Implementato

Il budget è basato su percentuali e importi coerenti con il reddito pianificato.

Funzioni presenti:

- macro-categorie **Necessità**, **Desideri**, **Risparmio**;
- percentuali personalizzabili, con validazione della somma;
- importi derivati dal reddito mensile pianificato;
- salvataggio atomico tramite `save_budget_allocations`;
- sotto-budget gerarchici con `parent_key` e `is_macro`;
- creazione di sotto-categorie entro la percentuale disponibile della macro-categoria;
- modifica del reddito usato dal budget;
- classificazione delle entrate che alimentano o non alimentano il piano mensile;
- esclusione manuale di una transazione dal budget;
- giorno di inizio ciclo configurabile tra 1 e 28;
- modalità di rollover configurabile;
- calcoli ancorati al ciclo finanziario, non necessariamente al mese solare.

Il reddito del ciclo viene calcolato dalle entrate incluse e classificate; in assenza di dati sufficienti viene usato il reddito pianificato.

### 3.5 Timeline e transazioni — Implementato

La Timeline supporta entrate e uscite e costituisce il registro operativo delle finanze dell'utente.

Funzioni presenti:

- periodi settimana, mese e anno;
- navigazione tra periodi precedenti e successivi;
- intervallo date personalizzato;
- grafico entrate/uscite con granularità adattata al periodo;
- riepilogo di entrate, uscite e saldo netto;
- lista raggruppata cronologicamente;
- ricerca testuale;
- filtro per una o più categorie;
- combinazione di ricerca, categoria e date;
- inserimento manuale con data;
- modifica di descrizione, importo, categoria, tipo e data;
- eliminazione movimento;
- selezione multipla;
- categorizzazione bulk;
- opzione “ricorda per movimenti simili”;
- inclusione/esclusione dal budget;
- distinzione tra entrata e uscita tramite `transactions.kind`;
- esclusione dai totali e riconoscimento dei trasferimenti interni per i movimenti bancari.

### 3.6 Categorizzazione — Implementato

La categorizzazione ora combina tre livelli:

1. normalizzazione e suggerimento locale per descrizione;
2. categorie distinte per entrate e uscite;
3. regole personali persistite in `transaction_category_rules`.

Quando l'utente ricategorizza un movimento può applicare la scelta in bulk e memorizzare una regola per descrizioni simili. Un trigger applica automaticamente le regole alle transazioni successive. La categorizzazione LLM general-purpose resta pianificata; il Coach usa già modelli AI, ma non sostituisce ancora questo motore.

### 3.7 Obiettivi di risparmio — Implementato

Il motore obiettivi è stato ampliato rispetto al progetto iniziale.

Funzioni presenti:

- creazione e modifica obiettivo con nome, target e scadenza;
- date picker nativo per la scadenza;
- elenco obiettivi attivi con progresso;
- dettaglio e storico versamenti;
- versamento manuale a un obiettivo specifico;
- distribuzione automatica di un pool di risparmio;
- modalità **priorità/waterfall**;
- modalità **percentuale**;
- riordinamento delle priorità;
- stato `reached` al raggiungimento del target;
- scelta esplicita tra completamento e prosecuzione come `free_savings`;
- archivio espandibile degli obiettivi completati;
- eliminazione logica con `deleted_at`;
- eliminazione anche dall'archivio completati;
- restituzione alla quota Risparmio dei contributi appartenenti al ciclo finanziario corrente;
- conservazione nello storico degli accantonamenti dei cicli chiusi;
- ricalcolo delle priorità dopo la cancellazione;
- notifiche generate dall'allocazione automatica.

Gli accantonamenti sono **virtuali**: il denaro rimane fisicamente sul conto. L'app mantiene la destinazione logica e deve comunicarlo sempre chiaramente.

### 3.8 Finanziamenti — Implementato a livello iniziale

Mutui e prestiti sono modellati separatamente dagli obiettivi.

Sono presenti:

- tabella `loans`;
- inserimento di importo finanziato, anticipo, numero rate, tasso, data di inizio e maxirata;
- calcolo della rata con formula di ammortamento;
- indicatore di sostenibilità rispetto a reddito e quota Necessità;
- sezione Finanziamenti nella tab Obiettivi;
- integrazione delle rate tra le scadenze future.

Restano da completare gestione/modifica dei finanziamenti, piano di ammortamento dettagliato e collegamento guidato della maxirata a un obiettivo.

### 3.9 Patrimonio — Implementato

La quinta tab principale è ora **Patrimonio**, non Profilo.

Funzioni presenti:

- patrimonio netto aggregato dai conti finanziari attivi;
- conti manuali e Open Banking nello stesso modello `financial_accounts`;
- saldo corrente, saldo precedente e delta;
- dettaglio istituto, valuta e ultimo aggiornamento;
- grafico dello storico patrimoniale ricostruito da saldo corrente e movimenti;
- snapshot giornalieri dei saldi bancari;
- accesso al collegamento di una nuova banca;
- dettaglio di connessione con risorse, movimenti importati e pending;
- sincronizzazione manuale;
- rimozione di una connessione.

### 3.10 Money Coach — Implementato tecnicamente, da consolidare come prodotto

Il Coach è una chat in italiano con backend server-side. Supporta due provider selezionabili tramite configurazione:

- **Gemini** via `AI_PROVIDER=gemini`;
- **OpenAI Responses API** via `AI_PROVIDER=openai`.

Tool disponibili:

- `get_spending_summary`;
- `add_transaction`;
- `create_goal`;
- `update_goal`;
- `update_budget`.

Il Coach legge un riepilogo autenticato da Supabase per settimana, mese o anno. Le mutazioni non scrivono direttamente: restituiscono una proposta modificabile e una card di conferma. Solo dopo la conferma l'app richiama le normali operazioni del provider applicativo.

Da completare:

- memoria conversazionale controllata;
- limiti per piano e rate limiting;
- osservabilità, valutazioni e gestione costi;
- copertura più ampia degli intenti;
- guardrail finanziari e messaggi legali definitivi;
- notifiche e insight generati automaticamente.

### 3.11 Profilo, tema e privacy — Implementato/parziale

Il Profilo è raggiungibile dall'header e non occupa più una tab primaria. Comprende:

- email e piano corrente;
- tema sistema, chiaro o scuro;
- accesso a Budget;
- voce predisposta per gruppi e condivisione;
- toggle importi visibili;
- gestione account e logout.

La preferenza di visibilità degli importi è globale nell'app, salvata per utente e dispositivo in AsyncStorage. I gruppi sono ancora pianificati.

### 3.12 Notifiche — Parziale

Sono presenti schermata e modello dati per notifiche degli obiettivi, oltre alla generazione di messaggi quando un'entrata Open Banking viene allocata. Le push native e la pianificazione completa delle notifiche non sono ancora implementate.

### 3.13 Web app e sito pubblico — Parziale

La web app React/Vite contiene:

- landing page;
- pagine privacy e termini;
- dashboard tecnica;
- flusso di collegamento banca e callback;
- inspector e strumenti diagnostici sviluppati nelle fasi iniziali;
- pagina pubblica “coming soon” con identità Flownd e data di lancio indicativa del 1° ottobre 2026.

In locale le rotte operative sono abilitate. Nei deployment pubblici vengono bloccate e reindirizzate alla pagina coming soon, salvo `VITE_ENABLE_INTERNAL_ROUTES=true` in un ambiente privato.

La parità funzionale mobile/web non è ancora raggiunta.

---

## 4. Open Banking

### 4.1 Stato provider

**Enable Banking è il provider realmente integrato.** Tink e un eventuale terzo provider restano opzioni future e non devono essere descritti come già disponibili.

Il collegamento è riservato ai piani paganti tramite controllo server-side di `plan_tier`.

### 4.2 Flusso autorizzativo implementato

1. Il client recupera l'elenco ASPSP per paese.
2. L'utente seleziona la banca.
3. `/api/eb/auth` verifica sessione e entitlement.
4. Il backend genera una richiesta Enable Banking firmata JWT RS256.
5. Lo `state` viene salvato solo come hash in `open_banking_authorizations`.
6. L'utente completa il consenso sul sito della banca.
7. `/api/eb/callback` valida lo stato, crea la sessione bancaria e registra conti e connessione.
8. Il client avvia o visualizza la sincronizzazione protetta.

Le credenziali bancarie non transitano mai in Flownd; l'autenticazione avviene presso la banca/provider.

### 4.3 Pipeline di sincronizzazione implementata

La sincronizzazione:

- recupera in parallelo dettagli conto, saldi e transazioni;
- normalizza payload differenti tra istituti;
- seleziona il saldo migliore in base al tipo;
- salva o aggiorna `financial_accounts`;
- registra snapshot giornalieri del saldo;
- importa movimenti con chiavi stabili e fingerprint;
- riconcilia transazioni già importate;
- prova a collegare movimenti manuali equivalenti per evitare duplicati;
- distingue booked e pending;
- identifica possibili rimborsi e trasferimenti;
- riconosce trasferimenti interni tra conti dello stesso utente e li esclude dai totali;
- gestisce account non più disponibili senza invalidare necessariamente l'intera connessione;
- aggiorna stato, errore e prossima sincronizzazione della connessione.

### 4.4 Resilienza e compatibilità bancaria

Sono state introdotte correzioni specifiche per payload e comportamenti differenti:

- paginazione completa con `continuation_key`;
- strategia alternativa Enable Banking `longest`;
- fallback per finestre temporali, con suddivisione progressiva dei range;
- recupero dello storico precedente quando la prima risposta è parziale;
- tolleranza ai fallimenti parziali di dettagli, saldo o transazioni;
- retry per errori temporanei del provider;
- supporto ai payload verificati di ING, Casse Rurali/CRBZ e N26;
- gestione degli Spaces N26 e prevenzione di import duplicati o non pertinenti;
- disattivazione degli endpoint raw precedentemente usati per il debug, per proteggere i dati bancari.

### 4.5 Sincronizzazione automatica

Il modello attuale sostituisce il precedente cron notturno singolo:

- Vercel Cron invoca `/api/eb/auto-sync` ogni **15 minuti**;
- l'endpoint è protetto da `CRON_SECRET`;
- vengono selezionate solo connessioni abilitate e scadute da almeno **6 ore**;
- le connessioni vengono reclamate tramite RPC con lock temporaneo;
- l'elaborazione avviene in piccoli batch paralleli;
- il processo rispetta il limite temporale della funzione serverless;
- i batch successivi raccolgono progressivamente le connessioni rimanenti;
- in caso di errore il lock viene rilasciato e viene pianificato un nuovo tentativo;
- consensi scaduti e connessioni non valide vengono aggiornati.

La sincronizzazione manuale usa lo stesso sistema di claim per evitare esecuzioni concorrenti. Il cooldown UX definitivo deve ancora essere consolidato.

### 4.6 Evoluzione multi-provider — Pianificata

Il modello dati contiene già `provider` nelle connessioni, ma non esiste ancora un router multi-provider operativo. Prima di aggiungere Tink o altri provider occorre:

- introdurre un'interfaccia server-side comune per auth, accounts, balances e transactions;
- creare una tabella di routing per istituto, paese, priorità e success rate;
- spostare le normalizzazioni comuni fuori dal namespace Enable Banking;
- definire una strategia di migrazione/ricollegamento delle connessioni;
- misurare copertura e qualità reali, evitando claim non verificati.

---

## 5. Nuova architettura tecnica

### 5.1 Stack reale

| Layer | Tecnologia attuale | Stato/nota |
| --- | --- | --- |
| Mobile | React Native 0.86 + React 19 + Expo 57 + TypeScript 6 | Client principale |
| Routing mobile | Expo Router 57 | File-based routing, stack e modal |
| Tab mobile | Expo Router Native Tabs | 5 tab native: Dashboard, Timeline, Coach, Obiettivi, Patrimonio |
| UI mobile | Componenti React Native, Expo UI, Symbols, Reanimated | Specifica per piattaforma |
| Persistenza locale | AsyncStorage | Sessione Supabase e preferenze non finanziarie |
| Web | React 19 + Vite 8 + React Router 7 | Sito pubblico e strumenti interni |
| Backend | Vercel Serverless Functions in `/api` | Coach e Open Banking |
| Database/Auth | Supabase PostgreSQL + Auth + RLS + RPC/trigger | Fonte primaria dei dati |
| Open Banking | Enable Banking | Integrato; altri provider pianificati |
| AI Coach | Gemini oppure OpenAI Responses API | Chiavi esclusivamente server-side |
| Deploy web/API | Vercel | Build web, rewrite SPA, cron automatico |
| Test | Node test runner + ESLint/Expo lint | Copertura concentrata su Open Banking |
| Font | Baloo 2, IBM Plex Sans, IBM Plex Mono, Material Symbols | Caricati in Expo |

### 5.2 Monorepo reale

```text
flownd/
├── apps/
│   ├── mobile/
│   │   ├── src/app/                 # Route Expo Router e schermate
│   │   │   ├── (tabs)/              # Dashboard, Timeline, Coach, Obiettivi, Patrimonio
│   │   │   ├── onboarding.tsx
│   │   │   ├── add-transaction.tsx
│   │   │   ├── budget*.tsx
│   │   │   ├── goal*.tsx
│   │   │   ├── financing.tsx
│   │   │   ├── connect-bank.tsx
│   │   │   └── bank-connection.tsx
│   │   ├── src/components/          # Design system e componenti mobile
│   │   ├── src/lib/                 # Calcoli e adapter del client mobile
│   │   ├── src/providers/           # Stato applicativo e accesso Supabase
│   │   └── assets/
│   └── web/
│       ├── src/pages/                # Landing, coming soon, legal, strumenti interni
│       └── src/lib/                  # Adapter e strumenti web/Open Banking
├── api/
│   ├── coach.js                      # Endpoint AI autenticato
│   ├── local-server.mjs              # Runtime API locale
│   └── eb/                           # Enable Banking e sync
│       ├── _jwt.js
│       ├── _client.js
│       ├── _normalize.js
│       ├── _supabase.js
│       ├── _sync-schedule.js
│       ├── auth.js
│       ├── callback.js
│       ├── connections.js
│       ├── sync.js
│       └── auto-sync.js
├── packages/
│   ├── core/                         # Riservato alla logica condivisa
│   ├── api-client/                   # Riservato al client API tipizzato
│   └── config/                       # Riservato a token/config condivisi
├── supabase/migrations/              # Schema, RLS, RPC, trigger e indici
├── prompt/                           # Documentazione di prodotto e design
├── package.json                      # npm workspaces e script root
└── vercel.json                       # Build, rewrite, funzioni e cron
```

### 5.3 Modifica rispetto all'architettura iniziale

I package `core`, `api-client` e `config` esistono ma sono ancora placeholder. La logica condivisibile vive oggi soprattutto in `apps/mobile/src/lib` e nel provider mobile. Quindi:

- il monorepo è reale;
- la condivisione del backend e del database è reale;
- la condivisione di dominio tra mobile e web è ancora incompleta;
- non bisogna duplicare ulteriore logica nel web prima di estrarre contratti e calcoli nei package.

### 5.4 Architettura del client mobile

`AppProvider` è oggi il principale application service del mobile. Gestisce:

- sessione e profilo;
- hydration parallela dei dati Supabase;
- onboarding;
- transazioni e categorizzazione;
- budget e ciclo finanziario;
- obiettivi, contributi, notifiche e prestiti;
- conti finanziari, ricorrenze e insight;
- preferenza globale di privacy.

Questo ha accelerato l'MVP, ma il file è diventato un punto di concentrazione. La prossima evoluzione architetturale dovrebbe separare:

- `auth/session`;
- `transactions`;
- `budgets`;
- `goals`;
- `wealth/open-banking`;
- query/cache e orchestrazione dello stato.

L'estrazione deve essere incrementale, mantenendo un'unica API di dominio e senza duplicare fetch nelle schermate.

### 5.5 Backend e confini di sicurezza

Le funzioni serverless hanno due ruoli:

- **operazioni privilegiate e integrazioni esterne**: Open Banking, cron e chiavi private;
- **AI autenticata**: preparazione del contesto finanziario e chiamata al modello.

Le normali operazioni utente vengono eseguite dal client Supabase sotto RLS o tramite RPC `security invoker`. Le operazioni automatiche che richiedono privilegi usano la service role solo sul server.

### 5.6 Modello dati consolidato

Le aree principali dello schema sono:

| Area | Tabelle/campi principali |
| --- | --- |
| Profilo | `profiles`: onboarding, piano, modalità obiettivi, ciclo budget, rollover, reddito pianificato, fascia reddito |
| Budget | `budget_categories`: macro/sotto-categorie, limite, percentuale, gerarchia |
| Movimenti | `transactions`: tipo, importo, categoria, origine, conto, stato bancario, esclusioni budget/totali, trasferimento interno |
| Regole categoria | `transaction_category_rules` |
| Obiettivi | `goals`, `goal_contributions`, `goal_notifications` |
| Finanziamenti | `loans` |
| Patrimonio | `financial_accounts`, `financial_account_balance_snapshots` |
| Ricorrenze/insight | `recurring_payments`, `coach_insights` |
| Open Banking | `open_banking_authorizations`, `open_banking_connections`, `open_banking_accounts`, `open_banking_transaction_imports`, `open_banking_transaction_links` |

Tutte le tabelle utente hanno RLS e policy owner-based. Le entità bancarie proteggono anche le scritture, riservando le mutazioni sensibili al backend.

### 5.7 RPC e trigger principali

- `complete_flownd_onboarding_v2` — crea il modello iniziale e completa l'onboarding.
- `save_budget_allocations` — valida e salva reddito/percentuali.
- `categorize_transactions_bulk` — ricategorizza più movimenti e memorizza regole.
- trigger `apply_transaction_category_rule` — categorizzazione automatica persistente.
- `add_manual_goal_contribution` — aggiunge e distribuisce un versamento.
- `allocate_goal_pool` — waterfall/percentuali e risparmio libero.
- trigger su entrate Open Banking — allocazione automatica delle entrate idonee.
- `delete_goal` — soft delete, ripristino del ciclo corrente e riordino.
- `claim_open_banking_sync_batch` — claim atomico per cron.
- `claim_open_banking_connection_sync` — claim atomico per sync manuale.

---

## 6. Design system e navigazione

### 6.1 Identità visiva implementata

- **Baloo 2** per display e titoli principali.
- **IBM Plex Sans** per testo UI.
- **IBM Plex Mono** per importi e dati numerici.
- gradiente brand `#457FEF → #45D5B6` riservato a logo, splash e momenti speciali;
- palette chiara e scura con accento teal/blu;
- importi con cifre tabulari;
- componenti condivisi mobile per card, pulsanti, header, campi, progress bar, chip e loading state;
- splash e launch overlay animato;
- icone Material Symbols/Expo Symbols;
- supporto tema sistema, light e dark.

### 6.2 Navigazione corrente

Le tab principali sono:

1. Dashboard;
2. Timeline;
3. Coach;
4. Obiettivi;
5. Patrimonio.

Il Profilo è stato spostato fuori dalle tab ed è accessibile tramite azione nell'header. Budget, impostazioni, notifiche, dettagli obiettivo, finanziamenti e collegamento banca sono route stack o modal dedicate.

Questa è una modifica esplicita rispetto a `SCREENS-LOGICv2.md`, che descriveva Profilo come quinta tab.

### 6.3 Linee UX ancora valide

- dashboard con massimo 4–5 blocchi rilevanti;
- una CTA primaria per schermata;
- azioni AI sempre confermate;
- linguaggio non colpevolizzante;
- opzioni avanzate dietro impostazioni o dettaglio;
- rispetto di safe area, target touch e reduced motion;
- “linea di flusso” come elemento firma, da completare nelle celebrazioni e nei passaggi di denaro.

---

## 7. Privacy, sicurezza e affidabilità

### Misure già presenti

- chiave privata Enable Banking solo server-side;
- chiavi AI solo server-side;
- autenticazione Bearer per endpoint utente;
- service role mai inclusa nei bundle client;
- RLS sulle tabelle utente;
- controllo server-side del piano per Open Banking;
- `state` OAuth salvato come hash;
- validazione delle return URL;
- redazione dei payload bancari nei percorsi diagnostici;
- endpoint raw/session/balances/transactions legacy disabilitati con HTTP 410;
- deduplicazione e fingerprint dei movimenti;
- lock atomici per evitare sync concorrenti;
- `CRON_SECRET` per il cron Vercel;
- preferenza locale per nascondere tutti gli importi;
- AI senza scritture silenziose.

### Requisiti prima della produzione pubblica

- audit completo delle policy RLS e delle RPC `security definer`;
- retention policy per raw payload e log bancari;
- eliminazione o anonimizzazione dei fixture reali/sensibili prima di distribuire il repository;
- rate limiting per Coach e Open Banking;
- logging strutturato senza PII;
- monitoraggio errori e alert sul cron;
- gestione revoca consenso e cancellazione account/dati;
- documenti privacy/termini definitivi;
- DPIA e verifica GDPR per AI, Open Banking e advertising;
- backup, recovery e migrazioni testate in staging;
- secret rotation e separazione netta tra ambienti.

---

## 8. Variabili d'ambiente attuali

```bash
# Enable Banking — solo backend
ENABLE_BANKING_APP_ID=
ENABLE_BANKING_PRIVATE_KEY=
ENABLE_BANKING_REDIRECT_URL=
ENABLE_BANKING_CONSENT_DAYS=180

# Supabase mobile
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=

# Supabase web
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=

# Rotte operative web in deployment privato
VITE_ENABLE_INTERNAL_ROUTES=false

# Solo backend
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=

# Money Coach: Gemini
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_COACH_MODEL=

# Money Coach: alternativa OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_COACH_MODEL=
```

Regola: nessun segreto deve usare prefissi `EXPO_PUBLIC_` o `VITE_`.

---

## 9. Comandi di sviluppo e verifica

```bash
npm install
npm run dev:mobile
npm run dev:web
npm run dev:api
npm run build:web
npm run lint
npm run test:eb
```

Per il backend locale, `dev:api` carica `.env.local`. L'URL API mobile deve essere raggiungibile dal simulatore o dispositivo; su un dispositivo fisico può essere necessario un tunnel HTTPS.

La copertura automatica attuale verifica soprattutto:

- normalizzazione bancaria;
- scelta e retry delle richieste provider;
- paginazione e strategie di recupero;
- scheduling della sincronizzazione automatica.

Servono ancora test unitari per calcoli budget/obiettivi, test delle RPC in un database temporaneo e test end-to-end dei flussi principali.

---

## 10. Modifiche principali già effettuate

### Fondazioni

- conversione del repository in monorepo npm;
- separazione tra `apps/mobile`, `apps/web`, `api`, `packages` e `supabase`;
- introduzione di Expo/React Native per il client principale;
- introduzione della web app React/Vite;
- condivisione di Supabase e API tra client.

### Mobile e UX

- nuova identità visiva Flownd, font e temi light/dark;
- onboarding finanziario completo;
- navigazione nativa a cinque tab;
- Profilo spostato fuori dalla tab bar e Patrimonio promosso a tab;
- Dashboard a pagine con budget/patrimonio;
- donut interattivo e collegamento ai filtri Timeline;
- Timeline ricostruita con grafici, periodi, intervallo personalizzato, ricerca, filtri e bulk action;
- date picker per transazioni e obiettivi;
- privacy globale degli importi;
- schermate Budget, reddito, allocazione, sotto-budget e ciclo;
- motore Obiettivi, dettaglio, contributi, completamento, archivio ed eliminazione;
- finanziamenti e sostenibilità rata;
- schermata Patrimonio con conti e storico;
- collegamento e dettaglio banca;
- notifiche e schermate impostazioni;
- Money Coach conversazionale con card di conferma.

### Database

- schema iniziale profili/budget/obiettivi/transazioni;
- gerarchia budget e percentuali;
- ciclo finanziario personalizzato;
- classificazione entrate e inclusione budget;
- fonti Dashboard: conti, ricorrenze e insight;
- motore obiettivi con contributi, notifiche, prestiti e allocazione automatica;
- regole di categorizzazione persistenti;
- schema completo Open Banking e snapshot saldi;
- auto-sync con claim e lock;
- soft delete obiettivi e ripristino contributi del ciclo corrente.

### Open Banking

- autenticazione JWT RS256;
- flusso OAuth/consenso protetto;
- elenco banche, callback e persistenza connessioni;
- normalizzazione di conti, saldi e movimenti;
- sync manuale e automatico;
- deduplicazione e riconciliazione con transazioni manuali;
- internal transfer detection;
- gestione payload parziali, retry, paginazione e finestre temporali;
- compatibilità migliorata per N26 e più istituti italiani;
- cron a batch ogni 15 minuti con intervallo minimo di 6 ore;
- disattivazione degli inspector raw esposti via API.

### Web e deploy

- landing page e pagine legali;
- strumenti interni per il flusso bancario;
- pagina coming soon pubblica;
- feature flag per nascondere le rotte operative in produzione;
- configurazione Vercel per SPA, funzioni e cron;
- documentazione di configurazione `CRON_SECRET` e test locale Coach.

---

## 11. Roadmap aggiornata

### Fase A — Stabilizzazione MVP mobile

- [x] Monorepo e client mobile.
- [x] Supabase Auth e sessione persistente.
- [x] Onboarding finanziario.
- [x] Dashboard, Timeline, Budget, Obiettivi e Patrimonio.
- [x] Transazioni manuali e categorizzazione persistente.
- [x] Money Coach con conferma delle mutazioni.
- [ ] Test end-to-end su iOS e Android reali.
- [ ] Accessibilità completa e reduced motion.
- [ ] Error boundary, offline state e retry UX.
- [ ] Refactor del provider applicativo per dominio.
- [ ] Estrarre tipi e calcoli nei package condivisi.

### Fase B — Open Banking production-ready

- [x] Enable Banking e consenso PSD2.
- [x] Import, deduplicazione e riconciliazione.
- [x] Sync manuale e automatico a batch.
- [x] Storico e snapshot patrimoniali.
- [ ] Dashboard operativa di monitoraggio sync/provider.
- [ ] Staging con migrazioni e fixture sintetiche.
- [ ] Rate limiting, alert e logging strutturato.
- [ ] Validazione sistematica delle banche supportate.
- [ ] Secondo provider e router multi-provider solo dopo misurazione.

### Fase C — Monetizzazione

- [x] Campo `plan_tier` e gating server-side Open Banking.
- [ ] Stripe o acquisti in-app conformi alle regole degli store.
- [ ] Entitlement centralizzati e webhook.
- [ ] Paywall e gestione upgrade/downgrade.
- [ ] Limiti Free su storico, budget e Coach.
- [ ] Trial e gestione grace period.
- [ ] Advertising contestuale solo dopo revisione privacy.

### Fase D — AI e automazioni

- [x] Coach con Gemini/OpenAI e tool use.
- [x] Conferma obbligatoria delle mutazioni.
- [ ] Insight proattivi e notifiche intelligenti.
- [ ] Categorizzazione LLM come fallback controllato.
- [ ] Import CSV/PDF con preview e deduplicazione.
- [ ] Input vocale con precompilazione e conferma.
- [ ] Estrazione da screenshot/scontrino senza conservazione dell'immagine.
- [ ] Valutazioni automatiche di accuratezza e sicurezza.

### Fase E — Web app completa

- [x] Shell React/Vite e deployment.
- [x] Landing, legal, coming soon e rotte interne.
- [ ] Estrarre `core`, `api-client` e `config` reali.
- [ ] Autenticazione web sullo stesso progetto Supabase.
- [ ] Parità di Dashboard, Timeline, Budget, Obiettivi e Patrimonio.
- [ ] Gestione responsive e accessibilità browser.
- [ ] Sincronizzazione cross-platform e test conflitti.
- [ ] PWA e strategia cache/offline.

### Fase F — Famiglia, condivisione e crescita

- [ ] Gruppi e inviti.
- [ ] Livelli granulari di condivisione.
- [ ] Vista personale/gruppo.
- [ ] Obiettivi condivisi con contributi individuali.
- [ ] Split spese e saldi tra membri.
- [ ] Budget familiari.
- [ ] Report PDF mensile.
- [ ] Riconoscimento ricorrenze e abbonamenti.
- [ ] Push native, widget e biometria.
- [ ] Pubblicazione App Store e Google Play.

---

## 12. Feature pianificate: specifiche confermate

### 12.1 Import estratto conto con AI

Flusso previsto:

1. upload PDF/CSV in storage privato;
2. estrazione del testo;
3. parsing strutturato server-side;
4. preview obbligatoria;
5. correzione e deduplicazione;
6. import con source dedicata;
7. eliminazione del documento al termine.

Non deve essere promesso il supporto universale a “qualsiasi banca” senza suite di test e soglie di confidenza.

### 12.2 Voce e screenshot

Entrambi i flussi devono produrre una **bozza**, mai una transazione salvata direttamente. I campi incerti devono essere evidenziati. Immagini e audio non devono essere conservati oltre il tempo necessario all'elaborazione, salvo consenso esplicito e finalità definita.

### 12.3 Gruppi

Per l'MVP è confermato un gruppo per utente con livelli di condivisione:

- solo piano mensile;
- obiettivi selezionati;
- tutto.

La Dashboard dovrà offrire una vista personale e una vista gruppo esplicite. Gli obiettivi condivisi manterranno target aggregato ma contributi attribuiti al singolo membro. L'allocazione resterà individuale.

### 12.4 Report e ricorrenze

`recurring_payments` fornisce già una base dati, ma il riconoscimento automatico deve essere costruito su frequenza, tolleranza importo, descrizione normalizzata e confidenza. Il report PDF dovrà usare dati calcolati server-side e non includere informazioni bancarie non necessarie.

---

## 13. Metriche di successo

### Prodotto

- DAU/MAU > 30%;
- retention D30 > 40%;
- completamento onboarding > 70%;
- almeno una transazione o un conto collegato entro 24 ore;
- almeno un obiettivo creato entro la prima settimana.

### Monetizzazione

- conversione Free → pagante tra 5% e 8%;
- ARPU target iniziale 4 €/mese, da rivalutare dopo i costi provider/AI;
- churn mensile e utilizzo effettivo delle feature Pro come metriche primarie, non solo numero di trial.

### Open Banking

- successo del collegamento > 85% per banca dichiarata supportata;
- sync completati senza errore > 95%;
- duplicati importati < 0,1%;
- tempo medio di aggiornamento < 6 ore e 15 minuti per connessioni attive;
- percentuale di movimenti pending correttamente riconciliati;
- copertura storica reale misurata per istituto.

### Coach

- percentuale di risposte che usa dati corretti;
- percentuale di proposte accettate/modificate/annullate;
- tasso di azioni errate salvate dopo conferma;
- latenza, costo per conversazione e rate limit;
- risultati di eval su sicurezza, tono e non-allucinazione.

---

## 14. Decisioni aperte

Prima del rilascio vanno chiuse queste decisioni:

1. modalità di pagamento mobile: Stripe web, acquisti in-app o modello ibrido conforme agli store;
2. limiti esatti dei piani Free, Pro e Max;
3. provider AI primario e fallback di produzione;
4. policy di retention dei payload bancari;
5. secondo provider Open Banking e criteri quantitativi di adozione;
6. data di lancio pubblica effettiva;
7. strategia offline e conflitti;
8. struttura definitiva dei package condivisi;
9. supporto iniziale delle banche da dichiarare ufficialmente;
10. perimetro legale del Coach e disclaimer.

---

## 15. Sintesi

Flownd dispone già di un MVP mobile sostanziale, di un backend Open Banking funzionante e resiliente, di uno schema Supabase evoluto e di un Money Coach con tool use e conferma umana. La nuova architettura reale è un monorepo con client separati, API Vercel condivise e Supabase come fonte unica.

La priorità non è aggiungere indiscriminatamente nuove feature, ma consolidare ciò che esiste: test, sicurezza, osservabilità, refactor dei confini di dominio, monetizzazione e qualità del collegamento bancario. AI avanzata, parità web e gruppi vengono dopo questa stabilizzazione.
