import assert from 'node:assert/strict'
import test from 'node:test'

import { renderEmail } from './_email.js'

const base = {
  subject: 'Oggetto',
  preheader: 'Anteprima',
  title: 'Titolo',
  body: 'Testo',
  cta: { label: 'Apri', url: 'https://flownd.io/x?a=1&b=2' },
  footnote: 'Nota',
  assetBaseUrl: 'https://flownd.io',
}

test('il layout usa i loghi pubblici e un solo CTA ripetuto nel link di riserva', () => {
  const { html } = renderEmail(base)
  assert.ok(html.includes('https://flownd.io/email/lockup-chiaro.png'))
  assert.ok(html.includes('https://flownd.io/email/lockup-scuro.png'))
  assert.equal(html.match(/href="https:\/\/flownd\.io\/x\?a=1&amp;b=2"/g).length, 2)
  assert.ok(!html.includes('cid:'))
})

test('i testi vengono sempre escapati', () => {
  const { html, text } = renderEmail({ ...base, title: '<b>Casa & co</b>', detail: { label: 'Gruppo', value: '"x"' } })
  assert.ok(html.includes('&lt;b&gt;Casa &amp; co&lt;/b&gt;'))
  assert.ok(html.includes('&quot;x&quot;'))
  assert.ok(text.includes('<b>Casa & co</b>'))
})

test('il riquadro dettaglio compare solo se passato', () => {
  assert.ok(!renderEmail(base).html.includes('fl-detail" width'))
  assert.ok(renderEmail({ ...base, detail: { label: 'Gruppo', value: 'Casa' } }).html.includes('fl-detail" width'))
})

test('la variabile Go dei template Supabase resta intatta', () => {
  const { html } = renderEmail({ ...base, cta: { label: 'Conferma', url: '{{ .ConfirmationURL }}' } })
  assert.ok(html.includes('href="{{ .ConfirmationURL }}"'))
})
