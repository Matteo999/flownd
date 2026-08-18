import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Field,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
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
    saving,
    error,
    clearError,
    goals,
    draft,
    budgetMonthlyIncome,
    goalAllocationMode,
  } = useApp();
  const existingGoal = goals.find((goal) => goal.id === params.goalId);
  const [name, setName] = useState(existingGoal?.name ?? params.name ?? '');
  const [target, setTarget] = useState(
    existingGoal ? String(existingGoal.targetAmount) : params.target ?? '',
  );
  const [deadline, setDeadline] = useState(
    existingGoal?.deadline ?? params.deadline ?? '',
  );
  const targetAmount = Number(target.replace(',', '.')) || 0;
  const savingsMacro = draft.budgets.find((item) => item.id === 'savings');
  const savingsPool = savingsMacro
    ? (budgetMonthlyIncome * savingsMacro.percentage) / 100
    : draft.budgets
        .filter((item) => item.parentId === 'savings')
        .reduce((sum, item) => sum + item.amount, 0);
  const usedPercentage = goals
    .filter((goal) => goal.id !== existingGoal?.id)
    .reduce((sum, goal) => sum + goal.allocationPercentage, 0);
  const valid = Boolean(name.trim()) && targetAmount > 0;

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
        <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>Definisci il traguardo. Flownd lo inserirà automaticamente in coda agli altri obiettivi.</Text>

        <Field label="Nome" placeholder="es. Fondo emergenza" value={name} autoFocus onChangeText={(value) => { clearError(); setName(value); }} />
        <Field label="Importo target" placeholder="0,00" suffix="€" keyboardType="decimal-pad" value={target} onChangeText={(value) => { clearError(); setTarget(value); }} />
        <Field label="Scadenza" placeholder="AAAA-MM-GG" value={deadline} onChangeText={setDeadline} />
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton
          disabled={!valid}
          loading={saving}
          onPress={async () => {
            const values = {
              name: name.trim(),
              targetAmount,
              deadline,
              monthlyContribution:
                existingGoal?.monthlyContribution ??
                (goalAllocationMode === 'priority'
                  ? Math.max(targetAmount, savingsPool)
                  : 0),
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
});
