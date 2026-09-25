import type { GoalAllocationMode, Goal, GoalNotice, Loan } from '@/lib/goals';
import type { BudgetRolloverMode } from '@/lib/financial-cycle';
import {
  type BudgetCategory,
  type BudgetGroupKey,
  type ExpenseDraft,
  type IncomeBandId,
  incomeReferenceForBand,
} from '@/lib/onboarding';
import type { RecurringSeries } from '@/lib/recurring-payments';
import { supabase } from '@/lib/supabase';
import {
  incomeTreatmentForCategory,
  normalizeTransactionCategory,
} from '@/lib/transaction-categories';
import { transactionFingerprint } from '@/lib/transaction-import';

// Lettura e mappatura dei dati utente da Supabase, senza stato React.
// L'AppProvider decide quando caricarli e come applicarli allo stato.

export type FinancialAccount = {
  id: string;
  name: string;
  balance: number;
  previousMonthBalance: number | null;
  source: 'open_banking' | 'manual';
  accountKind: 'bank' | 'manual_bank' | 'cash_wallet';
  balanceAsOf: string | null;
  openingBalance: number;
  openingBalanceAsOf: string | null;
  lastSyncedAt: string | null;
  institutionName: string | null;
  currency: string;
};

export type CoachInsight = {
  id: string;
  title: string;
  body: string;
};

export type GoalContributionSummary = {
  goalId: string | null;
  amount: number;
  createdAt: string;
};

type TransactionHistoryRow = {
  id: string;
  description: string;
  amount: number | string;
  category: string;
  occurred_at: string;
  occurred_time: string | null;
  occurred_time_source: string | null;
  source: string;
  kind: string | null;
  financial_account_id: string | null;
  bank_status: string | null;
  excluded_from_totals: boolean | null;
  internal_transfer: boolean | null;
  excluded_from_budget: boolean | null;
  income_type: string | null;
  raw_description: string | null;
  merchant_name: string | null;
  counterparty_name: string | null;
  import_memo: string | null;
  import_reference: string | null;
  import_confidence: number | string | null;
  recurring_payment_id: string | null;
  recurring_occurrence_id: string | null;
};

async function fetchTransactionHistory(userId: string) {
  const rows: TransactionHistoryRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,description,amount,category,occurred_at,occurred_time,occurred_time_source,source,kind,financial_account_id,bank_status,excluded_from_totals,internal_transfer,excluded_from_budget,income_type,raw_description,merchant_name,counterparty_name,import_memo,import_reference,import_confidence,recurring_payment_id,recurring_occurrence_id')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as TransactionHistoryRow[]));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}

// Normalizza sorgente, categoria e trattamento entrate come fa il salvataggio
// singolo, così import singolo e in blocco producono righe identiche.
export function normalizeTransactionDraft(transaction: ExpenseDraft) {
  const occurredAt = transaction.occurredAt ?? new Date().toISOString();
  const kind = transaction.kind ?? 'expense';
  const source = ['file_import', 'ai_scan'].includes(transaction.source ?? '')
    ? transaction.source
    : 'manual';
  const category = normalizeTransactionCategory(transaction.category, kind);
  const incomeTreatment =
    kind === 'income' || category === 'Giroconto'
      ? incomeTreatmentForCategory(category)
      : null;
  return { occurredAt, kind, source, category, incomeTreatment };
}

export function transactionInsertPayload(userId: string, transaction: ExpenseDraft) {
  const { occurredAt, kind, source, category, incomeTreatment } =
    normalizeTransactionDraft(transaction);
  return {
    user_id: userId,
    description: transaction.description.trim(),
    amount: transaction.amount,
    category,
    source,
    kind,
    income_type: incomeTreatment?.incomeType ?? null,
    excluded_from_budget: incomeTreatment?.excludedFromBudget ?? false,
    internal_transfer: incomeTreatment?.incomeType === 'internal_transfer',
    excluded_from_totals: incomeTreatment?.incomeType === 'internal_transfer',
    occurred_at: occurredAt,
    occurred_time: transaction.occurredTime ?? null,
    occurred_time_source: transaction.occurredTimeSource ?? null,
    financial_account_id: null,
    ...(source !== 'manual'
      ? {
          import_fingerprint: transaction.forceImportDuplicate
            ? null
            : transactionFingerprint({
                ...transaction,
                occurredAt,
                kind,
              }),
          raw_description: transaction.rawDescription ?? transaction.description,
          merchant_name: transaction.merchantName ?? null,
          counterparty_name: transaction.counterpartyName ?? null,
          import_memo: transaction.memo ?? null,
          import_reference: transaction.bankReference ?? null,
          import_confidence: transaction.importConfidence ?? null,
        }
      : {}),
  };
}

export type CoreUserData = {
  transactions: ExpenseDraft[];
  budgets: BudgetCategory[];
  allocation: Partial<Record<BudgetGroupKey, number>>;
  goals: Goal[];
  completedGoals: Goal[];
  goalContributions: GoalContributionSummary[];
  goalAllocationMode: GoalAllocationMode;
  planTier: 'free' | 'pro' | 'max';
  budgetCycleStartDay: number;
  budgetRolloverMode: BudgetRolloverMode;
  incomeBand: IncomeBandId | null;
  plannedMonthlyIncome: number;
  loans: Loan[];
  goalNotice: GoalNotice | null;
  groupMonthlyAllocation: number;
  previousGroupMonthlyAllocation: number;
  groupPersonalCarryIn: number;
};

export type SecondaryUserData = {
  financialAccounts: FinancialAccount[];
  recurringPayments: RecurringSeries[];
  coachInsight: CoachInsight | null;
};

// Dati necessari al primo render (budget, movimenti, obiettivi, profilo).
// Restituisce null se una delle letture essenziali fallisce.
export async function fetchCoreUserData(userId: string): Promise<CoreUserData | null> {
  const contributionHistoryStart = new Date();
  contributionHistoryStart.setFullYear(contributionHistoryStart.getFullYear() - 1);
  contributionHistoryStart.setHours(0, 0, 0, 0);
  const [
    budgetsResult,
    goalsResult,
    completedGoalsResult,
    transactionResult,
    goalSettingsResult,
    loansResult,
    goalNoticeResult,
    goalContributionsResult,
    groupAllocationResult,
    groupTransactionLinksResult,
  ] = await Promise.all([
    supabase
      .from('budget_categories')
      .select('category_key,name,emoji,monthly_limit,allocation_percentage,parent_key,parent_category_key,budget_enabled,is_macro')
      .eq('user_id', userId)
      .order('created_at'),
    supabase
      .from('goals')
      .select('id,name,target_amount,saved_amount,deadline_label,monthly_contribution,allocation_percentage,priority,status')
      .eq('user_id', userId)
      .is('group_id', null)
      .eq('active', true)
      .order('priority')
      .order('created_at'),
    supabase
      .from('goals')
      .select('id,name,target_amount,saved_amount,deadline_label,monthly_contribution,allocation_percentage,priority,status')
      .eq('user_id', userId)
      .is('group_id', null)
      .eq('active', false)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('completed_at', { ascending: false }),
    fetchTransactionHistory(userId),
    supabase
      .from('profiles')
      .select('goal_allocation_mode,plan_tier,budget_cycle_start_day,budget_rollover_mode,planned_monthly_income,income_band')
      .eq('id', userId)
      .single(),
    supabase
      .from('loans')
      .select('id,name,financed_amount,down_payment,installment_count,monthly_payment,interest_rate,start_date,final_balloon')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('goal_notifications')
      .select('id,title,body')
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('goal_contributions')
      .select('goal_id,amount,occurred_at')
      .eq('user_id', userId)
      .is('group_id', null)
      .gte('occurred_at', contributionHistoryStart.toISOString())
      .order('occurred_at', { ascending: false }),
    supabase.rpc('my_group_allocation_summary'),
    supabase.rpc('my_group_transaction_links'),
  ]);

  if (
    budgetsResult.error ||
    goalsResult.error ||
    completedGoalsResult.error ||
    transactionResult.error ||
    goalSettingsResult.error ||
    loansResult.error ||
    goalNoticeResult.error ||
    goalContributionsResult.error
  ) {
    return null;
  }

  if (__DEV__ && groupAllocationResult.error) {
    console.warn(
      'Flownd group allocation is unavailable; personal budget will use the full amount.',
      groupAllocationResult.error,
    );
  }
  if (__DEV__ && groupTransactionLinksResult.error) {
    console.warn(
      'Flownd group transaction links are unavailable; personal transactions remain visible.',
      groupTransactionLinksResult.error,
    );
  }

  const groupTransactionIds = new Map(
    ((groupTransactionLinksResult.data ?? []) as {
      transaction_id: string;
      group_id: string;
    }[]).map((item) => [item.transaction_id, item.group_id]),
  );
  const monthlyTransactions = (transactionResult.data ?? []).map((item) => ({
    id: item.id,
    description: item.description,
    amount: Number(item.amount),
    category: item.category,
    occurredAt: item.occurred_at,
    occurredTime: item.occurred_time,
    occurredTimeSource: item.occurred_time_source as ExpenseDraft['occurredTimeSource'],
    source: item.source,
    kind: (item.kind ?? 'expense') as ExpenseDraft['kind'],
    financialAccountId: item.financial_account_id,
    bankStatus: item.bank_status,
    excludedFromTotals: Boolean(item.excluded_from_totals),
    internalTransfer: Boolean(item.internal_transfer),
    excludedFromBudget: Boolean(item.excluded_from_budget) || groupTransactionIds.has(item.id),
    groupId: groupTransactionIds.get(item.id) ?? null,
    incomeType: item.income_type as ExpenseDraft['incomeType'],
    rawDescription: item.raw_description,
    merchantName: item.merchant_name,
    counterpartyName: item.counterparty_name,
    memo: item.import_memo,
    bankReference: item.import_reference,
    importConfidence:
        item.import_confidence == null ? null : Number(item.import_confidence),
    recurringPaymentId: item.recurring_payment_id,
    recurringOccurrenceId: item.recurring_occurrence_id,
    isRecurring: Boolean(item.recurring_payment_id),
  }));
  const incomeBand = goalSettingsResult.data.income_band as IncomeBandId | null;
  const plannedMonthlyIncome = Number(
    goalSettingsResult.data.planned_monthly_income
    ?? incomeReferenceForBand(incomeBand),
  );
  const hydratedBudgets: BudgetCategory[] = (budgetsResult.data ?? []).map(
    (item) => ({
      id: item.category_key,
      name: item.name,
      emoji: item.emoji ?? '◦',
      amount: Number(item.monthly_limit),
      percentage: Number(item.allocation_percentage),
      selected: true,
      parentId: item.parent_key as BudgetGroupKey | undefined,
      parentCategoryId: item.parent_category_key,
      budgetEnabled: item.budget_enabled !== false,
      isMacro: Boolean(item.is_macro),
    }),
  );
  const hydratedAllocation = (group: BudgetGroupKey) =>
    hydratedBudgets.find((item) => item.isMacro && item.parentId === group)
      ?.percentage;
  const hydratedGoals: Goal[] = (goalsResult.data ?? []).map((goal) => ({
    id: goal.id,
    name: goal.name,
    targetAmount: Number(goal.target_amount),
    savedAmount: Number(goal.saved_amount),
    deadline: goal.deadline_label ?? '',
    monthlyContribution: Number(goal.monthly_contribution),
    allocationPercentage: Number(goal.allocation_percentage),
    priority: Number(goal.priority),
    status: goal.status as Goal['status'],
  }));
  const hydratedCompletedGoals: Goal[] = (completedGoalsResult.data ?? []).map(
    (goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: Number(goal.target_amount),
      savedAmount: Number(goal.saved_amount),
      deadline: goal.deadline_label ?? '',
      monthlyContribution: Number(goal.monthly_contribution),
      allocationPercentage: Number(goal.allocation_percentage),
      priority: Number(goal.priority),
      status: goal.status as Goal['status'],
    }),
  );
  const groupAllocation = groupAllocationResult.error
    ? null
    : groupAllocationResult.data as Record<string, unknown> | null;
  const allocation: CoreUserData['allocation'] = {};
  (['needs', 'wants', 'savings'] as const).forEach((group) => {
    const percentage = hydratedAllocation(group);
    if (percentage != null) allocation[group] = percentage;
  });

  return {
    transactions: monthlyTransactions,
    budgets: hydratedBudgets,
    allocation,
    goals: hydratedGoals,
    completedGoals: hydratedCompletedGoals,
    goalContributions: (goalContributionsResult.data ?? []).map((contribution) => ({
      goalId: contribution.goal_id,
      amount: Number(contribution.amount),
      createdAt: contribution.occurred_at,
    })),
    goalAllocationMode: goalSettingsResult.data.goal_allocation_mode as GoalAllocationMode,
    planTier: goalSettingsResult.data.plan_tier as 'free' | 'pro' | 'max',
    budgetCycleStartDay: Number(goalSettingsResult.data.budget_cycle_start_day) || 1,
    budgetRolloverMode:
      goalSettingsResult.data.budget_rollover_mode === 'carry' ? 'carry' : 'savings',
    incomeBand,
    plannedMonthlyIncome,
    loans: (loansResult.data ?? []).map((loan) => ({
      id: loan.id,
      name: loan.name,
      financedAmount: Number(loan.financed_amount),
      downPayment: Number(loan.down_payment),
      installmentCount: Number(loan.installment_count),
      monthlyPayment: Number(loan.monthly_payment),
      interestRate: loan.interest_rate == null ? null : Number(loan.interest_rate),
      startDate: loan.start_date,
      finalBalloon: loan.final_balloon == null ? null : Number(loan.final_balloon),
    })),
    goalNotice: goalNoticeResult.data ?? null,
    groupMonthlyAllocation: Number(groupAllocation?.allocatedToGroups ?? 0),
    previousGroupMonthlyAllocation: Number(groupAllocation?.previousAllocatedToGroups ?? 0),
    groupPersonalCarryIn: Number(groupAllocation?.personalCarryIn ?? 0),
  };
}

// Dati caricati dopo il primo render: conti, ricorrenze, insight del Coach.
export async function fetchSecondaryUserData(userId: string): Promise<SecondaryUserData> {
  const [accountsResult, paymentsResult, insightResult] = await Promise.all([
    supabase
      .from('financial_accounts')
      .select('id,name,current_balance,opening_balance,opening_balance_as_of,previous_month_balance,source,account_kind,balance_as_of,last_synced_at,institution_name,currency')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at'),
    supabase
      .from('recurring_payments')
      .select('id,name,amount,next_due_on,series_type,direction,origin,status,frequency,category,anchor_on,financial_account_id,settlement_mode,loan_id')
      .eq('user_id', userId)
      .in('status', ['active', 'paused'])
      .order('next_due_on'),
    supabase
      .from('coach_insights')
      .select('id,title,body')
      .eq('user_id', userId)
      .eq('active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const financialAccounts: FinancialAccount[] = (accountsResult.data ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    balance: Number(account.current_balance),
    previousMonthBalance:
      account.previous_month_balance == null
        ? null
        : Number(account.previous_month_balance),
    source: account.source as FinancialAccount['source'],
    accountKind: account.account_kind as FinancialAccount['accountKind'],
    balanceAsOf: account.balance_as_of,
    openingBalance: Number(account.opening_balance ?? 0),
    openingBalanceAsOf: account.opening_balance_as_of,
    lastSyncedAt: account.last_synced_at,
    institutionName: account.institution_name,
    currency: account.currency,
  }));
  const hydratedRecurringPayments: RecurringSeries[] = (paymentsResult.data ?? []).map((payment) => ({
    id: payment.id,
    name: payment.name,
    amount: Number(payment.amount),
    direction: payment.direction as RecurringSeries['direction'],
    origin: payment.origin as RecurringSeries['origin'],
    status: payment.status as RecurringSeries['status'],
    frequency: payment.frequency as RecurringSeries['frequency'],
    category: payment.category,
    anchorOn: payment.anchor_on,
    nextDueOn: payment.next_due_on,
    financialAccountId: payment.financial_account_id,
    settlementMode: payment.settlement_mode as RecurringSeries['settlementMode'],
    loanId: payment.loan_id,
  }));
  return {
    financialAccounts,
    recurringPayments: hydratedRecurringPayments,
    coachInsight: insightResult.data
      ? {
          id: insightResult.data.id,
          title: insightResult.data.title,
          body: insightResult.data.body,
        }
      : null,
  };
}
