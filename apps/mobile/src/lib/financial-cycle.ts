import type { ExpenseDraft } from '@/lib/onboarding';

export type BudgetRolloverMode = 'savings' | 'carry' | 'reset';

export type FinancialCycle = {
  start: Date;
  end: Date;
};

export function financialCycleForDate(
  date: Date,
  startDay: number,
): FinancialCycle {
  const safeStartDay = Math.min(28, Math.max(1, Math.round(startDay)));
  const start = new Date(
    date.getFullYear(),
    date.getMonth() - (date.getDate() < safeStartDay ? 1 : 0),
    safeStartDay,
  );
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, safeStartDay);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

export function previousFinancialCycle(cycle: FinancialCycle): FinancialCycle {
  const start = new Date(
    cycle.start.getFullYear(),
    cycle.start.getMonth() - 1,
    cycle.start.getDate(),
  );
  start.setHours(0, 0, 0, 0);
  return { start, end: new Date(cycle.start) };
}

export function transactionsForFinancialCycle(
  transactions: ExpenseDraft[],
  cycle: FinancialCycle,
) {
  return transactions.filter((transaction) => {
    if (!transaction.occurredAt) return false;
    const occurredAt = new Date(transaction.occurredAt);
    return (
      !Number.isNaN(occurredAt.getTime()) &&
      occurredAt >= cycle.start &&
      occurredAt < cycle.end
    );
  });
}

export function formatFinancialCycle(cycle: FinancialCycle) {
  const lastDay = new Date(cycle.end);
  lastDay.setDate(lastDay.getDate() - 1);
  const formatter = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
  });
  return `${formatter.format(cycle.start)} – ${formatter.format(lastDay)}`;
}
