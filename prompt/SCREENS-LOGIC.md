# Flownd — Logica delle tab e delle schermate

Specifica di contenuto e comportamento per le 5 tab principali (Dashboard, Timeline, Coach, Obiettivi, Profilo) e per la logica di condivisione tra più utenti. Da usare come riferimento per l'implementazione.

---

## 1. Dashboard

### Card patrimonio (in alto, scorrevole)

Due pagine in swipe orizzontale, indicatore a puntini:

**Pagina 1 — Budget mensile**
- Disponibile del mese corrente su introito totale (es. "1.180€ disponibili su 1.800€")
- Sotto, il riepilogo Necessità/Desideri/Risparmio già definito

**Pagina 2 — Patrimonio aggregato**
- Somma di tutti i conti collegati (se Open Banking attivo) + eventuali saldi inseriti manualmente
- Variazione rispetto al mese scorso (delta €, non solo %)

**Toggle privacy (icona occhio)**
- Non è locale alla card: è una preferenza globale dell'utente, persistita, che maschera (`•••••`) ogni importo sensibile in tutta l'app (Dashboard, Timeline, Obiettivi) finché non viene riattivata
- Utile per usare l'app in pubblico senza mostrare cifre — va salvata per sessione/dispositivo, non richiesta ad ogni apertura

### Pie chart categorizzazione spesa
- Periodo di riferimento = mese corrente per default, con possibilità di cambiare (stessa selezione periodo di Timeline)
- Tap su una fetta → filtra la Timeline su quella categoria

### Cosa mettere sotto (in ordine di priorità, mostrato solo se rilevante — non tutto sempre)

1. **Insight del Coach** — una singola card con l'osservazione più rilevante del momento (vedi Money Coach §2.1 del documento precedente). Se non c'è nulla di significativo da segnalare, la card non compare — mai un insight forzato o generico.
2. **Prossime scadenze** — rate di mutuo/prestito in arrivo, abbonamenti ricorrenti dei prossimi 7 giorni. Coerente col framing loss-aversion già scelto per gli abbonamenti dimenticati.
3. **Obiettivo in evidenza** — il goal con priorità più alta (dal waterfall, vedi §4), con barra di progresso e link diretto alla tab Obiettivi.
4. **Alert budget** — solo se una categoria è vicina/oltre il limite questo mese.
5. **CTA singola contestuale** — "Importa il tuo estratto conto" o "Collega la tua banca", mostrata solo se l'utente non ha ancora una fonte dati recente. Sparisce da sola una volta soddisfatta la condizione, non è un elemento fisso.

**Regola generale**: la Dashboard non deve mai mostrare più di una CTA primaria e più di 4-5 blocchi contenuto — se in un dato momento non c'è nulla di rilevante per un blocco, quel blocco non si renderizza, la schermata si accorcia invece di riempirsi di placeholder vuoti.

---

## 2. Timeline

### Filtro periodo
Segmented control in alto: Settimana / Mese / Anno. Cambia sia la lista sotto che il grafico.

### Plot andamento
Consigliato: **grafico a barre entrate vs uscite** per sotto-periodo (giorni se vista settimana, settimane se vista mese, mesi se vista anno) — più leggibile di una linea cumulativa per capire "in che giorni/settimane ho speso di più", che è la domanda che l'utente si fa davvero in questa tab. Sopra il grafico, tre numeri riassuntivi del periodo selezionato: Entrate totali, Uscite totali, Saldo netto.

### Lista storico
- Raggruppata per giorno (o settimana in vista anno), totale per gruppo nell'header
- Ogni riga: descrizione, categoria (tap per correggere), importo, data
- Ricerca testuale e filtro per categoria, dietro un'icona filtro (non barra sempre visibile, per non affollare)

---

## 3. Coach

### Funzionalità
Chat in linguaggio naturale con tre tipi di intento, tutti gestiti dallo stesso endpoint conversazionale:

1. **Domande sui dati** — "posso permettermi un weekend a 300€?" → risposta basata sui dati reali dell'utente (vedi Money Coach §2.2 del documento precedente)
2. **Creazione spesa** — "ho speso 20€ al bar" → il modello estrae importo + descrizione + categoria proposta
3. **Creazione/modifica obiettivo** — "voglio mettere da parte 5.000€ per la macchina entro 2 anni" → il modello estrae i parametri del goal

### Architettura tecnica
Implementare come **tool use**: definisci lato backend un set di funzioni che il modello può invocare (`add_transaction`, `create_goal`, `get_spending_summary`, ecc.), passate come tools nella chiamata API. Il modello decide se la richiesta dell'utente richiede una domanda informativa (risponde con testo) o un'azione (chiama il tool corrispondente).

### Vincolo di sicurezza UX — mai azioni silenziose
Ogni azione generata da linguaggio naturale (nuova spesa, nuovo obiettivo, modifica budget) va **sempre confermata dall'utente** prima di essere salvata: mostra una card di riepilogo ("Ho capito: spesa di 20€, categoria Bar, oggi — confermi?") con un tap di conferma o modifica. Il linguaggio naturale è ambiguo per natura; l'AI propone, l'utente conferma. Nessuna scrittura diretta sul database senza questo passaggio.

---

## 4. Obiettivi

### 4.1 Logica di riempimento — quando arriva lo stipendio

Dipende dalla fonte dati disponibile:

- **Con Open Banking connesso (Pro/Max)**: quando una transazione in entrata viene riconosciuta come stipendio/entrata ricorrente (stesso pattern del riconoscimento abbonamenti, ma sulle entrate), l'app **accantona automaticamente** verso gli obiettivi attivi secondo la logica del waterfall (§4.2) — ma sempre con una notifica esplicita ("Stipendio ricevuto: 200€ destinati a Fondo emergenza, 160€ a Giappone"), mai in silenzio. È un accantonamento virtuale (il denaro resta fisicamente nello stesso conto, vedi discussione precedente sul saldo disponibile), ma il calcolo parte da un evento reale rilevato sul conto.
- **Senza Open Banking (Free)**: nessun rilevamento automatico possibile. L'utente registra manualmente un contributo ("ho ricevuto lo stipendio", o versamento diretto a un obiettivo specifico). L'automazione è quindi un differenziatore naturale e comprensibile per il Pro/Max, coerente con la struttura piani già discussa.

### 4.2 Priorità vs percentuali — due modalità, non una sola

Due modelli tra cui l'utente sceglie in fase di configurazione degli obiettivi (impostazione a livello di account, modificabile in qualsiasi momento da Profilo o dalla tab Obiettivi):

- **Modalità priorità (waterfall)** — default consigliato. Gli obiettivi sono ordinati (drag&drop), il pool Risparmio riempie il primo fino al contributo richiesto, poi il secondo, ecc. Riflette la pratica finanziaria standard (prima l'emergenza, poi il resto).
- **Modalità percentuale** — l'utente assegna una % fissa del pool Risparmio a ciascun obiettivo attivo (es. 60% Fondo emergenza, 40% Giappone). Più controllo manuale, tutti gli obiettivi avanzano in parallelo invece che in sequenza.

Il vincolo di validazione (somma richiesta ≤ pool disponibile → altrimenti schermata di riconciliazione) si applica a entrambe le modalità, cambia solo come viene distribuito il pool.

### 4.3 Cosa succede quando un obiettivo è pieno

A differenza di N26/Monzo (dove lo spazio pieno resta lì finché l'utente non lo svuota manualmente), qui la scelta va resa esplicita perché il denaro è virtuale, non spostato fisicamente. Alla soglia del 100%, l'app mostra un momento di celebrazione (coerente con l'elemento firma "linea di flusso" animata col gradiente di brand, vedi DESIGN.md) e chiede:

- **"Obiettivo raggiunto — segna come completato"**: il contributo mensile che questo obiettivo occupava si libera automaticamente e scorre al prossimo obiettivo in coda nel waterfall (o resta buffer libero se non ce ne sono altri). L'utente conferma che il denaro è stato/sarà effettivamente speso per lo scopo (viaggio, acquisto).
- **"Continua ad accantonare"**: l'obiettivo si trasforma in risparmio libero senza scadenza (utile se l'utente vuole solo continuare a mettere via senza un traguardo specifico), il contributo resta assegnato lì finché non viene riassegnato manualmente.

Non forzare una scelta immediata: se l'utente ignora la notifica, l'obiettivo resta "pieno" visibilmente in cima alla lista finché non decide — non sparisce e non si libera automaticamente senza conferma.

### 4.4 Mutui e prestiti — un tipo di oggetto separato dagli obiettivi

Un mutuo/prestito non è un obiettivo di risparmio (non si accumula verso un traguardo, è un impegno fisso in uscita), va quindi modellato come entità distinta ma nella stessa tab, in una sezione "Finanziamenti":

```
loans:
  id, user_id, nome, importo_finanziato, anticipo,
  numero_rate, rata_mensile, tasso_interesse (opzionale),
  data_inizio, maxirata_finale (opzionale, per leasing/PCP)
```

**Verifica di fattibilità**, mostrata quando l'utente inserisce i parametri (importo, anticipo, durata, eventuale maxirata):
- Calcolo della rata mensile con formula di ammortamento standard, se non inserita direttamente dall'utente
- Confronto tra rata mensile e disponibile nella fetta **Necessità** (i finanziamenti sono impegni fissi, non risparmio) — non contro il pool Risparmio, che è un budget concettualmente diverso
- Indicatore di sostenibilità (verde/giallo/rosso) basato su una soglia ragionevole (es. rata sotto il 30% del reddito disponibile è un riferimento comune nella prassi creditizia, non una regola assoluta — comunicalo come tale)
- Se è presente una **maxirata finale**, segnalala esplicitamente come impegno futuro isolato e proponi di collegarla a un obiettivo di risparmio dedicato con scadenza coincidente ("Vuoi creare un obiettivo per coprire la maxirata di 5.000€ entro 36 mesi?") — riusa il motore obiettivi già costruito invece di duplicarne la logica.

---

## 5. Profilo

Contenuto: nome, avatar, piano attuale (con CTA upgrade se Free/Pro), gestione gruppo (§6), notifiche, modalità privacy di default, supporto, logout.

### Collegamento conto corrente — dove va messo

Va gestito **in Profilo** come punto di gestione principale (elenco conti collegati, aggiungi/rimuovi, stato sync) — è un'impostazione d'account, non un'azione ricorrente da esporre in Dashboard in modo permanente.

La leva di conversione verso Pro, però, resta comunque in **Dashboard**, tramite la CTA contestuale già definita al punto 1.5: se l'utente non ha ancora collegato un conto, la vede lì, nel momento in cui il valore mancante è più evidente (sta guardando i suoi dati e si accorge che sono incompleti). Una volta collegato, la CTA sparisce dalla Dashboard e la gestione passa in Profilo. Non serve duplicare permanentemente l'ingresso in due posti — la Dashboard fa da innesco nel momento giusto, il Profilo è la destinazione di gestione.

---

## 6. Condivisione tra più utenti (gruppo)

### Dove si gestisce
Creazione e gestione del gruppo vivono in **Profilo**. Al momento della creazione (o dell'invito ricevuto), chi entra nel gruppo sceglie esplicitamente **cosa condividere** — non è un'opzione nascosta da configurare dopo, è parte del flusso di join.

### Livelli di condivisione (granulari, non binari)
Un all-or-nothing ("condividi tutto" vs "condividi niente") è troppo rigido per come le persone gestiscono davvero i soldi in coppia/famiglia — spesso si vuole condividere il piano di spesa comune ma non l'intero patrimonio personale. Tre livelli:

1. **Solo piano mensile** — budget e spese condivise (utile per gestire spese di casa comuni), il patrimonio/saldo totale di ciascun membro resta privato.
2. **Obiettivi selezionati** — solo i goal che l'utente marca esplicitamente come condivisi (es. "Casa" condiviso con il partner, "Fondo personale" resta privato). Vedi §6.2.
3. **Tutto** — patrimonio aggregato, transazioni, obiettivi tutti visibili tra i membri.

Un utente può stare in più "ambiti" di condivisione diversi con persone diverse solo se il modello dati lo prevede fin dall'inizio — per l'MVP è ragionevole limitarsi a **un gruppo per utente** con un livello di condivisione unico, ed espandere in futuro se emerge la necessità di più gruppi paralleli.

### Vista Dashboard in un gruppo
Non fondere automaticamente i dati: un toggle esplicito in alto ("Vista personale" / "Vista di gruppo") lascia scegliere cosa guardare in ogni momento. La vista di gruppo mostra solo i dati che il livello di condivisione scelto rende visibili — se il livello è "solo piano mensile", la vista di gruppo non mostrerà mai il patrimonio aggregato di nessuno, a prescindere da cosa l'utente vorrebbe vedere in quel momento.

### 6.2 Obiettivi condivisi
Un goal condiviso ha una struttura leggermente diversa da uno personale:

```
goals:
  ...campi esistenti...
  group_id (nullable — null se personale)
  condiviso (boolean)

goal_contributions:
  id, goal_id, user_id, importo, data
```

- Il target e la barra di progresso sono aggregati (somma dei contributi di tutti i membri), ma **ogni contributo resta tracciato per singolo utente** — importante per trasparenza ("chi ha messo cosa"), specialmente in gruppi non di coppia (es. condivisione tra amici per un obiettivo comune).
- Il waterfall/percentuali di allocazione restano **individuali**: ogni membro decide quanto del proprio pool Risparmio personale destinare al goal condiviso — non esiste un pool di gruppo unico che qualcuno controlla per gli altri. Questo evita conflitti su chi decide le priorità di risparmio di qualcun altro.
- Quando un obiettivo condiviso è pieno, la scelta "completato / continua ad accantonare" (§4.3) va confermata da chi ha creato il goal, ma notificata a tutti i membri contributori.
