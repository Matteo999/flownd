import { apiRequest } from '@/lib/api';

export * from './recurring-payments-core';

// Incrementare insieme a RECURRING_DETECTOR_VERSION lato API quando una modifica
// dell'algoritmo richiede un nuovo backfill dello storico.
export const RECURRING_DETECTION_VERSION = 3;

export async function refreshRecurringDetection(
  accessToken: string,
  options: { reason?: 'startup' | 'activity'; transactionId?: string } = {},
) {
  return apiRequest<{ detected: number; skipped: boolean }>(
    '/api/transaction-tools?action=recurring-refresh',
    accessToken,
    { body: options, timeoutMs: 30_000 },
  );
}
