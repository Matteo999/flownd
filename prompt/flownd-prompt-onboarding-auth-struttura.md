# Prompt per — Onboarding, autenticazione e struttura base di Flownd

Implementa onboarding, autenticazione e struttura di navigazione base dell'app Flownd (money coach mobile-first). Segui esattamente la sequenza e i vincoli sotto — sono progettati per applicare principi di UX psicologica (Goal Gradient Effect, IKEA Effect, Smart Defaults) validati per app fintech consumer.

## Stack di riferimento

-   Per la versione mobile, React-Native + Expo
-   Supabase (Auth, Database, Edge Functions). In .env.local si trovano le chiavi EXPO per collegarsi a supabase. Da Supabase viene suggerito di creare utils/supabase.ts con il seguente contenuto:
~~~
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
~~~
-   Routing client-side con stato di sessione persistente

## 1\. Onboarding (pre-registrazione)

Sequenza fissa di 6 step, in quest'ordine. Nessuno step va saltato o riordinato: l'ordine è funzionale (personalizzazione prima della richiesta di dati personali).

1.  **Benvenuto** — una sola schermata con value proposition, nessun form. CTA singola "Inizia".
2.  **Personalizza budget** — l'utente sceglie 2-3 categorie di spesa da una lista precompilata con valori Smart Default (proponi importi tipici per categoria, non campi vuoti). L'utente può modificare i valori proposti ma parte sempre da un default sensato.
3.  **Primo obiettivo di risparmio** — form con nome, importo target, scadenza opzionale. Precompila un esempio modificabile (es. "Fondo emergenza — 500€") per abbassare la frizione, ma permetti totale personalizzazione.
4.  **Prima spesa** — l'utente inserisce una spesa reale (importo + descrizione). Categorizzala automaticamente in base al testo (matching semplice su keyword, nessuna chiamata AI necessaria in questo step) e mostra il risultato come conferma, non come domanda.
5.  **Registrazione** — mostra un indicatore di progresso che parte da un valore alto (80%), non da 0%, conteggiando gli step 2-4 come già completati. Frame esplicito: "il tuo profilo è pronto all'80% — ultimo passo". Qui si passa alla sezione 2 (autenticazione).
6.  **Conferma e ingresso in dashboard** — dopo l'autenticazione, riepiloga cosa l'utente ha appena creato (budget, obiettivo, prima spesa) prima di mostrare la dashboard vera e propria. Vedi sezione 3.1 per il contenuto.

**Persistenza dati pre-auth**: i dati inseriti negli step 2-4 vanno tenuti in stato locale (non in Supabase) fino al completamento della registrazione, poi salvati sul nuovo account in un'unica operazione post-signup. Se l'utente abbandona prima di registrarsi, i dati si perdono — è previsto, fa parte della leva psicologica.

---

## 2\. Autenticazione

Implementa **Supabase Auth** con questi metodi, in quest'ordine di priorità visiva nella UI:

1.  **Social login** — Google e Apple Sign-In come opzioni primarie (bottoni in evidenza, un tap).
2.  **Magic link** — campo email con invio di link di accesso via email, come alternativa sotto ai bottoni social. Nessuna password da creare o ricordare.

**Requisiti UI:**

-   Non mostrare mai un form con campo password: né social login né magic link lo richiedono.
-   Dopo l'invio del magic link, mostra una schermata di attesa chiara ("controlla la tua email") con opzione di reinvio dopo un timeout (es. 30s) e link per tornare indietro/cambiare email.
-   Gestisci lo stato di redirect post-click sul magic link (deep link o redirect URL) per riportare l'utente esattamente al punto 6 dell'onboarding, non alla home generica.
-   Se l'utente arriva da magic link/social login senza aver completato l'onboarding (es. login da un altro dispositivo), va indirizzato all'onboarding, non a una dashboard vuota.

---

## 3\. Struttura di navigazione (post-onboarding)

Bottom tab bar con 4 sezioni principali. Ogni sezione è una route/schermata a sé.

### 3.1 Dashboard (home)

Al primo accesso mostra, in ordine:

1.  Riepilogo di conferma di ciò che l'utente ha appena creato in onboarding (budget, obiettivo, prima spesa) — solo alla primissima visita, poi sostituito dal contenuto normale.
2.  Un solo insight testuale guidato se i dati sono insufficienti per grafici significativi (es. meno di 5 transazioni): messaggio propositivo, non grafici vuoti o a zero.
3.  Barra di progresso dell'obiettivo di risparmio attivo, sempre visibile.
4.  Una singola call-to-action prioritaria verso l'azione a maggior valore (es. "Importa il tuo estratto conto" / "Collega la tua banca") — non più di una CTA primaria per volta.
5.  Solo quando c'è storico sufficiente (soglia configurabile, es. 10+ transazioni): grafici di trend spesa e confronto periodo su periodo.

**Vincolo esplicito**: non renderizzare mai grafici a torta con una sola categoria, trend a 30 giorni con un solo punto dati, o sezioni "confronto col mese scorso" quando non c'è un mese scorso. Sostituisci sempre con lo stato guidato del punto 2.

### 3.2 Obiettivi (goals)

-   Lista degli obiettivi di risparmio attivi, ciascuno con barra di progresso.
-   Ogni obiettivo mostra: nome, importo raggiunto/target, data prevista di completamento stimata in base al ritmo di risparmio attuale (se calcolabile).
-   CTA per creare un nuovo obiettivo, con lo stesso pattern di Smart Default usato in onboarding (proponi importo/scadenza plausibili, modificabili).
-   Nessun obiettivo attivo → stato vuoto con CTA a crearne uno, non schermata bianca.

### 3.3 Timeline (transazioni)

-   Lista cronologica delle transazioni, ordinata dalla più recente.
-   Raggruppamento per giorno/settimana con totale di spesa per gruppo mostrato nell'header del gruppo.
-   Filtri per categoria e intervallo di date, accessibili ma non invasivi (icona filtro, non barra sempre visibile).
-   Ogni riga transazione: descrizione, categoria (con possibilità di correzione manuale al tap), importo, data.
-   Stato vuoto (nessuna transazione oltre a quella di onboarding): messaggio che guida all'aggiunta manuale o all'import.

### 3.4 Budget

-   Le categorie definite in onboarding, ciascuna con: budget impostato, speso finora nel periodo corrente, barra di avanzamento.
-   Barra che cambia stato visivo (non necessariamente colore allarmante, ma un segnale chiaro) quando una categoria si avvicina o supera il limite.
-   CTA per aggiungere nuove categorie di budget oltre a quelle iniziali.
-   Editing inline degli importi budget per categoria, senza dover aprire schermate separate.

---

## 4\. Vincoli trasversali

-   Mobile-first: tutte le schermate vanno progettate prima per viewport stretto (~380px), poi adattate.
-   Nessuno step di onboarding o autenticazione deve richiedere più di un'azione principale per schermata (un tap, un input, non moduli con più campi obbligatori insieme).
-   Stato di caricamento esplicito su ogni operazione asincrona (auth, salvataggio dati onboarding, fetch transazioni) — mai schermate bianche durante il caricamento.
-   Gestione esplicita degli stati vuoti per ogni sezione (obiettivi, timeline, budget) descritta sopra — nessuna sezione deve apparire "rotta" quando i dati sono pochi o assenti.