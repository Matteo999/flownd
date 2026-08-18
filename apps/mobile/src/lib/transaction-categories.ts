import { categorizeExpense } from '@/lib/onboarding';

export const expenseTransactionCategories = [
  'ATM (prelievo contante)',
  'Bar e ristoranti',
  'Spese aziendali',
  'Educazione',
  'Famiglia e Amici',
  'Cibo e Spesa',
  'Cure sanitarie e Farmacia',
  'Casa e utenze',
  'Assicurazioni e Finanza',
  'Tempo libero e intrattenimento',
  'Multimedia e Elettronica',
  'Altro',
  'Shopping',
  'Sottoscrizioni e donazioni',
  'Tasse e Multe',
  'Trasporti e Auto',
  'Viaggi e Vacanze',
] as const;

export const incomeTransactionCategories = [
  'Stipendio',
  'Tredicesima',
  'Altra entrata',
  'Rimborso spese',
  'Giroconto',
] as const;

export const transactionCategories = [
  ...expenseTransactionCategories,
  ...incomeTransactionCategories,
] as const;

export function categoriesForTransactionKind(kind: 'expense' | 'income') {
  return kind === 'income'
    ? incomeTransactionCategories
    : expenseTransactionCategories;
}

export function normalizeTransactionDescription(description: string) {
  return description
    .trim()
    .toLocaleLowerCase('it')
    .replace(/[0-9]{4,}/g, ' ')
    .replace(/[-_/.,*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const legacyCategoryMap: Record<string, (typeof expenseTransactionCategories)[number]> = {
  Spesa: 'Cibo e Spesa',
  Ristoranti: 'Bar e ristoranti',
  Trasporti: 'Trasporti e Auto',
  'Tempo libero': 'Tempo libero e intrattenimento',
  Salute: 'Cure sanitarie e Farmacia',
  Casa: 'Casa e utenze',
  Shopping: 'Shopping',
  Altro: 'Altro',
};

export function suggestTransactionCategory(
  description: string,
  kind: 'expense' | 'income',
) {
  if (kind === 'income') return 'Altra entrata';
  const suggestedCategory = categorizeExpense(description);
  if (
    expenseTransactionCategories.some(
      (option) => option === suggestedCategory,
    )
  ) {
    return suggestedCategory as (typeof expenseTransactionCategories)[number];
  }
  return legacyCategoryMap[suggestedCategory] ?? 'Altro';
}

export function normalizeTransactionCategory(
  category: string,
  kind: 'expense' | 'income',
) {
  const trimmed = category.trim();
  if (kind === 'income') {
    if (incomeTransactionCategories.some((option) => option === trimmed)) {
      return trimmed;
    }
    return 'Altra entrata';
  }
  if (expenseTransactionCategories.some((option) => option === trimmed)) {
    return trimmed;
  }
  return legacyCategoryMap[trimmed] ?? 'Altro';
}

export function incomeTreatmentForCategory(category: string) {
  switch (category) {
    case 'Stipendio':
      return { incomeType: 'salary' as const, excludedFromBudget: false };
    case 'Tredicesima':
      return { incomeType: 'extra_salary' as const, excludedFromBudget: true };
    case 'Rimborso spese':
      return { incomeType: 'reimbursement' as const, excludedFromBudget: true };
    case 'Giroconto':
      return { incomeType: 'internal_transfer' as const, excludedFromBudget: true };
    default:
      return { incomeType: 'other_income' as const, excludedFromBudget: false };
  }
}
