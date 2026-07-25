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

Per le decisioni architetturali e la roadmap consulta `prompt/flownd-project.md`.
