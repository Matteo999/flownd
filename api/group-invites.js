import { ApiError, authenticateRequest } from './eb/_supabase.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default async function handler(req, res) {
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
      .from('groups')
      .select('name')
      .eq('id', invite.group_id)
      .single()
    if (groupError || !group) throw new ApiError(404, 'Gruppo non trovato')

    const resendKey = process.env.RESEND_API_KEY
    const from = process.env.GROUP_INVITE_FROM_EMAIL
    if (!resendKey || !from) {
      return res.status(202).json({
        emailSent: false,
        reason: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      })
    }

    const groupName = escapeHtml(group.name)
    const deepLink = process.env.FLOWND_GROUP_INVITE_URL || 'flownd://family'
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [invite.email],
        subject: `Sei stato invitato nel gruppo ${group.name} su Flownd`,
        html: [
          '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">',
          '<h1 style="font-size:24px">Invito su Flownd</h1>',
          `<p>Sei stato invitato a partecipare al gruppo <strong>${groupName}</strong>.</p>`,
          '<p>Accedi a Flownd usando questa stessa email per visualizzare e accettare l’invito.</p>',
          `<p><a href="${escapeHtml(deepLink)}" style="display:inline-block;padding:12px 18px;background:#147d6f;color:#fff;text-decoration:none;border-radius:10px">Apri Flownd</a></p>`,
          `<p style="color:#667;font-size:12px">L’invito scade il ${new Date(invite.expires_at).toLocaleDateString('it-IT')}.</p>`,
          '</div>',
        ].join(''),
      }),
    })
    if (!emailResponse.ok) {
      const providerBody = await emailResponse.text()
      console.error('Flownd group invite email failed', {
        status: emailResponse.status,
        body: providerBody.slice(0, 500),
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
