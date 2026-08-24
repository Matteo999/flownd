import { Slider } from '@expo/ui/community/slider';
import { router, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, ProgressBar, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import {
  type BudgetCategory,
  categoryToBudgetGroup,
  formatEuro,
  materializeBudgetAmounts,
  summarizeBudgets,
  updateAllocation,
} from '@/lib/onboarding';
import { financialCycleForDate, transactionsForFinancialCycle } from '@/lib/financial-cycle';
import { useApp } from '@/providers/app-provider';

export default function BudgetAllocationScreen() {
  const { colors } = useFlowndTheme();
  const {
    draft,
    transactions,
    goalContributions,
    budgetCycleStartDay,
    budgetMonthlyIncome,
    error,
    saveBudgetAllocations,
  } = useApp();
  const [budgets, setBudgets] = useState<BudgetCategory[]>(() =>
    draft.budgets.filter((item) => item.selected),
  );
  const budgetsRef = useRef(budgets);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeBudgets = useMemo(
    () => mergeSelectedBudgets(budgets, draft.budgets),
    [budgets, draft.budgets],
  );
  const materialized = useMemo(
    () => materializeBudgetAmounts(completeBudgets, budgetMonthlyIncome),
    [budgetMonthlyIncome, completeBudgets],
  );
  const groups = useMemo(() => summarizeBudgets(materialized), [materialized]);
  const cycle = useMemo(
    () => financialCycleForDate(new Date(), budgetCycleStartDay, transactions),
    [budgetCycleStartDay, transactions],
  );
  const expenses = useMemo(
    () =>
      transactionsForFinancialCycle(transactions, cycle).filter(
        (transaction) => transaction.kind !== 'income' && !transaction.excludedFromTotals,
      ),
    [cycle, transactions],
  );
  const savedThisCycle = useMemo(
    () =>
      goalContributions
        .filter((contribution) => {
          const createdAt = new Date(contribution.createdAt);
          return createdAt >= cycle.start && createdAt < cycle.end;
        })
        .reduce((sum, contribution) => sum + contribution.amount, 0),
    [cycle, goalContributions],
  );
  const spentByGroup = useMemo(
    () =>
      expenses.reduce(
        (summary, transaction) => {
          summary[categoryToBudgetGroup(transaction.category)] += transaction.amount;
          return summary;
        },
        { needs: 0, wants: 0, savings: savedThisCycle },
      ),
    [expenses, savedThisCycle],
  );

  function updateMacroPercentage(id: string, percentage: number) {
    const items = mergeSelectedBudgets(budgets, draft.budgets);
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const allocation = updateAllocation(
      {
        needs: items.find((item) => item.isMacro && item.parentId === 'needs')?.percentage ?? 50,
        wants: items.find((item) => item.isMacro && item.parentId === 'wants')?.percentage ?? 30,
        savings: items.find((item) => item.isMacro && item.parentId === 'savings')?.percentage ?? 20,
      },
      target.parentId ?? (target.id as 'needs' | 'wants' | 'savings'),
      percentage,
    );
    const next = items.map((item) =>
        item.isMacro
          ? { ...item, percentage: allocation[item.parentId ?? (item.id as 'needs' | 'wants' | 'savings')] }
          : item,
      );
    budgetsRef.current = next;
    setBudgets(next);
  }

  function persistBudget() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const latest = materializeBudgetAmounts(
        mergeSelectedBudgets(budgetsRef.current, draft.budgets),
        budgetMonthlyIncome,
      );
      void saveBudgetAllocations(latest, Math.max(1, budgetMonthlyIncome));
    }, 350);
  }

  return (
    <Screen>
      <PageHeader title="Suddivisione" leading={<BackButton />} />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Le tre quote sommano sempre al 100%. Tocca una macro-categoria per gestire le sue categorie.
      </Text>
      <View style={styles.list}>
        {groups.map((group) => {
          const spent = spentByGroup[group.id];
          const progress = group.amount ? spent / group.amount : 0;
          const percentage = Math.round(group.percentage);
          return (
            <Card key={group.id}>
              <View style={styles.top}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Gestisci le categorie di ${group.name}`}
                  onPress={() => router.push(`/budget-subcategory?parent=${group.id}` as Href)}
                  style={({ pressed }) => [styles.category, pressed && styles.pressed]}>
                  <View style={[styles.groupIcon, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.categoryIcon, { color: colors.accent }]}>{group.icon}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.name, { color: colors.text }]}>{group.name}</Text>
                    <Text style={[styles.groupCaption, { color: colors.textSecondary }]}>
                      {group.children.length
                        ? `${group.children.length} categorie`
                        : 'Aggiungi una categoria'}
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
                </Pressable>
                <Text style={[styles.sliderValue, { color: colors.accent }]}>{percentage}%</Text>
              </View>

              {group.macro ? (
                <View
                  onTouchEnd={persistBudget}
                  onTouchCancel={persistBudget}
                  style={styles.sliderTouchArea}>
                  <Slider
                    value={group.macro.percentage}
                    minimumValue={5}
                    maximumValue={90}
                    step={1}
                    minimumTrackTintColor={colors.accent}
                    maximumTrackTintColor={colors.sunken}
                    thumbTintColor={colors.accent}
                    onValueChange={(value) => updateMacroPercentage(group.macro!.id, value)}
                    style={styles.slider}
                  />
                </View>
              ) : null}

              <View style={styles.meta}>
                <Text style={[styles.spent, { color: colors.text }]}>
                  {group.id === 'savings' ? `${formatEuro(spent)} accantonati` : `${formatEuro(spent)} utilizzati`}
                </Text>
                <Text
                  style={[
                    styles.remaining,
                    {
                      color:
                        group.id !== 'savings' && progress >= 0.8
                          ? colors.warning
                          : colors.textSecondary,
                    },
                  ]}>
                  {formatEuro(Math.max(0, group.amount - spent))} disponibili
                </Text>
              </View>
              <ProgressBar value={progress} warning={group.id !== 'savings' && progress >= 0.8} />

            </Card>
          );
        })}
      </View>
      {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Le quote non assegnate restano disponibili nella rispettiva macro-categoria.
      </Text>
    </Screen>
  );
}

function mergeSelectedBudgets(current: BudgetCategory[], source: BudgetCategory[]) {
  const currentIds = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...source.filter((item) => item.selected && !currentIds.has(item.id)),
  ];
}

function BackButton() {
  const { colors } = useFlowndTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
      <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  intro: { fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  list: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  category: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  categoryIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  name: { fontFamily: font.bodySemiBold, fontSize: 14 },
  groupCaption: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  chevron: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 19 },
  sliderValue: { fontFamily: font.dataMedium, fontSize: 14, minWidth: 37, textAlign: 'right' },
  sliderTouchArea: { paddingVertical: 10 },
  slider: { height: 28 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 7 },
  spent: { fontFamily: font.bodyMedium, fontSize: 11 },
  remaining: { fontFamily: font.body, fontSize: 10, textAlign: 'right' },
  hint: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 12 },
  pressed: { opacity: 0.68 },
});
