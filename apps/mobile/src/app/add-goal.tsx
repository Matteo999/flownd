import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Field,
  Card,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { GoalDateField } from '@/components/goal-date-field';
import { formatEuro, monthsUntil } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function AddGoalScreen() {
  const { colors, isDark } = useFlowndTheme();
  const params = useLocalSearchParams<{
    name?: string;
    target?: string;
    deadline?: string;
    goalId?: string;
  }>();
  const {
    createGoal,
    updateGoal,
    deleteGoal,
    saving,
    error,
    clearError,
    goals,
    goalAllocationMode,
    budgetMonthlyIncome,
    draft,
  } = useApp();
  const existingGoal = goals.find((goal) => goal.id === params.goalId);
  const isFreeSavings = existingGoal?.status === 'free_savings';
  const [name, setName] = useState(existingGoal?.name ?? params.name ?? '');
  const [target, setTarget] = useState(
    existingGoal ? String(existingGoal.targetAmount) : params.target ?? '',
  );
  const [deadline, setDeadline] = useState(
    existingGoal?.deadline ?? params.deadline ?? '',
  );
  const targetAmount = Number(target.replace(',', '.')) || 0;
  const monthlyNeedFor = (
    amount: number,
    savedAmount: number,
    goalDeadline: string,
  ) => goalDeadline
    ? Math.max(0, amount - savedAmount) / monthsUntil(goalDeadline)
    : 0;
  const monthlyNeed = monthlyNeedFor(
    targetAmount,
    existingGoal?.savedAmount ?? 0,
    deadline,
  );
  const otherGoalsMonthlyNeed = goals
    .filter(
      (goal) =>
        goal.id !== existingGoal?.id &&
        goal.status !== 'free_savings' &&
        Boolean(goal.deadline),
    )
    .reduce(
      (sum, goal) =>
        sum + monthlyNeedFor(
          goal.targetAmount,
          goal.savedAmount,
          goal.deadline,
        ),
      0,
    );
  const totalMonthlyNeed = monthlyNeed + otherGoalsMonthlyNeed;
  const savingsCapacity =
    (budgetMonthlyIncome * draft.allocation.savings) / 100;
  const planIsAligned = totalMonthlyNeed <= savingsCapacity;
  const usedPercentage = goals
    .filter(
      (goal) =>
        goal.id !== existingGoal?.id && goal.status === 'active',
    )
    .reduce((sum, goal) => sum + goal.allocationPercentage, 0);
  const valid = Boolean(name.trim()) && (isFreeSavings || targetAmount > 0);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            style={[
              styles.close,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{existingGoal ? 'Modifica obiettivo' : 'Nuovo obiettivo'}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={[uiStyles.title, { color: colors.text }]}>{existingGoal ? 'Aggiorna il tuo piano' : 'Per cosa vuoi risparmiare?'}</Text>
        <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
          {isFreeSavings
            ? 'Il risparmio libero raccoglie la parte della quota mensile non assegnata ad altri obiettivi.'
            : 'Definisci il traguardo. Flownd lo inserirà automaticamente in coda agli altri obiettivi.'}
        </Text>

        <Field label="Nome" placeholder="es. Fondo emergenza" value={name} autoFocus onChangeText={(value) => { clearError(); setName(value); }} />
        {!isFreeSavings ? (
          <>
            <Field label="Importo target" placeholder="0,00" suffix="€" keyboardType="decimal-pad" value={target} onChangeText={(value) => { clearError(); setTarget(value); }} />
            <GoalDateField value={deadline} onChange={setDeadline} />
            {deadline && targetAmount > 0 ? (
              <Card
                style={[
                  styles.insightCard,
                  {
                    backgroundColor: planIsAligned
                      ? colors.accentSoft
                      : colors.warningSoft,
                  },
                ]}>
                <View
                  style={[
                    styles.insightIcon,
                    {
                      backgroundColor: planIsAligned
                        ? colors.accent
                        : colors.warning,
                    },
                  ]}>
                  <Text style={styles.insightIconText}>
                    {planIsAligned ? 'check' : 'priority_high'}
                  </Text>
                </View>
                <View style={styles.insightCopy}>
                  <Text style={[styles.insightTitle, { color: colors.text }]}>
                    {formatEuro(monthlyNeed)} al mese
                  </Text>
                  <Text style={[styles.insightText, { color: colors.textSecondary }]}>
                    {planIsAligned
                      ? `Il piano complessivo è in linea con i ${formatEuro(savingsCapacity)} (${draft.allocation.savings}%) destinati ogni mese ai risparmi.`
                      : `Gli obiettivi richiedono ${formatEuro(totalMonthlyNeed)} al mese, ${formatEuro(totalMonthlyNeed - savingsCapacity)} oltre la quota Risparmi impostata.`}
                  </Text>
                </View>
              </Card>
            ) : null}
          </>
        ) : null}
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton
          disabled={!valid}
          loading={saving}
          onPress={async () => {
            const values = {
              name: name.trim(),
              targetAmount: isFreeSavings
                ? (existingGoal?.targetAmount ?? 1)
                : targetAmount,
              deadline: isFreeSavings ? '' : deadline,
              allocationPercentage:
                existingGoal?.allocationPercentage ??
                (goalAllocationMode === 'percentage'
                  ? Math.max(0, 100 - usedPercentage)
                  : 0),
            };
            const saved = existingGoal
              ? await updateGoal(existingGoal.id, values)
              : await createGoal({ ...values, savedAmount: 0 });
            if (saved) router.back();
          }}>
          {existingGoal ? 'Salva modifiche' : 'Crea obiettivo'}
        </PrimaryButton>
        {existingGoal && !isFreeSavings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Elimina ${existingGoal.name}`}
            disabled={saving}
            onPress={() => {
              Alert.alert(
                'Eliminare l’obiettivo?',
                existingGoal.savedAmount > 0
                  ? `“${existingGoal.name}” verrà rimosso dagli obiettivi attivi. I versamenti già effettuati resteranno nei totali storici del budget.`
                  : `“${existingGoal.name}” verrà eliminato definitivamente. La quota futura tornerà disponibile.`,
                [
                  { text: 'Annulla', style: 'cancel' },
                  {
                    text: 'Elimina',
                    style: 'destructive',
                    onPress: () => {
                      void deleteGoal(existingGoal.id).then((deleted) => {
                        if (deleted) router.replace('/goals');
                      });
                    },
                  },
                ],
              );
            }}
            style={({ pressed }) => [
              styles.deleteButton,
              { borderColor: colors.negative },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.deleteText, { color: colors.negative }]}>
              Elimina obiettivo
            </Text>
          </Pressable>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  close: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font.body, fontSize: 25, lineHeight: 28 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  deleteButton: {
    minHeight: 44,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontFamily: font.bodySemiBold, fontSize: 12 },
  insightCard: {
    flexDirection: 'row',
    gap: 11,
    marginTop: 14,
    paddingVertical: 14,
  },
  insightIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightIconText: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 19,
  },
  insightCopy: { flex: 1 },
  insightTitle: { fontFamily: font.dataMedium, fontSize: 15 },
  insightText: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.7 },
});
