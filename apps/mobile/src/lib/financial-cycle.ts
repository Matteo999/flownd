import type { ExpenseDraft } from '@/lib/onboarding';

export type BudgetRolloverMode = 'savings' | 'carry' | 'reset';

export type FinancialCycle = {
  start: Date;
  end: Date;
};

// Covers weekends, public holidays and common December payroll advances while
// keeping the configured day as the stable monthly anchor.
const EARLY_SALARY_WINDOW_DAYS = 10;

function nominalBoundary(year: number, month: number, startDay: number) {
  const boundary = new Date(year, month, startDay);
  boundary.setHours(0, 0, 0, 0);
  return boundary;
}

function isSalary(transaction: ExpenseDraft) {
  return transaction.kind === 'income' && (
    transaction.incomeType === 'salary' || transaction.category === 'Stipendio'
  );
}

function effectiveBoundary(
  boundary: Date,
  transactions: ExpenseDraft[],
) {
  const earliest = new Date(boundary);
  earliest.setDate(earliest.getDate() - EARLY_SALARY_WINDOW_DAYS);
  const salary = transactions
    .filter(isSalary)
    .map((transaction) => new Date(transaction.occurredAt ?? ''))
    .filter((occurredAt) => (
      !Number.isNaN(occurredAt.getTime()) &&
      occurredAt >= earliest &&
      occurredAt < boundary
    ))
    .sort((first, second) => second.getTime() - first.getTime())[0];
  if (!salary) return boundary;
  salary.setHours(0, 0, 0, 0);
  return salary;
}

export function financialCycleForDate(
  date: Date,
  startDay: number,
  transactions: ExpenseDraft[] = [],
): FinancialCycle {
  const safeStartDay = Math.min(28, Math.max(1, Math.round(startDay)));
  const boundaries = Array.from({ length: 5 }, (_, index) => {
    const monthOffset = index - 2;
    const nominal = nominalBoundary(
      date.getFullYear(),
      date.getMonth() + monthOffset,
      safeStartDay,
    );
    return effectiveBoundary(nominal, transactions);
  }).sort((first, second) => first.getTime() - second.getTime());
  const startIndex = Math.max(
    0,
    boundaries.findLastIndex((boundary) => boundary <= date),
  );
  return {
    start: boundaries[startIndex],
    end: boundaries[startIndex + 1] ?? nominalBoundary(
      boundaries[startIndex].getFullYear(),
      boundaries[startIndex].getMonth() + 1,
      safeStartDay,
    ),
  };
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

export function incomeCandidatesForFinancialCycle(
  transactions: ExpenseDraft[],
  cycle: FinancialCycle,
) {
  return transactions.filter((transaction) => {
    if (transaction.kind !== 'income' || !transaction.occurredAt) {
      return false;
    }
    const occurredAt = new Date(transaction.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return false;
    return occurredAt >= cycle.start && occurredAt < cycle.end;
  });
}

export function budgetIncomeForFinancialCycle(
  transactions: ExpenseDraft[],
  cycle: FinancialCycle,
) {
  return incomeCandidatesForFinancialCycle(transactions, cycle).filter(
    (transaction) => !transaction.excludedFromBudget,
  );
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
