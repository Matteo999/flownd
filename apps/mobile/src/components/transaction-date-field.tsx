import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';

function formatTransactionDate(date: Date) {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function preserveTime(date: Date, current: Date) {
  const next = new Date(date);
  next.setHours(
    current.getHours(),
    current.getMinutes(),
    current.getSeconds(),
    current.getMilliseconds(),
  );
  return next;
}

export function TransactionDateField({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  const { colors, isDark } = useFlowndTheme();
  const [open, setOpen] = useState(false);
  const today = new Date();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>Data</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Data della transazione: ${formatTransactionDate(value)}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.value, { color: colors.text }]}> 
          {formatTransactionDate(value)}
        </Text>
        <SymbolView
          name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          size={19}
          tintColor={colors.accent}
        />
      </Pressable>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          presentation="dialog"
          maximumDate={today}
          accentColor={colors.accent}
          positiveButton={{ label: 'Conferma' }}
          negativeButton={{ label: 'Annulla' }}
          onValueChange={(_event, date) => {
            onChange(preserveTime(date, value));
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
                <Text style={[styles.pickerTitle, { color: colors.text }]}>Scegli la data</Text>
                <Pressable accessibilityRole="button" onPress={() => setOpen(false)}>
                  <Text style={[styles.done, { color: colors.accent }]}>Fatto</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={value}
                mode="date"
                display="inline"
                locale="it_IT"
                maximumDate={today}
                accentColor={colors.accent}
                themeVariant={isDark ? 'dark' : 'light'}
                onValueChange={(_event, date) => onChange(preserveTime(date, value))}
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
  label: { fontFamily: font.bodySemiBold, fontSize: 13, marginBottom: 7 },
  field: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  value: { flex: 1, fontFamily: font.body, fontSize: 14, textTransform: 'capitalize' },
  pressed: { opacity: 0.68 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(4, 12, 9, 0.4)',
  },
  pickerCard: { borderRadius: 22, borderWidth: 1, padding: 16 },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pickerTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  done: { fontFamily: font.bodySemiBold, fontSize: 14, padding: 6 },
  picker: { minHeight: 330 },
});
