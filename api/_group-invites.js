import { renderEmail } from './_email.js'
import { ApiError, authenticateRequest } from './eb/_supabase.js'

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
    const expirationDate = new Date(invite.expires_at).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const subject = `${inviterDisplayName} ti ha invitato in “${group.name}” su Flownd`
    const { html, text } = renderEmail({
      subject,
      preheader: 'Condividete budget, obiettivi e spese in un solo posto.',
      title: `Entra in ${group.name}`,
      body: `${inviterDisplayName} ti ha invitato a condividere budget, obiettivi e spese. Accedi con questa stessa email: troverai l’invito pronto nella sezione Famiglia.`,
      detail: { label: 'Gruppo', value: `${group.name} · invito da ${inviterDisplayName}` },
      cta: { label: 'Apri l’invito', url: deepLink },
      footnote: `L’invito scade il ${expirationDate}. Se non conosci chi te l’ha mandato, puoi ignorare questa email.`,
    })
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [invite.email], subject, text, html }),
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
