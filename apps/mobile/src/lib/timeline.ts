import type { ExpenseDraft } from '@/lib/onboarding';
import type { DashboardPeriod } from '@/providers/app-provider';

export type TimelineBin = {
  key: string;
  label: string;
  income: number;
  expense: number;
};

export type TimelineGroup = {
  key: string;
  label: string;
  caption: string;
  total: number;
  transactions: ExpenseDraft[];
};

function transactionDate(transaction: ExpenseDraft) {
  const date = transaction.occurredAt
    ? new Date(transaction.occurredAt)
    : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addToBin(bin: TimelineBin, transaction: ExpenseDraft) {
  if (transaction.excludedFromTotals) return;
  if (transaction.kind === 'income') {
    bin.income += transaction.amount;
  } else {
    bin.expense += transaction.amount;
  }
}

export function summarizeTransactions(transactions: ExpenseDraft[]) {
  return transactions.reduce(
    (summary, transaction) => {
      if (transaction.excludedFromTotals) return summary;
      if (transaction.kind === 'income') {
        summary.income += transaction.amount;
      } else {
        summary.expense += transaction.amount;
      }
      summary.net = summary.income - summary.expense;
      return summary;
    },
    { income: 0, expense: 0, net: 0 },
  );
}

export function buildTimelineBins(
  transactions: ExpenseDraft[],
  period: DashboardPeriod,
  now = new Date(),
) {
  if (period === 'week') {
    const start = startOfWeek(now);
    const bins = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        key: dateKey(date),
        label: new Intl.DateTimeFormat('it-IT', { weekday: 'narrow' }).format(
          date,
        ),
        income: 0,
        expense: 0,
      };
    });
    const byKey = new Map(bins.map((bin) => [bin.key, bin]));
    transactions.forEach((transaction) => {
      const bin = byKey.get(dateKey(transactionDate(transaction)));
      if (bin) addToBin(bin, transaction);
    });
    return bins;
  }

  if (period === 'month') {
    const weeksInMonth = Math.ceil(now.getDate() / 7);
    const bins = Array.from({ length: weeksInMonth }, (_, index) => ({
      key: `week-${index}`,
      label: `${index * 7 + 1}–${Math.min((index + 1) * 7, now.getDate())}`,
      income: 0,
      expense: 0,
    }));
    transactions.forEach((transaction) => {
      const date = transactionDate(transaction);
      const index = Math.floor((date.getDate() - 1) / 7);
      const bin = bins[index];
      if (bin) addToBin(bin, transaction);
    });
    return bins;
  }

  const bins = Array.from({ length: 12 }, (_, month) => {
    const date = new Date(now.getFullYear(), month, 1);
    return {
      key: `month-${month}`,
      label: new Intl.DateTimeFormat('it-IT', { month: 'narrow' }).format(date),
      income: 0,
      expense: 0,
    };
  });
  transactions.forEach((transaction) => {
    const date = transactionDate(transaction);
    const bin = bins[date.getMonth()];
    if (bin) addToBin(bin, transaction);
  });
  return bins;
}

export function groupTimelineTransactions(
  transactions: ExpenseDraft[],
  period: DashboardPeriod,
  now = new Date(),
) {
  const groups = new Map<string, TimelineGroup>();
  const sorted = [...transactions].sort(
    (first, second) =>
      transactionDate(second).getTime() - transactionDate(first).getTime(),
  );

  sorted.forEach((transaction) => {
    const date = transactionDate(transaction);
    const groupDate = period === 'year' ? startOfWeek(date) : startOfDay(date);
    const key = dateKey(groupDate);
    const existing = groups.get(key);
    const signedAmount = transaction.excludedFromTotals
      ? 0
      : transaction.kind === 'income'
        ? transaction.amount
        : -transaction.amount;
    if (existing) {
      existing.transactions.push(transaction);
      existing.total += signedAmount;
      return;
    }

    if (period === 'year') {
      const end = new Date(groupDate);
      end.setDate(end.getDate() + 6);
      groups.set(key, {
        key,
        label: `Settimana ${new Intl.DateTimeFormat('it-IT', {
          day: 'numeric',
          month: 'short',
        }).format(groupDate)}–${new Intl.DateTimeFormat('it-IT', {
          day: 'numeric',
          month: 'short',
        }).format(end)}`,
        caption: `${dateKey(groupDate)} / ${dateKey(end)}`,
        total: signedAmount,
        transactions: [transaction],
      });
      return;
    }

    const today = dateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const label =
      key === today
        ? 'Oggi'
        : key === dateKey(yesterday)
          ? 'Ieri'
          : new Intl.DateTimeFormat('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(date);
    groups.set(key, {
      key,
      label,
      caption: new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date),
      total: signedAmount,
      transactions: [transaction],
    });
  });

  return Array.from(groups.values());
}
