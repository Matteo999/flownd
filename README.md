# Flownd

Flownd è organizzato come monorepo npm con due client indipendenti e un unico backend.

## Struttura

- `apps/mobile`: app iOS e Android in React Native + Expo
- `apps/web`: web app React + Vite
- `packages/core`: tipi e logica di dominio indipendenti dalla piattaforma
- `packages/api-client`: client del backend condiviso
- `packages/config`: configurazione e design token condivisi
- `api`: funzioni serverless condivise da mobile e web
- `supabase`: migrazioni ed Edge Functions condivise

Mobile e web devono usare lo stesso progetto Supabase, lo stesso schema e gli stessi endpoint. La UI e le integrazioni specifiche della piattaforma rimangono nelle rispettive app.

## Comandi

```bash
npm install
npm run dev:mobile
npm run dev:web
npm run build:web
npm run lint
```

## Sito pubblico in attesa del lancio

Il deployment pubblico della web app espone esclusivamente la pagina “coming soon”,
con lancio fissato al 1° ottobre 2026. Tutte le rotte dell’interfaccia operativa
reindirizzano a quella pagina. In sviluppo locale restano disponibili automaticamente;
per abilitarle in un deployment privato, imposta `VITE_ENABLE_INTERNAL_ROUTES=true`.
Le funzioni serverless sotto `/api/eb/*` restano invariate per il flusso Enable Banking.

## Sincronizzazione bancaria automatica

Il cron di produzione controlla ogni 15 minuti le connessioni bancarie e avvia
solo quelle la cui ultima sincronizzazione risale ad almeno 6 ore prima. In
Vercel configura `CRON_SECRET` per l'ambiente Production usando una stringa
casuale, per esempio generata con `openssl rand -hex 32`. Inserisci soltanto il
valore prodotto, senza il prefisso `Bearer`: Vercel aggiunge automaticamente
l'header di autorizzazione alle richieste del cron. Dopo aver modificato la
variabile esegui un nuovo deployment perché la configurazione diventi attiva.

## Test locale del Money Coach su mobile

Il modello AI viene chiamato soltanto dalla funzione backend `api/coach.js`: non
inserire mai una chiave AI in una variabile `EXPO_PUBLIC_*`.

1. Crea `.env.local` dalla struttura di `.env.example` e imposta
   `AI_PROVIDER=gemini`, `GEMINI_API_KEY` e il modello desiderato, per esempio
   `GEMINI_COACH_MODEL=gemini-3.6-flash`.
2. Avvia il backend locale con `npm run dev:api`.
3. Imposta `EXPO_PUBLIC_API_URL` in `.env.local` sull'URL raggiungibile dal
   dispositivo: `http://localhost:3000` per il simulatore iOS, oppure
   `http://10.0.2.2:3000` per Android Emulator. Per un telefono fisico usa un
   tunnel HTTPS temporaneo verso la porta 3000: iOS e Android possono bloccare
   le richieste HTTP in chiaro verso l'IP LAN del Mac.
4. Riavvia `npm run dev:mobile` dopo ogni modifica a una variabile `EXPO_PUBLIC_*`.

Il telefono e il Mac devono essere sulla stessa rete. La chiave `GEMINI_API_KEY`
resta caricata solo dal processo locale di Vercel e non viene inclusa nel bundle Expo.

Per le decisioni architetturali e la roadmap consulta `prompt/flownd-project.md`.

## IA in produzione su Vercel

Le funzioni IA pubblicate non richiedono il server locale. In **Settings →
Environment Variables** del progetto Vercel configura per l'ambiente
**Production**:

- `AI_PROVIDER=gemini` e `GEMINI_API_KEY`, oppure `AI_PROVIDER=openai` e
  `OPENAI_API_KEY`;
- `GEMINI_COACH_MODEL`/`OPENAI_COACH_MODEL` e, facoltativamente, i modelli
  specifici `*_IMPORT_MODEL` e `*_VISION_MODEL`;
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (necessaria
  per verificare il piano Pro/Max durante la scansione di immagini).

Dopo aver aggiunto o modificato le variabili avvia un nuovo deployment. I file
`.env.local` restano esclusivamente locali e non vengono copiati su Vercel.

Gemini 3.6 e 3.7 possono essere usati contemporaneamente assegnandoli a funzioni
diverse, ad esempio `GEMINI_COACH_MODEL=gemini-3.6-flash` e
`GEMINI_IMPORT_MODEL=gemini-3.7-flash`. Il backend adatta automaticamente il
payload strutturato alla versione scelta e non passa a un secondo modello in
automatico, evitando chiamate aggiuntive fatturate.

Gli import di file vengono accodati in `transaction_import_jobs`: l’API risponde
appena il job è salvato, l’elaborazione prosegue sul server e il risultato viene
aperto dalla notifica “Importazione pronta”. Il contenuto temporaneo del file
viene cancellato dalla tabella al termine dell’elaborazione.

Il riconoscimento file ha un timeout predefinito di quattro minuti, configurabile
con `AI_IMPORT_TIMEOUT_MS` tra 30 e 270 secondi. La funzione Vercel
`api/transaction-tools.js` ha una durata massima di 300 secondi, lasciando tempo
per registrare il risultato e generare la notifica anche dopo una risposta lenta
del provider.
