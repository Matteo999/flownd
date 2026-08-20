import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { AppHeaderActions } from '@/components/app-header-actions';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { financialCycleForDate } from '@/lib/financial-cycle';
import type { Goal } from '@/lib/goals';
import { formatDateItalian, formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function GoalsScreen() {
  const { colors } = useFlowndTheme();
  const {
    goals,
    completedGoals,
    loans,
    amountsVisible,
    saving,
    deleteGoal,
    goalContributions,
    budgetCycleStartDay,
  } = useApp();
  const [completedOpen, setCompletedOpen] = useState(false);
  const orderedGoals = [...goals].sort(
    (first, second) =>
      Number(first.status === 'free_savings') -
        Number(second.status === 'free_savings') ||
      first.priority - second.priority,
  );
  const targetGoalCount = goals.filter(
    (goal) => goal.status !== 'free_savings',
  ).length;
  const monthlyLoanTotal = loans.reduce(
    (sum, loan) => sum + loan.monthlyPayment,
    0,
  );
  const currentCycle = financialCycleForDate(new Date(), budgetCycleStartDay);
  const currentCycleContributions = goalContributions.reduce(
    (totals, contribution) => {
      const occurredAt = new Date(contribution.createdAt);
      if (
        contribution.goalId &&
        occurredAt >= currentCycle.start &&
        occurredAt < currentCycle.end
      ) {
        totals.set(
          contribution.goalId,
          (totals.get(contribution.goalId) ?? 0) + contribution.amount,
        );
      }
      return totals;
    },
    new Map<string, number>(),
  );

  function confirmCompletedGoalDeletion(goal: Goal) {
    const amountToRestore = currentCycleContributions.get(goal.id) ?? 0;
    const restorationCopy = amountToRestore > 0 && amountsVisible
      ? `${formatEuro(amountToRestore)} torneranno disponibili nella quota risparmi del ciclo corrente.`
      : 'Gli accantonamenti del ciclo corrente torneranno disponibili.';
    Alert.alert(
      'Eliminare l’obiettivo completato?',
      `“${goal.name}” verrà rimosso dall’archivio. ${restorationCopy} Quelli dei cicli precedenti resteranno nello storico.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            void deleteGoal(goal.id);
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <PageHeader
        title="Obiettivi"
        action={
          <AppHeaderActions
            leading={
              <Pressable
                accessibilityLabel="Gestisci allocazione"
                accessibilityRole="button"
                onPress={() => router.push('/goal-settings' as Href)}
                style={({ pressed }) => [
                  styles.headerAction,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.materialIcon, { color: colors.text }]}>tune</Text>
              </Pressable>
            }
          />
        }
      />

      <View style={styles.listHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>I tuoi obiettivi</Text>
          <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}> 
            {targetGoalCount === 1
              ? '1 obiettivo attivo'
              : `${targetGoalCount} obiettivi attivi`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Aggiungi obiettivo"
          accessibilityRole="button"
          onPress={() => router.push('/add-goal' as Href)}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.accent },
            pressed && styles.pressed,
          ]}>
          <Text style={styles.addIcon}>add</Text>
        </Pressable>
      </View>

      {orderedGoals.length ? (
        <View style={styles.list}>
          {orderedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              amountsVisible={amountsVisible}
              onPress={() =>
                router.push(
                  `/goal-detail?goalId=${encodeURIComponent(goal.id)}` as Href,
                )
              }
            />
          ))}
        </View>
      ) : (
        <Card style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}> 
            Il prossimo traguardo parte da qui.
          </Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Crea un obiettivo e assegna la tua quota mensile di risparmio.
          </Text>
          <View style={styles.emptyAction}>
            <PrimaryButton onPress={() => router.push('/add-goal' as Href)}>
              Crea il primo obiettivo
            </PrimaryButton>
          </View>
        </Card>
      )}

      {completedGoals.length ? (
        <View style={styles.completedSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: completedOpen }}
            accessibilityLabel={
              completedOpen
                ? 'Nascondi obiettivi completati'
                : 'Mostra obiettivi completati'
            }
            onPress={() => setCompletedOpen((current) => !current)}
            style={({ pressed }) => [
              styles.completedToggle,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}>
            <View
              style={[
                styles.completedToggleIcon,
                { backgroundColor: colors.accentSoft },
              ]}>
              <Text style={[styles.materialIcon, { color: colors.accent }]}>done</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.completedTitle, { color: colors.text }]}>
                Obiettivi completati
              </Text>
              <Text
                style={[styles.completedCaption, { color: colors.textSecondary }]}>
                {completedGoals.length === 1
                  ? '1 obiettivo archiviato'
                  : `${completedGoals.length} obiettivi archiviati`}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textSecondary }]}>
              {completedOpen ? 'expand_less' : 'expand_more'}
            </Text>
          </Pressable>

          {completedOpen ? (
            <View style={styles.completedList}>
              {completedGoals.map((goal) => (
                <Card key={goal.id} style={styles.completedCard}>
                  <View style={styles.completedGoalIcon}>
                    <Text style={[styles.materialIcon, { color: colors.positive }]}>
                      check_circle
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.completedGoalName, { color: colors.text }]}>
                      {goal.name}
                    </Text>
                    <Text
                      style={[
                        styles.completedGoalAmount,
                        { color: colors.textSecondary },
                      ]}>
                      {(currentCycleContributions.get(goal.id) ?? 0) > 0
                        ? amountsVisible
                          ? `${formatEuro(currentCycleContributions.get(goal.id) ?? 0)} da ripristinare nel ciclo corrente`
                          : `${HIDDEN_AMOUNT} da ripristinare nel ciclo corrente`
                        : amountsVisible
                          ? `${formatEuro(goal.savedAmount)} accantonati nello storico`
                          : `${HIDDEN_AMOUNT} accantonati nello storico`}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina ${goal.name}`}
                    disabled={saving}
                    hitSlop={8}
                    onPress={() => confirmCompletedGoalDeletion(goal)}
                    style={({ pressed }) => [
                      styles.deleteCompletedButton,
                      saving && styles.disabled,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.materialIcon, { color: colors.negative }]}>
                      delete
                    </Text>
                  </Pressable>
                </Card>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {loans.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-loan' as Href)}
          style={({ pressed }) => pressed && styles.pressed}>
          <Card style={styles.financingCard}>
            <View
              style={[styles.financingIcon, { backgroundColor: colors.sunken }]}> 
              <Text style={[styles.materialIcon, { color: colors.text }]}> 
                account_balance
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.financingTitle, { color: colors.text }]}> 
                Finanziamenti
              </Text>
              <Text style={[styles.financingCopy, { color: colors.textSecondary }]}> 
                {loans.length === 1 ? '1 finanziamento attivo' : `${loans.length} finanziamenti attivi`}
                {' · '}
                {amountsVisible ? `${formatEuro(monthlyLoanTotal)}/mese` : HIDDEN_AMOUNT}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
          </Card>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function GoalCard({
  goal,
  amountsVisible,
  onPress,
}: {
  goal: Goal;
  amountsVisible: boolean;
  onPress: () => void;
}) {
  const { colors } = useFlowndTheme();
  const progress = goal.targetAmount
    ? Math.min(goal.savedAmount / goal.targetAmount, 1)
    : 0;

  return (
    <Pressable
      accessibilityLabel={`Apri ${goal.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={goal.status === 'reached' ? { borderColor: colors.accent } : undefined}>
        <View style={styles.goalTop}>
          <View style={styles.flex}>
            <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
            <Text style={[styles.goalMeta, { color: colors.textSecondary }]}> 
              {goal.status === 'free_savings'
                ? 'Risparmio libero'
                : goal.deadline
                  ? `Scadenza ${formatDateItalian(goal.deadline) || goal.deadline}`
                  : 'Nessuna scadenza'}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={[styles.amount, { color: colors.text }]}> 
            {amountsVisible ? formatEuro(goal.savedAmount) : HIDDEN_AMOUNT}
          </Text>
          {goal.status !== 'free_savings' ? (
            <Text style={[styles.target, { color: colors.textSecondary }]}>
              {amountsVisible ? `su ${formatEuro(goal.targetAmount)}` : `su ${HIDDEN_AMOUNT}`}
            </Text>
          ) : null}
        </View>
        {goal.status !== 'free_savings' ? <ProgressBar value={progress} /> : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerAction: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  sectionCaption: { fontFamily: font.body, fontSize: 11, marginTop: -1 },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 23,
  },
  list: { gap: 10 },
  goalTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalName: { fontFamily: font.bodySemiBold, fontSize: 15 },
  goalMeta: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 17,
    marginBottom: 10,
  },
  amount: { fontFamily: font.dataMedium, fontSize: 21 },
  target: { fontFamily: font.data, fontSize: 10 },
  chevron: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  empty: { alignItems: 'center', paddingVertical: 24 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  emptyCopy: { fontFamily: font.body, fontSize: 11, marginTop: 4 },
  emptyAction: { width: '100%', marginTop: 16 },
  completedSection: { marginTop: 22 },
  completedToggle: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  completedToggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  completedCaption: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  completedList: { gap: 8, marginTop: 8 },
  completedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  completedGoalIcon: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedGoalName: { fontFamily: font.bodySemiBold, fontSize: 13 },
  completedGoalAmount: { fontFamily: font.data, fontSize: 10, marginTop: 3 },
  deleteCompletedButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  financingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 22,
  },
  financingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  financingTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  financingCopy: { fontFamily: font.body, fontSize: 10, marginTop: 3 },
  pressed: { opacity: 0.7 },
});
