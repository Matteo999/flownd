import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';

export type TransactionKind = 'expense' | 'income';

export function TransactionKindSelector({
  value,
  onChange,
  compact = false,
  showLabel = true,
}: {
  value: TransactionKind;
  onChange: (value: TransactionKind) => void;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const { colors, isDark } = useFlowndTheme();
  const options = [
    {
      id: 'expense' as const,
      label: 'Uscita',
      icon: 'north_east',
      color: '#3D8BFF',
      soft: isDark ? '#203552' : '#EBF3FF',
    },
    {
      id: 'income' as const,
      label: 'Entrata',
      icon: 'south_west',
      color: '#20C58A',
      soft: isDark ? '#153B30' : '#E8FBF4',
    },
  ];

  return (
    <View>
      {showLabel ? (
        <Text style={[styles.label, { color: colors.text }]}>Tipo di movimento</Text>
      ) : null}
      <View style={styles.options}>
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => [
                styles.option,
                compact && styles.compactOption,
                {
                  backgroundColor: selected ? option.soft : colors.surface,
                  borderColor: selected ? option.color : colors.border,
                },
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.iconBox,
                  compact && styles.compactIconBox,
                  { backgroundColor: option.soft },
                ]}>
                <Text style={[styles.icon, { color: option.color }]}>
                  {option.icon}
                </Text>
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                {option.label}
              </Text>
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
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  compactOption: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 9,
    gap: 7,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIconBox: { width: 28, height: 28, borderRadius: 9 },
  icon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 20,
    lineHeight: 23,
  },
  title: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 12 },
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
