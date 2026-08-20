const SIX_HOURS_MS = 6 * 60 * 60 * 1000

export function nextAutomaticSyncAt(_connectionId, from = new Date()) {
  return new Date(new Date(from).getTime() + SIX_HOURS_MS)
}
