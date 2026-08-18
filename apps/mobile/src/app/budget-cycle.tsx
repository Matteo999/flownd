import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import {
  type BudgetRolloverMode,
  financialCycleForDate,
  formatFinancialCycle,
} from '@/lib/financial-cycle';
import { useApp } from '@/providers/app-provider';

const days = Array.from({ length: 28 }, (_, index) => index + 1);
const rolloverOptions: {
  id: BudgetRolloverMode;
  title: string;
  description: string;
}[] = [
  {
    id: 'savings',
    title: 'Sposta nei Risparmi',
    description: 'L’avanzo del ciclo precedente aumenta solo la quota Risparmi.',
  },
  {
    id: 'carry',
    title: 'Riporta al ciclo successivo',
    description: 'L’avanzo viene ridistribuito tra tutte le quote.',
  },
  {
    id: 'reset',
    title: 'Non riportare',
    description: 'Il nuovo budget considera soltanto le nuove entrate.',
  },
];

export default function BudgetCycleScreen() {
  const { colors, isDark } = useFlowndTheme();
  const {
    budgetCycleStartDay,
    budgetRolloverMode,
    updateBudgetCycleSettings,
    saving,
    error,
    clearError,
  } = useApp();
  const [startDay, setStartDay] = useState(budgetCycleStartDay);
  const [rolloverMode, setRolloverMode] =
    useState<BudgetRolloverMode>(budgetRolloverMode);
  const startDayRef = useRef(startDay);
  const rolloverModeRef = useRef(rolloverMode);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [daysOpen, setDaysOpen] = useState(false);
  const cycle = financialCycleForDate(new Date(), startDay);

  function saveSettings(day: number, mode: BudgetRolloverMode) {
    saveQueue.current = saveQueue.current.then(async () => {
      await updateBudgetCycleSettings(day, mode);
    });
  }

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi"
          onPress={() => router.back()}
          style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Mese finanziario</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[uiStyles.title, { color: colors.text }]}>Quando inizia il tuo mese?</Text>
      <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}> 
        Scegli il giorno in cui ricevi normalmente lo stipendio. Il budget verrà calcolato fino al giorno precedente del mese successivo.
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Giorno di inizio</Text>
      <View
        style={[
          styles.dropdown,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: daysOpen }}
          onPress={() => setDaysOpen((current) => !current)}
          style={({ pressed }) => [styles.dropdownTrigger, pressed && styles.pressed]}>
          <Text style={[styles.dropdownValue, { color: colors.text }]}>Giorno {startDay}</Text>
          <Text style={[styles.materialIcon, { color: colors.textSecondary }]}> 
            {daysOpen ? 'expand_less' : 'expand_more'}
          </Text>
        </Pressable>
        {daysOpen ? (
          <View style={[styles.dayGrid, { borderTopColor: colors.border }]}> 
            {days.map((day) => {
              const selected = day === startDay;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    clearError();
                    startDayRef.current = day;
                    setStartDay(day);
                    setDaysOpen(false);
                    saveSettings(day, rolloverModeRef.current);
                  }}
                  style={[
                    styles.day,
                    { backgroundColor: selected ? colors.accentSoft : colors.sunken },
                  ]}>
                  <Text style={[styles.dayText, { color: selected ? colors.accent : colors.text }]}> 
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={[styles.preview, { backgroundColor: colors.accentSoft }]}> 
        <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>CICLO CORRENTE</Text>
        <Text style={[styles.previewValue, { color: colors.text }]}> 
          {formatFinancialCycle(cycle)}
        </Text>
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Avanzo a fine ciclo</Text>
      <View style={styles.options}>
        {rolloverOptions.map((option) => {
          const selected = rolloverMode === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                clearError();
                rolloverModeRef.current = option.id;
                setRolloverMode(option.id);
                saveSettings(startDayRef.current, option.id);
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected ? colors.accentSoft : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
                pressed && styles.pressed,
              ]}>
              <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.border }]}> 
                {selected ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>{option.title}</Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}> 
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
      <Text style={[styles.saveStatus, { color: colors.textSecondary }]}>
        {saving ? 'Salvataggio…' : 'Le modifiche vengono salvate automaticamente.'}
      </Text>
    </Screen>
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
  label: { fontFamily: font.bodySemiBold, fontSize: 13, marginTop: 22, marginBottom: 8 },
  dropdown: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dropdownTrigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  dropdownValue: { fontFamily: font.bodyMedium, fontSize: 14 },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  dayGrid: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 10,
  },
  day: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontFamily: font.dataMedium, fontSize: 11 },
  preview: { borderRadius: 12, padding: 14, marginTop: 12 },
  previewLabel: { fontFamily: font.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  previewValue: { fontFamily: font.dataMedium, fontSize: 14, marginTop: 4, textTransform: 'capitalize' },
  options: { gap: 8 },
  option: {
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  optionDescription: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  saveStatus: { fontFamily: font.body, fontSize: 10, textAlign: 'center', marginTop: 14 },
  pressed: { opacity: 0.68 },
});
