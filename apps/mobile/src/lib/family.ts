import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type SharingAccess = 'none' | 'view' | 'edit';
export type GroupRole = 'owner' | 'member' | 'readonly';

export type SharingPreferences = {
  shareMonthlyBudget: boolean;
  shareNetWorth: boolean;
  shareTransactions: boolean;
  shareTransactionCategories: boolean;
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
};

export type FamilyDashboardSummary = {
  groupId: string;
  groupName: string;
  currency: string;
  memberCount: number;
  budgetTotal: number;
  budgetSpent: number;
  netWorthTotal: number;
  sharedGoalCount: number;
  goalSaved: number;
  goalTarget: number;
  transactionCount: number;
  categoryCount: number;
};

type AccessDraft = {
  role: Exclude<GroupRole, 'owner'>;
  transactionsAccess: SharingAccess;
  budgetsAccess: SharingAccess;
  goalsAccess: SharingAccess;
};

export async function fetchFamilyGroups(userId: string) {
  const { data: memberships, error: membershipsError } = await supabase
    .from('group_members')
    .select('group_id,role,transactions_access,budgets_access,goals_access,share_monthly_budget,share_net_worth,share_transactions,share_transaction_categories')
    .eq('user_id', userId)
    .order('joined_at');
  if (membershipsError) throw membershipsError;
  if (!memberships?.length) return [];

  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id,name,owner_id,currency')
    .in('id', memberships.map((membership) => membership.group_id));
  if (groupsError) throw groupsError;

  const groupById = new Map((groups ?? []).map((group) => [group.id, group]));
  return memberships.flatMap((membership): FamilyGroup[] => {
    const group = groupById.get(membership.group_id);
    if (!group) return [];
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
      shareTransactionCategories: Boolean(membership.share_transaction_categories),
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
      .select('user_id,display_name,email,avatar_url,role,transactions_access,budgets_access,goals_access,share_monthly_budget,share_net_worth,share_transactions,share_transaction_categories')
      .eq('group_id', group.id)
      .order('joined_at'),
    supabase
      .from('goals')
      .select('id,name,target_amount,saved_amount')
      .eq('group_id', group.id)
      .eq('active', true)
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

  const [shareLinksResult, personalGoalsResult] = await Promise.all([
    supabase
      .from('goal_group_shares')
      .select('goal_id')
      .eq('group_id', group.id),
    supabase
      .from('goals')
      .select('id,name,target_amount,saved_amount')
      .eq('user_id', userId)
      .is('group_id', null)
      .eq('active', true)
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
    members: (membersResult.data ?? []).map((member) => ({
      userId: member.user_id,
      displayName: member.display_name || member.email || 'Membro Flownd',
      email: member.email,
      avatarUrl: member.avatar_url,
      role: member.role as GroupRole,
      transactionsAccess: member.transactions_access as SharingAccess,
      budgetsAccess: member.budgets_access as SharingAccess,
      goalsAccess: member.goals_access as SharingAccess,
      shareMonthlyBudget: Boolean(member.share_monthly_budget),
      shareNetWorth: Boolean(member.share_net_worth),
      shareTransactions: Boolean(member.share_transactions),
      shareTransactionCategories: Boolean(member.share_transaction_categories),
    })),
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
  const { error } = await supabase.from('group_invites').insert({
    group_id: groupId,
    email: normalizedEmail,
    invited_by: invitedBy,
    role: access.role,
    transactions_access: access.transactionsAccess,
    budgets_access: access.budgetsAccess,
    goals_access: access.goalsAccess,
  });
  if (error) throw error;
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
) {
  const { data, error } = await supabase.rpc('create_shared_expense', {
    p_group_id: groupId,
    p_description: description,
    p_amount: amount,
    p_occurred_at: occurredAt,
    p_shares: shares,
    p_transaction_id: transactionId ?? null,
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
  const { data, error } = await supabase.rpc('family_dashboard_summary', {
    p_group_id: groupId,
  });
  if (error) throw error;
  const summary = data as Record<string, unknown>;
  return {
    groupId: String(summary.groupId),
    groupName: String(summary.groupName),
    currency: String(summary.currency),
    memberCount: Number(summary.memberCount),
    budgetTotal: Number(summary.budgetTotal),
    budgetSpent: Number(summary.budgetSpent),
    netWorthTotal: Number(summary.netWorthTotal),
    sharedGoalCount: Number(summary.sharedGoalCount),
    goalSaved: Number(summary.goalSaved),
    goalTarget: Number(summary.goalTarget),
    transactionCount: Number(summary.transactionCount),
    categoryCount: Number(summary.categoryCount),
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
