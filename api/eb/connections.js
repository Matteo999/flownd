import {
  authenticateRequest,
  paidEntitlement,
  sendApiError,
} from './_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non supportato' })
  try {
    const { user, service } = await authenticateRequest(req)
    const entitlement = await paidEntitlement(service, user.id)
    const { data, error } = await service
      .from('open_banking_connections')
      .select('id,aspsp_name,aspsp_country,status,valid_until,last_synced_at,last_error')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return res.status(200).json({
      plan: entitlement.plan,
      maxConnections: entitlement.maxConnections,
      connections: data || [],
    })
  } catch (error) {
    return sendApiError(res, error)
  }
}
