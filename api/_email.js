// Layout unico delle email Flownd: il guscio (logo, card, pulsante, link di
// riserva, footer) è fisso, ogni email passa solo i testi e il CTA. Usato sia
// dalle API su Resend sia per generare i template di Supabase Auth, quindi i
// loghi sono URL pubblici e non allegati cid: (Supabase non li supporta).

const LIGHT = {
  canvas: '#F6F8F7', card: '#FFFFFF', line: '#DCE3DF', ink: '#16211D',
  muted: '#5C6B64', detail: '#EDF1EF', accent: '#256B7E', onAccent: '#FFFFFF',
}
const DARK = {
  canvas: '#0F1712', card: '#17211C', line: '#26332C', ink: '#EAF1ED',
  muted: '#9AAAA2', detail: '#0B120E', accent: '#47B3D1', onAccent: '#0B120E',
}
const FONT = "Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
const PAYOFF = 'Flownd · I tuoi soldi, finalmente chiari.'

export function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

export function emailAssetBaseUrl() {
  return (process.env.PUBLIC_SITE_URL || 'https://www.flownd.io').replace(/\/+$/, '')
}

// I client che rispettano prefers-color-scheme (Apple Mail, Outlook app)
// passano al tema scuro; gli altri restano sugli stili inline chiari.
const DARK_STYLES = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.fl-canvas{background:${DARK.canvas}!important}
.fl-card{background:${DARK.card}!important;border-color:${DARK.line}!important}
.fl-ink{color:${DARK.ink}!important}
.fl-muted{color:${DARK.muted}!important}
.fl-detail{background:${DARK.detail}!important}
.fl-btn{background:${DARK.accent}!important}
.fl-btn a{color:${DARK.onAccent}!important}
.fl-link{color:${DARK.accent}!important}
.fl-rule{border-top-color:${DARK.line}!important}
.fl-on-light{display:none!important}
.fl-on-dark{display:block!important;max-height:none!important}
}`

function themedImage({ base, name, width, height, alt }) {
  const common = `width="${width}" height="${height}" alt="${alt}"`
  return `<img class="fl-on-light" src="${base}/email/${name}-chiaro.png" ${common} style="display:block;border:0;width:${width}px;height:${height}px">`
    + `<img class="fl-on-dark" src="${base}/email/${name}-scuro.png" ${common} style="display:none;max-height:0;border:0;width:${width}px;height:${height}px;mso-hide:all">`
}

/**
 * @param {object} email
 * @param {string} email.subject
 * @param {string} email.preheader  anteprima nella lista della inbox
 * @param {string} email.title
 * @param {string} email.body
 * @param {{label: string, value: string}} [email.detail]  riquadro opzionale
 * @param {{label: string, url: string}} email.cta
 * @param {string} email.footnote  scadenza e cosa fare se non è stato l'utente
 * @param {string} [email.assetBaseUrl]
 * @returns {{ html: string, text: string }}
 */
export function renderEmail({ subject, preheader, title, body, detail, cta, footnote, assetBaseUrl = emailAssetBaseUrl() }) {
  const p = LIGHT
  const url = escapeHtml(cta.url)
  const html = `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>${DARK_STYLES}</style>
</head>
<body class="fl-canvas" style="margin:0;padding:0;background:${p.canvas}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div>
<table role="presentation" class="fl-canvas" width="100%" cellspacing="0" cellpadding="0" style="background:${p.canvas};padding:32px 12px;font-family:${FONT};color:${p.ink}">
<tr><td align="center">
<table role="presentation" class="fl-card" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${p.card};border:1px solid ${p.line};border-radius:20px;border-collapse:separate">
<tr><td style="padding:28px 32px 0">${themedImage({ base: assetBaseUrl, name: 'lockup', width: 150, height: 28, alt: 'Flownd' })}</td></tr>
<tr><td style="padding:28px 32px 32px">
<h1 class="fl-ink" style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.6px;font-weight:800;color:${p.ink}">${escapeHtml(title)}</h1>
<p class="fl-muted" style="margin:0 0 ${detail ? 16 : 24}px;font-size:16px;line-height:1.6;color:${p.muted}">${escapeHtml(body)}</p>
${detail ? `<table role="presentation" class="fl-detail" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:${p.detail};border-radius:12px"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.5"><span class="fl-muted" style="color:${p.muted}">${escapeHtml(detail.label)}</span><br><strong class="fl-ink" style="color:${p.ink}">${escapeHtml(detail.value)}</strong></td></tr></table>` : ''}
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td class="fl-btn" bgcolor="${p.accent}" style="background:${p.accent};border-radius:12px">
<a href="${url}" style="display:inline-block;padding:14px 24px;color:${p.onAccent};text-decoration:none;font-size:15px;font-weight:700;border-radius:12px">${escapeHtml(cta.label)}</a>
</td></tr></table>
<p class="fl-muted" style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${p.muted}">Se il pulsante non funziona, copia questo link nel browser:<br><a class="fl-link" href="${url}" style="color:${p.accent};word-break:break-all">${url}</a></p>
<hr class="fl-rule" style="border:0;border-top:1px solid ${p.line};margin:24px 0 16px">
<p class="fl-muted" style="margin:0;font-size:12px;line-height:1.5;color:${p.muted}">${escapeHtml(footnote)}</p>
</td></tr></table>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px auto 0"><tr>
<td style="padding-right:8px;vertical-align:middle">${themedImage({ base: assetBaseUrl, name: 'marchio', width: 18, height: 18, alt: '' })}</td>
<td class="fl-muted" style="font-size:11px;color:${p.muted};vertical-align:middle">${PAYOFF}</td>
</tr></table>
</td></tr></table>
</body></html>`

  const text = [
    title,
    body,
    detail ? `${detail.label}: ${detail.value}` : null,
    `${cta.label}: ${cta.url}`,
    footnote,
    `— ${PAYOFF}`,
  ].filter(Boolean).join('\n\n')

  return { html, text }
}
