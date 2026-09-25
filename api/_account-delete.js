import { enableBankingRequest } from './eb/_client.js'
import { ApiError, authenticateRequest } from './eb/_supabase.js'

// Elimina definitivamente l'account dell'utente autenticato.
// Tutte le tabelle applicative referenziano auth.users con on delete cascade:
// qui revochiamo prima i consensi bancari presso il provider, poi eliminiamo
// l'utente da Supabase Auth.
export default async function accountDeleteHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo non supportato' })
  }
  try {
    const { user, service } = await authenticateRequest(req)
    if (req.body?.confirm !== true) throw new ApiError(400, 'Conferma mancante')

    const { data: connections, error: connectionsError } = await service
      .from('open_banking_connections')
      .select('id,provider_session_id')
      .eq('user_id', user.id)
      .eq('status', 'authorized')
    if (connectionsError) throw connectionsError

    for (const connection of connections || []) {
      try {
        await enableBankingRequest(
          `/sessions/${encodeURIComponent(connection.provider_session_id)}`,
          { method: 'DELETE' },
        )
      } catch (providerError) {
        if (![404, 410].includes(Number(providerError?.providerStatus))) {
          // Il consenso scade comunque lato banca: non blocchiamo la cancellazione.
          console.error('Flownd account delete: bank session revoke failed', {
            userId: user.id,
            connectionId: connection.id,
            status: providerError?.providerStatus || null,
          })
        }
      }
    }

    const { error: deleteError } = await service.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError
    return res.status(200).json({ deleted: true })
  } catch (error) {
    const status = Number(error?.status) || 500
    if (status >= 500) console.error('Flownd account delete failed', error)
    return res.status(status).json({
      error: status >= 500
        ? 'Non siamo riusciti a eliminare l’account. Riprova tra poco.'
        : error.message,
    })
  }
}
