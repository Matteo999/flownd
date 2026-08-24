import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import {
  financialCycleForDate,
  incomeCandidatesForFinancialCycle,
} from '@/lib/financial-cycle';
import { formatEuro, incomeBands } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function BudgetIncomeScreen() {
  const { colors } = useFlowndTheme();
  const {
    draft,
    transactions,
    budgetCycleStartDay,
    budgetMonthlyIncome,
    error,
    setTransactionBudgetInclusion,
  } = useApp();
  const cycle = useMemo(
    () => financialCycleForDate(new Date(), budgetCycleStartDay, transactions),
    [budgetCycleStartDay, transactions],
  );
  const candidates = useMemo(
    () => incomeCandidatesForFinancialCycle(transactions, cycle),
    [cycle, transactions],
  );
  const incomeBand = incomeBands.find((band) => band.id === draft.incomeBand);

  return (
    <Screen>
      <PageHeader title="Budget mensile" leading={<BackButton />} />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Seleziona soltanto le entrate che costituiscono nuovo reddito. Giroconti e rimborsi possono essere esclusi qui.
      </Text>
      <Card style={styles.totalCard}>
        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>BUDGET DEL CICLO</Text>
        <Text style={[styles.total, { color: colors.text }]}>{formatEuro(budgetMonthlyIncome)}</Text>
        <Text style={[styles.totalCaption, { color: colors.textSecondary }]}>
          {candidates.length
            ? `${candidates.filter((item) => !item.excludedFromBudget).length} di ${candidates.length} entrate incluse`
            : incomeBand
              ? `Stima onboarding: ${incomeBand.shortLabel}`
              : 'Stima iniziale in attesa delle prime entrate'}
        </Text>
      </Card>

      {candidates.length ? (
        <View style={styles.list}>
          {candidates.map((transaction) => {
            const included = !transaction.excludedFromBudget;
            return (
              <Pressable
                key={transaction.id ?? `${transaction.occurredAt}-${transaction.description}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: included }}
                disabled={!transaction.id}
                onPress={() => {
                  if (transaction.id) {
                    void setTransactionBudgetInclusion(transaction.id, !included);
                  }
                }}
                style={({ pressed }) => pressed && styles.pressed}>
                <Card style={styles.row}>
                  <Text style={[styles.checkbox, { color: included ? colors.accent : colors.textSecondary }]}>
                    {included ? 'check_box' : 'check_box_outline_blank'}
                  </Text>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                      {transaction.description}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {transaction.internalTransfer ? 'Giroconto rilevato' : transaction.category}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: colors.text }]}>{formatEuro(transaction.amount)}</Text>
                </Card>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Card>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessuna entrata rilevata</Text>
          <Text style={[styles.emptyCaption, { color: colors.textSecondary }]}>
            Finché non vengono registrate entrate nel mese finanziario, il budget usa la fascia scelta durante l’onboarding.
          </Text>
        </Card>
      )}
      {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
    </Screen>
  );
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
  totalCard: { marginBottom: 16 },
  totalLabel: { fontFamily: font.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  total: { fontFamily: font.dataMedium, fontSize: 28, marginTop: 5 },
  totalCaption: { fontFamily: font.body, fontSize: 11, marginTop: 4 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 70 },
  checkbox: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 23 },
  name: { fontFamily: font.bodySemiBold, fontSize: 13 },
  meta: { fontFamily: font.body, fontSize: 11, marginTop: 3 },
  amount: { fontFamily: font.dataMedium, fontSize: 12 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  emptyCaption: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  pressed: { opacity: 0.68 },
});
