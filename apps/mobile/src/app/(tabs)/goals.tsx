import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PageHeader,
  ProgressBar,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import type { Goal } from '@/lib/goals';
import { formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function GoalsScreen() {
  const { colors } = useFlowndTheme();
  const { goals, loans, amountsVisible } = useApp();
  const orderedGoals = [...goals].sort(
    (first, second) => first.priority - second.priority,
  );
  const monthlyLoanTotal = loans.reduce(
    (sum, loan) => sum + loan.monthlyPayment,
    0,
  );

  return (
    <Screen>
      <PageHeader
        title="Obiettivi"
        action={
          <Pressable
            accessibilityLabel="Gestisci allocazione"
            accessibilityRole="button"
            onPress={() => router.push('/goal-settings' as Href)}
            style={({ pressed }) => [
              styles.headerAction,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.materialIcon, { color: colors.text }]}>tune</Text>
          </Pressable>
        }
      />

      <View style={styles.listHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>I tuoi obiettivi</Text>
          <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}> 
            {goals.length === 1 ? '1 obiettivo attivo' : `${goals.length} obiettivi attivi`}
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
            Tocca + per creare il tuo primo obiettivo.
          </Text>
        </Card>
      )}

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
                  ? `Scadenza ${goal.deadline}`
                  : 'Nessuna scadenza'}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={[styles.amount, { color: colors.text }]}> 
            {amountsVisible ? formatEuro(goal.savedAmount) : HIDDEN_AMOUNT}
          </Text>
          <Text style={[styles.target, { color: colors.textSecondary }]}> 
            {amountsVisible ? `su ${formatEuro(goal.targetAmount)}` : `su ${HIDDEN_AMOUNT}`}
          </Text>
        </View>
        <ProgressBar value={progress} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
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
