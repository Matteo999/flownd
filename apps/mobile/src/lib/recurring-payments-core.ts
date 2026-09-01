export type RecurringFrequency =
  | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly'
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
  weekly: 'Settimanale', biweekly: 'Ogni 2 settimane', monthly: 'Mensile',
  bimonthly: 'Bimestrale', quarterly: 'Trimestrale', semiannual: 'Semestrale', annual: 'Annuale',
};

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
