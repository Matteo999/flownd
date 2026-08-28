import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';

export type TransactionKind = 'expense' | 'income';

export function TransactionKindSelector({
  value,
  onChange,
}: {
  value: TransactionKind;
  onChange: (value: TransactionKind) => void;
}) {
  const { colors, isDark } = useFlowndTheme();
  const options = [
    {
      id: 'expense' as const,
      label: 'Uscita',
      description: 'Denaro speso',
      icon: 'north_east',
      color: '#FF6685',
      soft: isDark ? '#43232E' : '#FFF0F4',
    },
    {
      id: 'income' as const,
      label: 'Entrata',
      description: 'Denaro ricevuto',
      icon: 'south_west',
      color: '#20C58A',
      soft: isDark ? '#153B30' : '#E8FBF4',
    },
  ];

  return (
    <View>
      <Text style={[styles.label, { color: colors.text }]}>Tipo di movimento</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.label}, ${option.description}`}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected ? option.soft : colors.surface,
                  borderColor: selected ? option.color : colors.border,
                },
                pressed && styles.pressed,
              ]}>
              <View style={[styles.iconBox, { backgroundColor: option.soft }]}>
                <Text style={[styles.icon, { color: option.color }]}>
                  {option.icon}
                </Text>
              </View>
              <View style={styles.copy}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {option.label}
                </Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  {option.description}
                </Text>
              </View>
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? option.color : colors.border },
                ]}>
                {selected ? (
                  <View style={[styles.radioDot, { backgroundColor: option.color }]} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    marginBottom: 9,
  },
  options: { flexDirection: 'row', gap: 10 },
  option: {
    flex: 1,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 20,
    lineHeight: 23,
  },
  copy: { flex: 1 },
  title: { fontFamily: font.bodySemiBold, fontSize: 12 },
  description: { fontFamily: font.body, fontSize: 9, marginTop: 2 },
  radio: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  pressed: { opacity: 0.68 },
});
