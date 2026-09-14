export type ContributionInput = {
  id: string;
  monthlyIncome: number;
  percentage: number;
};

export function contributionAmounts(monthlyIncome: number, percentage: number) {
  const safeIncome = Math.max(0, monthlyIncome);
  const safePercentage = Math.min(100, Math.max(0, percentage));
  const group = Math.round(safeIncome * safePercentage) / 100;
  return { group, personal: Math.max(0, safeIncome - group) };
}

export function totalContributionPercentage(percentages: number[]) {
  return percentages.reduce((total, percentage) => total + percentage, 0);
}

export function buildContributionPlan(members: ContributionInput[]) {
  return members.map((member) => ({
    ...member,
    ...contributionAmounts(member.monthlyIncome, member.percentage),
  }));
}

export function coveredContribution(
  plannedAmount: number,
  receivedIncome: number,
  percentage: number,
) {
  const receivedShare = contributionAmounts(receivedIncome, percentage).group;
  return Math.min(Math.max(0, plannedAmount), receivedShare);
}

export function splitByContribution(
  amount: number,
  members: { id: string; percentage: number }[],
) {
  const eligible = members.filter((member) => member.percentage > 0);
  const weighted = eligible.length
    ? eligible
    : members.map((member) => ({ ...member, percentage: 1 }));
  const totalWeight = totalContributionPercentage(
    weighted.map((member) => member.percentage),
  );
  let allocated = 0;
  return weighted.map((member, index) => {
    const share = index === weighted.length - 1
      ? Math.round((amount - allocated) * 100) / 100
      : Math.round(amount * member.percentage / totalWeight * 100) / 100;
    allocated += share;
    return { memberId: member.id, amount: share };
  });
}

export function calculateMemberBalances(
  memberIds: string[],
  expenses: {
    paidBy: string;
    amount: number;
    shares: { memberId: string; amount: number }[];
  }[],
) {
  const balances = new Map(memberIds.map((memberId) => [memberId, 0]));
  for (const expense of expenses) {
    balances.set(
      expense.paidBy,
      (balances.get(expense.paidBy) ?? 0) + expense.amount,
    );
    for (const share of expense.shares) {
      balances.set(
        share.memberId,
        (balances.get(share.memberId) ?? 0) - share.amount,
      );
    }
  }
  return memberIds.map((memberId) => ({
    memberId,
    balance: Math.round((balances.get(memberId) ?? 0) * 100) / 100,
  }));
}
