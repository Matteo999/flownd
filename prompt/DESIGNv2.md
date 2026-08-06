# Flownd — Design System

Money coach mobile-first, React + Expo. Personalità: **rassicurante e professionale**, con un accento di crescita economica — l'app deve trasmettere competenza senza freddezza, come un consulente che sa il fatto suo ma non intimidisce.

---

## 1. Principi di design

- **Calma prima di tutto.** Chi apre Flownd spesso è già in ansia per i soldi. Ogni schermata riduce il rumore visivo, non lo aggiunge: niente rosso acceso per ogni piccola spesa, niente notifiche urlate.
- **I numeri sono il contenuto, non la decorazione.** Saldi, budget, obiettivi vanno sempre trattati con massima leggibilità e allineamento — mai sacrificati per un layout "creativo".
- **Un solo accento, usato con intenzione.** Il colore di marca compare dove guida un'azione o segnala un progresso positivo, non ovunque.
- **Vuoto = invito, non errore.** Le schermate senza dati (nessuna transazione, nessun obiettivo) parlano con la voce del prodotto e suggeriscono il prossimo passo, non restano bianche.

---

## 2. Colore

Palette chiara e neutra, con un accento freddo verde-blu che richiama crescita e denaro senza cadere nel verde-banconota da stock photo. Supporto nativo a light e dark mode, partenza da preferenza di sistema (`useColorScheme` di Expo).

### Gradiente di brand

`#457FEF → #45D5B6` è il gradiente del logo — vivido di proposito. **Riservato a**: logo, splash screen, schermata di benvenuto in onboarding, momenti di celebrazione (obiettivo raggiunto). Non va usato in elementi funzionali ricorrenti (pulsanti, barre, badge): lì lavora `accent.primary`, la versione scurita/desaturata della stessa famiglia cromatica, pensata per l'uso quotidiano senza affaticare.

### Light mode

| Token | Hex | Uso |
|---|---|---|
| `bg.base` | `#F6F8F7` | Sfondo principale (bianco freddo, non cream) |
| `bg.surface` | `#FFFFFF` | Card, sheet, input |
| `bg.sunken` | `#EDF1EF` | Sezioni secondarie, stati vuoti |
| `text.primary` | `#16211D` | Testo principale (verde-antracite, non nero puro) |
| `text.secondary` | `#5C6B64` | Testo secondario, label |
| `accent.primary` | `#256B7E` | CTA, link, progresso positivo, elementi attivi — derivato dalla tonalità intermedia del gradiente di brand (457FEF→45D5B6), scurito per uso quotidiano |
| `accent.soft` | `#DCEAEC` | Sfondo badge/chip legati all'accento |
| `positive` | `#2E8B6F` | Delta positivo, risparmio raggiunto |
| `warning` | `#B98A2E` | Budget in avvicinamento al limite |
| `negative` | `#C3573F` | Sforamento budget, alert — un corallo caldo, non un rosso allarme |
| `border` | `#DCE3DF` | Divisori, contorni card |

### Dark mode

| Token | Hex | Uso |
|---|---|---|
| `bg.base` | `#0F1712` | Sfondo principale (verde-antracite scuro, non nero puro) |
| `bg.surface` | `#17211C` | Card, sheet, input |
| `bg.sunken` | `#0B120E` | Sezioni secondarie, stati vuoti |
| `text.primary` | `#EAF1ED` | Testo principale |
| `text.secondary` | `#9AAAA2` | Testo secondario, label |
| `accent.primary` | `#47B3D1` | CTA, link, progresso positivo (versione schiarita, più vicina all'estremo blu del gradiente di brand) |
| `accent.soft` | `#173842` | Sfondo badge/chip |
| `positive` | `#4FB89A` | Delta positivo |
| `warning` | `#D9A94F` | Budget in avvicinamento |
| `negative` | `#E08469` | Sforamento budget |
| `border` | `#26332C` | Divisori |

**Regola d'uso:** l'accento (`accent.primary`) è riservato ad azioni e progresso — mai usato come colore di sfondo esteso o come colore di testo per contenuti neutri. Se una schermata ha più di due elementi accentati contemporaneamente, va rivista.

---

## 3. Tipografia

Tre ruoli distinti, scelti per una ragione funzionale precisa — non la stessa coppia display/body che si userebbe per qualsiasi altro brief.

| Ruolo | Font | Motivazione |
|---|---|---|
| **Display** | Baloo 2 (pesi 600–700) | Geometric sans arrotondato, coerente con i terminali morbidi e le forme circolari del logo Flownd. Usato solo per il saldo principale e i titoli di sezione — mai per corpo di testo, per evitare che l'arrotondamento diventi eccessivo su blocchi di testo lunghi. |
| **Body / UI** | IBM Plex Sans | Alta leggibilità su schermi piccoli, tono professionale ma non asettico. Usato per tutto il testo funzionale: label, descrizioni, pulsanti. |
| **Dati numerici** | IBM Plex Mono (cifre tabulari) | Ogni importo, saldo e percentuale usa questo font: le cifre monospaziate allineano i decimali nelle liste di transazioni e comunicano precisione — una scelta legata al contenuto, non estetica. |

### Scala tipografica (base 16px, mobile)

| Stile | Font / peso | Size / line-height | Uso |
|---|---|---|---|
| `display.lg` | Baloo 2 700 | 34 / 40 | Saldo principale in dashboard |
| `display.md` | Baloo 2 600 | 24 / 30 | Titoli di sezione |
| `body.lg` | Plex Sans 400 | 17 / 24 | Testo primario, descrizioni |
| `body.md` | Plex Sans 400 | 15 / 20 | Testo secondario, label |
| `body.sm` | Plex Sans 500 | 13 / 16 | Caption, metadati, timestamp |
| `data.lg` | Plex Mono 500 | 22 / 28 | Importi in evidenza (card obiettivo, budget) |
| `data.md` | Plex Mono 400 | 15 / 20 | Importi in liste (transazioni) |

Nessun corsivo, nessun peso oltre 700 su Baloo 2 e nessun uso del display font oltre saldo/titoli: la voce del brand resta ferma, non invasiva.

---

## 4. Layout e spaziatura

Griglia a 4px, mobile-first, safe area sempre rispettate (notch, home indicator).

- Padding esterno schermo: `20px`
- Gap tra card: `12px`
- Padding interno card: `16px`
- Raggio angoli: `12px` per card, `10px` per bottoni/input, `24px` solo per sheet modali dal basso — arrotondamento moderato, coerente con "professionale", mai pillole eccessivamente arrotondate da app consumer giocosa.
- Elevazione: ombre quasi impercettibili in light mode (`0 1px 3px rgba(22,33,29,0.06)`), nessuna ombra in dark mode — il contrasto tra `bg.surface` e `bg.base` basta a separare i piani.

### Wireframe concettuale — Dashboard

```
┌─────────────────────────────┐
│  Ciao, [Nome]                │  body.md, text.secondary
│  € 2.340,50                  │  display.lg
│  ╭╌╌╌╌ linea di flusso ╌╌╌╮  │  ← elemento firma, vedi §6
│                               │
│  ┌─ Obiettivo: Giappone ───┐ │  card, accent.soft progress
│  │ €1.200 / €2.000  ▓▓▓▓░░ │ │
│  └───────────────────────────┘│
│                               │
│  ┌─ Budget di luglio ──────┐ │  card
│  │ Ristoranti  ▓▓▓▓▓▓░ 82% │ │
│  │ Trasporti   ▓▓░░░░░ 34% │ │
│  └───────────────────────────┘│
│                               │
│  [ Importa il tuo estratto ] │  CTA singola, accent.primary
│                               │
├───┬────┬────┬────┬───────────┤
│Home│Time│Coach│Obiet│Profilo │  tab bar, bg.surface
└───┴────┴────┴────┴───────────┘
```

---

## 5. Componenti chiave

- **Bottoni primari**: `accent.primary` pieno, testo `bg.base`-scuro-su-chiaro (contrasto AA garantito in entrambi i temi), radius 10px, altezza minima 48px (target touch).
- **Bottoni secondari**: outline `border`, testo `text.primary`, nessun riempimento.
- **Card**: `bg.surface`, radius 12px, padding 16px, nessun bordo in light mode (l'ombra basta), bordo sottile `border` in dark mode (le ombre non funzionano su sfondo scuro).
- **Barre di progresso** (budget/obiettivi): traccia `bg.sunken`, riempimento `accent.primary` di default, transizione a `warning`/`negative` solo quando la soglia è superata — mai colore allarmante di default.
- **Tab bar**: 5 voci (Dashboard, Timeline, Coach, Obiettivi, Profilo), icone outline a riposo, icona piena + `accent.primary` per la tab attiva. Nessuna etichetta testuale ridondante con icona ambigua: ogni icona è chiara da sola o accompagnata da label da 11px.
- **Stati vuoti**: illustrazione minimale a linea singola (coerente con l'elemento firma, §6), un titolo in `body.lg`, una CTA singola. Mai una schermata bianca con solo un'icona grigia.

---

## 6. Elemento firma: la "linea di flusso"

Il nome Flownd richiama il flusso del denaro. L'elemento distintivo e ricorrente dell'app è una **sottile linea curva** che attraversa in modo discreto i punti in cui il denaro "si muove": dietro il saldo principale in dashboard, come base delle barre di avanzamento obiettivo, come divisore tra i gruppi della timeline. Nell'uso quotidiano è colorata con `accent.primary` a bassissima opacità (8–12%) — ambientale, non decorativa. Nei momenti di celebrazione (obiettivo raggiunto, primo obiettivo creato) la stessa linea può animarsi assumendo il gradiente di brand completo (`#457FEF → #45D5B6`) a piena opacità: è l'unico punto dell'interfaccia dove il gradiente vivido del logo rientra nell'UI, riservato apposta a questi momenti per restare un evento raro e riconoscibile, non un elemento di routine.

---

## 7. Movimento

Minimo e mirato, mai ambient/costante:

- Transizione tra tab: dissolvenza rapida (150ms), nessuno slide laterale marcato.
- Completamento onboarding e sblocco obiettivo raggiunto: unico momento con micro-animazione più marcata (la barra di progresso che si riempie con leggero easing, 400ms) — il resto dell'app resta fermo apposta per far risaltare questo momento.
- Rispetto di `prefers-reduced-motion` / impostazione accessibilità di sistema su iOS/Android: tutte le animazioni si riducono a semplice dissolvenza.

---

## 8. Voce e tono nei testi UI

- Verbi attivi, frasi corte: "Salva budget", non "Il budget verrà salvato".
- Mai colpevolizzante sugli sforamenti: "Hai superato il budget Ristoranti di €40" — non "Attenzione! Stai spendendo troppo!".
- Stati vuoti come invito: "Ancora nessun obiettivo. Creane uno per iniziare a vedere i tuoi progressi." — non "Nessun dato disponibile".
- Coerenza nome-azione: il pulsante che dice "Importa estratto" produce sempre un messaggio di conferma con la stessa parola ("Estratto importato"), mai sinonimi che disorientano.

---

## 9. Token per implementazione (React/Expo)

```js
export const theme = {
  brandGradient: ['#457FEF', '#45D5B6'], // solo logo, splash, onboarding, celebrazioni
  light: {
    bg: { base: '#F6F8F7', surface: '#FFFFFF', sunken: '#EDF1EF' },
    text: { primary: '#16211D', secondary: '#5C6B64' },
    accent: { primary: '#256B7E', soft: '#DCEAEC' },
    status: { positive: '#2E8B6F', warning: '#B98A2E', negative: '#C3573F' },
    border: '#DCE3DF',
  },
  dark: {
    bg: { base: '#0F1712', surface: '#17211C', sunken: '#0B120E' },
    text: { primary: '#EAF1ED', secondary: '#9AAAA2' },
    accent: { primary: '#47B3D1', soft: '#173842' },
    status: { positive: '#4FB89A', warning: '#D9A94F', negative: '#E08469' },
    border: '#26332C',
  },
  radius: { sm: 10, md: 12, lg: 24 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
  font: {
    display: 'Baloo2',
    body: 'IBMPlexSans',
    data: 'IBMPlexMono',
  },
};
```

Font da caricare via `expo-font` (Google Fonts: `Baloo 2`, `IBM Plex Sans`, `IBM Plex Mono` — tutte disponibili su Google Fonts, licenza libera per uso commerciale). Se il logo usa un font custom o modificato, verificalo con chi ha creato il wordmark prima di finalizzare: Baloo 2 è la miglior approssimazione libera, non una garanzia di match esatto.
