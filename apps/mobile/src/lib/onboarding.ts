export type BudgetCategory = {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  selected: boolean;
  parentId?: BudgetGroupKey;
  isMacro?: boolean;
};

export type BudgetGroupKey = 'needs' | 'wants' | 'savings';

export const budgetGroups: {
  id: BudgetGroupKey;
  name: string;
  emoji: string;
}[] = [
  { id: 'needs', name: 'Necessità', emoji: '🏠' },
  { id: 'wants', name: 'Desideri', emoji: '🧳' },
  { id: 'savings', name: 'Risparmi', emoji: '🐷' },
];

export type IncomeBandId =
  | 'under-1000'
  | '1000-1500'
  | '1500-2000'
  | '2000-2500'
  | 'over-2500';

export type BudgetAllocation = {
  needs: number;
  wants: number;
  savings: number;
};

export const incomeBands: {
  id: IncomeBandId;
  label: string;
  shortLabel: string;
  monthlyReference: number;
}[] = [
  { id: 'under-1000', label: 'Meno di 1.000 €', shortLabel: '< 1.000 €', monthlyReference: 800 },
  { id: '1000-1500', label: 'Tra 1.000 e 1.500 €', shortLabel: '1.000 – 1.500 €', monthlyReference: 1250 },
  { id: '1500-2000', label: 'Tra 1.500 e 2.000 €', shortLabel: '1.500 – 2.000 €', monthlyReference: 1750 },
  { id: '2000-2500', label: 'Tra 2.000 e 2.500 €', shortLabel: '2.000 – 2.500 €', monthlyReference: 2250 },
  { id: 'over-2500', label: 'Più di 2.500 €', shortLabel: '> 2.500 €', monthlyReference: 2750 },
];

export type GoalDraft = {
  id?: string;
  name: string;
  targetAmount: number;
  deadline: string;
  savedAmount?: number;
  monthlyContribution?: number;
  allocationPercentage?: number;
  priority?: number;
  status?: 'active' | 'reached' | 'free_savings' | 'completed';
};

export type ExpenseDraft = {
  id?: string;
  description: string;
  amount: number;
  category: string;
  occurredAt?: string;
  source?: string;
  kind?: 'expense' | 'income';
};

export type OnboardingDraft = {
  incomeBand: IncomeBandId | null;
  monthlyReference: number;
  allocation: BudgetAllocation;
  budgets: BudgetCategory[];
  goal: GoalDraft;
  expense: ExpenseDraft;
};

export const defaultAllocation: BudgetAllocation = { needs: 50, wants: 30, savings: 20 };

export function createBudgetCategories(
  monthlyReference: number,
  allocation: BudgetAllocation,
): BudgetCategory[] {
  return [
    {
      id: 'needs',
      name: 'Necessità',
      emoji: '🏠',
      amount: Math.round((monthlyReference * allocation.needs) / 100),
      selected: true,
      parentId: 'needs',
      isMacro: true,
    },
    {
      id: 'wants',
      name: 'Desideri',
      emoji: '🧳',
      amount: Math.round((monthlyReference * allocation.wants) / 100),
      selected: true,
      parentId: 'wants',
      isMacro: true,
    },
    {
      id: 'savings',
      name: 'Risparmi',
      emoji: '🐷',
      amount: Math.round((monthlyReference * allocation.savings) / 100),
      selected: true,
      parentId: 'savings',
      isMacro: true,
    },
  ];
}

export function formatDateISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDraftDate(value: string) {
  const parts = value.trim().split(/[/-]/).map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  const [first, second, third] = parts;
  const date =
    first > 1900
      ? new Date(first, second - 1, third)
      : new Date(third, second - 1, first);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== (first > 1900 ? first : third) ||
    date.getMonth() !== second - 1 ||
    date.getDate() !== (first > 1900 ? third : first)
  ) {
    return null;
  }
  return date;
}

export function formatDateItalian(value: string) {
  const date = parseDraftDate(value);
  return date
    ? new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date)
    : '';
}

export function defaultGoalDeadline() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return formatDateISO(date);
}

export const initialDraft: OnboardingDraft = {
  incomeBand: null,
  monthlyReference: 1250,
  allocation: defaultAllocation,
  budgets: createBudgetCategories(1250, defaultAllocation),
  goal: { name: 'Fondo emergenza', targetAmount: 500, deadline: defaultGoalDeadline() },
  expense: { description: '', amount: 0, category: 'Altro' },
};

export function updateAllocation(
  current: BudgetAllocation,
  key: keyof BudgetAllocation,
  rawValue: number,
) {
  const next = { ...current };
  const value = Math.round(Math.max(5, Math.min(90, rawValue)));
  const delta = value - current[key];
  next[key] = value;

  const priority: Record<keyof BudgetAllocation, (keyof BudgetAllocation)[]> = {
    needs: ['wants', 'savings'],
    wants: ['needs', 'savings'],
    savings: ['wants', 'needs'],
  };

  let remaining = Math.abs(delta);
  for (const other of priority[key]) {
    if (!remaining) break;
    const available = delta > 0 ? next[other] - 5 : 90 - next[other];
    const adjustment = Math.min(remaining, Math.max(0, available));
    next[other] += delta > 0 ? -adjustment : adjustment;
    remaining -= adjustment;
  }

  if (remaining > 0) return current;
  return next;
}

export function monthsUntil(deadline: string, now = new Date()) {
  const target = parseDraftDate(deadline);
  if (!target || Number.isNaN(target.getTime()) || target <= now) return 12;
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 +
    target.getMonth() -
    now.getMonth() +
    (target.getDate() > now.getDate() ? 1 : 0);
  return Math.max(1, months);
}

export function categoryToBudgetGroup(category: string): BudgetGroupKey {
  const normalized = category.trim().toLocaleLowerCase('it');
  if (
    [
      'spesa',
      'cibo',
      'trasporti',
      'auto',
      'casa',
      'bollette',
      'salute',
      'cure',
      'farmacia',
      'affitto',
      'utenze',
      'assicurazioni',
      'tasse',
      'multe',
      'educazione',
      'aziendali',
    ].some(
      (name) => normalized.includes(name),
    )
  ) {
    return 'needs';
  }
  if (
    ['risparmi', 'investimenti', 'fondo emergenza'].some((name) =>
      normalized.includes(name),
    )
  ) {
    return 'savings';
  }
  return 'wants';
}

export function summarizeBudgets(items: BudgetCategory[]) {
  return budgetGroups.map((group) => {
    const macro = items.find((item) => item.id === group.id || (item.isMacro && item.parentId === group.id));
    const children = items.filter(
      (item) =>
        !item.isMacro &&
        item.id !== group.id &&
        (item.parentId ?? categoryToBudgetGroup(item.name)) === group.id,
    );
    return {
      ...group,
      amount: macro?.amount ?? children.reduce((sum, item) => sum + item.amount, 0),
      macro,
      children,
    };
  });
}

const categoryRules: [string, string[]][] = [
  ['Spesa', ['coop', 'esselunga', 'conad', 'supermercato', 'spesa', 'lidl', 'carrefour']],
  ['Ristoranti', ['ristorante', 'pizza', 'bar', 'caffè', 'pranzo', 'cena', 'deliveroo']],
  ['Trasporti', ['benzina', 'q8', 'eni', 'treno', 'metro', 'taxi', 'bus', 'uber']],
  ['Tempo libero', ['cinema', 'netflix', 'spotify', 'teatro', 'concerto']],
  ['Shopping', ['amazon', 'zara', 'scarpe', 'vestiti', 'negozio']],
];

export function categorizeExpense(description: string) {
  const normalized = description.toLocaleLowerCase('it');
  return (
    categoryRules.find(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))?.[0] ??
    'Altro'
  );
}

export function formatEuro(value: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
