export type RecurringFrequency =
  | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'fourweekly'
  | 'monthly' | 'bimonthly'
  | 'quarterly' | 'semiannual' | 'annual';
export type RecurringStatus = 'active' | 'paused' | 'dismissed' | 'completed';
export type RecurringSettlementMode = 'bank_match' | 'manual_post' | 'review';

export type RecurringSeries = {
  id: string;
  name: string;
  amount: number;
  direction: 'expense' | 'income';
  origin: 'detected' | 'manual' | 'loan';
  status: RecurringStatus;
  frequency: RecurringFrequency;
  category: string;
  anchorOn: string;
  nextDueOn: string;
  financialAccountId: string | null;
  settlementMode: RecurringSettlementMode;
  loanId: string | null;
};

export type RecurringSeriesDraft = Pick<
  RecurringSeries,
  'name' | 'amount' | 'direction' | 'frequency' | 'category' | 'nextDueOn' | 'financialAccountId'
>;

export type RecurringOccurrence = {
  id: string;
  recurringPaymentId: string;
  expectedDueOn: string;
  expectedAmount: number;
  status: 'projected' | 'matched' | 'materialized' | 'missed' | 'skipped';
};

export const frequencyLabels: Record<RecurringFrequency, string> = {
  daily: 'Ogni giorno', weekdays: 'Ogni giorno lavorativo',
  weekly: 'Ogni settimana', biweekly: 'Ogni 2 settimane', fourweekly: 'Ogni 4 settimane',
  monthly: 'Ogni mese', bimonthly: 'Ogni 2 mesi', quarterly: 'Ogni 3 mesi',
  semiannual: 'Ogni 6 mesi', annual: 'Ogni anno',
};

export function nextRecurringDate(
  value: string,
  frequency: RecurringFrequency,
  anchorDay?: number,
) {
  const current = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (frequency === 'daily') {
    current.setDate(current.getDate() + 1);
    return current.toISOString().slice(0, 10);
  }
  if (frequency === 'weekdays') {
    do current.setDate(current.getDate() + 1);
    while (current.getDay() === 0 || current.getDay() === 6);
    return current.toISOString().slice(0, 10);
  }
  if (['weekly', 'biweekly', 'fourweekly'].includes(frequency)) {
    const days = { weekly: 7, biweekly: 14, fourweekly: 28 }[frequency as 'weekly' | 'biweekly' | 'fourweekly'];
    current.setDate(current.getDate() + days);
    return current.toISOString().slice(0, 10);
  }
  const months = {
    monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
  }[frequency as 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'];
  const wantedDay = anchorDay ?? current.getDate();
  current.setDate(1);
  current.setMonth(current.getMonth() + months);
  const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  current.setDate(Math.min(wantedDay, lastDay));
  return current.toISOString().slice(0, 10);
}

export function nextFutureRecurringDate(value: string, frequency: RecurringFrequency) {
  const anchorDay = new Date(`${value.slice(0, 10)}T12:00:00`).getDate();
  const today = new Date().toISOString().slice(0, 10);
  let next = nextRecurringDate(value, frequency, anchorDay);
  while (next <= today) next = nextRecurringDate(next, frequency, anchorDay);
  return next;
}

export function significantUpcomingPayments(
  series: RecurringSeries[],
  monthlyBudget: number,
  today = new Date(),
) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  const upcoming = series.filter((item) => {
    if (item.status !== 'active') return false;
    const due = new Date(`${item.nextDueOn}T12:00:00`);
    return due >= start && due <= end;
  });
  const threshold = monthlyBudget > 0 ? monthlyBudget * 0.03 : 0;
  const dailyExpenses = upcoming.reduce<Record<string, number>>((totals, item) => {
    if (item.direction === 'expense') totals[item.nextDueOn] = (totals[item.nextDueOn] ?? 0) + item.amount;
    return totals;
  }, {});
  return upcoming.filter((item) => item.direction === 'income'
    || item.amount >= threshold || (dailyExpenses[item.nextDueOn] ?? 0) >= threshold);
}
