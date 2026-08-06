import type { GoalDraft } from '@/lib/onboarding';

export type GoalAllocationMode = 'priority' | 'percentage';

export type Goal = GoalDraft & {
  id: string;
  savedAmount: number;
  monthlyContribution: number;
  allocationPercentage: number;
  priority: number;
  status: 'active' | 'reached' | 'free_savings' | 'completed';
};

export type Loan = {
  id: string;
  name: string;
  financedAmount: number;
  downPayment: number;
  installmentCount: number;
  monthlyPayment: number;
  interestRate: number | null;
  startDate: string;
  finalBalloon: number | null;
};

export type LoanDraft = Omit<Loan, 'id' | 'monthlyPayment'> & {
  monthlyPayment?: number;
};

export type GoalNotice = {
  id: string;
  title: string;
  body: string;
};

export function calculateMonthlyPayment({
  financedAmount,
  downPayment,
  installmentCount,
  interestRate,
  finalBalloon,
}: LoanDraft) {
  const principal = Math.max(0, financedAmount - downPayment);
  if (!principal || installmentCount <= 0) return 0;
  const monthlyRate = (interestRate ?? 0) / 100 / 12;
  if (!monthlyRate) {
    return Math.max(0, principal - (finalBalloon ?? 0)) / installmentCount;
  }
  const factor = (1 + monthlyRate) ** installmentCount;
  const balloonPresentValue = (finalBalloon ?? 0) / factor;
  const amortizedPrincipal = Math.max(0, principal - balloonPresentValue);
  return amortizedPrincipal * ((monthlyRate * factor) / (factor - 1));
}

export function loanSustainability(
  monthlyPayment: number,
  monthlyIncome: number,
  availableNeeds: number,
) {
  const ratio = monthlyIncome > 0 ? monthlyPayment / monthlyIncome : 1;
  const level =
    monthlyPayment > availableNeeds || ratio > 0.4
      ? 'high'
      : ratio > 0.3
        ? 'medium'
        : 'low';
  return { ratio, level } as const;
}

export function addMonthsToDate(dateValue: string, months: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}
