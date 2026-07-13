# Prompt — Landing Page Flownd
## Singolo file HTML · Mobile-first · Design editoriale

---

## Concetto visivo: "Il Libro Mastro"

La landing page di Flownd non deve sembrare un'app fintech. Deve sembrare il momento in cui, per la prima volta, capisci dove vanno davvero i tuoi soldi. L'estetica si ispira ai libri mastri italiani degli anni '60-'70 — grafica editoriale, tipografia forte, numeri trattati come oggetti visuali.

**Non è:**
- L'ennesimo sito con sfondo scuro e accento verde acido (Linear, Raycast, ogni SaaS del 2023)
- Il solito fintech con gradiente azzurro e foto di persone sorridenti con laptop
- Lo stile "caldo e minimalista" con sfondo crema e serif terracotta
- Hero con tre card fluttuanti e ombra lunga

**È:**
- Sfondo chiaro quasi-bianco, freddo e pulito, come carta da stampa
- Tipografia condensed e bold trattata come oggetto grafico, non come delivery di testo
- Un unico accento cromatico inaspettato per il fintech: rosso-arancio intenso (#E8402A), caldo e mediterraneo
- Numeri grandi come elementi visivi primari — il denaro è numeri, i numeri sono bellezza
- Struttura asimmetrica con griglia forte e intenzionale
- Animazioni rare, esatte, mai decorative

---

## Sistema di token

### Colori
```
--ink:        #141210   /* quasi-nero caldo, inchiostro */
--paper:      #F5F4F0   /* quasi-bianco freddo, carta da stampa */
--accent:     #E8402A   /* rosso-arancio, unico colore caldo */
--accent-dim: #F2C4BC   /* versione tenue dell'accento */
--surface:    #ECEAE4   /* grigio carta, superfici interne */
--muted:      #7A7872   /* testi secondari */
--rule:       #D4D2CC   /* linee divisorie, bordi */
--white:      #FFFFFF
```

Regola: il rosso (#E8402A) appare solo 3 volte in tutta la pagina — CTA principale, un numero hero, un dettaglio grafico. Il suo potere viene dalla rarità.

### Tipografia

**Display (titoli hero):** `'Barlow Condensed'` peso 700–800, maiuscolo, tracking stretto. Da Google Fonts. Tratta ogni headline come un poster, non come un titolo di paragrafo.

**Body:** `'Inter'` peso 400–500 per testo, peso 600 per label e UI. Da Google Fonts.

**Mono (numeri, dati):** `'JetBrains Mono'` per cifre, importi, date. I numeri meritano un font proprio.

**Scala:**
```
--text-xs:    11px
--text-sm:    13px
--text-base:  15px
--text-lg:    18px
--text-xl:    24px
--text-2xl:   36px
--text-3xl:   56px
--text-hero:  clamp(72px, 12vw, 140px)   /* dimensione dei numeri hero */
```

### Layout
- Max-width: `1200px`, centrato
- Griglia: 12 colonne con `gap: 24px`
- Padding laterale: `clamp(20px, 5vw, 80px)`
- Sezioni: `padding-block: clamp(60px, 10vw, 120px)`
- Nessun `border-radius` > 8px — angoli netti, non "morbidi"

---

## Elemento firma

**Il Feed Vivente** — Il signature element della pagina è un mock animato del feed transazioni di Flownd, posizionato nella colonna destra del hero. Non è uno screenshot statico, non è un mockup con cornice di telefono. È il feed stesso, vivo: le transazioni scorrono verso il basso ogni 3 secondi in un loop continuo, con i colori delle categorie, gli importi in JetBrains Mono, le icone emoji delle categorie. Si vede che è l'app reale, non una rappresentazione dell'app. Larghezza fissa `360px`, altezza `480px`, bordo sottile `1px solid var(--rule)`, sfondo `var(--white)`, `overflow: hidden`, con un gradiente che svanisce in alto e in basso.

---

## Struttura della pagina

### 0. Barra di navigazione

```
[FLOWND]                    Funzionalità  Prezzi  Blog    [Inizia gratis →]
```

- Sfondo `var(--paper)`, bordo inferiore `1px solid var(--rule)`
- Logo: "FLOWND" in Barlow Condensed 700, `--ink`, `letter-spacing: 0.05em`
- Link: Inter 400, `var(--muted)`, nessun stile di default
- CTA nav: sfondo `var(--ink)`, testo `var(--paper)`, padding `8px 16px`, `border-radius: 4px`
- Position sticky top:0, `backdrop-filter: blur(8px)`, `background: rgba(245,244,240,0.85)`

---

### 1. Hero — Layout asimmetrico a due colonne

**Colonna sinistra (60%):**

Eyebrow label in Inter 500, `var(--muted)`, `text-transform: uppercase`, `letter-spacing: 0.12em`, `font-size: 11px`:
```
Gestione finanziaria personale
```

Headline in Barlow Condensed 800, maiuscolo, `var(--ink)`, `font-size: var(--text-hero)`, `line-height: 0.9`, `letter-spacing: -0.02em`:
```
SMETTI
DI CHIEDERTI
DOVE VANNO
I SOLDI.
```

La parola "SOLDI" è in `var(--accent)`. Solo quella parola. Nient'altro nella headline ha il colore accento.

Sotto la headline, separato da `margin-top: 32px`, un paragrafo in Inter 400, `var(--muted)`, `font-size: var(--text-lg)`, `max-width: 420px`, `line-height: 1.6`:
```
Flownd collega il tuo conto corrente, categorizza
le spese automaticamente e ti mostra esattamente
dove stai spendendo — e dove puoi risparmiare.
```

CTA group, `margin-top: 40px`, `display: flex`, `gap: 12px`, `align-items: center`:
- **Bottone primario:** sfondo `var(--accent)`, testo `var(--white)`, Inter 600, `padding: 14px 28px`, `border-radius: 6px`, `font-size: var(--text-base)`. Testo: "Inizia gratis"
- **Link secondario:** nessun bordo, nessun sfondo, Inter 500, `var(--muted)`, underline sottile. Testo: "Vedi come funziona →"

Sotto i CTA, `margin-top: 48px`, una riga di "social proof" in stile dati:
```
[●] 2.400+ utenti beta  ·  [●] 18 banche italiane  ·  [●] GDPR compliant
```
Testo in Inter 400, `font-size: var(--text-sm)`, `var(--muted)`. I pallini `[●]` sono in `var(--accent)`.

**Colonna destra (40%):**
Il Feed Vivente (vedi sezione Elemento Firma). Allineato verticalmente al centro della colonna sinistra. Su mobile: nascosto e sostituito da una versione compatta a larghezza piena sotto la headline.

**Implementazione del Feed Vivente:**
```js
const DEMO_FEED = [
  { e: '🍕', desc: 'Esselunga Milano',     amount: '-€87,43',  cat: 'Cibo',       color: '#FCEBEB' },
  { e: '💰', desc: 'Stipendio Maggio',      amount: '+€2.800',  cat: 'Entrate',    color: '#E1F5EE' },
  { e: '🚆', desc: 'Trenitalia MI→RM',     amount: '-€45,00',  cat: 'Trasporti',  color: '#E6F1FB' },
  { e: '🎬', desc: 'Netflix',              amount: '-€15,99',  cat: 'Svago',      color: '#FAECE7' },
  { e: '⚡', desc: 'A2A Energia',          amount: '-€65,00',  cat: 'Bollette',   color: '#FAEEDA' },
  { e: '🛍', desc: 'Zara CityLife',        amount: '-€79,95',  cat: 'Shopping',   color: '#FBEAF0' },
  { e: '❤️', desc: 'Farmacia Centrale',    amount: '-€28,70',  cat: 'Salute',     color: '#EEEDFE' },
  { e: '🚆', desc: 'ATM Abbonamento',      amount: '-€35,00',  cat: 'Trasporti',  color: '#E6F1FB' },
  { e: '🍕', desc: 'Pizzeria da Mario',    amount: '-€32,50',  cat: 'Cibo',       color: '#FCEBEB' },
  { e: '💰', desc: 'Freelance Progetto',   amount: '+€500,00', cat: 'Entrate',    color: '#E1F5EE' },
];
```
Ogni riga: `display: flex`, `align-items: center`, `gap: 10px`, `padding: 12px 14px`, `border-bottom: 1px solid #F0EFE8`. L'importo a destra in `JetBrains Mono 500`, verde se positivo (`#1D9E75`), `#141210` se negativo. Una nuova transazione viene aggiunta in cima ogni 2.5 secondi con una `translateY` animation da -40px a 0, `ease-out`, `200ms`. L'elemento più vecchio esce in fondo con un fade-out.

---

### 2. Sezione problema — "Tre verità scomode"

**Layout:** fullwidth, sfondo `var(--ink)`, testo `var(--paper)`. Padding generoso.

**Headline** in Barlow Condensed 700, maiuscolo, `var(--paper)`, `font-size: var(--text-3xl)`:
```
HAI GIÀ APERTO L'APP DELLA BANCA
STAMATTINA. NON HAI CAPITO NIENTE.
```

Sotto, tre statement grandi divisi da linee orizzontali `1px solid rgba(255,255,255,0.1)`. Ogni statement è su una riga con layout a due colonne: numero a sinistra in Barlow Condensed, `var(--accent)`, `font-size: clamp(48px, 8vw, 96px)`, statement a destra in Inter 400, `rgba(245,244,240,0.7)`, `font-size: var(--text-lg)`.

```
47%    degli italiani non sa quanto spende
       mensilmente in cibo e ristoranti.

3.2    abbonamenti in media vengono pagati
       senza accorgersene ogni mese.

€340   è la differenza media tra quello che
       si pensa di spendere e quanto si spende.
```

I numeri `47%`, `3.2`, `€340` si animano con un contatore quando entrano nel viewport (`IntersectionObserver`). L'animazione dura 1.5 secondi, `easeOut`. Solo questi tre numeri si animano in tutta la pagina.

---

### 3. Sezione come funziona — Layout orizzontale a step

**Headline** centrata in Barlow Condensed 600, maiuscolo, `var(--ink)`:
```
DA ZERO A TUTTO CHIARO IN TRE MINUTI
```

**Tre step** in una griglia `1fr 1fr 1fr` con separatori verticali `1px solid var(--rule)`:

**Step 1 — Collega**
Label: `Inter 500, 11px, var(--muted), uppercase, tracking wide` → "Collega il conto"
Numero step: `Barlow Condensed 800, var(--surface), font-size: 96px` → "01" (sullo sfondo, decorativo)
Headline step: `Barlow Condensed 700, var(--ink), font-size: 28px` → "La tua banca in 2 tap"
Body: `Inter 400, var(--muted), font-size: 15px` → "Supportiamo 18+ banche italiane via Open Banking PSD2. Nessuna credenziale condivisa, accesso in sola lettura."
Mini-list: 3 banche con logo testuale e spunta verde. (ING, Intesa Sanpaolo, UniCredit come esempi)

**Step 2 — Categorie**
→ "Le spese si ordinano da sole"
→ "Ogni transazione viene categorizzata automaticamente. L'AI corregge i casi incerti. Tu correggi il resto con un tap."
→ Mini-donut chart statico con le categorie (SVG inline, piccolo, 80px)

**Step 3 — Controlla**
→ "Budget e risparmi sotto controllo"
→ "Imposta un budget per categoria. Flownd ti avvisa quando ti avvicini al limite. A fine mese sai esattamente dove hai risparmiato."
→ Mini-barra di budget statica con due categorie di esempio (SVG o HTML puro)

---

### 4. Sezione feature AI — Layout sfalsato

**Sfondo:** `var(--surface)`. Sezione divisa in due blocchi alternati (feature sinistra/destra) con padding asimmetrico.

**Headline sezione** in Barlow Condensed 700, `var(--ink)`:
```
L'AI CHE CAPISCE
I TUOI SOLDI
```

**Feature 1 — Screenshot**
Colonna sinistra: testo
```
Eyebrow: "Solo piano Premium"
Headline: Fotografa. Fatto.
Body: Uno screenshot della notifica bancaria, di un'email di conferma o di uno scontrino.
      Flownd estrae importo, data e categoria in automatico.
      Nessun inserimento manuale.
```
Colonna destra: mock visuale — uno "smartphone" stilizzato (rettangolo con angoli arrotondati `border-radius: 28px`, bordo `3px solid var(--ink)`, sfondo `var(--ink)`) che mostra uno screenshot finto di notifica bancaria con overlay di parsing. Il parsing è animato: tre campi appaiono in sequenza con un delay di 300ms ciascuno (importo → categoria → data), ognuno con un fade+translateY da 10px a 0.

**Feature 2 — Voce**
Layout invertito (testo a destra, mock a sinistra)
```
Headline: Di' quanto hai speso.
Body: "Ho speso venti euro al supermercato ieri." Flownd capisce,
      categorizza e aggiunge la transazione. Conferma con un tap.
```
Mock: waveform animata (5 barre verticali che oscillano con `animation: wave`, amplitudine e timing diversi per ogni barra, `background: var(--accent)`), con sotto il transcript che appare lettera per lettera come se fosse live.

**Feature 3 — Import estratto**
Layout normale (testo a sinistra)
```
Headline: Carica il PDF della banca.
Body: Qualunque banca, qualunque formato. L'AI analizza l'estratto conto,
      estrae tutte le transazioni e le importa in Flownd con le categorie già assegnate.
      Il file viene eliminato subito dopo l'import.
```
Mock: icona PDF semplice con animazione di "parsing" — tre skeleton loader che appaiono sequenzialmente e poi si trasformano in righe di transazione reali.

---

### 5. Sezione gruppo — "Per chi vive insieme"

**Layout:** due colonne. Sinistra: testo. Destra: mock della schermata gruppo.

**Sfondo:** `var(--white)`, bordo superiore `1px solid var(--rule)`.

```
Eyebrow: "Famiglia · Coinquilini · Coppia"
Headline in Barlow Condensed 800, font-size: var(--text-3xl):
TRE PERSONE.
UN BUDGET.
ZERO DISCUSSIONI.
```

```
Body: Crea un gruppo, invita chi vuoi. Ogni membro vede le spese condivise,
      può aggiungere le proprie, e il budget di gruppo si aggiorna in tempo reale.
      Le spese personali restano private.
```

Feature list (senza bullet, solo righe con lineetta em):
```
— Budget condivisi con contributi per membro
— Split spese automatico (chi deve quanto a chi)
— Profili separati: spese personali vs spese gruppo
— Fino a 6 persone nel piano Famiglia
```

Mock colonna destra: lista di 3 avatar (cerchi con iniziali, colori diversi) con accanto un budget bar condiviso che si aggiorna con un'animazione CSS di fill. Statico ma con micro-animazione di riempimento al caricamento della sezione (IntersectionObserver).

---

### 6. Sezione prezzi

**Sfondo:** `var(--paper)`.

**Headline** in Barlow Condensed 700:
```
SCEGLI IL TUO PIANO
```

**Tre card** in griglia `1fr 1fr 1fr`:

**Card Free:**
- Sfondo `var(--white)`, bordo `1px solid var(--rule)`
- Piano: "Free"
- Prezzo: "€0" in Barlow Condensed 800, `font-size: 56px`, `var(--ink)`
- Subtitle: "Per sempre"
- Feature list (font-size 13px, Inter 400, var(--muted), con spunte ✓ in ink e ✗ in var(--rule)):
  ```
  ✓ Inserimento manuale spese
  ✓ Budget per 3 categorie
  ✓ Grafici mese corrente
  ✓ Storico 3 mesi
  ✓ Gruppo fino a 3 persone
  ✗ Collegamento bancario
  ✗ Funzionalità AI
  ✗ Import estratto conto
  ```
- CTA: bottone outline (`border: 1.5px solid var(--ink)`, sfondo trasparente)
- Nota piccola in basso: "Include pubblicità non invasiva"

**Card Premium (quella centrale — evidenziata):**
- Sfondo `var(--ink)`, testo `var(--paper)`
- Badge top center: "PIÙ SCELTO" in Inter 600, `font-size: 10px`, `var(--accent)`, uppercase, tracking wide
- Piano: "Premium"
- Prezzo: "€5" in Barlow Condensed 800, `font-size: 56px`, `var(--accent)`, + "/mese" in Inter 400, `font-size: 16px`, `rgba(245,244,240,0.5)`
- Subtitle: "Fatturazione mensile · Disdici quando vuoi"
- Feature list con sfondo leggermente più chiaro per le spunte, tutto in `var(--paper)`:
  ```
  ✓ Tutto il piano Free
  ✓ Collegamento bancario (18+ banche)
  ✓ Sync automatico transazioni
  ✓ Categorizzazione AI
  ✓ Import estratto conto con AI
  ✓ Aggiunta spesa con voce
  ✓ Aggiunta spesa da screenshot
  ✓ Storico illimitato
  ✓ Gruppo fino a 10 persone
  ✓ Report mensile PDF
  ✗ Profili separati famiglia
  ```
- CTA: bottone `var(--accent)` — "Inizia gratis 14 giorni"
- Nota: "Nessuna carta di credito per iniziare"

**Card Famiglia:**
- Sfondo `var(--white)`, bordo `1px solid var(--rule)`
- Piano: "Famiglia"
- Prezzo: "€9" in Barlow Condensed 800, `font-size: 56px`, `var(--ink)`
- Subtitle: "Fino a 6 persone"
- Feature list:
  ```
  ✓ Tutto il piano Premium
  ✓ Fino a 6 persone
  ✓ Profili separati (personale + famiglia)
  ✓ Budget familiari con contributi
  ✓ Split spese automatico
  ✓ Dashboard famiglia dedicata
  ```
- CTA: bottone outline

Sotto le card, centrato, testo in Inter 400, `var(--muted)`, `font-size: 13px`:
```
Tutti i piani includono: crittografia end-to-end · GDPR compliant ·
accesso bancario in sola lettura · dati mai venduti a terzi
```

---

### 7. Sezione FAQ — Accordion tipografico

**Sfondo:** `var(--white)`. **Nessun bordo, nessuna card, nessun padding eccessivo.**

Le FAQ sono semplicemente righe con una linea divisoria `1px solid var(--rule)` tra ognuna. La domanda è in Barlow Condensed 600, `font-size: 22px`, `var(--ink)`. Il simbolo apri/chiudi è un semplice "+" / "−" in `var(--accent)`, `font-size: 28px`. La risposta appare con un'animazione `max-height` + `opacity`, Inter 400, `var(--muted)`, `font-size: 15px`, `line-height: 1.7`.

**5 domande:**
1. "La mia banca è supportata?" — risposta sui 18+ banche, link a pagina lista banche
2. "Flownd vede le mie credenziali bancarie?" — risposta su OAuth PSD2, sola lettura
3. "Posso usarlo senza collegare la banca?" — risposta su inserimento manuale e import CSV
4. "Cosa succede ai miei dati se annullo?" — risposta su export e cancellazione
5. "Funziona per la mia banca piccola (Cassa Rurale, ecc.)?" — risposta onesta su copertura e alternativa import CSV

---

### 8. Footer CTA finale

**Sfondo:** `var(--accent)` — unico uso del rosso come sfondo. Bold, inaspettato.

**Headline** in Barlow Condensed 800, `var(--white)`, `font-size: var(--text-hero)`, centrata:
```
INIZIA OGGI.
```

**Subheadline** in Inter 400, `rgba(255,255,255,0.75)`, centrata:
```
Gratis. Nessuna carta richiesta. 14 giorni di Premium inclusi.
```

**CTA** in bottone `var(--ink)`, testo `var(--white)`: "Crea il tuo account →"

---

### 9. Footer informativo

**Sfondo:** `var(--ink)`. Due righe:

Riga 1 — colonne: Logo FLOWND · Link (Chi siamo, Funzionalità, Prezzi, Blog, Privacy, Termini) · Social icon (solo outline, no colori brand)

Riga 2 — centrata, Inter 400, `var(--muted)`, `font-size: 12px`:
```
© 2026 Flownd · Made in Italy · P.IVA XXXXXXXXXXX
Servizio di aggregazione dati bancari conforme PSD2 · Dati protetti con crittografia AES-256
```

---

## Animazioni — regole ferme

**Sì:**
- Contatori numerici (sezione problema) — solo al primo ingresso nel viewport
- Feed transazioni hero — loop continuo, mai pause
- Accordion FAQ — max-height transition, 250ms
- Hover sui bottoni: `transform: translateY(-1px)`, `box-shadow` sottile, 150ms
- Fill della barra budget (sezione gruppo) — una volta sola all'ingresso nel viewport
- Parsing mock (screenshot feature) — sequenza ritardata, una volta sola

**No:**
- Nessun parallax sullo sfondo
- Nessun elemento che fluttua in loop
- Nessun fade-in su tutto il testo a scorrimento (solo sugli elementi signature)
- Nessun cursore personalizzato
- Nessuno scroll hijacking
- Nessun video autoplay di background
- `prefers-reduced-motion`: tutte le animazioni disattivate se impostato

---

## Requisiti tecnici

- **Singolo file HTML** — CSS in `<style>`, JS in `<script>` inline, tutto autocontenuto
- **Google Fonts** via `<link>`: Barlow Condensed (700, 800), Inter (400, 500, 600), JetBrains Mono (400, 500)
- **Zero dipendenze JS** — nessun framework, nessun bundler, vanilla JS puro
- **Mobile-first** — breakpoint principale a `768px`. Su mobile: layout a colonna singola, feed nascosto, font-size ridotti ma proporzionali
- **Performance:** nessuna immagine esterna, tutti i mock sono HTML/CSS/SVG inline
- **Accessibilità:** contrasti WCAG AA, focus visible, `aria-expanded` sugli accordion, `role="img"` sui mock grafici
- **Open Graph meta tag** per condivisione social (og:title, og:description, og:image placeholder)

---

## Copy — tono di voce

**Il tono è diretto, adulto, un po' ironico.** Non è il tono rassicurante delle banche. Non è il tono entusiasta delle startup. È il tono di un amico intelligente che ti spiega le cose senza giri di parole.

**Evitare:**
- "Rivoluziona il modo in cui gestisci i tuoi soldi"
- "Potenzia la tua financial awareness"
- "La piattaforma all-in-one per il tuo benessere finanziario"
- Qualsiasi cosa con "seamless", "powerful", "intuitive"

**Usare:**
- Frasi corte. Verbi attivi. Nessun aggettivo inutile.
- Numeri reali quando possibile (€87,43 non "risparmia di più")
- Ironia gentile sul fatto che nessuno sa davvero dove vanno i soldi
- Onestà sui limiti ("la copertura bancaria varia — se la tua banca non è supportata, puoi importare il CSV")
