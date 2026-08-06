import type { DashboardPeriod } from '@/providers/app-provider';
import type { ExpenseDraft } from '@/lib/onboarding';

export const HIDDEN_AMOUNT = '•••••';

export function isInPeriod(
  occurredAt: string | undefined,
  period: DashboardPeriod,
  now = new Date(),
) {
  if (!occurredAt) return period === 'month';
  const occurred = new Date(occurredAt);
  if (Number.isNaN(occurred.getTime())) return false;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
  } else if (period === 'month') {
    start.setDate(1);
  } else {
    start.setMonth(0, 1);
  }
  return occurred >= start && occurred <= now;
}

export function transactionsForPeriod(
  transactions: ExpenseDraft[],
  period: DashboardPeriod,
) {
  return transactions.filter((transaction) =>
    isInPeriod(transaction.occurredAt, period),
  );
}

export function isRecentSource(
  transactions: ExpenseDraft[],
  lastSyncedDates: (string | null)[],
  now = new Date(),
) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 35);
  return [
    ...transactions.map((transaction) => transaction.occurredAt),
    ...lastSyncedDates,
  ].some((value) => {
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  });
}

export function formatDueDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}
