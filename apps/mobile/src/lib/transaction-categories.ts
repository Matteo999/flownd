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

export const incomeTransactionCategories = ['Entrata', 'Stipendio'] as const;

export const transactionCategories = [
  ...expenseTransactionCategories,
  ...incomeTransactionCategories,
] as const;

export function categoriesForTransactionKind(kind: 'expense' | 'income') {
  return kind === 'income'
    ? incomeTransactionCategories
    : expenseTransactionCategories;
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
  if (kind === 'income') return 'Entrata';
  const legacyCategory = categorizeExpense(description);
  return legacyCategoryMap[legacyCategory] ?? 'Altro';
}

export function normalizeTransactionCategory(
  category: string,
  kind: 'expense' | 'income',
) {
  const trimmed = category.trim();
  if (kind === 'income') {
    return trimmed === 'Stipendio' ? 'Stipendio' : 'Entrata';
  }
  if (expenseTransactionCategories.some((option) => option === trimmed)) {
    return trimmed;
  }
  return legacyCategoryMap[trimmed] ?? 'Altro';
}
