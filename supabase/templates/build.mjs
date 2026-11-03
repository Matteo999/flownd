// Genera i template di Supabase Auth con lo stesso layout delle email Resend.
// Uso: npm run emails:build, poi incolla oggetto e HTML in
// Supabase → Authentication → Email Templates.
import { writeFile } from 'node:fs/promises'

import { renderEmail } from '../../api/_email.js'

// Variabile Go che Supabase sostituisce con il link firmato.
const CONFIRMATION_URL = '{{ .ConfirmationURL }}'

const TEMPLATES = {
  // "Confirm signup": parte da register.tsx (supabase.auth.signUp)
  confirmation: {
    subject: 'Conferma il tuo account Flownd',
    preheader: 'Attiva l’account e inizia a dare un nome ai tuoi soldi.',
    title: 'Ti diamo il benvenuto in Flownd',
    body: 'Conferma il tuo indirizzo per attivare l’account. Poi ti aspetta il primo ciclo: entrate, budget e obiettivi, in pochi minuti.',
    cta: { label: 'Conferma l’account', url: CONFIRMATION_URL },
    footnote: 'Se non hai creato tu un account Flownd, ignora questa email: senza conferma l’account non viene attivato.',
  },
  // "Reset password": parte da login.tsx (supabase.auth.resetPasswordForEmail)
  recovery: {
    subject: 'Reimposta la password di Flownd',
    preheader: 'Il link vale per un’ora e si usa una volta sola.',
    title: 'Scegli una nuova password',
    body: 'Abbiamo ricevuto una richiesta per reimpostare la password del tuo account. Il link vale per un’ora e si può usare una sola volta.',
    cta: { label: 'Imposta nuova password', url: CONFIRMATION_URL },
    footnote: 'Non hai chiesto tu il cambio? Ignora questa email: la password resta quella di prima.',
  },
}

for (const [name, email] of Object.entries(TEMPLATES)) {
  const { html } = renderEmail(email)
  await writeFile(new URL(`./${name}.html`, import.meta.url), html)
  console.log(`supabase/templates/${name}.html  oggetto: ${email.subject}`)
}
