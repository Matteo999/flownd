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

## Test locale del Money Coach su mobile

Il modello AI viene chiamato soltanto dalla funzione backend `api/coach.js`: non
inserire mai una chiave AI in una variabile `EXPO_PUBLIC_*`.

1. Crea `.env.local` dalla struttura di `.env.example` e imposta
   `AI_PROVIDER=gemini`, `GEMINI_API_KEY` e `GEMINI_COACH_MODEL=gemini-3.6-flash`.
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
