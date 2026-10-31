---
version: 1
slug: "src-pages-homepage-jsx"
primary_target: "src/pages/HomePage.jsx"
related_targets: ["src/pages/WaitlistConfirmPage.jsx"]
---

# Landing pubblica Flownd

Scope: home pubblica del sito (`/`), più la pagina di conferma email (`/lista-attesa/conferma`). Mode: Persuade.

Audience: persone 25–45 in Italia che non sanno con precisione dove vanno i soldi ogni mese. Job: capire in pochi secondi cosa fa Flownd e lasciare l'email.
Azione: iscrizione alla lista d'attesa (unica CTA; app non ancora negli store, nessuna data di lancio). Protezione: Cloudflare Turnstile verificato lato server, campo trappola, limite per IP, doppio opt-in via Resend.
Prova: interfaccia dell'app ricostruita in pagina con dati di esempio, senza etichette "esempio" visibili (scelta dell'utente). Open Banking presentato solo come "in arrivo". Nessun prezzo, cliente, numero di banche o metrica inventata.
Vincoli: Vercel Hobby a 12/12 funzioni → action `waitlist-*` dentro `/api/transaction-tools`.

## Direction contract

THESIS: la pagina parte dal disordine reale di un estratto conto e lo risolve in chiarezza: "dove sono finiti i soldi" è la prima cosa che si vede, non una promessa. Rifiuta l'hero diviso testo-a-sinistra/telefono-a-destra con fila di card sotto.
OWN-WORLD: il mondo dell'app. Fondo #F6F8F7 e bianco, inchiostro verde-antracite #16211D, un solo accento petrolio #256B7E per azione e selezione, positivo #2E8B6F, ambra #B98A2E per i Desideri. Manrope per tutto; le righe d'estratto in mono maiuscolo grigio chiaro sono l'unico secondo registro. Raggi 10/12/24, bordi #DCE3DF, nessun vetro, gradiente del logo solo nel marchio.
STORY: il visitatore riconosce il proprio estratto conto, vede le stesse righe trasformate in una classifica di categorie, poi scopre piano mensile, obiettivi e Coach, si fida grazie alla sezione privacy e lascia l'email.
FIRST VIEWPORT: muro di righe d'estratto a tutta pagina in tre colonne grigie; al centro una scheda bianca larga ~840px con titolo 60px "Dove sono finiti i soldi questo mese?", sottotitolo, classifica di 4 categorie a barre, campo email con pulsante petrolio dentro la scheda, visibile senza scroll anche a 1280×720. Barra di navigazione sospesa sopra il muro che, scorrendo, si allarga e si aggancia in testa.
FORM: "Dal movimento grezzo alla classifica", seconda della lista ordinata (indice 2), seed:d34c6d486f33092c. Interazione firma: passando su una categoria, le sue righe nel muro si accendono in petrolio e le altre si spengono; all'ingresso il muro si attenua mentre le barre crescono; il muro scorre lentissimo verso il basso come un estratto che si aggiorna. Sotto, le sezioni entrano allo scroll e la conversazione col Coach si scrive in sequenza.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
