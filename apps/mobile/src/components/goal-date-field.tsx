import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';
import {
  defaultGoalDeadline,
  formatDateISO,
  formatDateItalian,
  parseDraftDate,
} from '@/lib/onboarding';

export function GoalDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, isDark } = useFlowndTheme();
  const [open, setOpen] = useState(false);
  const selectedDate =
    parseDraftDate(value) ??
    parseDraftDate(defaultGoalDeadline()) ??
    new Date();
  const minimumDate = new Date();
  minimumDate.setHours(0, 0, 0, 0);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>Scadenza</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          value
            ? `Scadenza ${formatDateItalian(formatDateISO(selectedDate))}`
            : 'Seleziona una scadenza'
        }
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && styles.pressed,
        ]}>
        <Text
          style={[
            styles.value,
            { color: value ? colors.text : colors.textSecondary },
          ]}>
          {value
            ? formatDateItalian(formatDateISO(selectedDate))
            : 'Nessuna scadenza'}
        </Text>
        <SymbolView
          name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          size={19}
          tintColor={colors.accent}
        />
      </Pressable>

      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rimuovi scadenza"
          onPress={() => onChange('')}
          style={styles.clearButton}>
          <Text style={[styles.clearText, { color: colors.textSecondary }]}>
            Rimuovi scadenza
          </Text>
        </Pressable>
      ) : null}

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          presentation="dialog"
          minimumDate={minimumDate}
          accentColor={colors.accent}
          positiveButton={{ label: 'Conferma' }}
          negativeButton={{ label: 'Annulla' }}
          onValueChange={(_event, date) => {
            onChange(formatDateISO(date));
            setOpen(false);
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          presentationStyle="overFullScreen"
          onRequestClose={() => setOpen(false)}>
          <View style={styles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
            <View
              style={[
                styles.pickerCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <View style={styles.pickerHeader}>
                <Text style={[styles.pickerTitle, { color: colors.text }]}>
                  Scegli la scadenza
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setOpen(false)}>
                  <Text style={[styles.done, { color: colors.accent }]}>Fatto</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="inline"
                locale="it_IT"
                minimumDate={minimumDate}
                accentColor={colors.accent}
                themeVariant={isDark ? 'dark' : 'light'}
                onValueChange={(_event, date) => onChange(formatDateISO(date))}
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  label: { fontFamily: font.bodyMedium, fontSize: 13, marginBottom: 7 },
  field: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  value: { flex: 1, fontFamily: font.data, fontSize: 15 },
  pressed: { opacity: 0.68 },
  clearButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  clearText: { fontFamily: font.bodyMedium, fontSize: 11 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(5, 14, 10, 0.48)',
  },
  pickerCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pickerTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  done: { fontFamily: font.bodySemiBold, fontSize: 14, padding: 7 },
  picker: { width: '100%', minHeight: 330 },
});
