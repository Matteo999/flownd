export type BudgetCategory = {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  percentage: number;
  selected: boolean;
  parentId?: BudgetGroupKey;
  parentCategoryId?: string | null;
  budgetEnabled?: boolean;
  isMacro?: boolean;
};

export type BudgetGroupKey = 'needs' | 'wants' | 'savings';

export const budgetGroups: {
  id: BudgetGroupKey;
  name: string;
  icon: string;
}[] = [
  { id: 'needs', name: 'Necessità', icon: 'home' },
  { id: 'wants', name: 'Desideri', icon: 'luggage' },
  { id: 'savings', name: 'Risparmi', icon: 'savings' },
];

const budgetCategoryIcons: [string[], string][] = [
  [['needs', 'necessità'], 'home'],
  [['wants', 'desideri'], 'luggage'],
  [['savings', 'risparmi', 'fondo emergenza'], 'savings'],
  [['spesa', 'alimentari', 'cibo', 'supermercato'], 'shopping_cart'],
  [['casa', 'affitto', 'mutuo'], 'home_work'],
  [['bollette', 'utenze'], 'receipt_long'],
  [['trasporti', 'auto', 'carburante'], 'directions_car'],
  [['salute', 'farmacia', 'cure'], 'medical_services'],
  [['ristoranti', 'bar'], 'restaurant'],
  [['multimedia', 'elettronica'], 'laptop_mac'],
  [['sottoscrizioni', 'abbonamenti', 'donazioni'], 'calendar_check'],
  [['famiglia', 'amici'], 'group'],
  [['spese aziendali', 'aziendali'], 'business_center'],
  [['tasse', 'multe'], 'heap_snapshot_large'],
  [['shopping', 'abbigliamento'], 'shopping_bag'],
  [['tempo libero', 'intrattenimento', 'cinema'], 'local_activity'],
  [['viaggi', 'vacanze'], 'flight'],
  [['educazione', 'formazione'], 'school'],
  [['assicurazioni'], 'verified_user'],
  [['investimenti'], 'trending_up'],
  [['regali'], 'redeem'],
];

export function budgetCategoryIcon(category: { id?: string; name: string }) {
  const normalized = `${category.id ?? ''} ${category.name}`
    .trim()
    .toLocaleLowerCase('it');
  return (
    budgetCategoryIcons.find(([names]) =>
      names.some((name) => normalized.includes(name)),
    )?.[1] ?? 'category'
  );
}

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

export function incomeReferenceForBand(id: IncomeBandId | null | undefined) {
  return incomeBands.find((band) => band.id === id)?.monthlyReference ?? 1250;
}

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
  occurredTime?: string | null;
  occurredTimeSource?: 'structured' | 'narrative' | null;
  source?: string;
  rawDescription?: string | null;
  merchantName?: string | null;
  counterpartyName?: string | null;
  memo?: string | null;
  bankReference?: string | null;
  importConfidence?: number | null;
  forceImportDuplicate?: boolean;
  kind?: 'expense' | 'income';
  financialAccountId?: string | null;
  bankStatus?: string | null;
  excludedFromTotals?: boolean;
  internalTransfer?: boolean;
  excludedFromBudget?: boolean;
  recurringPaymentId?: string | null;
  recurringOccurrenceId?: string | null;
  isRecurring?: boolean;
  incomeType?:
    | 'salary'
    | 'extra_salary'
    | 'reimbursement'
    | 'internal_transfer'
    | 'other_income';
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
      percentage: allocation.needs,
      selected: true,
      parentId: 'needs',
      isMacro: true,
    },
    {
      id: 'wants',
      name: 'Desideri',
      emoji: '🧳',
      amount: Math.round((monthlyReference * allocation.wants) / 100),
      percentage: allocation.wants,
      selected: true,
      parentId: 'wants',
      isMacro: true,
    },
    {
      id: 'savings',
      name: 'Risparmi',
      emoji: '🐷',
      amount: Math.round((monthlyReference * allocation.savings) / 100),
      percentage: allocation.savings,
      selected: true,
      parentId: 'savings',
      isMacro: true,
    },
  ];
}

export function materializeBudgetAmounts(
  items: BudgetCategory[],
  plannedMonthlyIncome: number,
) {
  const macroAmounts = new Map<BudgetGroupKey, number>();
  const categoryAmounts = new Map<string, number>();
  for (const item of items) {
    if (!item.isMacro) continue;
    const group = item.parentId ?? (item.id as BudgetGroupKey);
    macroAmounts.set(
      group,
      Math.round((plannedMonthlyIncome * item.percentage) / 100),
    );
    categoryAmounts.set(item.id, Math.round((plannedMonthlyIncome * item.percentage) / 100));
  }

  for (const item of items) {
    if (item.isMacro || item.parentCategoryId) continue;
    const parentAmount = macroAmounts.get(
      item.parentId ?? categoryToBudgetGroup(item.name),
    ) ?? 0;
    categoryAmounts.set(
      item.id,
      item.budgetEnabled === false ? 0 : Math.round((parentAmount * item.percentage) / 100),
    );
  }

  return items.map((item) => {
    const parentAmount = item.parentCategoryId
      ? categoryAmounts.get(item.parentCategoryId) ?? 0
      : macroAmounts.get(item.parentId ?? categoryToBudgetGroup(item.name)) ?? 0;
    const amount = item.isMacro
      ? categoryAmounts.get(item.id) ?? 0
      : item.budgetEnabled === false
        ? 0
        : Math.round((parentAmount * item.percentage) / 100);
    categoryAmounts.set(item.id, amount);
    return {
      ...item,
      amount,
    };
  });
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
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 2);
  const lastDay = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(day, lastDay));
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
      percentage: macro?.percentage ?? 0,
      macro,
      children,
    };
  });
}

const categoryRules: [string, RegExp][] = [
  ['ATM (prelievo contante)', /\b(atm|bancomat|prelievo|cash withdrawal)\b/],
  [
    'Cibo e Spesa',
    /\b(coop|esselunga|conad|lidl|carrefour|aldi|despar|interspar|eurospin|pam|poli|orvea|iper|supermercato|supermarket|alimentari|grocery)\b/,
  ],
  [
    'Bar e ristoranti',
    /\b(bar|ristorante|ristorazione|pizzeria|pizza|sushi|caffe|caffè|pub|osteria|trattoria|mcdonald|burger king|deliveroo|glovo|just eat)\b/,
  ],
  [
    'Trasporti e Auto',
    /\b(benzina|carburante|q8|eni|ip|tamoil|esso|treno|trenitalia|italo|metro|taxi|uber|parcheggio|autostrade|telepass|officina|gommista)\b/,
  ],
  [
    'Casa e utenze',
    /\b(affitto|condominio|utenza|energia|elettricita|elettricità|gas|acqua|enel|a2a|dolomiti energia|eurobrico|leroy merlin|ikea|brico)\b/,
  ],
  [
    'Cure sanitarie e Farmacia',
    /\b(farmacia|parafarmacia|medico|dentista|sanitario|ospedale|clinica|ottica|fisioterapia|analisi)\b/,
  ],
  [
    'Tasse e Multe',
    /\b(f24|pagopa|imposta|tassa|tributo|multa|sanzione|agenzia entrate|comune)\b/,
  ],
  [
    'Sottoscrizioni e donazioni',
    /\b(netflix|spotify|disney|prime video|now tv|abbonamento|subscription|donazione|patreon)\b/,
  ],
  [
    'Tempo libero e intrattenimento',
    /\b(cinema|teatro|concerto|museo|evento|palestra|sport|ticketone|steam|playstation|xbox)\b/,
  ],
  [
    'Multimedia e Elettronica',
    /\b(mediaworld|unieuro|euronics|apple store|elettronica|computer|smartphone)\b/,
  ],
  [
    'Educazione',
    /\b(universita|università|scuola|corso|formazione|udemy|coursera|libreria|libri scolastici)\b/,
  ],
  [
    'Viaggi e Vacanze',
    /\b(booking|airbnb|hotel|albergo|volo|ryanair|easyjet|aeroporto|vacanza|viaggio)\b/,
  ],
  [
    'Assicurazioni e Finanza',
    /\b(assicurazione|polizza|commissione|canone conto|interessi|banca|finanziamento)\b/,
  ],
  [
    'Shopping',
    /\b(amazon|zara|h&m|zalando|abbigliamento|scarpe|negozio|shopping|decathlon)\b/,
  ],
];

export function categorizeExpense(description: string) {
  const normalized = description.toLocaleLowerCase('it');
  return (
    categoryRules.find(([, pattern]) => pattern.test(normalized))?.[0] ??
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
