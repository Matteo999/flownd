import { Slider } from '@expo/ui/community/slider';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Field, PageHeader, PrimaryButton, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import { type BudgetGroupKey, budgetGroups } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

function isBudgetGroup(value: string | undefined): value is BudgetGroupKey {
  return value === 'needs' || value === 'wants' || value === 'savings';
}

export default function BudgetSubcategoryScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{ parent?: string }>();
  const parent = isBudgetGroup(params.parent) ? params.parent : null;
  const { draft, saving, error, createBudgetSubcategory } = useApp();
  const [name, setName] = useState('');
  const children = useMemo(
    () => draft.budgets.filter((item) => item.selected && !item.isMacro && item.parentId === parent),
    [draft.budgets, parent],
  );
  const allocated = children.reduce((sum, item) => sum + item.percentage, 0);
  const available = Math.max(0, 100 - allocated);
  const [percentage, setPercentage] = useState(Math.max(1, Math.min(10, available)));
  const group = budgetGroups.find((item) => item.id === parent);

  if (!parent || !group) {
    return (
      <Screen>
        <PageHeader title="Sotto-budget" leading={<BackButton />} />
        <Text style={[uiStyles.error, { color: colors.negative }]}>Macro-categoria non valida.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={`Sotto-budget ${group.name}`} leading={<BackButton />} />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Crea una quota interna a {group.name}. Le percentuali qui sotto si riferiscono alla macro-categoria, non all’intero reddito.
      </Text>

      {children.length ? (
        <View style={styles.existingList}>
          {children.map((child) => (
            <Card key={child.id} style={styles.existingRow}>
              <Text style={[styles.existingName, { color: colors.text }]}>{child.name}</Text>
              <Text style={[styles.existingValue, { color: colors.accent }]}>{Math.round(child.percentage)}%</Text>
            </Card>
          ))}
        </View>
      ) : null}

      <Card style={styles.form}>
        <View style={styles.formHeading}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Nuovo sotto-budget</Text>
          <Text style={[styles.available, { color: colors.textSecondary }]}>{available}% disponibile</Text>
        </View>
        <Field label="Nome" placeholder="es. Affitto" value={name} onChangeText={setName} />
        <View style={styles.percentageHeading}>
          <Text style={[styles.percentageLabel, { color: colors.text }]}>Quota di {group.name}</Text>
          <Text style={[styles.percentageValue, { color: colors.accent }]}>{percentage}%</Text>
        </View>
        <Slider
          value={Math.min(percentage, Math.max(1, available))}
          minimumValue={1}
          maximumValue={Math.max(1, available)}
          disabled={available < 1}
          step={1}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.sunken}
          thumbTintColor={colors.accent}
          onValueChange={(value) => setPercentage(Math.round(value))}
          style={styles.slider}
        />
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton
          disabled={!name.trim() || available < 1}
          loading={saving}
          onPress={async () => {
            const created = await createBudgetSubcategory(parent, name.trim(), Math.min(percentage, available));
            if (created) router.back();
          }}>
          Aggiungi sotto-budget
        </PrimaryButton>
      </Card>
    </Screen>
  );
}

function BackButton() {
  const { colors } = useFlowndTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
      <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  intro: { fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  existingList: { gap: 7, marginBottom: 14 },
  existingRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  existingName: { fontFamily: font.bodySemiBold, fontSize: 12 },
  existingValue: { fontFamily: font.dataMedium, fontSize: 12 },
  form: { gap: 14 },
  formHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  available: { fontFamily: font.body, fontSize: 10 },
  percentageHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  percentageLabel: { fontFamily: font.bodyMedium, fontSize: 12 },
  percentageValue: { fontFamily: font.dataMedium, fontSize: 13 },
  slider: { height: 30 },
  pressed: { opacity: 0.68 },
});
