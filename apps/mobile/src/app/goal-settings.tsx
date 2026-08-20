import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Card,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { financialCycleForDate } from '@/lib/financial-cycle';
import type { Goal } from '@/lib/goals';
import { formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function GoalSettingsScreen() {
  const { colors, isDark } = useFlowndTheme();
  const {
    goals,
    goalContributions,
    loans,
    draft,
    budgetMonthlyIncome,
    budgetCycleStartDay,
    amountsVisible,
    goalAllocationMode,
    setGoalAllocationMode,
    moveGoal,
    updateGoal,
  } = useApp();
  const targetGoals = [...goals]
    .filter((goal) => goal.status === 'active')
    .sort((first, second) => first.priority - second.priority);
  const savingsMacro = draft.budgets.find((item) => item.id === 'savings');
  const savingsPool = savingsMacro
    ? (budgetMonthlyIncome * savingsMacro.percentage) / 100
    : draft.budgets
        .filter((item) => item.parentId === 'savings')
        .reduce((sum, item) => sum + item.amount, 0);
  const cycle = financialCycleForDate(new Date(), budgetCycleStartDay);
  const savedThisCycle = goalContributions
    .filter((contribution) => {
      const createdAt = new Date(contribution.createdAt);
      return createdAt >= cycle.start && createdAt < cycle.end;
    })
    .reduce((sum, contribution) => sum + contribution.amount, 0);
  const availableSavings = Math.max(0, savingsPool - savedThisCycle);
  const percentageTotal = targetGoals.reduce(
    (sum, goal) => sum + goal.allocationPercentage,
    0,
  );
  const freePercentage = Math.max(0, 100 - percentageTotal);
  const needsAttention = percentageTotal > 100;

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ModalHeader title="Gestisci allocazione" />

      <Text style={[uiStyles.title, { color: colors.text }]}>Come distribuire i risparmi</Text>
      <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}> 
        La modalità Priorità è quella consigliata: completa un obiettivo alla volta seguendo l’ordine scelto.
      </Text>

      <Card>
        <View style={[styles.modeControl, { backgroundColor: colors.sunken }]}> 
          <ModeButton
            label="Priorità"
            selected={goalAllocationMode === 'priority'}
            onPress={() => void setGoalAllocationMode('priority')}
          />
          <ModeButton
            label="Percentuale"
            selected={goalAllocationMode === 'percentage'}
            onPress={() => void setGoalAllocationMode('percentage')}
          />
        </View>
        <Text style={[styles.modeCopy, { color: colors.textSecondary }]}> 
          {goalAllocationMode === 'priority'
            ? 'L’intera quota Risparmio va al primo obiettivo. L’eventuale eccedenza passa al successivo.'
            : 'La quota Risparmio viene suddivisa tra gli obiettivi. La parte non assegnata resta nel Risparmio libero.'}
        </Text>
        <View style={styles.poolRow}>
          <Text style={[styles.poolLabel, { color: colors.textSecondary }]}>Quota pianificata</Text>
          <Text style={[styles.poolValue, { color: colors.text }]}>
            {amountsVisible ? formatEuro(savingsPool) : HIDDEN_AMOUNT}
          </Text>
        </View>
        <View style={styles.poolRow}>
          <Text style={[styles.poolLabel, { color: colors.textSecondary }]}>Accantonato nel ciclo</Text>
          <Text style={[styles.poolValue, { color: colors.text }]}>
            {amountsVisible ? formatEuro(savedThisCycle) : HIDDEN_AMOUNT}
          </Text>
        </View>
        <View style={styles.poolRow}>
          <Text style={[styles.poolLabel, { color: colors.textSecondary }]}>Ancora disponibile</Text>
          <Text style={[styles.poolValue, { color: colors.accent }]}>
            {amountsVisible ? formatEuro(availableSavings) : HIDDEN_AMOUNT}
          </Text>
        </View>
        {goalAllocationMode === 'percentage' ? (
          <View style={styles.poolRow}>
            <Text style={[styles.poolLabel, { color: colors.textSecondary }]}>Risparmio libero</Text>
            <Text style={[styles.poolValue, { color: colors.text }]}>
              {amountsVisible
                ? `${freePercentage}% · ${formatEuro((savingsPool * freePercentage) / 100)}`
                : HIDDEN_AMOUNT}
            </Text>
          </View>
        ) : null}
      </Card>

      {needsAttention ? (
        <Card style={[styles.warning, { backgroundColor: colors.warningSoft }]}> 
          <Text style={[styles.warningTitle, { color: colors.warning }]}>Quote da rivedere</Text>
          <Text style={[styles.warningCopy, { color: colors.textSecondary }]}> 
            Le percentuali arrivano al {percentageTotal}%. Riducile fino a un massimo del 100%.
          </Text>
        </Card>
      ) : null}

      {goalAllocationMode === 'priority' && targetGoals.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Ordine di priorità</Text>
          <Text style={[styles.sectionCopy, { color: colors.textSecondary }]}> 
            Il primo obiettivo riceve l’intera quota mensile. Trascina le righe per cambiare l’ordine.
          </Text>
          <View style={styles.goalList}>
            {targetGoals.map((goal, index) => (
              <SortableGoalRow
                key={goal.id}
                goal={goal}
                first={index === 0}
                last={index === targetGoals.length - 1}
                onMove={(direction) => void moveGoal(goal.id, direction)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {goalAllocationMode === 'percentage' && targetGoals.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quote percentuali</Text>
          <Text style={[styles.sectionCopy, { color: colors.textSecondary }]}> 
            Regola ogni quota a passi del 5%. Ciò che rimane confluisce nel Risparmio libero.
          </Text>
          <View style={styles.goalList}>
            {targetGoals.map((goal) => (
              <PercentageRow
                key={goal.id}
                goal={goal}
                maxValue={Math.max(
                  0,
                  100 - (percentageTotal - goal.allocationPercentage),
                )}
                onChange={(value) =>
                  void updateGoal(goal.id, { allocationPercentage: value })
                }
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Altre impostazioni</Text>
        <Pressable
          onPress={() => router.push('/financing' as Href)}
          style={({ pressed }) => pressed && styles.pressed}>
          <Card style={styles.settingRow}>
            <Text style={[styles.rowIcon, { color: colors.text }]}>account_balance</Text>
            <View style={styles.flex}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Finanziamenti</Text>
              <Text style={[styles.rowCopy, { color: colors.textSecondary }]}> 
                {loans.length ? `${loans.length} attivi` : 'Nessun finanziamento attivo'}
              </Text>
            </View>
            <Text style={[styles.rowIcon, { color: colors.textSecondary }]}>chevron_right</Text>
          </Card>
        </Pressable>
        <Card style={styles.settingRow}>
          <Text style={[styles.rowIcon, { color: colors.text }]}>group</Text>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Condivisione</Text>
            <Text style={[styles.rowCopy, { color: colors.textSecondary }]}> 
              Nessun obiettivo condiviso
            </Text>
          </View>
          <Text style={[styles.comingSoon, { color: colors.textSecondary }]}>Presto</Text>
        </Card>
      </View>
    </Screen>
  );
}

function ModalHeader({ title }: { title: string }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Chiudi"
        accessibilityRole="button"
        onPress={() => router.back()}
        style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function ModeButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.modeButton, selected && { backgroundColor: colors.surface }]}> 
      <Text style={[styles.modeText, { color: selected ? colors.text : colors.textSecondary }]}> 
        {label}
      </Text>
    </Pressable>
  );
}

function SortableGoalRow({
  goal,
  first,
  last,
  onMove,
}: {
  goal: Goal;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const { colors } = useFlowndTheme();
  const [translateY] = useState(() => new Animated.Value(0));
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
        onPanResponderMove: (_, gesture) => translateY.setValue(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -24 && !first) onMove(-1);
          if (gesture.dy > 24 && !last) onMove(1);
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start(),
      }),
    [first, last, onMove, translateY],
  );
  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.sortableRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          transform: [{ translateY }],
        },
      ]}>
      <Text style={[styles.dragIcon, { color: colors.textSecondary }]}>drag_indicator</Text>
      <Text style={[styles.sortableName, { color: colors.text }]}>{goal.name}</Text>
    </Animated.View>
  );
}

function PercentageRow({
  goal,
  maxValue,
  onChange,
}: {
  goal: Goal;
  maxValue: number;
  onChange: (value: number) => void;
}) {
  const { colors } = useFlowndTheme();
  const value = Math.max(0, Math.min(100, goal.allocationPercentage));
  const canIncrease = value < Math.min(100, maxValue);
  return (
    <View
      style={[
        styles.percentageRow,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      <Text numberOfLines={1} style={[styles.percentageName, { color: colors.text }]}> 
        {goal.name}
      </Text>
      <Pressable
        accessibilityLabel={`Riduci quota di ${goal.name}`}
        disabled={value <= 0}
        onPress={() => onChange(Math.max(0, value - 5))}
        style={[styles.stepButton, { backgroundColor: colors.sunken }]}> 
        <Text style={[styles.stepIcon, { color: value <= 0 ? colors.border : colors.text }]}>remove</Text>
      </Pressable>
      <Text style={[styles.percentageValue, { color: colors.text }]}>{value}%</Text>
      <Pressable
        accessibilityLabel={`Aumenta quota di ${goal.name}`}
        disabled={!canIncrease}
        onPress={() => onChange(Math.min(100, maxValue, value + 5))}
        style={[styles.stepButton, { backgroundColor: colors.sunken }]}> 
        <Text style={[styles.stepIcon, { color: canIncrease ? colors.text : colors.border }]}>add</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontFamily: font.body, fontSize: 25, lineHeight: 28 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  modeControl: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  modeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeText: { fontFamily: font.bodySemiBold, fontSize: 12 },
  modeCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 10 },
  poolRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  poolLabel: { fontFamily: font.bodyMedium, fontSize: 12 },
  poolValue: { fontFamily: font.dataMedium, fontSize: 13 },
  warning: { marginTop: 10 },
  warningTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  warningCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 4 },
  section: { marginTop: 26 },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 19 },
  sectionCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 2 },
  goalList: { gap: 8, marginTop: 10 },
  sortableRow: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
  },
  dragIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  sortableName: { fontFamily: font.bodyMedium, fontSize: 13 },
  percentageRow: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  percentageName: { flex: 1, fontFamily: font.bodyMedium, fontSize: 12 },
  percentageValue: {
    width: 42,
    textAlign: 'center',
    fontFamily: font.dataMedium,
    fontSize: 11,
  },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 9 },
  rowIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  rowTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  rowCopy: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  comingSoon: { fontFamily: font.bodySemiBold, fontSize: 9 },
  pressed: { opacity: 0.7 },
});
