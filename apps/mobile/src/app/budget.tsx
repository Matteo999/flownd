import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PageHeader,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import {
  formatEuro,
  materializeBudgetAmounts,
  summarizeBudgets,
} from '@/lib/onboarding';
import {
  financialCycleForDate,
  formatFinancialCycle,
  incomeCandidatesForFinancialCycle,
} from '@/lib/financial-cycle';
import { useApp } from '@/providers/app-provider';

export default function BudgetScreen() {
  const { colors } = useFlowndTheme();
  const { draft, transactions, budgetCycleStartDay, budgetMonthlyIncome } =
    useApp();
  const cycle = useMemo(
    () => financialCycleForDate(new Date(), budgetCycleStartDay, transactions),
    [budgetCycleStartDay, transactions],
  );
  const incomeCount = useMemo(
    () => incomeCandidatesForFinancialCycle(transactions, cycle).length,
    [cycle, transactions],
  );
  const groups = useMemo(
    () =>
      summarizeBudgets(
        materializeBudgetAmounts(
          draft.budgets.filter((item) => item.selected),
          budgetMonthlyIncome,
        ),
      ),
    [budgetMonthlyIncome, draft.budgets],
  );
  const allocation = groups
    .map((group) => `${Math.round(group.percentage)}%`)
    .join(' · ');

  return (
    <Screen>
      <PageHeader
        title="Budget"
        leading={
          <Pressable
            accessibilityLabel="Indietro"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
          </Pressable>
        }
      />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Gestisci separatamente le entrate, il periodo di calcolo e la suddivisione del budget.
      </Text>

      <View style={styles.list}>
        <BudgetMenuCard
          icon="account_balance_wallet"
          title="Budget mensile"
          caption={
            incomeCount
              ? `${incomeCount} ${incomeCount === 1 ? 'entrata rilevata' : 'entrate rilevate'}`
              : 'Stima basata sul profilo'
          }
          value={formatEuro(budgetMonthlyIncome)}
          route="/budget-income"
        />
        <BudgetMenuCard
          icon="calendar_month"
          title="Mese finanziario"
          caption="Periodo usato per calcolare entrate e spese"
          value={formatFinancialCycle(cycle)}
          route="/budget-cycle"
        />
        <BudgetMenuCard
          icon="donut_large"
          title="Suddivisione"
          caption="Necessità · Desideri · Risparmi"
          value={allocation}
          route="/budget-allocation"
        />
      </View>
    </Screen>
  );
}

function BudgetMenuCard({ icon, title, caption, value, route }: {
  icon: string;
  title: string;
  caption: string;
  value: string;
  route: Href;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Apri ${title}`}
      onPress={() => router.push(route)}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.materialIcon, { color: colors.accent }]}>{icon}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>{caption}</Text>
          <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  intro: { fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: 20 },
  list: { gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 104 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.bodySemiBold, fontSize: 15 },
  caption: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  value: { fontFamily: font.dataMedium, fontSize: 13, marginTop: 7, textTransform: 'capitalize' },
  chevron: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22 },
  pressed: { opacity: 0.68 },
});
