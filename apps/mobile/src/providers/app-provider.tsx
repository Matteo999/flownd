import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
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
  incomeTreatmentForCategory,
  normalizeTransactionCategory,
} from '@/lib/transaction-categories';
import {
  type BudgetRolloverMode,
  financialCycleForDate,
  budgetIncomeForFinancialCycle,
  incomeCandidatesForFinancialCycle,
} from '@/lib/financial-cycle';

export type TransactionUpdate = {
  description: string;
  amount: number;
  category: string;
  kind: 'expense' | 'income';
  occurredAt: string;
};

export type FinancialAccount = {
  id: string;
  name: string;
  balance: number;
  previousMonthBalance: number | null;
  source: 'open_banking' | 'manual';
  lastSyncedAt: string | null;
  institutionName: string | null;
  currency: string;
};

export type UpcomingPayment = {
  id: string;
  name: string;
  amount: number;
  dueAt: string;
  kind: 'loan' | 'subscription';
};

export type CoachInsight = {
  id: string;
  title: string;
  body: string;
};

type AppContextValue = {
  session: Session | null;
  loading: boolean;
  saving: boolean;
  onboardingComplete: boolean;
  firstDashboardVisit: boolean;
  draft: OnboardingDraft;
  transactions: ExpenseDraft[];
  goals: Goal[];
  loans: Loan[];
  goalAllocationMode: GoalAllocationMode;
  goalNotice: GoalNotice | null;
  planTier: 'free' | 'pro' | 'max';
  financialAccounts: FinancialAccount[];
  upcomingPayments: UpcomingPayment[];
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
  setGoalAllocationMode: (mode: GoalAllocationMode) => Promise<boolean>;
  moveGoal: (goalId: string, direction: -1 | 1) => Promise<boolean>;
  addGoalContribution: (
    amount: number,
    goalId?: string | null,
  ) => Promise<boolean>;
  completeGoal: (goalId: string) => Promise<boolean>;
  continueGoalAsSavings: (goalId: string) => Promise<boolean>;
  createLoan: (loan: LoanDraft) => Promise<boolean>;
  dismissGoalNotice: (noticeId: string) => Promise<void>;
  updateBudgetAmount: (id: string, amount: number) => Promise<boolean>;
  saveBudgetAllocations: (
    budgets: BudgetCategory[],
    plannedMonthlyIncome: number,
  ) => Promise<boolean>;
  createBudgetSubcategory: (
    parentId: BudgetGroupKey,
    name: string,
    percentage: number,
  ) => Promise<BudgetCategory | null>;
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

export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [firstDashboardVisit, setFirstDashboardVisit] = useState(false);
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft);
  const [transactions, setTransactions] = useState<ExpenseDraft[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [goalAllocationMode, setGoalAllocationModeState] =
    useState<GoalAllocationMode>('priority');
  const [goalNotice, setGoalNotice] = useState<GoalNotice | null>(null);
  const [planTier, setPlanTier] = useState<'free' | 'pro' | 'max'>('free');
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPayment[]>([]);
  const [coachInsight, setCoachInsight] = useState<CoachInsight | null>(null);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [budgetCycleStartDay, setBudgetCycleStartDay] = useState(1);
  const [budgetRolloverMode, setBudgetRolloverMode] =
    useState<BudgetRolloverMode>('savings');
  const [error, setError] = useState<string | null>(null);
  const activeUserId = useRef<string | null>(null);

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
    const historyStart = new Date();
    historyStart.setFullYear(historyStart.getFullYear() - 1);
    historyStart.setHours(0, 0, 0, 0);
    const upcomingLimit = new Date();
    upcomingLimit.setDate(upcomingLimit.getDate() + 7);
    const [
      budgetsResult,
      goalsResult,
      transactionResult,
      goalSettingsResult,
      loansResult,
      goalNoticeResult,
    ] = await Promise.all([
      supabase
        .from('budget_categories')
        .select('category_key,name,emoji,monthly_limit,allocation_percentage,parent_key,is_macro')
        .eq('user_id', userId)
        .order('created_at'),
      supabase
        .from('goals')
        .select('id,name,target_amount,saved_amount,deadline_label,monthly_contribution,allocation_percentage,priority,status')
        .eq('user_id', userId)
        .eq('active', true)
        .order('priority')
        .order('created_at'),
      supabase
        .from('transactions')
        .select('id,description,amount,category,occurred_at,source,kind,financial_account_id,bank_status,excluded_from_totals,internal_transfer,excluded_from_budget,income_type')
        .eq('user_id', userId)
        .gte('occurred_at', historyStart.toISOString())
        .order('occurred_at', { ascending: false }),
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
    ]);

    if (
      budgetsResult.error ||
      goalsResult.error ||
      transactionResult.error ||
      goalSettingsResult.error ||
      loansResult.error ||
      goalNoticeResult.error
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
      source: item.source,
      kind: (item.kind ?? 'expense') as ExpenseDraft['kind'],
      financialAccountId: item.financial_account_id,
      bankStatus: item.bank_status,
      excludedFromTotals: Boolean(item.excluded_from_totals),
      internalTransfer: Boolean(item.internal_transfer),
      excludedFromBudget: Boolean(item.excluded_from_budget),
      incomeType: item.income_type as ExpenseDraft['incomeType'],
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
    setTransactions(monthlyTransactions);
    setGoals(hydratedGoals);
    setGoalAllocationModeState(
      goalSettingsResult.data.goal_allocation_mode as GoalAllocationMode,
    );
    setPlanTier(goalSettingsResult.data.plan_tier as 'free' | 'pro' | 'max');
    setBudgetCycleStartDay(
      Number(goalSettingsResult.data.budget_cycle_start_day) || 1,
    );
    setBudgetRolloverMode(
      (goalSettingsResult.data.budget_rollover_mode ?? 'savings') as BudgetRolloverMode,
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
        .select('id,name,current_balance,previous_month_balance,source,last_synced_at,institution_name,currency')
        .eq('user_id', userId)
        .eq('active', true)
        .order('created_at'),
      supabase
        .from('recurring_payments')
        .select('id,name,amount,next_due_at,kind')
        .eq('user_id', userId)
        .eq('active', true)
        .gte('next_due_at', new Date().toISOString())
        .lte('next_due_at', upcomingLimit.toISOString())
        .order('next_due_at'),
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
        lastSyncedAt: account.last_synced_at,
        institutionName: account.institution_name,
        currency: account.currency,
      })),
    );
    setUpcomingPayments(
      (paymentsResult.data ?? []).map((payment) => ({
        id: payment.id,
        name: payment.name,
        amount: Number(payment.amount),
        dueAt: payment.next_due_at,
        kind: payment.kind as UpcomingPayment['kind'],
      })),
    );
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
      setOnboardingComplete(false);
      setFirstDashboardVisit(false);
      setDraft(initialDraft);
      setTransactions([]);
      setGoals([]);
      setLoans([]);
      setGoalAllocationModeState('priority');
      setGoalNotice(null);
      setPlanTier('free');
      setFinancialAccounts([]);
      setUpcomingPayments([]);
      setCoachInsight(null);
      setAmountsVisible(true);
      setBudgetCycleStartDay(1);
      setBudgetRolloverMode('savings');
      setError(null);
      return;
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed')
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
    if (completed) await hydrateUserData(nextSession.user.id);
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
        await SplashScreen.hideAsync();
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
    const channel = supabase
      .channel(`goal-events:${userId}`)
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
          void hydrateUserData(userId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hydrateUserData, onboardingComplete, session?.user.id]);

  const budgetMonthlyIncome = useMemo(() => {
    const cycle = financialCycleForDate(new Date(), budgetCycleStartDay);
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
    const category = normalizeTransactionCategory(transaction.category, kind);
    const incomeTreatment =
      kind === 'income' ? incomeTreatmentForCategory(category) : null;
    const { data, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: session.user.id,
        description: transaction.description.trim(),
        amount: transaction.amount,
        category,
        source: 'manual',
        kind,
        income_type: incomeTreatment?.incomeType ?? null,
        excluded_from_budget: incomeTreatment?.excludedFromBudget ?? false,
        occurred_at: occurredAt,
      })
      .select('id,description,amount,category,source,kind,occurred_at')
      .single();
    setSaving(false);

    if (insertError) {
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
      source: data.source,
      kind: data.kind,
      incomeType: incomeTreatment?.incomeType,
      excludedFromBudget: incomeTreatment?.excludedFromBudget ?? false,
    };
    if (recordedTransaction.kind !== 'income') {
      setDraft((current) => ({ ...current, expense: recordedTransaction }));
    }
    setTransactions((current) => [recordedTransaction, ...current]);
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

    setSaving(true);
    setError(null);
    const selectedBudgets = budgets.filter((item) => item.selected);
    const { error: updateError } = await supabase.rpc('save_budget_allocations', {
      p_planned_monthly_income: plannedMonthlyIncome,
      p_allocations: selectedBudgets.map((item) => ({
        id: item.id,
        percentage: item.percentage,
        isMacro: Boolean(item.isMacro),
        parentId: item.parentId,
      })),
    });
    setSaving(false);

    if (updateError) {
      if (__DEV__) console.error('Flownd budget allocation update failed', updateError);
      setError('Non siamo riusciti ad aggiornare il piano budget. Riprova.');
      return false;
    }

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
      transaction.kind === 'income'
        ? incomeTreatmentForCategory(nextCategory)
        : null;
    if (!nextDescription || !nextCategory || transaction.amount <= 0) return false;

    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        description: nextDescription,
        amount: transaction.amount,
        category: nextCategory,
        kind: transaction.kind,
        income_type: incomeTreatment?.incomeType ?? null,
        excluded_from_budget: incomeTreatment?.excludedFromBudget ?? false,
        occurred_at: transaction.occurredAt,
      })
      .eq('id', transactionId)
      .eq('user_id', session.user.id);
    setSaving(false);

    if (updateError) {
      if (__DEV__) console.error('Flownd transaction update failed', updateError);
      setError('Non siamo riusciti ad aggiornare la transazione.');
      return false;
    }

    const updatedFields: Partial<ExpenseDraft> = {
      description: nextDescription,
      amount: transaction.amount,
      category: nextCategory,
      kind: transaction.kind,
      incomeType: incomeTreatment?.incomeType,
      excludedFromBudget: incomeTreatment?.excludedFromBudget ?? false,
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
      kind === 'income' ? incomeTreatmentForCategory(nextCategory) : null;
    const updatedFields: Partial<ExpenseDraft> = {
      category: nextCategory,
      incomeType: incomeTreatment?.incomeType,
      excludedFromBudget: incomeTreatment?.excludedFromBudget ?? false,
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
    if (!transaction || !['manual', 'onboarding'].includes(transaction.source ?? '')) {
      setError('I movimenti bancari non possono essere eliminati. Puoi riclassificarli.');
      return false;
    }
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .eq('user_id', session.user.id)
      .in('source', ['manual', 'onboarding']);
    setSaving(false);
    if (deleteError) {
      if (__DEV__) console.error('Flownd transaction delete failed', deleteError);
      setError('Non siamo riusciti a eliminare la transazione.');
      return false;
    }
    setTransactions((current) =>
      current.filter((item) => item.id !== transactionId),
    );
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
    percentage: number,
  ) {
    if (!session) {
      setError('La sessione è scaduta. Accedi di nuovo.');
      return null;
    }
    const trimmedName = name.trim();
    const safePercentage = Math.round(percentage);
    const siblingTotal = draft.budgets
      .filter((item) => !item.isMacro && item.parentId === parentId)
      .reduce((sum, item) => sum + item.percentage, 0);
    if (!trimmedName || safePercentage < 1 || siblingTotal + safePercentage > 100) {
      setError('La sottocategoria deve lasciare il totale della macro entro il 100%.');
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
    const amount = Math.round(
      (budgetMonthlyIncome * parent.percentage * safePercentage) / 10000,
    );
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('budget_categories')
      .insert({
        user_id: session.user.id,
        category_key: categoryKey,
        name: trimmedName,
        emoji: null,
        monthly_limit: Math.max(1, amount),
        allocation_percentage: safePercentage,
        parent_key: parentId,
        is_macro: false,
      })
      .select('category_key,name,emoji,monthly_limit,allocation_percentage,parent_key,is_macro')
      .single();
    setSaving(false);
    if (insertError) {
      if (__DEV__) console.error('Flownd budget subcategory insert failed', insertError);
      setError('Non siamo riusciti a creare la sottocategoria.');
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
      isMacro: Boolean(data.is_macro),
    };
    setDraft((current) => ({
      ...current,
      budgets: [...current.budgets, created],
    }));
    return created;
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
    const currentIndex = goals.findIndex((goal) => goal.id === goalId);
    const nextIndex = currentIndex + direction;
    if (!session || currentIndex < 0 || nextIndex < 0 || nextIndex >= goals.length) {
      return false;
    }
    const reordered = [...goals];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const prioritized = reordered.map((goal, index) => ({ ...goal, priority: index }));
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
    const { error: contributionError } = await supabase.rpc(
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
    return true;
  }

  async function completeGoal(goalId: string) {
    if (!session) return false;
    const completedGoal = goals.find((goal) => goal.id === goalId);
    const nextGoal = [...goals]
      .filter((goal) => goal.id !== goalId && goal.status === 'active')
      .sort((first, second) => first.priority - second.priority)[0];
    const operations = [
      supabase
        .from('goals')
        .update({ active: false, status: 'completed', completed_at: new Date().toISOString() })
        .eq('user_id', session.user.id)
        .eq('id', goalId),
    ];
    if (
      goalAllocationMode === 'priority' &&
      completedGoal &&
      nextGoal &&
      completedGoal.monthlyContribution > 0
    ) {
      operations.push(
        supabase
          .from('goals')
          .update({
            monthly_contribution:
              nextGoal.monthlyContribution + completedGoal.monthlyContribution,
          })
          .eq('user_id', session.user.id)
          .eq('id', nextGoal.id),
      );
    }
    const results = await Promise.all(operations);
    if (results.some((result) => result.error)) {
      setError('Non siamo riusciti a completare l’obiettivo.');
      return false;
    }
    const remaining = goals
      .filter((goal) => goal.id !== goalId)
      .map((goal) =>
        goal.id === nextGoal?.id && goalAllocationMode === 'priority'
          ? {
              ...goal,
              monthlyContribution:
                goal.monthlyContribution +
                (completedGoal?.monthlyContribution ?? 0),
            }
          : goal,
      );
    setGoals(remaining);
    if (draft.goal.id === goalId && remaining[0]) {
      setDraft((current) => ({ ...current, goal: remaining[0] }));
    }
    return true;
  }

  async function continueGoalAsSavings(goalId: string) {
    if (!session) return false;
    const { error: updateError } = await supabase
      .from('goals')
      .update({ status: 'free_savings', deadline_label: null })
      .eq('user_id', session.user.id)
      .eq('id', goalId);
    if (updateError) {
      setError('Non siamo riusciti a convertire l’obiettivo.');
      return false;
    }
    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? { ...goal, status: 'free_savings', deadline: '' }
          : goal,
      ),
    );
    return true;
  }

  async function createLoan(loan: LoanDraft) {
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

  const value: AppContextValue = {
    session,
    loading,
    saving,
    onboardingComplete,
    firstDashboardVisit,
    draft,
    transactions,
    goals,
    loans,
    goalAllocationMode,
    goalNotice,
    planTier,
    financialAccounts,
    upcomingPayments,
    coachInsight,
    amountsVisible,
    budgetCycleStartDay,
    budgetRolloverMode,
    budgetMonthlyIncome,
    error,
    updateDraft: (next) => setDraft((current) => ({ ...current, ...next })),
    completeOnboarding,
    addTransaction,
    updateTransaction,
    categorizeTransactions,
    deleteTransaction,
    setTransactionBudgetInclusion,
    createGoal,
    updateGoal,
    setGoalAllocationMode,
    moveGoal,
    addGoalContribution,
    completeGoal,
    continueGoalAsSavings,
    createLoan,
    dismissGoalNotice,
    updateBudgetAmount,
    saveBudgetAllocations,
    createBudgetSubcategory,
    updateBudgetCycleSettings,
    dismissFirstVisit: () => setFirstDashboardVisit(false),
    toggleAmountsVisible,
    clearError: () => setError(null),
    refreshData: async () => {
      if (session?.user.id) await hydrateUserData(session.user.id);
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp deve essere usato dentro AppProvider');
  return value;
}
