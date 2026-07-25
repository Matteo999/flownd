# Flownd — Documento di Progetto

*Versione 0.4 — Luglio 2026*

---

## 1\. Visione del prodotto

**Flownd** è un prodotto multipiattaforma per la gestione finanziaria personale e familiare. La prima versione viene sviluppata come applicazione mobile nativa per iOS e Android con **React Native + Expo**. In una fase successiva verrà integrata una **web app separata**, sviluppata con React + Vite.

Le applicazioni mobile e web sono due client dello stesso prodotto: usano lo stesso backend, la stessa autenticazione Supabase e lo stesso database. Un utente accede con il medesimo account e ritrova transazioni, budget, obiettivi, gruppi, abbonamento e preferenze sincronizzati su entrambe le piattaforme. Nessun dato finanziario è salvato come fonte primaria nel solo dispositivo o nel browser; eventuali cache locali servono esclusivamente per prestazioni e supporto offline.

Il problema che risolve: la maggior parte delle persone non sa con precisione dove vanno i propri soldi ogni mese. Le app bancarie mostrano i movimenti ma non li interpretano. I fogli Excel sono tediosi. Flownd si posiziona nel mezzo: connessione automatica alla banca dove possibile, inserimento manuale o via AI dove non lo è, con una UX pensata per essere usata ogni giorno in 30 secondi.

**Target primario:** 25–45 anni, Italia, uno o due redditi, con l'esigenza di tenere traccia delle spese familiari o di coppia.

---

## 2\. Modello di business

### Livelli di accesso

| Feature | Free | Pro (4,99€/mese) | Max (9,99€/mese) |
| --- | --- | --- | --- |
| Inserimento manuale spese | ✅ | ✅ | ✅ |
| Categorizzazione automatica (keyword) | ✅ | ✅ | ✅ |
| Budget mensile per categoria | ✅ (2 cat.) | ✅ illimitati | ✅ illimitati |
| Dashboard e grafici mese corrente | ✅ | ✅ | ✅ |
| Storico dati | 2 mesi | Illimitato | Illimitato |
| Export CSV | ✅ | ✅ | ✅ |
| **Pubblicità** | ✅ | ❌ | ❌ |
| Gruppo persone | ❌ | 2 | 10 (profili separati) |
| Collegamento conto corrente (Open Banking) | ❌ | ✅ | ✅ |
| Sync automatico transazioni | ❌ | ✅ | ✅ |
| Import estratto conto (AI) | ❌ | ✅ | ✅ |
| Aggiunta spesa con voce (AI) | ❌ | ✅ | ✅ |
| Aggiunta spesa da screenshot (AI) | ❌ | ✅ | ✅ |
| Categorizzazione AI (LLM) | ❌ | ✅ | ✅ |
| Obiettivi di risparmio con proiezioni | Base | ✅ avanzati | ✅ avanzati |
| Alert intelligenti | ❌ | ✅ | ✅ |
| Split spese condivise | ❌ | ✅ | ✅ |
| Report mensile PDF | ❌ | ✅ | ✅ |
| Riconoscimento abbonamenti ricorrenti | ❌ | ✅ | ✅ |

### Introito pubblicitario (piano Free)

Gli utenti del piano Free visualizzano annunci contestuali in posizioni non invasive: banner nella dashboard (sotto il riepilogo mensile) e tra le sezioni nella pagina di analisi. Mai all'interno della lista transazioni, mai su schermate che mostrano dati bancari sensibili (saldo, IBAN).

Provider pubblicitari da valutare in ordine di integrazione:

**Google AdSense** — integrazione più semplice, rete più ampia, richiede sito con dominio verificato e contenuto sufficiente. Adatto alla fase iniziale.

**Setupad / Mediavine** — network premium per publisher europei, CPM più elevato di AdSense, ma richiedono un minimo di traffico mensile (50K–100K sessioni). Obiettivo post-crescita.

Considerazione GDPR critica: l'app tratta dati finanziari sensibili. Il consenso alla pubblicità basata su interessi deve essere separato e opt-in esplicito, non opt-out. In pratica: mostrare solo annunci contestuali non personalizzati (non basati su profilo) finché l'utente non dà consenso esplicito. AdSense supporta questa modalità con `non_personalized_ads: true`.

---

## 3\. Funzionalità principali

### 3.1 Tracciamento spese

**Inserimento manuale** — Form rapido con importo, descrizione, data e categoria. Ottimizzato per inserimento in meno di 5 secondi. Disponibile su tutti i piani.

**Categorizzazione automatica** — Sistema a due livelli: keyword matching locale (veloce, gratuito, zero latenza) come prima passata; categorizzazione LLM (Claude API / GPT-4o-mini) come secondo livello per le transazioni che il matching non risolve. Il secondo livello è solo per utenti premium.

Categorie predefinite: Cibo & Ristoranti, Trasporti, Shopping, Bollette & Abbonamenti, Salute, Svago & Cultura, Casa, Viaggi, Regali, Istruzione, Altro.

**Modifica e correzione categoria** — L'utente può sempre sovrascrivere la categoria suggerita. Le correzioni vengono memorizzate per migliorare il matching futuro su quella specifica descrizione.

### 3.2 Budget e risparmio

**Budget per categoria** — L'utente imposta un limite mensile per categoria. La dashboard mostra una barra di avanzamento per ognuno. Alert automatico all'80% e al 100% del budget.

**Obiettivi di risparmio** — L'utente crea un obiettivo con nome, importo target e data scadenza ("Vacanza Giappone: 2.000€ entro marzo 2027"). L'app calcola il risparmio mensile necessario e monitora i progressi. Gli utenti premium ricevono proiezioni dinamiche basate sulle spese reali degli ultimi 3 mesi.

**Proiezione fine mese** — Basandosi sulle spese dei primi N giorni, l'app proietta il totale a fine mese per categoria e segnala quelle a rischio superamento.

**Riconoscimento abbonamenti ricorrenti** (premium) — L'app identifica automaticamente le transazioni ricorrenti (Netflix, Spotify, palestra, utenze) e le raccoglie in una sezione dedicata con il costo mensile aggregato. Utile per scoprire abbonamenti dimenticati.

### 3.3 Funzionalità AI premium

#### Import estratto conto con AI

L'utente carica il PDF o CSV dell'estratto conto scaricato dall'home banking della propria banca. L'AI estrae e struttura automaticamente tutte le transazioni, le categorizza e le importa in Flownd.

Funziona per qualsiasi banca, indipendentemente dal formato del file — il modello LLM è abbastanza flessibile da interpretare formati diversi senza regole hard-coded. È la soluzione universale per banche non supportate dall'Open Banking.

```
Flusso tecnico:
1. Upload PDF/CSV → storage Supabase (bucket privato, solo owner)
2. Estrazione testo → PDF.js (client-side) o pdftotext (serverless)
3. Prompt LLM con testo estratto → JSON strutturato [{ date, description, amount, category }]
4. Preview all'utente con possibilità di correzione prima dell'import
5. Upsert su tabella transactions con flag source: 'csv_import'
6. Eliminazione file dallo storage dopo l'import (non conserviamo documenti bancari)
```

Prompt di riferimento per l'estrazione:

> "Sei un parser di estratti conto bancari italiani. Estrai tutte le transazioni dal testo seguente e restituisci SOLO un array JSON con campi: date (YYYY-MM-DD), description (stringa), amount (numero, negativo per uscite, positivo per entrate), category (una tra: food, transport, shopping, utilities, health, entertainment, home, travel, other). Non aggiungere testo fuori dal JSON."

#### Aggiunta spesa con controllo vocale

L'utente preme un pulsante microfono e dice ad esempio: "Ho speso venti euro al supermercato ieri" oppure "Aggiungi 45 euro per la cena di sabato sera al ristorante da Mario". L'AI interpreta l'input e pre-compila il form di inserimento spesa. L'utente conferma con un tap.

```
Flusso tecnico:
1. API speech-to-text compatibile con Expo/React Native sul mobile; Web Speech API come implementazione specifica della futura web app
2. Testo → Claude API con prompt di estrazione:
   → { amount, description, date, category, confidence }
3. Pre-compilazione form con i dati estratti
4. Conferma utente → salvataggio
```

Fallback: se la trascrizione è ambigua o il modello non è sicuro (confidence < 0.7), il form viene aperto pre-compilato con i campi incerti evidenziati per correzione manuale.

#### Aggiunta spesa da screenshot

L'utente fa uno screenshot dell'app di home banking (o di un'email di conferma pagamento, o di uno scontrino digitale) e lo carica in Flownd. L'AI estrae importo, data, descrizione e categoria.

```
Flusso tecnico:
1. Upload immagine → compressione client-side (max 1MB prima dell'invio)
2. Immagine base64 → Claude Vision API (claude-3-5-sonnet) o GPT-4o
3. Prompt: "Estrai la transazione finanziaria da questa immagine. 
   Restituisci JSON: { amount, description, date, category }.
   Se non è una transazione finanziaria, restituisci { error: 'not_a_transaction' }."
4. Pre-compilazione form → conferma utente → salvataggio
5. Immagine NON conservata dopo l'estrazione (privacy)
```

Casi d'uso supportati: screenshot notifiche bancarie, email di conferma pagamento PayPal/Amazon, foto scontrini fisici, screenshot home banking.

### 3.4 Gruppo famiglia / coinquilini

Gli utenti possono creare un gruppo e invitare altri membri via email. Ogni membro vede le spese condivise del gruppo oltre alle proprie spese personali.

**Split spese** (premium) — Funzionalità tipo Splitwise integrata: si registra una spesa condivisa, si indicano i partecipanti, l'app calcola i saldi ("Marco deve 18€ a Giulia"). I saldi vengono aggiornati in tempo reale tramite Supabase Realtime.

**Piano Famiglia** — Dashboard separata per le spese familiari vs personali. Budget familiari con contributi per membro. Profili figli in sola lettura.

---

## 4\. Collegamento Open Banking

### Strategia multi-provider

Nessun provider singolo copre tutte le banche italiane con qualità sufficiente. Flownd adotta un layer di astrazione interno che seleziona automaticamente il provider migliore per ogni istituto, basandosi su una tabella di routing aggiornata continuamente.

**Provider integrati:**

**Enable Banking** — Primo provider integrato. Autenticazione JWT RS256 con chiave privata RSA. Buona copertura EU, gratuito nelle fasi iniziali. Confermato funzionante per: ING Italia, Cassa Rurale di Trento e altre banche maggiori italiane.

**Tink (Visa)** — Secondo provider, attivato come fallback per banche non coperte da Enable Banking. Confermato funzionante per: Cassa di Risparmio di Bolzano / Sparkasse. Copertura 3.400+ istituzioni EU. Pricing enterprise, da integrare quando il volume di utenti premium lo giustifica.

**Tabella di routing (Supabase):**

```sql
create table bank_provider_routing (
  bank_bic        text,
  bank_name       text,
  country         text default 'IT',
  provider        text,           -- 'enablebanking' | 'tink' | 'salt_edge'
  priority        integer,        -- 1 = primo tentativo, 2 = fallback, ecc.
  success_rate    numeric(5,2),   -- % connessioni andate a buon fine
  avg_days_history integer,       -- giorni medi di storico restituiti
  last_tested     timestamptz,
  notes           text,
  primary key (bank_bic, provider)
);
```

Stato attuale routing (da aggiornare continuamente):

| Banca | Provider primario | Fallback | Note |
| --- | --- | --- | --- |
| ING Italia | Enable Banking | Tink | ✅ verificato |
| Cassa Rurale di Trento | Enable Banking | Tink | ✅ verificato |
| Cassa di Risparmio di Bolzano | Tink | Salt Edge | ✅ verificato con Tink |
| Cassa Rurale di Alta Vallagarina | — | — | ⚠️ nessun provider verificato |
| Intesa Sanpaolo | Enable Banking | Tink | da verificare |
| UniCredit | Enable Banking | Tink | da verificare |
| Fineco | Enable Banking | Tink | da verificare |
| Revolut | Enable Banking | — | da verificare |

### Modello di sync transazioni

Le banche PSD2 forniscono 30–90 giorni di storico e non supportano push notification. Il modello adottato è **accumulo progressivo su Supabase**:

-   Primo collegamento: importa tutto lo storico disponibile (30-90gg a seconda della banca)
-   Sync automatico silenzioso: ogni apertura dell'app se l'ultimo sync è > 6 ore
-   Sync notturno schedulato: Supabase Edge Function cron alle 02:00 per tutti gli utenti attivi
-   Refresh manuale: bottone nella UI, con cooldown di 30 minuti per rispettare i rate limit

Con il tempo l'utente accumula uno storico che supera quello disponibile via API, rendendo Flownd progressivamente più utile.  
Nella versione Base sono disponibili solo 2 mesi di storico. Nelle versioni Pro, se l'Open Banking è limitato a solo 30 giorni, l'utente può importare l'estratto conto per avere subito uno storico più ampio.  

**Schema Supabase — tabelle principali:**

```sql
-- Transazioni (nucleo del prodotto)
create table transactions (
  id              text,
  user_id         uuid references auth.users,
  account_uid     text,
  group_id        uuid references groups(id),
  date            date,
  description     text,
  amount          numeric(12,2),
  currency        text default 'EUR',
  category        text,
  category_source text,  -- 'keyword' | 'ai' | 'manual' | 'import'
  is_shared       boolean default false,
  source          text,  -- 'open_banking' | 'manual' | 'csv_import' | 'voice' | 'screenshot'
  created_at      timestamptz default now(),
  primary key (user_id, account_uid, id)
);

-- Budget per categoria
create table budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users,
  group_id    uuid references groups(id),
  category    text,
  amount      numeric(12,2),
  period      text default 'monthly',
  created_at  timestamptz default now()
);

-- Obiettivi di risparmio
create table savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users,
  name          text,
  target_amount numeric(12,2),
  current_amount numeric(12,2) default 0,
  deadline      date,
  created_at    timestamptz default now()
);

-- Log sincronizzazioni bancarie
create table sync_log (
  user_id       uuid references auth.users,
  account_uid   text,
  provider      text,
  last_sync     timestamptz,
  first_sync    timestamptz,
  primary key (user_id, account_uid)
);

-- Gruppi famiglia/coinquilini
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  owner_id    uuid references auth.users,
  plan        text default 'premium',
  created_at  timestamptz default now()
);

create table group_members (
  group_id  uuid references groups(id),
  user_id   uuid references auth.users,
  role      text default 'member',  -- 'owner' | 'member' | 'readonly'
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);
```

---

## 5\. Architettura tecnica

### Stack

| Layer | Tecnologia | Motivazione |
| --- | --- | --- |
| App mobile (prima fase) | React Native + Expo + TypeScript | Un solo codebase nativo per iOS e Android |
| Routing mobile | Expo Router | Routing file-based e deep linking |
| App web (fase successiva) | React + Vite | Client web separato, veloce da sviluppare e distribuire |
| Routing web | React Router | Routing dedicato al browser |
| UI | Componenti specifici per piattaforma + design token condivisi | UX nativa senza forzare la condivisione della UI |
| Logica condivisa | Package TypeScript indipendenti dalla piattaforma | Tipi, validazione, calcoli e client API riusabili |
| Database | Supabase (PostgreSQL) | Auth + DB + Realtime + Storage + Edge Functions in uno |
| Backend API condiviso | Supabase Edge Functions e/o Vercel Serverless Functions (`/api/*`) | Un solo backend consumato da mobile e web |
| Open Banking | Enable Banking + Tink | Multi-provider per copertura massima |
| AI Features | Claude API (claude-sonnet-4-5) | Categorizzazione, voice, screenshot, CSV |
| Speech-to-text | Web Speech API | Browser-native, gratuita |
| Grafici | Chart.js | Leggero, mobile-friendly |
| Pagamenti | Stripe | Standard per abbonamenti SaaS |
| Pubblicità | Google AdSense | Integrazione immediata, rete ampia |
| Linter | ESLint | Ecosistema maturo per React |

### Struttura cartelle

Il repository è organizzato come monorepo. `apps/mobile` e `apps/web` sono progetti distinti e distribuibili indipendentemente; non sono due copie della stessa app. Il backend e i package di dominio sono condivisi.

```
flownd/
├── apps/
│   ├── mobile/              # React Native + Expo (iOS e Android)
│   │   ├── app/             # Route e layout Expo Router
│   │   ├── src/
│   │   │   ├── components/  # UI nativa
│   │   │   ├── features/    # Transazioni, budget, obiettivi, gruppi
│   │   │   ├── hooks/
│   │   │   └── lib/         # Adapter mobile: storage, notifiche, biometria
│   │   ├── assets/
│   │   ├── app.json
│   │   └── package.json
│   └── web/                 # React + Vite (fase successiva)
│       ├── src/
│       │   ├── components/  # UI web
│       │   ├── pages/
│       │   ├── hooks/
│       │   └── lib/         # Adapter browser
│       ├── public/
│       ├── index.html
│       ├── vite.config.js
│       └── package.json
├── packages/
│   ├── core/                # Tipi, regole di dominio, calcoli, validazione
│   ├── api-client/          # Client tipizzato per il backend condiviso
│   └── config/              # Configurazioni e design token condivisi
├── api/
│   ├── eb/                  # Enable Banking serverless, usato da mobile e web
│   │   ├── _jwt.js
│   │   ├── banks.js
│   │   ├── auth.js
│   │   ├── session.js
│   │   ├── balances.js
│   │   ├── transactions.js
│   │   └── sync.js
│   ├── tink/                # Tink serverless (da integrare)
│   ├── ai/
│   │   ├── categorize.js    # Categorizzazione LLM
│   │   ├── voice.js         # Parsing input vocale
│   │   ├── screenshot.js    # Estrazione dati da immagine
│   │   └── csv-import.js    # Parsing estratto conto PDF/CSV
│   └── stripe/
│       ├── webhook.js       # Gestione eventi Stripe
│       └── portal.js        # Customer portal
├── supabase/
│   ├── migrations/          # Schema SQL versionato
│   └── functions/
│       └── nightly-sync/    # Cron Edge Function (02:00)
├── package.json             # Workspace e comandi dell'intero monorepo
└── .env.local               # Non su Git
```

### Principi di condivisione

-   **Da condividere:** tipi TypeScript, schema e client Supabase, validazione, calcoli finanziari, categorizzazione keyword, client API e design token.
-   **Da mantenere separato:** componenti UI, navigazione, storage locale, notifiche, biometria, upload file e integrazioni specifiche del browser.
-   **Backend come fonte unica:** tutte le scritture persistenti confluiscono nello stesso progetto Supabase e sono protette da RLS basata su `auth.uid()`.
-   **Identità unica:** mobile e web usano lo stesso progetto Supabase Auth; una sessione non è condivisa fisicamente tra dispositivi, ma identifica lo stesso `user_id`.
-   **Contratto stabile:** mobile e web chiamano le stesse API versionate; chiavi bancarie, AI e Stripe rimangono esclusivamente server-side.

### Variabili d'ambiente

```bash
# Supabase — valori pubblici, con prefissi diversi per ciascun bundler
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # solo serverless, mai lato client

# Backend condiviso
EXPO_PUBLIC_API_URL=             # URL assoluto usato dall'app mobile
VITE_API_URL=                    # URL web; può essere relativo in produzione

# Enable Banking
ENABLE_BANKING_APP_ID=
ENABLE_BANKING_PRIVATE_KEY=

# Tink
TINK_CLIENT_ID=
TINK_CLIENT_SECRET=

# AI
ANTHROPIC_API_KEY=               # mai lato client
OPENAI_API_KEY=
# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
VITE_STRIPE_PUBLISHABLE_KEY=

# AdSense
VITE_ADSENSE_CLIENT_ID=          # lato client, non sensibile
```

---

## 6\. Privacy e sicurezza

-   Le chiavi API bancarie (Enable Banking, Tink) non escono mai dal serverless — mai nel bundle React
-   Le immagini di screenshot vengono elaborate e immediatamente eliminate, non conservate
-   I file PDF di estratto conto vengono eliminati dallo storage Supabase dopo l'import
-   Row Level Security (RLS) attivo su tutte le tabelle Supabase: ogni utente accede solo ai propri dati
-   Il consenso pubblicitario è opt-in esplicito, separato dal consenso ai termini di servizio (GDPR Art. 7)
-   Le credenziali bancarie dell'utente non vengono mai richieste né conservate (OAuth PSD2)
-   Nessun dato finanziario viene usato per addestrare modelli AI — le chiamate all'API Claude sono stateless

---

## 7\. Roadmap

### Fase 1 — Fondazioni e MVP mobile (mese 1–2)

-   [ ]  Setup monorepo e app mobile (React Native + Expo + TypeScript)
-   [ ]  Autenticazione utente (Supabase Auth, email + Google)
-   [ ]  Inserimento manuale transazioni
-   [ ]  Categorizzazione keyword matching
-   [ ]  Dashboard base (saldo, grafici mese, ultime transazioni)
-   [ ]  Budget per categoria con alert
-   [ ]  Import CSV semplice
-   [ ]  Persistenza e sincronizzazione tramite backend condiviso

### Fase 2 — Open Banking (mese 2–3)

-   [ ]  Integrazione Enable Banking (serverless JWT + flusso OAuth)
-   [ ]  Routing multi-provider (Enable Banking + Salt Edge)
-   [ ]  Sync automatico + refresh manuale con cooldown
-   [ ]  Accumulazione storico su Supabase
-   [ ]  Integrazione Stripe (piani Premium e Famiglia)
-   [ ]  Paywall per features premium

### Fase 3 — AI Features (mese 3–4)

-   [ ]  Categorizzazione LLM (Claude API) per utenti premium
-   [ ]  Import estratto conto con AI (PDF/CSV → strutturato)
-   [ ]  Aggiunta spesa con voce (Web Speech API + Claude)
-   [ ]  Aggiunta spesa da screenshot (Claude Vision)
-   [ ]  Integrazione Tink come secondo provider bancario

### Fase 4 — Web app e parità dei dati (mese 4–5)

-   [ ]  Sviluppo della web app separata con React + Vite
-   [ ]  Login web sullo stesso progetto Supabase Auth
-   [ ]  Integrazione degli stessi endpoint e dati usati dal mobile
-   [ ]  Verifica della sincronizzazione cross-platform e gestione dei conflitti
-   [ ]  Adattamento delle funzionalità native alle API del browser
-   [ ]  Integrazione AdSense per il piano Free sul web

### Fase 5 — Social & Growth (mese 5–7)

-   [ ]  Gruppi famiglia/coinquilini
-   [ ]  Split spese condivise
-   [ ]  Obiettivi risparmio con proiezioni
-   [ ]  Report mensile PDF
-   [ ]  Riconoscimento abbonamenti ricorrenti
-   [ ]  Alert intelligenti ("trend anomalo in questa categoria")
-   [ ]  PWA manifest per la web app
-   [ ]  Widget iOS/Android con saldo
-   [ ]  Notifiche push native
-   [ ]  Face ID / Touch ID
-   [ ]  Pubblicazione App Store e Google Play

---

## 8\. Metriche di successo

**Engagement:** DAU/MAU ratio > 30% (indica utilizzo frequente, non solo fine mese)

**Retention:** Retention a 30 giorni > 40% (benchmark fintech consumer)

**Conversione free → premium:** Obiettivo 5–8% degli utenti attivi nel primo anno

**ARPU (Average Revenue Per User):** Target 4€/mese considerando mix free/premium/famiglia

**Qualità bancaria:** Success rate collegamento bancario > 85% per le banche supportate — monitorato nella tabella `bank_provider_routing`
