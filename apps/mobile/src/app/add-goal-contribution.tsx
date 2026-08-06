import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Field, PrimaryButton, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import { useApp } from '@/providers/app-provider';

export default function AddGoalContributionScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { goals, goalAllocationMode, addGoalContribution, saving, error } = useApp();
  const params = useLocalSearchParams<{ goalId?: string }>();
  const [amount, setAmount] = useState('');
  const [goalId, setGoalId] = useState<string | null>(params.goalId ?? null);
  const numericAmount = Number(amount.replace(',', '.')) || 0;

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Nuovo contributo</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={[styles.icon, { backgroundColor: colors.accent }]}><Text style={styles.iconText}>savings</Text></View>
      <Text style={[uiStyles.title, { color: colors.text }]}>Quanto vuoi accantonare?</Text>
      <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>Puoi scegliere un obiettivo preciso oppure distribuire il contributo con la modalità {goalAllocationMode === 'priority' ? 'priorità' : 'percentuale'}.</Text>
      <Field label="Importo" placeholder="0,00" suffix="€" keyboardType="decimal-pad" autoFocus value={amount} onChangeText={setAmount} />
      <Text style={[styles.label, { color: colors.textSecondary }]}>DESTINAZIONE</Text>
      <View style={styles.options}>
        <GoalOption label="Distribuisci automaticamente" selected={!goalId} onPress={() => setGoalId(null)} />
        {goals.filter((goal) => goal.status !== 'reached').map((goal) => (
          <GoalOption key={goal.id} label={goal.name} selected={goalId === goal.id} onPress={() => setGoalId(goal.id)} />
        ))}
      </View>
      {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
      <PrimaryButton disabled={numericAmount <= 0 || !goals.length} loading={saving} onPress={async () => {
        const saved = await addGoalContribution(numericAmount, goalId);
        if (saved) router.back();
      }}>Registra contributo</PrimaryButton>
    </Screen>
  );
}

function GoalOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return <Pressable onPress={onPress}><Card style={[styles.option, selected && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><Text style={[styles.optionText, { color: selected ? colors.accent : colors.text }]}>{label}</Text><Text style={[styles.radio, { color: selected ? colors.accent : colors.textSecondary }]}>{selected ? 'radio_button_checked' : 'radio_button_unchecked'}</Text></Card></Pressable>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  close: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font.body, fontSize: 25, lineHeight: 28 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  icon: { width: 56, height: 56, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  iconText: { color: '#FFFFFF', fontFamily: 'MaterialSymbols_400Regular', fontSize: 27 },
  label: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1, marginTop: 20, marginBottom: 8 },
  options: { gap: 8, marginBottom: 18 },
  option: { minHeight: 54, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  optionText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13 },
  radio: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
});
