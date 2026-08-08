import { enableBankingRequest } from './_client.js'
import {
  authenticateRequest,
  paidEntitlement,
  sendApiError,
} from './_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non supportato' })

  try {
    const { user, service } = await authenticateRequest(req)
    await paidEntitlement(service, user.id)
    const country = String(req.query.country || 'IT').toUpperCase()
    const data = await enableBankingRequest(
      `/aspsps?country=${encodeURIComponent(country)}`,
    )
    const banks = (data?.aspsps || [])
      .map((bank) => ({
        name: bank.name,
        country: bank.country || country,
        logo: bank.logo || null,
        psuTypes: bank.psu_types || ['personal'],
      }))
      .filter((bank) => bank.name)
      .sort((first, second) => first.name.localeCompare(second.name, 'it'))
    return res.status(200).json({ banks })
  } catch (error) {
    return sendApiError(res, error)
  }
}
