# Profilo di deploy Vercel

La configurazione attiva è dichiarata in `deployment-profile.json` e verificata da
`npm run test:deployment`. Non modificare soltanto `vercel.json`: il test deve
continuare a descrivere la topologia realmente pubblicata.

## Hobby prima del lancio

Il progetto usa esattamente 12 funzioni pubbliche e un cron:

- il refresh autenticato delle ricorrenze è l'action
  `/api/transaction-tools?action=recurring-refresh`;
- manutenzione, materializzazione e backfill delle ricorrenze vengono eseguiti
  all'inizio del cron `/api/eb/auto-sync`, con un budget massimo di 45 secondi;
- tutta la logica resta isolata in `api/_recurring-payments.js`, quindi
  l'accorpamento riguarda soltanto gli entrypoint.

I punti temporaneamente accorpati sono marcati nel codice con
`HOBBY_CONSOLIDATION(pro-split:recurring-payments)`.

## Checklist obbligatoria per il passaggio a Pro

Prima del lancio, eseguire lo split in un'unica modifica:

1. Ricreare `api/recurring-payments.js` come entrypoint sottile:
   - `POST`: autenticare con `authenticateRequest` e chiamare
     `refreshDetectedRecurringPayments`;
   - `GET`: verificare `CRON_SECRET` e chiamare `runRecurringMaintenance` senza
     il limite di 45 secondi condiviso con il sync bancario.
2. Rimuovere l'action `recurring-refresh` e il relativo import da
   `api/transaction-tools.js`.
3. Rimuovere `runRecurringMaintenance` e il blocco marcato da
   `api/eb/auto-sync.js`.
4. Riportare il client mobile a `/api/recurring-payments` e registrare la stessa
   route in `api/_local-server.mjs`.
5. In `vercel.json`, aggiungere `api/recurring-payments.js` alle functions con
   `maxDuration: 300` e ripristinare il cron dedicato delle `06:17`.
6. Impostare `vercelPlan` a `pro`, svuotare `pendingProSplits` in
   `deployment-profile.json` ed eliminare entrambi i marker di consolidamento.
7. Eseguire `npm run test:deployment`, `npm run test:recurring`, la suite Open
   Banking e un deploy Preview prima della promozione in Production.

Il test del profilo Pro fallisce intenzionalmente se manca l'entrypoint dedicato,
il secondo cron o se rimane un accorpamento Hobby: questa è la memoria
eseguibile del lavoro da completare prima del lancio.
