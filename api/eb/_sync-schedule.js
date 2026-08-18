const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const JITTER_WINDOW_MS = 30 * 60 * 1000

export function stableConnectionJitter(connectionId) {
  let hash = 2166136261
  for (const character of String(connectionId)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % JITTER_WINDOW_MS
}

export function nextAutomaticSyncAt(connectionId, from = new Date()) {
  return new Date(
    new Date(from).getTime()
      + SIX_HOURS_MS
      + stableConnectionJitter(connectionId),
  )
}
