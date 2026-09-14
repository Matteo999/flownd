import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type SharingAccess = 'none' | 'view' | 'edit';
export type GroupRole = 'owner' | 'member' | 'readonly';
export type TransactionVisibility = 'none' | 'summary' | 'full';
export type NetWorthVisibility = 'none' | 'all' | 'selected';

export type SharingPreferences = {
  shareMonthlyBudget: boolean;
  shareNetWorth: boolean;
  shareTransactions: boolean;
  shareTransactionCategories: boolean;
  contributionPercentage: number;
  scheduledContributionPercentage: number | null;
  scheduledContributionDate: string | null;
  transactionVisibility: TransactionVisibility;
  netWorthVisibility: NetWorthVisibility;
};

export type FamilyGroup = {
  id: string;
  name: string;
  ownerId: string;
  currency: string;
  role: GroupRole;
  transactionsAccess: SharingAccess;
  budgetsAccess: SharingAccess;
  goalsAccess: SharingAccess;
} & SharingPreferences;

export type GroupMember = {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: GroupRole;
  transactionsAccess: SharingAccess;
  budgetsAccess: SharingAccess;
  goalsAccess: SharingAccess;
  plannedContribution: number;
  coveredContribution: number;
  consumedContribution: number;
  remainingContribution: number;
} & SharingPreferences;

export type GroupInvite = {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  role: Exclude<GroupRole, 'owner'>;
  transactionsAccess: SharingAccess;
  budgetsAccess: SharingAccess;
  goalsAccess: SharingAccess;
  expiresAt: string;
};

export type FamilyGoalSummary = {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
};

export type ShareableGoal = FamilyGoalSummary & { shared: boolean };

export type FamilyBudgetSummary = {
  id: string;
  category: string;
  monthlyLimit: number;
  spent: number;
};

export type FamilyExpenseSummary = {
  id: string;
  amount: number;
  category: 'needs' | 'wants' | 'savings';
  occurredAt: string;
};

export type MemberBalance = {
  userId: string;
  balance: number;
};

export type FamilyGroupDetail = {
  members: GroupMember[];
  pendingInvites: GroupInvite[];
  goals: FamilyGoalSummary[];
  budgets: FamilyBudgetSummary[];
  balances: MemberBalance[];
  shareableGoals: ShareableGoal[];
  summary: FamilyDashboardSummary;
  selectedAccountIds: string[];
  recentTransactions: {
    id: string;
    memberId: string;
    description: string;
    amount: number;
    category: string | null;
    occurredAt: string;
  }[];
};

export type FamilyDashboardSummary = {
  groupId: string;
  groupName: string;
  currency: string;
  memberCount: number;
  members: { userId: string; displayName: string; avatarUrl: string | null }[];
  budgetTotal: number;
  budgetCovered: number;
  budgetSpent: number;
  budgetRemaining: number;
  netWorthTotal: number;
  sharedGoalCount: number;
  goalSaved: number;
  goalTarget: number;
  transactionCount: number;
  categoryCount: number;
  budgets: FamilyBudgetSummary[];
  expenses: FamilyExpenseSummary[];
  contributions: GroupContributionSummary[];
  myPreviousCycle: GroupPreviousCycle | null;
};

export type GroupContributionSummary = {
  userId: string;
  percentage: number;
  planned: number;
  covered: number;
  consumed: number;
  remaining: number;
};

export type GroupPreviousCycle = {
  cycleStart: string;
  amount: number;
  action: 'carry_group' | 'shared_goal' | 'personal_next_cycle' | null;
  goalId: string | null;
};

type AccessDraft = {
  role: Exclude<GroupRole, 'owner'>;
  transactionsAccess: SharingAccess;
  budgetsAccess: SharingAccess;
  goalsAccess: SharingAccess;
};

export async function fetchFamilyGroups(userId: string) {
  const [membershipsResult, rulesResult] = await Promise.all([
    supabase
      .from('group_members')
      .select('group_id,role,transactions_access,budgets_access,goals_access,share_monthly_budget,share_net_worth,share_transactions,share_transaction_categories,transaction_visibility,net_worth_visibility')
      .eq('user_id', userId)
      .order('joined_at'),
    supabase
      .from('group_contribution_rules')
      .select('group_id,percentage,effective_from')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false }),
  ]);
  const { data: memberships, error: membershipsError } = membershipsResult;
  if (membershipsError) throw membershipsError;
  if (rulesResult.error) throw rulesResult.error;
  if (!memberships?.length) return [];

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const rulesByGroup = new Map<string, {
    current: number;
    scheduled: number | null;
    date: string | null;
  }>();
  const currentRuleGroups = new Set<string>();
  const scheduledRuleGroups = new Set<string>();
  for (const rule of rulesResult.data ?? []) {
    const current = rulesByGroup.get(rule.group_id) ?? {
      current: 0,
      scheduled: null,
      date: null,
    };
    const effective = new Date(`${rule.effective_from}T00:00:00`);
    if (effective <= monthStart && !currentRuleGroups.has(rule.group_id)) {
      current.current = Number(rule.percentage);
      currentRuleGroups.add(rule.group_id);
    } else if (effective > monthStart && !scheduledRuleGroups.has(rule.group_id)) {
      current.scheduled = Number(rule.percentage);
      current.date = rule.effective_from;
      scheduledRuleGroups.add(rule.group_id);
    }
    rulesByGroup.set(rule.group_id, current);
  }

  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id,name,owner_id,currency')
    .in('id', memberships.map((membership) => membership.group_id));
  if (groupsError) throw groupsError;

  const groupById = new Map((groups ?? []).map((group) => [group.id, group]));
  return memberships.flatMap((membership): FamilyGroup[] => {
    const group = groupById.get(membership.group_id);
    if (!group) return [];
    const contribution = rulesByGroup.get(group.id) ?? {
      current: 0,
      scheduled: null,
      date: null,
    };
    return [{
      id: group.id,
      name: group.name,
      ownerId: group.owner_id,
      currency: group.currency,
      role: membership.role as GroupRole,
      transactionsAccess: membership.transactions_access as SharingAccess,
      budgetsAccess: membership.budgets_access as SharingAccess,
      goalsAccess: membership.goals_access as SharingAccess,
      shareMonthlyBudget: Boolean(membership.share_monthly_budget),
      shareNetWorth: Boolean(membership.share_net_worth),
      shareTransactions: Boolean(membership.share_transactions),
      shareTransactionCategories: Boolean(membership.share_transactions),
      contributionPercentage: contribution.current,
      scheduledContributionPercentage: contribution.scheduled,
      scheduledContributionDate: contribution.date,
      transactionVisibility: (membership.transaction_visibility ?? (
        membership.share_transactions ? 'full' : 'none'
      )) as TransactionVisibility,
      netWorthVisibility: (membership.net_worth_visibility ?? (
        membership.share_net_worth ? 'all' : 'none'
      )) as NetWorthVisibility,
    }];
  });
}

export async function fetchReceivedInvites(email: string) {
  const { data: invites, error } = await supabase
    .from('group_invites')
    .select('id,group_id,email,role,transactions_access,budgets_access,goals_access,expires_at')
    .eq('status', 'pending')
    .ilike('email', email)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return attachGroupNames(invites ?? []);
}

export async function fetchFamilyGroupDetail(
  group: FamilyGroup,
  userId: string,
): Promise<FamilyGroupDetail> {
  const requests = [
    supabase
      .from('group_members')
      .select('user_id,display_name,email,avatar_url,role,transactions_access,budgets_access,goals_access,share_monthly_budget,share_net_worth,share_transactions,share_transaction_categories,transaction_visibility,net_worth_visibility')
      .eq('group_id', group.id)
      .order('joined_at'),
    supabase
      .from('goals')
      .select('id,name,target_amount,saved_amount')
      .eq('group_id', group.id)
      .eq('active', true)
      .neq('status', 'free_savings')
      .order('priority'),
    supabase
      .from('group_budgets')
      .select('id,category,monthly_limit')
      .eq('group_id', group.id)
      .order('category'),
    supabase.rpc('group_member_balances', { p_group_id: group.id }),
  ] as const;

  const [membersResult, goalsResult, budgetsResult, balancesResult] =
    await Promise.all(requests);
  const firstError = [membersResult, goalsResult, budgetsResult, balancesResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const [dashboardSummary, sharedTransactionsResult, accountSharesResult] = await Promise.all([
    fetchFamilyDashboardSummary(group.id),
    supabase.rpc('shared_group_transactions', { p_group_id: group.id }),
    supabase
      .from('group_account_shares')
      .select('financial_account_id')
      .eq('group_id', group.id)
      .eq('user_id', userId),
  ]);
  if (sharedTransactionsResult.error) throw sharedTransactionsResult.error;
  if (accountSharesResult.error) throw accountSharesResult.error;
  const contributionByUser = new Map(
    dashboardSummary.contributions.map((item) => [item.userId, item]),
  );

  const [shareLinksResult, personalGoalsResult] = await Promise.all([
    supabase
      .from('goal_group_shares')
      .select('goal_id')
      .eq('group_id', group.id),
    supabase
      .from('goals')
      .select('id,name,target_amount,saved_amount,status')
      .eq('user_id', userId)
      .is('group_id', null)
      .eq('active', true)
      .neq('status', 'free_savings')
      .order('priority'),
  ]);
  if (shareLinksResult.error) throw shareLinksResult.error;
  if (personalGoalsResult.error) throw personalGoalsResult.error;
  const sharedGoalIds = (shareLinksResult.data ?? []).map((share) => share.goal_id);
  const { data: explicitlySharedGoals, error: explicitlySharedGoalsError } =
    sharedGoalIds.length
      ? await supabase
          .from('goals')
          .select('id,name,target_amount,saved_amount')
          .in('id', sharedGoalIds)
          .eq('active', true)
          .neq('status', 'free_savings')
      : { data: [], error: null };
  if (explicitlySharedGoalsError) throw explicitlySharedGoalsError;

  let pendingInvites: GroupInvite[] = [];
  if (group.role === 'owner') {
    const { data, error } = await supabase
      .from('group_invites')
      .select('id,group_id,email,role,transactions_access,budgets_access,goals_access,expires_at')
      .eq('group_id', group.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    pendingInvites = await attachGroupNames(data ?? []);
  }

  return {
    members: (membersResult.data ?? []).map((member) => {
      const contribution = contributionByUser.get(member.user_id);
      return {
        userId: member.user_id,
        displayName: member.display_name || member.email || 'Membro Flownd',
        email: member.email,
        avatarUrl: member.avatar_url,
        role: member.role as GroupRole,
        transactionsAccess: member.transactions_access as SharingAccess,
        budgetsAccess: member.budgets_access as SharingAccess,
        goalsAccess: member.goals_access as SharingAccess,
        shareMonthlyBudget: (contribution?.percentage ?? 0) > 0,
        shareNetWorth: Boolean(member.share_net_worth),
        shareTransactions: Boolean(member.share_transactions),
        shareTransactionCategories: Boolean(member.share_transactions),
        contributionPercentage: contribution?.percentage ?? 0,
        scheduledContributionPercentage: member.user_id === userId
          ? group.scheduledContributionPercentage
          : null,
        scheduledContributionDate: member.user_id === userId
          ? group.scheduledContributionDate
          : null,
        transactionVisibility: (member.transaction_visibility ?? (
          member.share_transactions ? 'full' : 'none'
        )) as TransactionVisibility,
        netWorthVisibility: (member.net_worth_visibility ?? (
          member.share_net_worth ? 'all' : 'none'
        )) as NetWorthVisibility,
        plannedContribution: contribution?.planned ?? 0,
        coveredContribution: contribution?.covered ?? 0,
        consumedContribution: contribution?.consumed ?? 0,
        remainingContribution: contribution?.remaining ?? 0,
      };
    }),
    pendingInvites,
    goals: [...(goalsResult.data ?? []), ...(explicitlySharedGoals ?? [])]
      .filter((goal, index, goals) => goals.findIndex((item) => item.id === goal.id) === index)
      .map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: Number(goal.target_amount),
      savedAmount: Number(goal.saved_amount),
      })),
    budgets: (budgetsResult.data ?? []).map((budget) => ({
      id: budget.id,
      category: budget.category,
      monthlyLimit: Number(budget.monthly_limit),
      spent: dashboardSummary.budgets.find((item) => item.id === budget.id)?.spent ?? 0,
    })),
    balances: ((balancesResult.data ?? []) as {
      user_id: string;
      balance: number | string;
    }[]).map((balance) => ({
      userId: balance.user_id,
      balance: Number(balance.balance),
    })),
    shareableGoals: (personalGoalsResult.data ?? []).map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: Number(goal.target_amount),
      savedAmount: Number(goal.saved_amount),
      shared: sharedGoalIds.includes(goal.id),
    })),
    summary: dashboardSummary,
    selectedAccountIds: (accountSharesResult.data ?? [])
      .map((item) => item.financial_account_id),
    recentTransactions: ((sharedTransactionsResult.data ?? []) as {
      id: string;
      member_id: string;
      description: string;
      amount: number | string;
      category: string | null;
      occurred_at: string;
    }[]).map((transaction) => ({
      id: transaction.id,
      memberId: transaction.member_id,
      description: transaction.description,
      amount: Number(transaction.amount),
      category: transaction.category,
      occurredAt: transaction.occurred_at,
    })),
  };
}

async function attachGroupNames<
  T extends {
    id: string;
    group_id: string;
    email: string;
    role: string;
    transactions_access: string;
    budgets_access: string;
    goals_access: string;
    expires_at: string;
  },
>(invites: T[]): Promise<GroupInvite[]> {
  if (!invites.length) return [];
  const { data: groups, error } = await supabase
    .from('groups')
    .select('id,name')
    .in('id', [...new Set(invites.map((invite) => invite.group_id))]);
  if (error) throw error;
  const names = new Map((groups ?? []).map((group) => [group.id, group.name]));
  return invites.map((invite) => ({
    id: invite.id,
    groupId: invite.group_id,
    groupName: names.get(invite.group_id) ?? 'Gruppo Flownd',
    email: invite.email,
    role: invite.role as GroupInvite['role'],
    transactionsAccess: invite.transactions_access as SharingAccess,
    budgetsAccess: invite.budgets_access as SharingAccess,
    goalsAccess: invite.goals_access as SharingAccess,
    expiresAt: invite.expires_at,
  }));
}

export async function createFamilyGroup(name: string) {
  const { data, error } = await supabase.rpc('create_family_group', {
    p_name: name.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function createGroupInvite(
  groupId: string,
  email: string,
  invitedBy: string,
  access: AccessDraft,
  accessToken?: string,
) {
  const normalizedEmail = email.trim().toLocaleLowerCase('en');
  const { error: expiryError } = await supabase
    .from('group_invites')
    .update({ status: 'expired' })
    .eq('group_id', groupId)
    .ilike('email', normalizedEmail)
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString());
  if (expiryError) throw expiryError;
  const { data: invite, error } = await supabase
    .from('group_invites')
    .insert({
      group_id: groupId,
      email: normalizedEmail,
      invited_by: invitedBy,
      role: access.role,
      transactions_access: access.transactionsAccess,
      budgets_access: access.budgetsAccess,
      goals_access: access.goalsAccess,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (!accessToken) return { emailSent: false };

  const configuredApi = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  const endpoint = configuredApi
    ? `${configuredApi}/api/transaction-tools?action=group-invite`
    : Platform.OS === 'web'
      ? '/api/transaction-tools?action=group-invite'
      : null;
  if (!endpoint) return { emailSent: false };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inviteId: invite.id }),
    });
    const body = await response.json() as { emailSent?: boolean };
    return { emailSent: response.ok && body.emailSent === true };
  } catch {
    return { emailSent: false };
  }
}

export async function createSharedGoal(
  groupId: string,
  name: string,
  targetAmount: number,
  deadline?: string,
) {
  const { data, error } = await supabase.rpc('create_shared_goal', {
    p_group_id: groupId,
    p_name: name,
    p_target_amount: targetAmount,
    p_deadline_label: deadline || null,
  });
  if (error) throw error;
  return data as string;
}

export async function addSharedGoalContribution(goalId: string, amount: number) {
  const { data, error } = await supabase.rpc('add_shared_goal_contribution', {
    p_goal_id: goalId,
    p_amount: amount,
  });
  if (error) throw error;
  return Number(data);
}

export async function saveFamilyBudget(
  groupId: string,
  category: string,
  monthlyLimit: number,
) {
  const { data, error } = await supabase.rpc('save_group_budget', {
    p_group_id: groupId,
    p_category: category,
    p_monthly_limit: monthlyLimit,
  });
  if (error) throw error;
  return data as string;
}

export async function createSharedExpense(
  groupId: string,
  description: string,
  amount: number,
  shares: { memberId: string; amount: number }[],
  occurredAt = new Date().toISOString(),
  transactionId?: string,
  macroCategory: 'needs' | 'wants' | 'savings' = 'needs',
) {
  const { data, error } = await supabase.rpc('create_group_expense_v2', {
    p_group_id: groupId,
    p_description: description,
    p_amount: amount,
    p_occurred_at: occurredAt,
    p_shares: shares.length ? shares : null,
    p_transaction_id: transactionId ?? null,
    p_macro_category: macroCategory,
  });
  if (error) throw error;
  return data as string;
}

export async function acceptGroupInvite(inviteId: string) {
  const { data, error } = await supabase.rpc('accept_group_invite', {
    p_invite_id: inviteId,
  });
  if (error) throw error;
  return data as string;
}

export async function updateGroupMemberAccess(
  groupId: string,
  userId: string,
  access: AccessDraft,
) {
  const { error } = await supabase
    .from('group_members')
    .update({
      role: access.role,
      transactions_access: access.transactionsAccess,
      budgets_access: access.budgetsAccess,
      goals_access: access.goalsAccess,
    })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateMyGroupSharing(
  groupId: string,
  preferences: SharingPreferences,
) {
  const { error } = await supabase.rpc('update_my_group_sharing', {
    p_group_id: groupId,
    p_share_monthly_budget: preferences.shareMonthlyBudget,
    p_share_net_worth: preferences.shareNetWorth,
    p_share_transactions: preferences.shareTransactions,
    p_share_transaction_categories: preferences.shareTransactionCategories,
  });
  if (error) throw error;
}

export async function setMyGroupContribution(groupId: string, percentage: number) {
  const { data, error } = await supabase.rpc('set_my_group_contribution', {
    p_group_id: groupId,
    p_percentage: percentage,
  });
  if (error) throw error;
  return data as string;
}

export async function setMyGroupPrivacy(
  groupId: string,
  transactionVisibility: TransactionVisibility,
  netWorthVisibility: NetWorthVisibility,
  accountIds: string[],
) {
  const { error } = await supabase.rpc('set_my_group_privacy', {
    p_group_id: groupId,
    p_transaction_visibility: transactionVisibility,
    p_net_worth_visibility: netWorthVisibility,
    p_account_ids: accountIds,
  });
  if (error) throw error;
}

export async function setMyGroupCycleDisposition(
  groupId: string,
  cycleStart: string,
  action: NonNullable<GroupPreviousCycle['action']>,
  goalId?: string,
) {
  const { error } = await supabase.rpc('set_my_group_cycle_disposition', {
    p_group_id: groupId,
    p_cycle_start: cycleStart,
    p_action: action,
    p_goal_id: goalId ?? null,
  });
  if (error) throw error;
}

export async function setGoalSharedWithGroup(
  groupId: string,
  goalId: string,
  shared: boolean,
) {
  const { error } = await supabase.rpc('set_goal_group_sharing', {
    p_group_id: groupId,
    p_goal_id: goalId,
    p_shared: shared,
  });
  if (error) throw error;
}

export async function leaveFamilyGroup(groupId: string) {
  const { error } = await supabase.rpc('leave_family_group', {
    p_group_id: groupId,
  });
  if (error) throw error;
}

export async function deleteFamilyGroup(groupId: string) {
  const { error } = await supabase.rpc('delete_family_group', {
    p_group_id: groupId,
  });
  if (error) throw error;
}

export async function fetchFamilyDashboardSummary(groupId: string) {
  const cycleStart = new Date();
  cycleStart.setDate(1);
  cycleStart.setHours(0, 0, 0, 0);
  const [summaryResult, budgetsResult, expensesResult] = await Promise.all([
    supabase.rpc('family_dashboard_summary', { p_group_id: groupId }),
    supabase
      .from('group_budgets')
      .select('id,category,monthly_limit')
      .eq('group_id', groupId)
      .order('category'),
    supabase
      .from('shared_expenses')
      .select('id,amount,macro_category,occurred_at')
      .eq('group_id', groupId)
      .order('occurred_at', { ascending: false })
      .limit(1000),
  ]);
  const { data, error } = summaryResult;
  if (error) throw error;
  if (budgetsResult.error) throw budgetsResult.error;
  if (expensesResult.error) throw expensesResult.error;
  const summary = data as Record<string, unknown>;
  const members = Array.isArray(summary.members)
    ? summary.members.map((member) => {
        const item = member as Record<string, unknown>;
        return {
          userId: String(item.userId),
          displayName: String(item.displayName || 'Membro Flownd'),
          avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : null,
        };
      })
    : [];
  const contributions = Array.isArray(summary.contributions)
    ? summary.contributions.map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          userId: String(item.userId),
          percentage: Number(item.percentage),
          planned: Number(item.planned),
          covered: Number(item.covered),
          consumed: Number(item.consumed),
          remaining: Number(item.remaining),
        };
      })
    : [];
  const previous = summary.myPreviousCycle as Record<string, unknown> | null;
  const expenses = (expensesResult.data ?? []).map((expense) => ({
    id: String(expense.id),
    amount: Number(expense.amount),
    category: expense.macro_category as FamilyExpenseSummary['category'],
    occurredAt: String(expense.occurred_at),
  }));
  const currentSpentByCategory = expenses.reduce<Record<string, number>>(
    (totals, expense) => {
      if (new Date(expense.occurredAt) >= cycleStart) {
        totals[expense.category] = (totals[expense.category] ?? 0) + expense.amount;
      }
      return totals;
    },
    {},
  );
  const budgetCategoryKey = (category: string) => {
    const normalized = category.toLocaleLowerCase('it-IT');
    if (normalized.includes('desider') || normalized === 'wants') return 'wants';
    if (normalized.includes('risparm') || normalized === 'savings') return 'savings';
    return 'needs';
  };
  return {
    groupId: String(summary.groupId),
    groupName: String(summary.groupName),
    currency: String(summary.currency),
    memberCount: Number(summary.memberCount),
    members,
    budgetTotal: Number(summary.budgetTotal),
    budgetCovered: Number(summary.budgetCovered ?? 0),
    budgetSpent: Number(summary.budgetSpent),
    budgetRemaining: Number(
      summary.budgetRemaining ?? Math.max(
        0,
        Number(summary.budgetTotal) - Number(summary.budgetSpent),
      ),
    ),
    netWorthTotal: Number(summary.netWorthTotal),
    sharedGoalCount: Number(summary.sharedGoalCount),
    goalSaved: Number(summary.goalSaved),
    goalTarget: Number(summary.goalTarget),
    transactionCount: Number(summary.transactionCount),
    categoryCount: Number(summary.categoryCount),
    budgets: (budgetsResult.data ?? []).map((budget) => ({
      id: budget.id,
      category: budget.category,
      monthlyLimit: Number(budget.monthly_limit),
      spent: currentSpentByCategory[budgetCategoryKey(budget.category)] ?? 0,
    })),
    expenses,
    contributions,
    myPreviousCycle: previous ? {
      cycleStart: String(previous.cycleStart),
      amount: Number(previous.amount),
      action: (previous.action as GroupPreviousCycle['action']) ?? null,
      goalId: typeof previous.goalId === 'string' ? previous.goalId : null,
    } : null,
  } satisfies FamilyDashboardSummary;
}

function activeFamilyGroupKey(userId: string) {
  return `flownd:active-family-group:${userId}`;
}

export async function getActiveFamilyGroupId(userId: string) {
  return AsyncStorage.getItem(activeFamilyGroupKey(userId));
}

export async function setActiveFamilyGroupId(
  userId: string,
  groupId: string | null,
) {
  if (groupId) {
    await AsyncStorage.setItem(activeFamilyGroupKey(userId), groupId);
  } else {
    await AsyncStorage.removeItem(activeFamilyGroupKey(userId));
  }
}
