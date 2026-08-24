import { Slider } from '@expo/ui/community/slider';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, ProgressBar, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import {
  type BudgetCategory,
  categoryToBudgetGroup,
  budgetCategoryIcon,
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
  const [macroSliderVersions, setMacroSliderVersions] = useState<Record<string, number>>({});
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

  function spentForCategory(category: BudgetCategory) {
    const names = [category.id, category.name].map((value) => value.trim().toLocaleLowerCase('it'));
    return expenses
      .filter((transaction) => names.includes(transaction.category.trim().toLocaleLowerCase('it')))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }

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
    const changedIndirectly = items.filter((item) => {
      if (!item.isMacro || item.id === id) return false;
      const groupId = item.parentId ?? (item.id as 'needs' | 'wants' | 'savings');
      return item.percentage !== allocation[groupId];
    });
    if (changedIndirectly.length) {
      setMacroSliderVersions((versions) => {
        const next = { ...versions };
        for (const item of changedIndirectly) {
          next[item.id] = (next[item.id] ?? 0) + 1;
        }
        return next;
      });
    }
    setBudgets(
      items.map((item) =>
        item.isMacro
          ? { ...item, percentage: allocation[item.parentId ?? (item.id as 'needs' | 'wants' | 'savings')] }
          : item,
      ),
    );
  }

  function updateChildPercentage(id: string, percentage: number) {
    setBudgets((items) => {
      const mergedItems = mergeSelectedBudgets(items, draft.budgets);
      const target = mergedItems.find((item) => item.id === id);
      if (!target) return mergedItems;
      const siblings = mergedItems
        .filter((item) => !item.isMacro && item.id !== id && item.parentId === target.parentId)
        .reduce((sum, item) => sum + item.percentage, 0);
      const next = Math.max(1, Math.min(100 - siblings, Math.round(percentage)));
      return mergedItems.map((item) => (item.id === id ? { ...item, percentage: next } : item));
    });
  }

  function persistBudget() {
    void saveBudgetAllocations(materialized, Math.max(1, budgetMonthlyIncome));
  }

  return (
    <Screen>
      <PageHeader title="Suddivisione" leading={<BackButton />} />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Le tre quote sommano sempre al 100%. Tocca una macro-categoria per gestire i suoi sotto-budget.
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
                  accessibilityLabel={`Gestisci i sotto-budget di ${group.name}`}
                  onPress={() => router.push(`/budget-subcategory?parent=${group.id}` as Href)}
                  style={({ pressed }) => [styles.category, pressed && styles.pressed]}>
                  <View style={[styles.groupIcon, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.categoryIcon, { color: colors.accent }]}>{group.icon}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.name, { color: colors.text }]}>{group.name}</Text>
                    <Text style={[styles.groupCaption, { color: colors.textSecondary }]}>
                      {group.children.length
                        ? `${group.children.length} sotto-budget`
                        : 'Aggiungi un sotto-budget'}
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
                    key={`${group.macro.id}-${macroSliderVersions[group.macro.id] ?? 0}`}
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

              {group.children.length ? (
                <View style={[styles.children, { borderTopColor: colors.border }]}>
                  {group.children.map((child) => (
                    <View key={child.id} style={styles.childRow}>
                      <Text style={[styles.childIcon, { color: colors.textSecondary }]}>{budgetCategoryIcon(child)}</Text>
                      <View style={styles.childCopy}>
                        <Text style={[styles.childName, { color: colors.text }]}>{child.name}</Text>
                        <Text style={[styles.childSpent, { color: colors.textSecondary }]}>
                          {group.id !== 'savings' ? `${formatEuro(spentForCategory(child))} utilizzati · ` : ''}
                          {formatEuro(child.amount)} pianificati
                        </Text>
                      </View>
                      <View style={styles.childAllocation}>
                        <Text style={[styles.childPercentage, { color: colors.accent }]}>{Math.round(child.percentage)}%</Text>
                        <View onTouchEnd={persistBudget} onTouchCancel={persistBudget} style={styles.childSliderTouchArea}>
                          <Slider
                            value={child.percentage}
                            minimumValue={1}
                            maximumValue={Math.max(
                              1,
                              100 -
                                group.children
                                  .filter((item) => item.id !== child.id)
                                  .reduce((sum, item) => sum + item.percentage, 0),
                            )}
                            step={1}
                            minimumTrackTintColor={colors.accent}
                            maximumTrackTintColor={colors.sunken}
                            thumbTintColor={colors.accent}
                            onValueChange={(value) => updateChildPercentage(child.id, value)}
                            style={styles.childSlider}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
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
  children: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 10, gap: 12 },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  childIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18 },
  childCopy: { flex: 1 },
  childName: { fontFamily: font.bodySemiBold, fontSize: 11 },
  childSpent: { fontFamily: font.body, fontSize: 9, lineHeight: 13, marginTop: 2 },
  childAllocation: { width: 105, alignItems: 'flex-end' },
  childPercentage: { fontFamily: font.dataMedium, fontSize: 10 },
  childSliderTouchArea: { width: '100%', paddingVertical: 4 },
  childSlider: { height: 20 },
  hint: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 12 },
  pressed: { opacity: 0.68 },
});
