import { categorizeExpense } from '@/lib/onboarding';
import type { ExpenseDraft } from '@/lib/onboarding';

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
  if (kind === 'income') {
    const normalized = normalizeTransactionDescription(description);
    if (/\b(tredicesima|13ma|13esima)\b/.test(normalized)) return 'Tredicesima';
    if (/\b(rimborso|storno|refund)\b/.test(normalized)) return 'Rimborso spese';
    if (/\b(giroconto|trasferimento|transfer)\b/.test(normalized)) return 'Giroconto';
    if (/\b(stipendio|salary|retribuzione|emolumento)\b/.test(normalized)) {
      return 'Stipendio';
    }
    return 'Altra entrata';
  }
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

export function suggestPersonalizedTransactionCategory(
  description: string,
  kind: 'expense' | 'income',
  transactions: ExpenseDraft[],
) {
  const fallback = suggestTransactionCategory(description, kind);
  const descriptionKey = normalizeTransactionDescription(description);
  if (descriptionKey.length < 3) return fallback;

  const allowedCategories = new Set<string>(categoriesForTransactionKind(kind));
  const inputTokens = new Set(descriptionKey.split(' ').filter(Boolean));
  const categoryScores = new Map<string, { score: number; matches: number }>();

  for (const transaction of transactions) {
    if ((transaction.kind ?? 'expense') !== kind) continue;
    if (!allowedCategories.has(transaction.category)) continue;
    const candidateKey = normalizeTransactionDescription(transaction.description);
    if (!candidateKey) continue;

    let score = 0;
    if (candidateKey === descriptionKey) score = 1;
    else if (
      candidateKey.startsWith(descriptionKey) ||
      descriptionKey.startsWith(candidateKey)
    ) score = 0.9;
    else {
      const candidateTokens = new Set(candidateKey.split(' ').filter(Boolean));
      const overlap = [...inputTokens].filter((token) =>
        [...candidateTokens].some(
          (candidate) => candidate.startsWith(token) || token.startsWith(candidate),
        ),
      ).length;
      score = overlap / Math.max(inputTokens.size, candidateTokens.size);
    }
    if (score < 0.5) continue;

    const current = categoryScores.get(transaction.category);
    categoryScores.set(transaction.category, {
      score: Math.max(current?.score ?? 0, score),
      matches: (current?.matches ?? 0) + 1,
    });
  }

  const learned = [...categoryScores.entries()]
    .map(([category, value]) => ({
      category,
      score: value.score + Math.min(0.08, value.matches * 0.01),
    }))
    .sort((first, second) => second.score - first.score)[0];
  return learned?.category ?? fallback;
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
