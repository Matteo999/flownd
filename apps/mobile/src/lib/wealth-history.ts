import type { ExpenseDraft } from '@/lib/onboarding';

export type NetWorthHistoryPoint = {
  date: Date;
  key: string;
  label: string;
  value: number;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function transactionEffect(transaction: ExpenseDraft) {
  return transaction.kind === 'income'
    ? transaction.amount
    : -transaction.amount;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function transactionMoment(transaction: ExpenseDraft, current: Date) {
  if (!transaction.occurredAt) return null;
  const storedDate = new Date(transaction.occurredAt);
  if (Number.isNaN(storedDate.getTime())) return null;

  const knownTime = transaction.occurredTime?.match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/,
  );
  if (knownTime) {
    storedDate.setHours(
      Number(knownTime[1]),
      Number(knownTime[2]),
      Number(knownTime[3] ?? 0),
      0,
    );
    return storedDate;
  }

  // Open Banking often supplies only a booking date. The legacy noon UTC
  // placeholder must not make a movement from today look like a future one:
  // the bank balance already includes it, so it belongs to today's closing
  // balance even when no real transaction time is available.
  const movementDay = startOfDay(storedDate);
  const currentDay = startOfDay(current);
  if (movementDay.getTime() === currentDay.getTime()) return new Date(current);
  return endOfDay(storedDate);
}

export function buildNetWorthHistory({
  currentNetWorth,
  financialAccountIds,
  transactions,
  now = new Date(),
  days = 30,
  pointCount = 7,
}: {
  currentNetWorth: number;
  financialAccountIds: string[];
  transactions: ExpenseDraft[];
  now?: Date;
  days?: number;
  pointCount?: number;
}): NetWorthHistoryPoint[] {
  const safePointCount = Math.max(2, pointCount);
  const current = new Date(now);
  const rangeStart = startOfDay(current);
  rangeStart.setDate(rangeStart.getDate() - days);
  const accountIds = new Set(financialAccountIds);
  const relevantTransactions = transactions.flatMap((transaction) => {
    if (transaction.internalTransfer) return [];
    if (transaction.bankStatus && transaction.bankStatus !== 'booked') return [];
    if (
      !transaction.financialAccountId ||
      !accountIds.has(transaction.financialAccountId)
    ) {
      return [];
    }
    const occurredAt = transactionMoment(transaction, current);
    if (
      !occurredAt ||
      occurredAt < rangeStart ||
      occurredAt > current
    ) {
      return [];
    }
    return [{ occurredAt, effect: transactionEffect(transaction) }];
  });

  return Array.from({ length: safePointCount }, (_, index) => {
    const isCurrent = index === safePointCount - 1;
    const date = isCurrent
      ? new Date(current)
      : new Date(rangeStart);
    if (!isCurrent) {
      date.setDate(
        rangeStart.getDate() +
          Math.round((days * index) / (safePointCount - 1)),
      );
      date.setHours(23, 59, 59, 999);
    }
    const movementsAfterPoint = relevantTransactions.reduce(
      (sum, transaction) =>
        transaction.occurredAt > date ? sum + transaction.effect : sum,
      0,
    );
    return {
      date,
      key: dateKey(date),
      label: new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'short',
      }).format(date),
      value: currentNetWorth - movementsAfterPoint,
    };
  });
}
