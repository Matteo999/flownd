import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  BudgetCategory,
  BudgetGroupKey,
  ExpenseDraft,
  IncomeBandId,
  incomeReferenceForBand,
  initialDraft,
  materializeBudgetAmounts,
  OnboardingDraft,
  updateAllocation,
} from '@/lib/onboarding';
import {
  calculateMonthlyPayment,
  type Goal,
  type GoalAllocationMode,
  type GoalNotice,
  type Loan,
  type LoanDraft,
} from '@/lib/goals';
import { supabase } from '@/lib/supabase';
import {
  GENERIC_OPERATION_ERROR,
  reportClientError,
  transactionFingerprint,
} from '@/lib/transaction-import';
import {
  incomeTreatmentForCategory,
  normalizeTransactionCategory,
} from '@/lib/transaction-categories';
import {
  type BudgetRolloverMode,
  financialCycleForDate,
  budgetIncomeForFinancialCycle,
  incomeCandidatesForFinancialCycle,
} from '@/lib/financial-cycle';
import {
  type RecurringSeries,
  type RecurringSeriesDraft,
  type RecurringStatus,
  RECURRING_DETECTION_VERSION,
  refreshRecurringDetection,
} from '@/lib/recurring-payments';

export type TransactionUpdate = {
  description: string;
  amount: number;
  category: string;
  kind: 'expense' | 'income';
  occurredAt: string;
  rememberSimilar?: boolean;
};

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

export type ManualFinancialAccountDraft = {
  name: string;
  balance: number;
  accountKind: 'manual_bank' | 'cash_wallet';
  balanceAsOf: string;
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

function isTransientBudgetSaveError(error: { message?: string; details?: string }) {
  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLocaleLowerCase('en');
  return (
    message.includes('network connection was lost') ||
    message.includes('fetch failed') ||
    message.includes('network request failed') ||
    message.includes('timeout')
  );
}

type AppContextValue = {
  session: Session | null;
  loading: boolean;
  saving: boolean;
  onboardingComplete: boolean;
  firstDashboardVisit: boolean;
  draft: OnboardingDraft;
  transactions: ExpenseDraft[];
  goals: Goal[];
  completedGoals: Goal[];
  goalContributions: GoalContributionSummary[];
  loans: Loan[];
  goalAllocationMode: GoalAllocationMode;
  goalNotice: GoalNotice | null;
  planTier: 'free' | 'pro' | 'max';
  financialAccounts: FinancialAccount[];
  recurringPayments: RecurringSeries[];
  coachInsight: CoachInsight | null;
  amountsVisible: boolean;
  budgetCycleStartDay: number;
  budgetRolloverMode: BudgetRolloverMode;
  budgetMonthlyIncome: number;
  error: string | null;
  updateDraft: (next: Partial<OnboardingDraft>) => void;
  completeOnboarding: () => Promise<boolean>;
  addTransaction: (transaction: ExpenseDraft) => Promise<boolean>;
  updateTransaction: (
    transactionId: string,
    transaction: TransactionUpdate,
  ) => Promise<boolean>;
  createRecurringPayment: (draft: RecurringSeriesDraft) => Promise<string | null>;
  createRecurringFromTransaction: (
    transactionId: string,
    draft: RecurringSeriesDraft,
  ) => Promise<string | null>;
  updateRecurringPayment: (id: string, draft: RecurringSeriesDraft) => Promise<boolean>;
  setRecurringPaymentStatus: (id: string, status: RecurringStatus) => Promise<boolean>;
  deleteRecurringPayment: (id: string, deleteManualTransactions?: boolean) => Promise<boolean>;
  unlinkTransactionFromRecurring: (transactionId: string) => Promise<boolean>;
  createManualFinancialAccount: (
    account: ManualFinancialAccountDraft,
  ) => Promise<string | null>;
  updateManualFinancialAccountOpeningBalance: (
    accountId: string,
    balance: number,
  ) => Promise<boolean>;
  deleteManualFinancialAccount: (accountId: string) => Promise<boolean>;
  categorizeTransactions: (
    transactionIds: string[],
    category: string,
    rememberSimilar: boolean,
  ) => Promise<boolean>;
  deleteTransaction: (transactionId: string) => Promise<boolean>;
  setTransactionBudgetInclusion: (
    transactionId: string,
    included: boolean,
  ) => Promise<boolean>;
  createGoal: (goal: OnboardingDraft['goal']) => Promise<boolean>;
  updateGoal: (
    goalId: string | null,
    changes: Partial<OnboardingDraft['goal']>,
  ) => Promise<boolean>;
  deleteGoal: (goalId: string) => Promise<boolean>;
  setGoalAllocationMode: (mode: GoalAllocationMode) => Promise<boolean>;
  moveGoal: (goalId: string, direction: -1 | 1) => Promise<boolean>;
  addGoalContribution: (
    amount: number,
    goalId?: string | null,
  ) => Promise<boolean>;
  transferFreeSavingsToGoal: (
    amount: number,
    goalId: string,
  ) => Promise<boolean>;
  deleteGoalContribution: (contributionId: string) => Promise<boolean>;
  completeGoal: (goalId: string) => Promise<boolean>;
  createLoan: (loan: LoanDraft, financialAccountId?: string | null) => Promise<boolean>;
  dismissGoalNotice: (noticeId: string) => Promise<void>;
  updateBudgetAmount: (id: string, amount: number) => Promise<boolean>;
  saveBudgetAllocations: (
    budgets: BudgetCategory[],
    plannedMonthlyIncome: number,
  ) => Promise<boolean>;
  createBudgetSubcategory: (
    parentId: BudgetGroupKey,
    name: string,
    parentCategoryId?: string | null,
  ) => Promise<BudgetCategory | null>;
  deleteBudgetSubcategory: (categoryId: string) => Promise<boolean>;
  updateBudgetCycleSettings: (
    startDay: number,
    rolloverMode: BudgetRolloverMode,
  ) => Promise<boolean>;
  dismissFirstVisit: () => void;
  toggleAmountsVisible: () => Promise<void>;
  clearError: () => void;
  refreshData: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

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

export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [firstDashboardVisit, setFirstDashboardVisit] = useState(false);
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft);
  const [transactions, setTransactions] = useState<ExpenseDraft[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [goalContributions, setGoalContributions] = useState<
    GoalContributionSummary[]
  >([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [goalAllocationMode, setGoalAllocationModeState] =
    useState<GoalAllocationMode>('priority');
  const [goalNotice, setGoalNotice] = useState<GoalNotice | null>(null);
  const [planTier, setPlanTier] = useState<'free' | 'pro' | 'max'>('free');
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringSeries[]>([]);
  const [coachInsight, setCoachInsight] = useState<CoachInsight | null>(null);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [budgetCycleStartDay, setBudgetCycleStartDay] = useState(1);
  const [budgetRolloverMode, setBudgetRolloverMode] =
    useState<BudgetRolloverMode>('savings');
  const [error, setError] = useState<string | null>(null);
  const activeUserId = useRef<string | null>(null);
  const recurringStartupRefreshUserId = useRef<string | null>(null);

  const privacyKey = useCallback(
    (userId: string) => `flownd:amounts-visible:${userId}`,
    [],
  );

  const hydratePrivacyPreference = useCallback(async (userId: string) => {
    try {
      const stored = await AsyncStorage.getItem(privacyKey(userId));
      if (activeUserId.current === userId) {
        setAmountsVisible(stored !== 'false');
      }
    } catch {
      if (__DEV__) console.warn('Flownd privacy preference is unavailable');
    }
  }, [privacyKey]);

  const hydrateUserData = useCallback(async (userId: string) => {
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
      if (activeUserId.current !== userId) return;
      setError('Il profilo è pronto, ma alcuni dati non sono ancora disponibili.');
      return;
    }

    if (activeUserId.current !== userId) return;
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
      excludedFromBudget: Boolean(item.excluded_from_budget),
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
    const plannedMonthlyIncome = incomeReferenceForBand(incomeBand);
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
    setTransactions(monthlyTransactions);
    setGoals(hydratedGoals);
    setCompletedGoals(hydratedCompletedGoals);
    setGoalContributions(
      (goalContributionsResult.data ?? []).map((contribution) => ({
        goalId: contribution.goal_id,
        amount: Number(contribution.amount),
        createdAt: contribution.occurred_at,
      })),
    );
    setGoalAllocationModeState(
      goalSettingsResult.data.goal_allocation_mode as GoalAllocationMode,
    );
    setPlanTier(goalSettingsResult.data.plan_tier as 'free' | 'pro' | 'max');
    setBudgetCycleStartDay(
      Number(goalSettingsResult.data.budget_cycle_start_day) || 1,
    );
    setBudgetRolloverMode(
      goalSettingsResult.data.budget_rollover_mode === 'carry'
        ? 'carry'
        : 'savings',
    );
    setLoans(
      (loansResult.data ?? []).map((loan) => ({
        id: loan.id,
        name: loan.name,
        financedAmount: Number(loan.financed_amount),
        downPayment: Number(loan.down_payment),
        installmentCount: Number(loan.installment_count),
        monthlyPayment: Number(loan.monthly_payment),
        interestRate:
          loan.interest_rate == null ? null : Number(loan.interest_rate),
        startDate: loan.start_date,
        finalBalloon:
          loan.final_balloon == null ? null : Number(loan.final_balloon),
      })),
    );
    setGoalNotice(goalNoticeResult.data ?? null);
    setDraft((current) => ({
      ...current,
      incomeBand,
      monthlyReference: plannedMonthlyIncome,
      allocation: hydratedBudgets.length
        ? {
            needs: hydratedAllocation('needs') ?? current.allocation.needs,
            wants: hydratedAllocation('wants') ?? current.allocation.wants,
            savings: hydratedAllocation('savings') ?? current.allocation.savings,
          }
        : current.allocation,
      budgets: hydratedBudgets.length ? hydratedBudgets : current.budgets,
      goal: hydratedGoals[0] ?? current.goal,
      expense:
        monthlyTransactions.find((transaction) => transaction.kind !== 'income')
        ?? current.expense,
    }));

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
        .neq('status', 'dismissed')
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

    if (activeUserId.current !== userId) return;
    setFinancialAccounts(
      (accountsResult.data ?? []).map((account) => ({
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
      })),
    );
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
    setRecurringPayments(hydratedRecurringPayments);
    setCoachInsight(
      insightResult.data
        ? {
            id: insightResult.data.id,
            title: insightResult.data.title,
            body: insightResult.data.body,
          }
        : null,
    );
  }, []);

  const readProfile = useCallback(async (nextSession: Session | null) => {
    if (!nextSession) {
      recurringStartupRefreshUserId.current = null;
      setOnboardingComplete(false);
      setFirstDashboardVisit(false);
      setDraft(initialDraft);
      setTransactions([]);
      setGoals([]);
      setCompletedGoals([]);
      setGoalContributions([]);
      setLoans([]);
      setGoalAllocationModeState('priority');
      setGoalNotice(null);
      setPlanTier('free');
      setFinancialAccounts([]);
      setRecurringPayments([]);
      setCoachInsight(null);
      setAmountsVisible(true);
      setBudgetCycleStartDay(1);
      setBudgetRolloverMode('savings');
      setError(null);
      return;
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed,recurring_detection_version')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (activeUserId.current !== nextSession.user.id) return;
    if (profileError) {
      if (__DEV__) console.error('Flownd profile lookup failed', profileError);
      setError(
        profileError.code === 'PGRST205'
          ? 'Il database Flownd non è ancora configurato su Supabase.'
          : 'Non riesco a verificare il profilo. Riprova tra poco.',
      );
      setOnboardingComplete(false);
      return;
    }
    const completed = Boolean(data?.onboarding_completed);
    setOnboardingComplete(completed);
    await hydratePrivacyPreference(nextSession.user.id);
    if (completed) {
      await hydrateUserData(nextSession.user.id);
      if (
        Number(data?.recurring_detection_version ?? 0) < RECURRING_DETECTION_VERSION
        && recurringStartupRefreshUserId.current !== nextSession.user.id
      ) {
        recurringStartupRefreshUserId.current = nextSession.user.id;
        try {
          await refreshRecurringDetection(nextSession.access_token, { reason: 'startup' });
          await hydrateUserData(nextSession.user.id);
        } catch (recurringError) {
          recurringStartupRefreshUserId.current = null;
          if (__DEV__) console.error('Flownd recurring startup detection failed', recurringError);
        }
      }
    }
  }, [hydratePrivacyPreference, hydrateUserData]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      let initialSession = data.session;
      if (
        initialSession?.expires_at
        && initialSession.expires_at <= Math.floor(Date.now() / 1000) + 60
      ) {
        const refreshed = await supabase.auth.refreshSession();
        if (!refreshed.error) initialSession = refreshed.data.session;
      }
      activeUserId.current = initialSession?.user.id ?? null;
      setSession(initialSession);
      await readProfile(initialSession);
      if (mounted) {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      activeUserId.current = nextSession?.user.id ?? null;
      setSession(nextSession);
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      setLoading(true);
      setTimeout(() => {
        if (!mounted) return;
        void readProfile(nextSession).finally(() => {
          if (mounted) setLoading(false);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [readProfile]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !onboardingComplete) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void hydrateUserData(userId);
      }, 180);
    };
    const channel = supabase
      .channel(`app-data:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'goal_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notice = payload.new as GoalNotice;
          setGoalNotice({ id: notice.id, title: notice.title, body: notice.body });
          scheduleRefresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        scheduleRefresh,
      )
      .subscribe();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleRefresh();
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [hydrateUserData, onboardingComplete, session?.user.id]);

  const budgetMonthlyIncome = useMemo(() => {
    const cycle = financialCycleForDate(new Date(), budgetCycleStartDay, transactions);
    const incomeCandidates = incomeCandidatesForFinancialCycle(transactions, cycle);
    const currentCycleIncome = budgetIncomeForFinancialCycle(transactions, cycle)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return incomeCandidates.length
      ? currentCycleIncome
      : incomeReferenceForBand(draft.incomeBand);
  }, [
    budgetCycleStartDay,
    draft.incomeBand,
    transactions,
  ]);

  async function completeOnboarding() {
    if (!session) {
      setError('Completa prima l’accesso.');
      return false;
    }

    setSaving(true);
    setError(null);
    const selectedBudgets = draft.budgets
      .filter((item) => item.selected)
      .map(({ id, name, emoji, amount }) => ({ id, name, emoji, amount }));

    const { error: saveError } = await supabase.rpc('complete_flownd_onboarding_v2', {
      p_budgets: selectedBudgets,
      p_goal: draft.goal,
      p_transaction: draft.expense,
      p_income_band: draft.incomeBand,
      p_planned_monthly_income: draft.monthlyReference,
    });

    setSaving(false);
    if (saveError) {
      if (__DEV__) console.error('Flownd onboarding save failed', saveError);
      setError(
        saveError.code === 'PGRST202' || saveError.code === 'PGRST205'
          ? 'Il database Flownd non è ancora configurato su Supabase. Applica la migrazione onboarding e riprova.'
          : 'Non siamo riusciti a salvare il profilo. Nulla è andato perso: riprova.',
      );
      return false;
    }

    setOnboardingComplete(true);
    setFirstDashboardVisit(true);
    const onboardingTransaction = {
      ...draft.expense,
      occurredAt: new Date().toISOString(),
      source: 'onboarding',
    };
    setTransactions(
      draft.expense.amount > 0 && draft.expense.description.trim()
        ? [onboardingTransaction]
        : [],
    );
    return true;
  }

  async function addTransaction(transaction: ExpenseDraft) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }

    setSaving(true);
    setError(null);
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
    const manualAccount = transaction.financialAccountId
      ? financialAccounts.find(
          (account) =>
            account.id === transaction.financialAccountId &&
            account.source === 'manual',
        )
      : null;

    if (transaction.financialAccountId && !manualAccount) {
      setSaving(false);
      setError('Il conto manuale selezionato non è più disponibile.');
      return false;
    }

    if (manualAccount) {
      const { data: transactionId, error: rpcError } = await supabase.rpc(
        'record_manual_financial_account_transaction',
        {
          p_account_id: manualAccount.id,
          p_description: transaction.description.trim(),
          p_amount: transaction.amount,
          p_category: category,
          p_kind: kind,
          p_occurred_at: occurredAt,
          p_income_type: incomeTreatment?.incomeType ?? null,
          p_excluded_from_budget:
            incomeTreatment?.excludedFromBudget ?? false,
        },
      );
      setSaving(false);
      if (rpcError || !transactionId) {
        if (__DEV__) console.error('Flownd manual account transaction failed', rpcError);
        setError(
          manualAccount.accountKind === 'cash_wallet' &&
            kind === 'expense' &&
            transaction.amount > manualAccount.balance
            ? 'Il portafoglio non contiene abbastanza contanti.'
            : 'Non siamo riusciti ad aggiornare il conto manuale.',
        );
        return false;
      }
      const recordedTransaction: ExpenseDraft = {
        ...transaction,
        id: String(transactionId),
        category,
        occurredAt,
        source,
        kind,
        financialAccountId: manualAccount.id,
        internalTransfer: incomeTreatment?.incomeType === 'internal_transfer',
        excludedFromTotals: incomeTreatment?.incomeType === 'internal_transfer',
        incomeType: incomeTreatment?.incomeType,
        excludedFromBudget: incomeTreatment?.excludedFromBudget ?? false,
      };
      await hydrateUserData(session.user.id);
      if (recordedTransaction.kind !== 'income') {
        setDraft((current) => ({ ...current, expense: recordedTransaction }));
      }
      void refreshRecurringDetection(session.access_token, { transactionId: String(transactionId) })
        .then(() => hydrateUserData(session.user.id))
        .catch(() => undefined);
      return true;
    }

    const insertPayload = {
        user_id: session.user.id,
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
    const insertTransaction = () => supabase
      .from('transactions')
      .insert(insertPayload)
      .select('id,description,amount,category,source,kind,occurred_at,occurred_time,occurred_time_source,internal_transfer,excluded_from_totals')
      .single();
    const insertResult = await insertTransaction();
    const { data, error: insertError } = insertResult;
    setSaving(false);

    if (insertError) {
      if (insertError.code === '23505' && source !== 'manual') return true;
      if (__DEV__) console.error('Flownd transaction save failed', insertError);
      setError('Non siamo riusciti a salvare la transazione. Riprova.');
      return false;
    }

    const recordedTransaction: ExpenseDraft = {
      id: data.id,
      description: data.description,
      amount: Number(data.amount),
      category: data.category,
      occurredAt: data.occurred_at,
      occurredTime: data.occurred_time,
      occurredTimeSource: data.occurred_time_source as ExpenseDraft['occurredTimeSource'],
      source: data.source,
      kind: data.kind,
      internalTransfer: Boolean(data.internal_transfer),
      excludedFromTotals: Boolean(data.excluded_from_totals),
      incomeType: incomeTreatment?.incomeType,
      excludedFromBudget: incomeTreatment?.excludedFromBudget ?? false,
      financialAccountId: null,
      rawDescription: transaction.rawDescription ?? null,
      merchantName: transaction.merchantName ?? null,
      counterpartyName: transaction.counterpartyName ?? null,
      memo: transaction.memo ?? null,
      bankReference: transaction.bankReference ?? null,
      importConfidence: transaction.importConfidence ?? null,
    };
    if (recordedTransaction.kind !== 'income') {
      setDraft((current) => ({ ...current, expense: recordedTransaction }));
    }
    setTransactions((current) => [recordedTransaction, ...current]);
    void refreshRecurringDetection(session.access_token, { transactionId: String(data.id) })
      .then(() => hydrateUserData(session.user.id))
      .catch(() => undefined);
    return true;
  }

  async function createRecurringPayment(draft: RecurringSeriesDraft) {
    if (!session || !draft.name.trim() || draft.amount <= 0) return null;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase.rpc('create_recurring_payment', {
      p_name: draft.name.trim(),
      p_amount: draft.amount,
      p_direction: draft.direction,
      p_frequency: draft.frequency,
      p_category: draft.category,
      p_next_due_on: draft.nextDueOn,
      p_financial_account_id: draft.financialAccountId,
    });
    setSaving(false);
    if (insertError || !data) {
      setError('Non siamo riusciti a creare la ricorrenza.');
      return null;
    }
    await hydrateUserData(session.user.id);
    return String(data);
  }

  async function createRecurringFromTransaction(
    transactionId: string,
    draft: RecurringSeriesDraft,
  ) {
    if (!session) return null;
    setSaving(true);
    setError(null);
    const { data, error: createError } = await supabase.rpc(
      'create_recurring_from_transaction_v2',
      {
        p_transaction_id: transactionId,
        p_name: draft.name.trim(),
        p_expected_amount: draft.amount,
        p_frequency: draft.frequency,
        p_category: draft.category,
        p_next_due_on: draft.nextDueOn,
        p_financial_account_id: draft.financialAccountId,
      },
    );
    setSaving(false);
    if (createError || !data) {
      setError('Non siamo riusciti a rendere ricorrente il movimento.');
      return null;
    }
    await hydrateUserData(session.user.id);
    return String(data);
  }

  async function updateRecurringPayment(id: string, draft: RecurringSeriesDraft) {
    if (!session || draft.amount <= 0 || !draft.name.trim()) return false;
    const account = draft.financialAccountId
      ? financialAccounts.find((item) => item.id === draft.financialAccountId)
      : null;
    setSaving(true);
    setError(null);
    const { error: occurrenceCleanupError } = await supabase
      .from('recurring_payment_occurrences')
      .delete()
      .eq('recurring_payment_id', id)
      .eq('user_id', session.user.id)
      .eq('status', 'projected');
    if (occurrenceCleanupError) {
      setSaving(false);
      setError('Non siamo riusciti ad aggiornare la prossima scadenza.');
      return false;
    }
    const { error: updateError } = await supabase.from('recurring_payments').update({
      name: draft.name.trim(),
      amount: draft.amount,
      direction: draft.direction,
      frequency: draft.frequency,
      category: draft.category,
      anchor_on: draft.nextDueOn,
      next_due_on: draft.nextDueOn,
      next_due_at: `${draft.nextDueOn}T12:00:00.000Z`,
      financial_account_id: draft.financialAccountId,
      settlement_mode: account?.source === 'open_banking' ? 'bank_match' : 'manual_post',
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('user_id', session.user.id);
    if (!updateError) await supabase.rpc('ensure_recurring_occurrence', { p_series_id: id });
    setSaving(false);
    if (updateError) {
      setError('Non siamo riusciti ad aggiornare la ricorrenza.');
      return false;
    }
    await hydrateUserData(session.user.id);
    return true;
  }

  async function setRecurringPaymentStatus(id: string, status: RecurringStatus) {
    if (!session) return false;
    setSaving(true);
    const { error: updateError } = await supabase.from('recurring_payments').update({
      status,
      active: status === 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('user_id', session.user.id);
    if (!updateError && status === 'active') {
      await supabase.rpc('ensure_recurring_occurrence', { p_series_id: id });
    }
    setSaving(false);
    if (updateError) {
      setError('Non siamo riusciti a cambiare lo stato della ricorrenza.');
      return false;
    }
    await hydrateUserData(session.user.id);
    return true;
  }

  async function deleteRecurringPayment(id: string, deleteManualTransactions = false) {
    if (!session) return false;
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase.rpc('delete_recurring_payment', {
      p_series_id: id,
      p_delete_manual_transactions: deleteManualTransactions,
    });
    setSaving(false);
    if (deleteError) {
      if (__DEV__) console.error('Flownd recurring payment delete failed', deleteError);
      setError('Non siamo riusciti a eliminare la ricorrenza.');
      return false;
    }
    await hydrateUserData(session.user.id);
    return true;
  }

  async function unlinkTransactionFromRecurring(transactionId: string) {
    if (!session) return false;
    setSaving(true);
    setError(null);
    const { data, error: unlinkError } = await supabase.rpc(
      'unlink_transaction_from_recurring',
      { p_transaction_id: transactionId },
    );
    setSaving(false);
    if (unlinkError || data !== true) {
      setError('Non siamo riusciti a rimuovere il movimento dalla ricorrenza.');
      return false;
    }
    await hydrateUserData(session.user.id);
    return true;
  }

  async function createManualFinancialAccount(
    account: ManualFinancialAccountDraft,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return null;
    }
    setSaving(true);
    setError(null);
    const { data: accountId, error: createError } = await supabase.rpc(
      'create_manual_financial_account',
      {
        p_name: account.name.trim(),
        p_account_kind: account.accountKind,
        p_balance: account.balance,
        p_balance_as_of: account.balanceAsOf,
      },
    );
    if (!createError && accountId) await hydrateUserData(session.user.id);
    setSaving(false);
    if (createError || !accountId) {
      if (__DEV__) console.error('Flownd manual account creation failed', createError);
      setError('Non siamo riusciti a creare il conto manuale.');
      return null;
    }
    return String(accountId);
  }

  async function updateManualFinancialAccountOpeningBalance(
    accountId: string,
    balance: number,
  ) {
    if (!session) return false;
    const account = financialAccounts.find(
      (item) => item.id === accountId && item.source === 'manual',
    );
    if (!account) {
      setError('Il conto manuale non è più disponibile.');
      return false;
    }
    if (account.accountKind === 'cash_wallet' && balance < 0) {
      setError('Il saldo del portafoglio non può essere negativo.');
      return false;
    }
    setSaving(true);
    setError(null);
    const { data: updated, error: updateError } = await supabase.rpc(
      'update_manual_financial_account_opening_balance',
      {
        p_account_id: accountId,
        p_opening_balance: balance,
        p_opening_balance_as_of: account.openingBalanceAsOf ?? new Date().toISOString(),
      },
    );
    if (!updateError && updated) await hydrateUserData(session.user.id);
    setSaving(false);
    if (updateError || !updated) {
      if (__DEV__) console.error('Flownd manual account balance failed', updateError);
      setError('Non siamo riusciti ad aggiornare il saldo iniziale.');
      return false;
    }
    return true;
  }

  async function deleteManualFinancialAccount(accountId: string) {
    if (!session) return false;
    setSaving(true);
    setError(null);
    const { data: deleted, error: deleteError } = await supabase.rpc(
      'delete_manual_financial_account',
      { p_account_id: accountId },
    );
    if (!deleteError && deleted) await hydrateUserData(session.user.id);
    setSaving(false);
    if (deleteError || !deleted) {
      if (__DEV__) console.error('Flownd manual account delete failed', deleteError);
      setError('Non siamo riusciti a eliminare il conto.');
      return false;
    }
    return true;
  }

  async function updateBudgetAmount(id: string, amount: number) {
    if (!session || amount <= 0) {
      setError(
        !session
          ? 'La sessione è scaduta. Accedi di nuovo.'
          : 'Il budget deve essere maggiore di zero.',
      );
      return false;
    }

    const target = draft.budgets.find((item) => item.id === id);
    if (!target) return false;
    let nextBudgets = draft.budgets;
    if (target.isMacro) {
      const currentAllocation = {
        needs:
          draft.budgets.find((item) => item.isMacro && item.parentId === 'needs')
            ?.percentage ?? draft.allocation.needs,
        wants:
          draft.budgets.find((item) => item.isMacro && item.parentId === 'wants')
            ?.percentage ?? draft.allocation.wants,
        savings:
          draft.budgets.find((item) => item.isMacro && item.parentId === 'savings')
            ?.percentage ?? draft.allocation.savings,
      };
      const group = target.parentId ?? (target.id as BudgetGroupKey);
      const allocation = updateAllocation(
        currentAllocation,
        group,
        (amount / draft.monthlyReference) * 100,
      );
      nextBudgets = draft.budgets.map((item) =>
        item.isMacro
          ? {
              ...item,
              percentage:
                allocation[item.parentId ?? (item.id as BudgetGroupKey)],
            }
          : item,
      );
    } else {
      const parent = draft.budgets.find(
        (item) => item.isMacro && item.parentId === target.parentId,
      );
      const siblingPercentage = draft.budgets
        .filter(
          (item) =>
            !item.isMacro &&
            item.id !== id &&
            item.parentId === target.parentId,
        )
        .reduce((sum, item) => sum + item.percentage, 0);
      const percentage = parent?.amount
        ? Math.max(
            1,
            Math.min(
              100 - siblingPercentage,
              Math.round((amount / parent.amount) * 100),
            ),
          )
        : target.percentage;
      nextBudgets = draft.budgets.map((item) =>
        item.id === id ? { ...item, percentage } : item,
      );
    }
    return saveBudgetAllocations(nextBudgets, draft.monthlyReference);
  }

  async function saveBudgetAllocations(
    budgets: BudgetCategory[],
    plannedMonthlyIncome: number,
  ) {
    if (!session || plannedMonthlyIncome <= 0) {
      setError(
        !session
          ? 'La sessione è scaduta. Accedi di nuovo.'
          : 'Il reddito mensile pianificato deve essere maggiore di zero.',
      );
      return false;
    }

    const selectedBudgets = budgets.filter((item) => item.selected);
    const materialized = materializeBudgetAmounts(
      selectedBudgets,
      plannedMonthlyIncome,
    );
    const macroPercentage = (group: BudgetGroupKey) =>
      materialized.find((item) => item.isMacro && item.parentId === group)
        ?.percentage ?? 0;
    setDraft((current) => ({
      ...current,
      monthlyReference: plannedMonthlyIncome,
      allocation: {
        needs: macroPercentage('needs'),
        wants: macroPercentage('wants'),
        savings: macroPercentage('savings'),
      },
      budgets: materialized,
    }));

    const payload = {
      p_planned_monthly_income: plannedMonthlyIncome,
      p_allocations: materialized.map((item) => ({
        id: item.id,
        percentage: item.percentage,
        isMacro: Boolean(item.isMacro),
        parentId: item.parentId,
        parentCategoryId: item.parentCategoryId ?? null,
        budgetEnabled: item.budgetEnabled !== false,
      })),
    };
    setSaving(true);
    setError(null);
    let { error: updateError } = await supabase.rpc('save_budget_allocations', payload);
    for (const delay of [600, 1400]) {
      if (!updateError || !isTransientBudgetSaveError(updateError)) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      ({ error: updateError } = await supabase.rpc('save_budget_allocations', payload));
    }
    setSaving(false);

    if (updateError) {
      if (__DEV__) console.error('Flownd budget allocation update failed', updateError);
      await reportClientError(session.access_token, 'budget_allocation_update', updateError);
      setError(GENERIC_OPERATION_ERROR);
      return false;
    }

    return true;
  }

  async function updateBudgetCycleSettings(
    startDay: number,
    rolloverMode: BudgetRolloverMode,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    const safeStartDay = Math.min(28, Math.max(1, Math.round(startDay)));
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        budget_cycle_start_day: safeStartDay,
        budget_rollover_mode: rolloverMode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);
    setSaving(false);

    if (updateError) {
      if (__DEV__) console.error('Flownd budget cycle update failed', updateError);
      setError('Non siamo riusciti a salvare il mese finanziario.');
      return false;
    }

    setBudgetCycleStartDay(safeStartDay);
    setBudgetRolloverMode(rolloverMode);
    if (rolloverMode === 'savings') {
      await hydrateUserData(session.user.id);
    }
    return true;
  }

  async function updateTransaction(
    transactionId: string,
    transaction: TransactionUpdate,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    const nextDescription = transaction.description.trim();
    const nextCategory = normalizeTransactionCategory(
      transaction.category,
      transaction.kind,
    );
    const incomeTreatment =
      transaction.kind === 'income' || nextCategory === 'Giroconto'
        ? incomeTreatmentForCategory(nextCategory)
        : null;
    const internalTransfer = incomeTreatment?.incomeType === 'internal_transfer';
    if (!nextDescription || !nextCategory || transaction.amount <= 0) return false;

    const existingTransaction = transactions.find((item) => item.id === transactionId);
    const manualAccount = existingTransaction?.financialAccountId
      ? financialAccounts.find(
          (account) =>
            account.id === existingTransaction.financialAccountId &&
            account.source === 'manual',
        )
      : null;

    setSaving(true);
    setError(null);
    const { error: updateError } = existingTransaction?.source === 'recurring_generated'
      ? await supabase.rpc('update_generated_recurring_transaction', {
          p_transaction_id: transactionId,
          p_description: nextDescription,
          p_amount: transaction.amount,
          p_category: nextCategory,
          p_kind: transaction.kind,
          p_occurred_at: transaction.occurredAt,
          p_income_type: incomeTreatment?.incomeType ?? null,
          p_excluded_from_budget: incomeTreatment?.excludedFromBudget ?? false,
        })
      : manualAccount
      ? await supabase.rpc('update_manual_financial_account_transaction', {
          p_transaction_id: transactionId,
          p_description: nextDescription,
          p_amount: transaction.amount,
          p_category: nextCategory,
          p_kind: transaction.kind,
          p_occurred_at: transaction.occurredAt,
          p_income_type: incomeTreatment?.incomeType ?? null,
          p_excluded_from_budget: incomeTreatment?.excludedFromBudget ?? false,
        })
      : await supabase
          .from('transactions')
          .update({
            description: nextDescription,
            amount: transaction.amount,
            category: nextCategory,
            kind: transaction.kind,
            income_type: incomeTreatment?.incomeType ?? null,
            excluded_from_budget:
              internalTransfer || incomeTreatment?.excludedFromBudget || false,
            internal_transfer: internalTransfer,
            excluded_from_totals: internalTransfer,
            occurred_at: transaction.occurredAt,
          })
          .eq('id', transactionId)
          .eq('user_id', session.user.id);
    if (updateError) {
      setSaving(false);
      if (__DEV__) console.error('Flownd transaction update failed', updateError);
      setError('Non siamo riusciti ad aggiornare la transazione.');
      return false;
    }

    if (transaction.rememberSimilar && transaction.kind === 'expense') {
      const { data: remembered, error: rememberError } = await supabase.rpc(
        'remember_transaction_category',
        {
          p_transaction_id: transactionId,
          p_category: nextCategory,
        },
      );
      if (rememberError || remembered !== true) {
        setSaving(false);
        if (__DEV__) {
          console.error('Flownd transaction category rule save failed', rememberError);
        }
        setError(
          'Il movimento è stato salvato, ma non siamo riusciti a ricordare la categoria.',
        );
        return false;
      }
    }

    setSaving(false);

    if (manualAccount || existingTransaction?.source === 'recurring_generated') {
      await hydrateUserData(session.user.id);
      return true;
    }

    const updatedFields: Partial<ExpenseDraft> = {
      description: nextDescription,
      amount: transaction.amount,
      category: nextCategory,
      kind: transaction.kind,
      incomeType: incomeTreatment?.incomeType,
      excludedFromBudget:
        internalTransfer || incomeTreatment?.excludedFromBudget || false,
      internalTransfer,
      excludedFromTotals: internalTransfer,
      occurredAt: transaction.occurredAt,
    };

    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, ...updatedFields }
          : transaction,
      ),
    );
    setDraft((current) => ({
      ...current,
      expense:
        current.expense.id === transactionId
          ? { ...current.expense, ...updatedFields }
          : current.expense,
    }));
    return true;
  }

  async function categorizeTransactions(
    transactionIds: string[],
    category: string,
    rememberSimilar: boolean,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    const uniqueIds = [...new Set(transactionIds)];
    const selectedTransactions = transactions.filter(
      (transaction) => transaction.id && uniqueIds.includes(transaction.id),
    );
    const kinds = new Set(
      selectedTransactions.map((transaction) => transaction.kind ?? 'expense'),
    );
    if (!selectedTransactions.length || kinds.size !== 1) {
      setError('Seleziona movimenti tutti dello stesso tipo.');
      return false;
    }
    if (selectedTransactions.some((transaction) => transaction.internalTransfer)) {
      setError('I trasferimenti interni non possono essere categorizzati in blocco.');
      return false;
    }

    const kind = (selectedTransactions[0].kind ?? 'expense') as
      | 'expense'
      | 'income';
    const nextCategory = normalizeTransactionCategory(category, kind);
    const incomeTreatment =
      kind === 'income' || nextCategory === 'Giroconto'
        ? incomeTreatmentForCategory(nextCategory)
        : null;
    const internalTransfer = incomeTreatment?.incomeType === 'internal_transfer';
    const updatedFields: Partial<ExpenseDraft> = {
      category: nextCategory,
      incomeType: incomeTreatment?.incomeType,
      excludedFromBudget:
        internalTransfer || incomeTreatment?.excludedFromBudget || false,
      internalTransfer,
      excludedFromTotals: internalTransfer,
    };

    setSaving(true);
    setError(null);
    const { data: updatedCount, error: updateError } = await supabase.rpc(
      'categorize_transactions_bulk',
      {
        p_transaction_ids: uniqueIds,
        p_category: nextCategory,
        p_remember_similar: rememberSimilar && kind === 'expense',
      },
    );
    if (updateError) {
      setSaving(false);
      if (__DEV__) console.error('Flownd bulk category update failed', updateError);
      setError('Non siamo riusciti a categorizzare i movimenti selezionati.');
      return false;
    }
    setSaving(false);
    if (Number(updatedCount) !== selectedTransactions.length) {
      setError('Alcuni movimenti non sono più disponibili. Aggiorna e riprova.');
      return false;
    }

    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id && uniqueIds.includes(transaction.id)
          ? { ...transaction, ...updatedFields }
          : transaction,
      ),
    );
    setDraft((current) =>
      current.expense.id && uniqueIds.includes(current.expense.id)
        ? {
            ...current,
            expense: { ...current.expense, ...updatedFields },
          }
        : current,
    );
    return true;
  }

  async function deleteTransaction(transactionId: string) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    const transaction = transactions.find((item) => item.id === transactionId);
    const disconnectedBankTransaction =
      ['open_banking', 'manual_open_banking'].includes(transaction?.source ?? '') &&
      !financialAccounts.some(
        (account) => account.id === transaction?.financialAccountId,
      );
    if (
      !transaction ||
      (!disconnectedBankTransaction &&
        !['manual', 'onboarding', 'ai_scan', 'file_import', 'recurring_generated'].includes(
          transaction.source ?? '',
        ))
    ) {
      setError('I movimenti bancari non possono essere eliminati. Puoi riclassificarli.');
      return false;
    }
    setSaving(true);
    setError(null);
    const linkedManualAccount = transaction.financialAccountId
      ? financialAccounts.some(
          (account) =>
            account.id === transaction.financialAccountId && account.source === 'manual',
        )
      : false;
    const { error: deleteError } = transaction.isRecurring
      ? await supabase.rpc('delete_recurring_linked_transaction', {
          p_transaction_id: transactionId,
        })
      : transaction.source === 'recurring_generated'
      ? await supabase.rpc('delete_generated_recurring_transaction', {
          p_transaction_id: transactionId,
        })
      : linkedManualAccount
      ? await supabase.rpc('delete_manual_financial_account_transaction', {
          p_transaction_id: transactionId,
        })
      : await supabase
          .from('transactions')
          .delete()
          .eq('id', transactionId)
          .eq('user_id', session.user.id)
          .in('source', [
            'manual',
            'onboarding',
            'ai_scan',
            'file_import',
            'open_banking',
            'manual_open_banking',
            'recurring_generated',
          ]);
    setSaving(false);
    if (deleteError) {
      if (__DEV__) console.error('Flownd transaction delete failed', deleteError);
      setError('Non siamo riusciti a eliminare la transazione.');
      return false;
    }
    if (linkedManualAccount) await hydrateUserData(session.user.id);
    else {
      setTransactions((current) =>
        current.filter((item) => item.id !== transactionId),
      );
    }
    return true;
  }

  async function setTransactionBudgetInclusion(
    transactionId: string,
    included: boolean,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    setError(null);
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, excludedFromBudget: !included }
          : transaction,
      ),
    );
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ excluded_from_budget: !included })
      .eq('id', transactionId)
      .eq('user_id', session.user.id)
      .eq('kind', 'income');
    if (updateError) {
      if (__DEV__) console.error('Flownd budget income update failed', updateError);
      setError('Non siamo riusciti ad aggiornare questa entrata.');
      setTransactions((current) =>
        current.map((transaction) =>
          transaction.id === transactionId
            ? { ...transaction, excludedFromBudget: included }
            : transaction,
        ),
      );
      return false;
    }
    return true;
  }

  async function createBudgetSubcategory(
    parentId: BudgetGroupKey,
    name: string,
    parentCategoryId: string | null = null,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return null;
    }
    const trimmedName = name.trim();
    const directParent = parentCategoryId
      ? draft.budgets.find(
          (item) => !item.isMacro && !item.parentCategoryId && item.id === parentCategoryId,
        )
      : null;
    if (parentCategoryId && (!directParent || directParent.parentId !== parentId)) {
      setError('La sottocategoria selezionata non è valida.');
      return null;
    }
    const duplicate = draft.budgets.some(
      (item) =>
        !item.isMacro &&
        item.parentId === parentId &&
        item.name.trim().localeCompare(trimmedName, 'it', { sensitivity: 'base' }) === 0,
    );
    if (!trimmedName || duplicate) {
      setError(duplicate ? 'Esiste già una categoria con questo nome.' : 'Inserisci un nome per la categoria.');
      return null;
    }
    const parent = draft.budgets.find(
      (item) => item.isMacro && item.parentId === parentId,
    );
    if (!parent) return null;
    const normalizedName = trimmedName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('it')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);
    const categoryKey = `${parentId}-${normalizedName || 'categoria'}-${Date.now().toString(36)}`;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('budget_categories')
      .insert({
        user_id: session.user.id,
        category_key: categoryKey,
        name: trimmedName,
        emoji: null,
        monthly_limit: 0,
        allocation_percentage: 0,
        parent_key: parentId,
        parent_category_key: parentCategoryId,
        budget_enabled: false,
        is_macro: false,
      })
      .select('category_key,name,emoji,monthly_limit,allocation_percentage,parent_key,parent_category_key,budget_enabled,is_macro')
      .single();
    setSaving(false);
    if (insertError) {
      if (__DEV__) console.error('Flownd budget subcategory insert failed', insertError);
      await reportClientError(session.access_token, 'budget_subcategory_create', insertError);
      setError(GENERIC_OPERATION_ERROR);
      return null;
    }
    const created: BudgetCategory = {
      id: data.category_key,
      name: data.name,
      emoji: data.emoji ?? '◦',
      amount: Number(data.monthly_limit),
      percentage: Number(data.allocation_percentage),
      selected: true,
      parentId: data.parent_key as BudgetGroupKey,
      parentCategoryId: data.parent_category_key,
      budgetEnabled: false,
      isMacro: Boolean(data.is_macro),
    };
    setDraft((current) => ({
      ...current,
      budgets: [...current.budgets, created],
    }));
    return created;
  }

  async function deleteBudgetSubcategory(categoryId: string) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    const target = draft.budgets.find((item) => item.id === categoryId && !item.isMacro);
    if (!target) return false;
    const ids = [
      categoryId,
      ...draft.budgets
        .filter((item) => item.parentCategoryId === categoryId)
        .map((item) => item.id),
    ];
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from('budget_categories')
      .delete()
      .eq('user_id', session.user.id)
      .in('category_key', ids);
    setSaving(false);
    if (deleteError) {
      if (__DEV__) console.error('Flownd budget subcategory delete failed', deleteError);
      await reportClientError(session.access_token, 'budget_subcategory_delete', deleteError);
      setError(GENERIC_OPERATION_ERROR);
      return false;
    }
    const removed = new Set(ids);
    setDraft((current) => ({
      ...current,
      budgets: current.budgets.filter((item) => !removed.has(item.id)),
    }));
    return true;
  }

  async function createGoal(goal: OnboardingDraft['goal']) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('goals')
      .insert({
        user_id: session.user.id,
        name: goal.name.trim(),
        target_amount: goal.targetAmount,
        deadline_label: goal.deadline || null,
        monthly_contribution: goal.monthlyContribution ?? 0,
        allocation_percentage: goal.allocationPercentage ?? 0,
        priority: goals.length,
      })
      .select('id,name,target_amount,saved_amount,deadline_label,monthly_contribution,allocation_percentage,priority,status')
      .single();
    setSaving(false);

    if (insertError) {
      if (__DEV__) console.error('Flownd goal insert failed', insertError);
      setError('Non siamo riusciti a creare l’obiettivo.');
      return false;
    }
    const createdGoal: Goal = {
      id: data.id,
      name: data.name,
      targetAmount: Number(data.target_amount),
      deadline: data.deadline_label ?? '',
      savedAmount: Number(data.saved_amount),
      monthlyContribution: Number(data.monthly_contribution),
      allocationPercentage: Number(data.allocation_percentage),
      priority: Number(data.priority),
      status: data.status as Goal['status'],
    };
    setGoals((current) => [...current, createdGoal]);
    if (!goals.length) {
      setDraft((current) => ({ ...current, goal: createdGoal }));
    }
    return true;
  }

  async function updateGoal(
    goalId: string | null,
    changes: Partial<OnboardingDraft['goal']>,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    if (!goalId) {
      setError('Non riusciamo a identificare l’obiettivo da aggiornare.');
      return false;
    }
    const payload: Record<string, string | number | null> = {};
    if (changes.name != null) payload.name = changes.name.trim();
    if (changes.targetAmount != null) {
      payload.target_amount = changes.targetAmount;
    }
    if (changes.deadline != null) {
      payload.deadline_label = changes.deadline || null;
    }
    if (changes.monthlyContribution != null) {
      payload.monthly_contribution = changes.monthlyContribution;
    }
    if (changes.allocationPercentage != null) {
      payload.allocation_percentage = changes.allocationPercentage;
    }
    const currentGoal = goals.find((goal) => goal.id === goalId);
    if (changes.targetAmount != null && currentGoal) {
      payload.status =
        changes.targetAmount <= currentGoal.savedAmount ? 'reached' : 'active';
    }
    if (!Object.keys(payload).length) return false;

    setSaving(true);
    setError(null);
    let query = supabase
      .from('goals')
      .update(payload)
      .eq('user_id', session.user.id)
      .is('group_id', null)
      .eq('active', true)
      .eq('id', goalId);
    const { error: updateError } = await query;
    setSaving(false);

    if (updateError) {
      if (__DEV__) console.error('Flownd goal update failed', updateError);
      setError('Non siamo riusciti ad aggiornare l’obiettivo.');
      return false;
    }
    setDraft((current) => ({
      ...current,
      goal:
        current.goal.id === goalId
          ? { ...current.goal, ...changes }
          : current.goal,
    }));
    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              ...changes,
              ...(payload.status
                ? { status: payload.status as Goal['status'] }
                : {}),
            }
          : goal,
      ),
    );
    return true;
  }

  async function deleteGoal(goalId: string) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return false;
    }
    const selectedGoal = goals.find((goal) => goal.id === goalId) ??
      completedGoals.find((goal) => goal.id === goalId);
    if (!selectedGoal) {
      setError('Non riusciamo a identificare l’obiettivo da eliminare.');
      return false;
    }
    if (selectedGoal.status === 'free_savings') {
      setError('Il Risparmio libero è una riserva permanente e non può essere eliminato.');
      return false;
    }
    setSaving(true);
    setError(null);
    const { data: deleted, error: deleteError } = await supabase.rpc(
      'delete_goal',
      { p_goal_id: goalId },
    );
    setSaving(false);
    if (deleteError || !deleted) {
      if (__DEV__) console.error('Flownd goal delete failed', deleteError);
      setError('Non siamo riusciti a eliminare l’obiettivo.');
      return false;
    }
    const remaining = goals
      .filter((goal) => goal.id !== goalId)
      .sort((first, second) => first.priority - second.priority)
      .map((goal, priority) => ({ ...goal, priority }));
    const currentCycle = financialCycleForDate(
      new Date(),
      budgetCycleStartDay,
      transactions,
    );
    setGoals(remaining);
    setCompletedGoals((current) =>
      current.filter((goal) => goal.id !== goalId),
    );
    setGoalContributions((current) =>
      current.filter((contribution) => {
        if (contribution.goalId !== goalId) return true;
        const occurredAt = new Date(contribution.createdAt);
        return occurredAt < currentCycle.start || occurredAt >= currentCycle.end;
      }),
    );
    setDraft((current) => ({
      ...current,
      goal:
        remaining.find((goal) => goal.status !== 'free_savings') ??
        remaining[0] ??
        initialDraft.goal,
    }));
    return true;
  }

  async function setGoalAllocationMode(mode: GoalAllocationMode) {
    if (!session) return false;
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ goal_allocation_mode: mode, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (updateError) {
      setError('Non siamo riusciti a cambiare la modalità di allocazione.');
      return false;
    }
    setGoalAllocationModeState(mode);
    return true;
  }

  async function moveGoal(goalId: string, direction: -1 | 1) {
    const orderedTargetGoals = [...goals]
      .filter((goal) => goal.status === 'active')
      .sort((first, second) => first.priority - second.priority);
    const currentIndex = orderedTargetGoals.findIndex((goal) => goal.id === goalId);
    const nextIndex = currentIndex + direction;
    if (
      !session ||
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= orderedTargetGoals.length
    ) {
      return false;
    }
    const [moved] = orderedTargetGoals.splice(currentIndex, 1);
    orderedTargetGoals.splice(nextIndex, 0, moved);
    const nonTargetGoals = [...goals]
      .filter((goal) => goal.status !== 'active')
      .sort((first, second) => first.priority - second.priority);
    const priorities = new Map(
      [...orderedTargetGoals, ...nonTargetGoals].map((goal, priority) => [
        goal.id,
        priority,
      ]),
    );
    const prioritized = goals.map((goal) => ({
      ...goal,
      priority: priorities.get(goal.id) ?? goal.priority,
    }));
    setGoals(prioritized);
    if (prioritized[0]) {
      setDraft((current) => ({ ...current, goal: prioritized[0] }));
    }
    const results = await Promise.all(
      prioritized.map((goal) =>
        supabase
          .from('goals')
          .update({ priority: goal.priority })
          .eq('user_id', session.user.id)
          .is('group_id', null)
          .eq('id', goal.id),
      ),
    );
    if (results.some((result) => result.error)) {
      setGoals(goals);
      if (goals[0]) {
        setDraft((current) => ({ ...current, goal: goals[0] }));
      }
      setError('Non siamo riusciti a riordinare gli obiettivi.');
      return false;
    }
    return true;
  }

  async function refreshGoals(userId: string) {
    const { data, error: goalsError } = await supabase
      .from('goals')
      .select('id,name,target_amount,saved_amount,deadline_label,monthly_contribution,allocation_percentage,priority,status')
      .eq('user_id', userId)
      .is('group_id', null)
      .eq('active', true)
      .order('priority')
      .order('created_at');
    if (goalsError) return false;
    const refreshed: Goal[] = (data ?? []).map((goal) => ({
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
    setGoals(refreshed);
    if (refreshed[0]) {
      setDraft((current) => ({ ...current, goal: refreshed[0] }));
    }
    return true;
  }

  async function addGoalContribution(amount: number, goalId?: string | null) {
    if (!session || amount <= 0) return false;
    setSaving(true);
    setError(null);
    const { data: contributionResult, error: contributionError } = await supabase.rpc(
      'add_manual_goal_contribution',
      { p_amount: amount, p_goal_id: goalId ?? null },
    );
    const refreshed = contributionError
      ? false
      : await refreshGoals(session.user.id);
    setSaving(false);
    if (contributionError || !refreshed) {
      setError('Non siamo riusciti a registrare il contributo.');
      return false;
    }
    const allocated = Number(
      (contributionResult as { allocated?: number } | null)?.allocated ?? 0,
    );
    if (allocated > 0) {
      setGoalContributions((current) => [
        {
          goalId: goalId ?? null,
          amount: allocated,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    }
    return true;
  }

  async function transferFreeSavingsToGoal(amount: number, goalId: string) {
    if (!session || amount <= 0 || !goalId) return false;
    setSaving(true);
    setError(null);
    const { data, error: transferError } = await supabase.rpc(
      'transfer_free_savings_to_goal',
      { p_amount: amount, p_goal_id: goalId },
    );
    const transferred = Number(
      (data as { transferred?: number } | null)?.transferred ?? 0,
    );
    const refreshed = transferError || transferred <= 0
      ? false
      : await refreshGoals(session.user.id);
    setSaving(false);
    if (transferError || !refreshed) {
      if (__DEV__) console.error('Flownd savings transfer failed', transferError);
      setError('Non siamo riusciti a spostare il denaro.');
      return false;
    }
    return true;
  }

  async function deleteGoalContribution(contributionId: string) {
    if (!session) return false;
    setSaving(true);
    setError(null);
    const { data, error: deleteError } = await supabase.rpc(
      'delete_manual_goal_contribution',
      { p_contribution_id: contributionId },
    );
    const deleted = Boolean(
      (data as { deleted?: boolean } | null)?.deleted,
    );
    const refreshed = deleteError || !deleted
      ? false
      : await hydrateUserData(session.user.id).then(() => true);
    setSaving(false);
    if (deleteError || !deleted || !refreshed) {
      if (__DEV__) console.error('Flownd goal contribution delete failed', deleteError);
      setError('Non siamo riusciti a eliminare il versamento.');
      return false;
    }
    return true;
  }

  async function completeGoal(goalId: string) {
    if (!session) return false;
    const completedGoal = goals.find((goal) => goal.id === goalId);
    const { error: updateError } = await supabase
      .from('goals')
      .update({ active: false, status: 'completed', completed_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('group_id', null)
      .eq('id', goalId);
    if (updateError) {
      setError('Non siamo riusciti a completare l’obiettivo.');
      return false;
    }
    const remaining = goals.filter((goal) => goal.id !== goalId);
    setGoals(remaining);
    if (completedGoal) {
      setCompletedGoals((current) => [
        { ...completedGoal, status: 'completed' },
        ...current,
      ]);
    }
    setDraft((current) => ({
      ...current,
      goal:
        current.goal.id === goalId
          ? (remaining[0] ?? initialDraft.goal)
          : current.goal,
    }));
    return true;
  }

  async function createLoan(loan: LoanDraft, financialAccountId: string | null = null) {
    if (!session) return false;
    const monthlyPayment =
      loan.monthlyPayment && loan.monthlyPayment > 0
        ? loan.monthlyPayment
        : calculateMonthlyPayment(loan);
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('loans')
      .insert({
        user_id: session.user.id,
        name: loan.name.trim(),
        financed_amount: loan.financedAmount,
        down_payment: loan.downPayment,
        installment_count: loan.installmentCount,
        monthly_payment: monthlyPayment,
        interest_rate: loan.interestRate,
        start_date: loan.startDate,
        final_balloon: loan.finalBalloon,
      })
      .select('id,name,financed_amount,down_payment,installment_count,monthly_payment,interest_rate,start_date,final_balloon')
      .single();
    setSaving(false);
    if (insertError) {
      setError('Non siamo riusciti a salvare il finanziamento.');
      return false;
    }
    const selectedAccount = financialAccountId
      ? financialAccounts.find((account) => account.id === financialAccountId)
      : null;
    const { error: recurringError } = await supabase
      .from('recurring_payments')
      .update({
        financial_account_id: financialAccountId,
        settlement_mode: selectedAccount?.source === 'open_banking' ? 'bank_match' : 'manual_post',
        updated_at: new Date().toISOString(),
      })
      .eq('loan_id', data.id)
      .eq('user_id', session.user.id);
    if (recurringError && __DEV__) console.error('Flownd loan recurrence update failed', recurringError);
    setLoans((current) => [
      {
        id: data.id,
        name: data.name,
        financedAmount: Number(data.financed_amount),
        downPayment: Number(data.down_payment),
        installmentCount: Number(data.installment_count),
        monthlyPayment: Number(data.monthly_payment),
        interestRate: data.interest_rate == null ? null : Number(data.interest_rate),
        startDate: data.start_date,
        finalBalloon: data.final_balloon == null ? null : Number(data.final_balloon),
      },
      ...current,
    ]);
    await hydrateUserData(session.user.id);
    return true;
  }

  async function dismissGoalNotice(noticeId: string) {
    if (!session) return;
    const { error: updateError } = await supabase
      .from('goal_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .eq('id', noticeId);
    if (updateError) return;
    const { data: nextNotice } = await supabase
      .from('goal_notifications')
      .select('id,title,body')
      .eq('user_id', session.user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setGoalNotice(
      nextNotice
        ? {
            id: nextNotice.id,
            title: nextNotice.title,
            body: nextNotice.body,
          }
        : null,
    );
  }

  async function toggleAmountsVisible() {
    const next = !amountsVisible;
    setAmountsVisible(next);
    if (!session) return;
    try {
      await AsyncStorage.setItem(privacyKey(session.user.id), String(next));
    } catch {
      setAmountsVisible(!next);
      setError('Non siamo riusciti a salvare la preferenza privacy.');
    }
  }

  const refreshData = useCallback(async () => {
    const userId = session?.user.id;
    if (userId) await hydrateUserData(userId);
  }, [hydrateUserData, session?.user.id]);

  const value: AppContextValue = {
    session,
    loading,
    saving,
    onboardingComplete,
    firstDashboardVisit,
    draft,
    transactions,
    goals,
    completedGoals,
    goalContributions,
    loans,
    goalAllocationMode,
    goalNotice,
    planTier,
    financialAccounts,
    recurringPayments,
    coachInsight,
    amountsVisible,
    budgetCycleStartDay,
    budgetRolloverMode,
    budgetMonthlyIncome,
    error,
    updateDraft: (next) => setDraft((current) => ({ ...current, ...next })),
    completeOnboarding,
    addTransaction,
    createRecurringPayment,
    createRecurringFromTransaction,
    updateRecurringPayment,
    setRecurringPaymentStatus,
    deleteRecurringPayment,
    unlinkTransactionFromRecurring,
    createManualFinancialAccount,
    updateManualFinancialAccountOpeningBalance,
    deleteManualFinancialAccount,
    updateTransaction,
    categorizeTransactions,
    deleteTransaction,
    setTransactionBudgetInclusion,
    createGoal,
    updateGoal,
    deleteGoal,
    setGoalAllocationMode,
    moveGoal,
    addGoalContribution,
    transferFreeSavingsToGoal,
    deleteGoalContribution,
    completeGoal,
    createLoan,
    dismissGoalNotice,
    updateBudgetAmount,
    saveBudgetAllocations,
    createBudgetSubcategory,
    deleteBudgetSubcategory,
    updateBudgetCycleSettings,
    dismissFirstVisit: () => setFirstDashboardVisit(false),
    toggleAmountsVisible,
    clearError: () => setError(null),
    refreshData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp deve essere usato dentro AppProvider');
  return value;
}
