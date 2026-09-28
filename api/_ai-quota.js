import { ApiError, serviceClient } from './eb/_supabase.js'

// Limiti per funzione AI e piano. Le quote settimanali/mensili valgono per il
// "pool": l'utente, oppure il proprietario Max per chi usa il piano condiviso
// (quote comuni al gruppo). Giornaliero e al minuto restano per singolo utente.
// null = funzione non inclusa nel piano.
export const AI_LIMITS = {
  coach: {
    free: { weekly: 1, daily: 1, minute: 6 },
    pro: { monthly: 60, daily: 10, minute: 6 },
    max: { monthly: 120, daily: 10, minute: 6 },
  },
  scan: {
    free: null,
    pro: { monthly: 20, daily: 10, minute: 6 },
    max: { monthly: 40, daily: 10, minute: 6 },
  },
  import: {
    free: null,
    pro: { monthly: 4, daily: 4, minute: 3 },
    max: { monthly: 8, daily: 4, minute: 3 },
  },
}

const FEATURE_LABELS = {
  coach: 'domande al Coach',
  scan: 'scansioni con l’AI',
  import: 'importazioni di file',
}

export function aiLimitsFor(feature, tier) {
  const byTier = AI_LIMITS[feature]
  if (!byTier) throw new Error(`Funzione AI sconosciuta: ${feature}`)
  const normalizedTier = ['pro', 'max'].includes(tier) ? tier : 'free'
  return byTier[normalizedTier] ?? null
}

export function quotaDeniedMessage(feature, reason, tier) {
  const label = FEATURE_LABELS[feature]
  if (reason === 'minute') return 'Stai facendo molte richieste in poco tempo. Attendi un minuto e riprova.'
  if (reason === 'daily') return `Hai raggiunto il limite giornaliero di ${label}. Riprova domani.`
  if (reason === 'weekly') {
    return tier === 'free'
      ? `Con il piano Free hai 1 domanda al Coach a settimana. Torna lunedì o passa a Pro per continuare.`
      : `Hai raggiunto il limite settimanale di ${label}.`
  }
  return tier === 'max'
    ? `Il gruppo ha esaurito le ${label} incluse questo mese. Si rinnovano il 1° del mese.`
    : `Hai esaurito le ${label} incluse questo mese. Si rinnovano il 1° del mese; con Max la quota raddoppia.`
}

// Verifica e consuma una unità di quota. Lancia ApiError 403 se la funzione non
// è inclusa nel piano, 429 se la quota è esaurita.
export async function consumeAiQuota(userId, feature, service = serviceClient()) {
  const { data: pool, error: poolError } = await service.rpc('ai_quota_pool', { p_user_id: userId })
  if (poolError) throw poolError
  const tier = pool?.tier || 'free'
  const limits = aiLimitsFor(feature, tier)
  if (!limits) {
    throw new ApiError(403, 'Questa funzione è disponibile con i piani Pro e Max.', 'PAID_PLAN_REQUIRED')
  }
  const { data, error } = await service.rpc('consume_ai_quota', {
    p_user_id: userId,
    p_pool_id: pool?.pool_id || userId,
    p_feature: feature,
    p_user_daily: limits.daily ?? null,
    p_user_minute: limits.minute ?? null,
    p_pool_weekly: limits.weekly ?? null,
    p_pool_monthly: limits.monthly ?? null,
  })
  if (error) throw error
  if (!data?.allowed) {
    throw new ApiError(
      429,
      quotaDeniedMessage(feature, data?.reason, tier),
      `AI_QUOTA_${String(data?.reason || 'monthly').toUpperCase()}`,
    )
  }
  return { tier, monthlyRemaining: data.monthly_remaining ?? null }
}
