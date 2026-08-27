import { ApiError, authenticateRequest } from './eb/_supabase.js'
import { readFileSync } from 'node:fs'


const FLOWND_EMAIL_LOGO_PNG = readFileSync(
  new URL('../apps/mobile/assets/images/flownd-alpha.png', import.meta.url),
  'base64',
)

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

export default async function groupInviteHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  try {
    const { user, service } = await authenticateRequest(req)
    const inviteId = String(req.body?.inviteId || '')
    if (!inviteId) throw new ApiError(400, 'Invito mancante')
    const { data: invite, error: inviteError } = await service
      .from('group_invites')
      .select('id,email,status,expires_at,group_id,invited_by')
      .eq('id', inviteId)
      .single()
    if (inviteError || !invite) throw new ApiError(404, 'Invito non trovato')
    if (invite.invited_by !== user.id) throw new ApiError(403, 'Invito non autorizzato')
    if (invite.status !== 'pending' || new Date(invite.expires_at) <= new Date()) {
      throw new ApiError(409, 'Invito non più disponibile')
    }
    const { data: group, error: groupError } = await service
      .from('groups').select('name').eq('id', invite.group_id).single()
    if (groupError || !group) throw new ApiError(404, 'Gruppo non trovato')

    const resendKey = process.env.RESEND_API_KEY
    const from = process.env.GROUP_INVITE_FROM_EMAIL
    if (!resendKey || !from) {
      return res.status(202).json({ emailSent: false, reason: 'EMAIL_PROVIDER_NOT_CONFIGURED' })
    }
    const deepLink = process.env.FLOWND_GROUP_INVITE_URL || 'flownd://family'
    const inviterDisplayName = user.user_metadata?.full_name
      || user.user_metadata?.name
      || user.email
      || 'Un membro Flownd'
    const inviterName = escapeHtml(inviterDisplayName)
    const groupName = escapeHtml(group.name)
    const expirationDate = new Date(invite.expires_at).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [invite.email],
        subject: `Sei stato invitato nel gruppo ${group.name} su Flownd`,
        text: `${inviterDisplayName} ti ha invitato a partecipare al gruppo ${group.name} su Flownd. Accedi con questa email e apri ${deepLink}. L'invito scade il ${expirationDate}.`,
        attachments: [{
          content: FLOWND_EMAIL_LOGO_PNG,
          filename: 'flownd-logo.png',
          content_id: 'flownd-logo',
        }],
        html: [
          '<div style="display:none;max-height:0;overflow:hidden">Hai ricevuto un invito su Flownd.</div>',
          '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2f7;padding:32px 12px;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#16121f">',
          '<tr><td align="center">',
          '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e1ef;border-radius:24px;overflow:hidden">',
          '<tr><td style="padding:28px 32px 18px">',
          '<table role="presentation" cellspacing="0" cellpadding="0"><tr>',
          '<td><img src="cid:flownd-logo" width="132" height="28" alt="Flownd" style="display:block;border:0;width:132px;height:28px;object-fit:contain"></td>',
          '</tr></table>',
          '</td></tr>',
          '<tr><td style="padding:8px 32px 32px">',
          '<div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#f0e7ff;color:#7431d4;font-size:12px;font-weight:700">FAMIGLIA E CONDIVISIONE</div>',
          `<h1 style="margin:20px 0 12px;font-size:30px;line-height:1.15;letter-spacing:-0.9px">Entra in ${groupName}</h1>`,
          `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#5f5869"><strong style="color:#16121f">${inviterName}</strong> ti ha invitato a condividere budget, obiettivi e spese nel gruppo <strong style="color:#16121f">${groupName}</strong>.</p>`,
          '<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#746d7c">Accedi a Flownd con questa stessa email: troverai l’invito già pronto nella sezione Famiglia.</p>',
          `<a href="${escapeHtml(deepLink)}" style="display:inline-block;padding:14px 22px;background:#7431d4;color:#ffffff;text-decoration:none;border-radius:13px;font-size:15px;font-weight:700">Apri Flownd&nbsp;&nbsp;→</a>`,
          `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#918a99">L’invito scade il ${expirationDate}. Se non conosci il mittente, puoi ignorare questa email.</p>`,
          '</td></tr></table>',
          '<p style="margin:18px 0 0;font-size:11px;color:#918a99">Flownd · I tuoi soldi, finalmente chiari.</p>',
          '</td></tr></table>',
        ].join(''),
      }),
    })
    if (!emailResponse.ok) {
      console.error('Flownd group invite email failed', {
        status: emailResponse.status,
        body: (await emailResponse.text()).slice(0, 500),
      })
      return res.status(202).json({ emailSent: false, reason: 'EMAIL_DELIVERY_FAILED' })
    }
    return res.status(200).json({ emailSent: true })
  } catch (error) {
    const status = Number(error?.status) || 500
    if (status >= 500) console.error('Flownd group invitation failed', error)
    return res.status(status).json({
      error: status >= 500 ? 'Invio email temporaneamente non disponibile' : error.message,
    })
  }
}
