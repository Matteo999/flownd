import { Slider } from '@expo/ui/community/slider';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Field, PageHeader, PrimaryButton, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import { type BudgetCategory, type BudgetGroupKey, budgetGroups } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

function isBudgetGroup(value: string | undefined): value is BudgetGroupKey {
  return value === 'needs' || value === 'wants' || value === 'savings';
}

export default function BudgetSubcategoryScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{ parent?: string }>();
  const parent = isBudgetGroup(params.parent) ? params.parent : null;
  const {
    draft, saving, error, createBudgetSubcategory, deleteBudgetSubcategory,
    saveBudgetAllocations, budgetMonthlyIncome,
  } = useApp();
  const sourceChildren = useMemo(
    () => draft.budgets.filter((item) => item.selected && !item.isMacro && item.parentId === parent),
    [draft.budgets, parent],
  );
  const [children, setChildren] = useState(sourceChildren);
  const childrenRef = useRef(children);
  const [name, setName] = useState('');
  const [budgetEnabled, setBudgetEnabled] = useState(true);
  const [percentage, setPercentage] = useState(10);
  const [newParentCategoryId, setNewParentCategoryId] = useState<string | null>(null);
  const group = budgetGroups.find((item) => item.id === parent);

  const topLevel = children.filter((item) => !item.parentCategoryId);
  const creationSiblings = children.filter(
    (item) => (item.parentCategoryId ?? null) === newParentCategoryId && item.budgetEnabled !== false,
  );
  const available = Math.max(0, 100 - creationSiblings.reduce((sum, item) => sum + item.percentage, 0));
  const selectedDirectParent = newParentCategoryId
    ? topLevel.find((item) => item.id === newParentCategoryId)
    : null;
  const canAssignBudget = !selectedDirectParent || selectedDirectParent.budgetEnabled !== false;

  function updateChildren(next: BudgetCategory[]) {
    childrenRef.current = next;
    setChildren(next);
  }

  function persistChildren() {
    const byId = new Map(childrenRef.current.map((item) => [item.id, item]));
    void saveBudgetAllocations(
      draft.budgets.map((item) => byId.get(item.id) ?? item),
      Math.max(1, budgetMonthlyIncome),
    );
  }

  function siblingAvailability(target: BudgetCategory) {
    const used = childrenRef.current
      .filter((item) => item.id !== target.id && item.budgetEnabled !== false &&
        (item.parentCategoryId ?? null) === (target.parentCategoryId ?? null))
      .reduce((sum, item) => sum + item.percentage, 0);
    return Math.max(0, 100 - used);
  }

  function setChildPercentage(id: string, value: number) {
    const target = childrenRef.current.find((item) => item.id === id);
    if (!target) return;
    const maximum = siblingAvailability(target);
    updateChildren(childrenRef.current.map((item) => item.id === id
      ? { ...item, percentage: Math.max(1, Math.min(maximum, Math.round(value))) }
      : item));
  }

  function toggleChildBudget(target: BudgetCategory) {
    const enabling = target.budgetEnabled === false;
    const maximum = siblingAvailability(target);
    if (enabling && maximum < 1) return;
    updateChildren(childrenRef.current.map((item) => {
      if (!enabling && item.parentCategoryId === target.id) {
        return { ...item, budgetEnabled: false, percentage: 0 };
      }
      return item.id === target.id
        ? { ...item, budgetEnabled: enabling, percentage: enabling ? Math.min(10, maximum) : 0 }
        : item;
    }));
    setTimeout(persistChildren, 0);
  }

  function confirmDelete(child: BudgetCategory) {
    const nestedCount = children.filter((item) => item.parentCategoryId === child.id).length;
    Alert.alert(
      `Eliminare ${child.name}?`,
      nestedCount
        ? `Verranno eliminate anche ${nestedCount} sottocategorie collegate.`
        : 'La categoria delle transazioni esistenti non verrà modificata.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => void (async () => {
            if (await deleteBudgetSubcategory(child.id)) {
              updateChildren(childrenRef.current.filter(
                (item) => item.id !== child.id && item.parentCategoryId !== child.id,
              ));
              if (newParentCategoryId === child.id) setNewParentCategoryId(null);
            }
          })(),
        },
      ],
    );
  }

  if (!parent || !group) {
    return <Screen><PageHeader title="Sotto-budget" leading={<BackButton />} />
      <Text style={[uiStyles.error, { color: colors.negative }]}>Macro-categoria non valida.</Text>
    </Screen>;
  }

  return (
    <Screen>
      <PageHeader title={`Sotto-budget ${group.name}`} leading={<BackButton />} />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Il budget è facoltativo. Puoi aggiungere un livello di sottocategorie dentro ogni voce.
      </Text>

      {topLevel.length ? <View style={styles.existingList}>
        {topLevel.map((child) => <BudgetRow
          key={child.id}
          child={child}
          nested={children.filter((item) => item.parentCategoryId === child.id)}
          maximum={siblingAvailability(child)}
          onChange={setChildPercentage}
          onPersist={persistChildren}
          onToggle={toggleChildBudget}
          onDelete={confirmDelete}
        />)}
      </View> : null}

      <Card style={styles.form}>
        <View style={styles.formHeading}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Nuova categoria</Text>
          <Text style={[styles.available, { color: colors.textSecondary }]}>{available}% disponibile</Text>
        </View>
        <Field label="Nome" placeholder="es. Affitto" value={name} onChangeText={setName} />

        {topLevel.length ? <View style={styles.parentBlock}>
          <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Posizione</Text>
          <View style={styles.chips}>
            <ChoiceChip label={group.name} selected={!newParentCategoryId} onPress={() => setNewParentCategoryId(null)} />
            {topLevel.map((item) => <ChoiceChip
              key={item.id} label={item.name} selected={newParentCategoryId === item.id}
              onPress={() => setNewParentCategoryId(item.id)}
            />)}
          </View>
        </View> : null}

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: budgetEnabled && canAssignBudget }}
          disabled={!canAssignBudget}
          onPress={() => setBudgetEnabled((current) => !current)}
          style={[styles.budgetToggle, !canAssignBudget && styles.disabled]}>
          <View style={[
            styles.checkbox, { borderColor: colors.border },
            budgetEnabled && canAssignBudget && { borderColor: colors.accent, backgroundColor: colors.accent },
          ]}>
            {budgetEnabled && canAssignBudget ? <Text style={styles.check}>check</Text> : null}
          </View>
          <View style={styles.flex}>
            <Text style={[styles.toggleTitle, { color: colors.text }]}>Assegna un budget</Text>
            <Text style={[styles.toggleCopy, { color: colors.textSecondary }]}>Puoi usare la categoria anche senza un limite.</Text>
          </View>
        </Pressable>

        {budgetEnabled && canAssignBudget ? <>
          <View style={styles.percentageHeading}>
            <Text style={[styles.percentageLabel, { color: colors.text }]}>Quota del livello superiore</Text>
            <Text style={[styles.percentageValue, { color: colors.accent }]}>{Math.min(percentage, available)}%</Text>
          </View>
          {available > 1 ? <Slider
            value={Math.max(1, Math.min(percentage, available))}
            minimumValue={1} maximumValue={available} step={1}
            minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.sunken}
            thumbTintColor={colors.accent}
            onValueChange={(value) => setPercentage(Math.round(value))}
            style={styles.slider}
          /> : <Text style={[styles.noSpace, { color: colors.textSecondary }]}>Non c’è quota disponibile per un altro budget.</Text>}
        </> : null}
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton
          disabled={!name.trim() || (budgetEnabled && canAssignBudget && available < 1)}
          loading={saving}
          onPress={async () => {
            const enabled = budgetEnabled && canAssignBudget;
            const created = await createBudgetSubcategory(
              parent, name.trim(), enabled ? Math.max(1, Math.min(percentage, available)) : 0,
              { parentCategoryId: newParentCategoryId, budgetEnabled: enabled },
            );
            if (created) {
              updateChildren([...childrenRef.current, created]);
              setName(''); setPercentage(10); setBudgetEnabled(true); setNewParentCategoryId(null);
            }
          }}>
          Aggiungi categoria
        </PrimaryButton>
      </Card>
    </Screen>
  );
}

function BudgetRow({ child, nested, maximum, onChange, onPersist, onToggle, onDelete }: {
  child: BudgetCategory; nested: BudgetCategory[]; maximum: number;
  onChange: (id: string, value: number) => void; onPersist: () => void;
  onToggle: (child: BudgetCategory) => void; onDelete: (child: BudgetCategory) => void;
}) {
  const { colors } = useFlowndTheme();
  return <Card style={styles.categoryCard}>
    <EditableBudgetLine child={child} maximum={maximum} onChange={onChange} onPersist={onPersist} onToggle={onToggle} onDelete={onDelete} />
    {nested.length ? <View style={[styles.nestedList, { borderTopColor: colors.border }]}>
      {nested.map((item) => <EditableBudgetLine
        key={item.id} child={item} nested
        maximum={100 - nested.filter((other) => other.id !== item.id && other.budgetEnabled !== false)
          .reduce((sum, other) => sum + other.percentage, 0)}
        onChange={onChange} onPersist={onPersist} onToggle={onToggle} onDelete={onDelete}
      />)}
    </View> : null}
  </Card>;
}

function EditableBudgetLine({ child, maximum, nested, onChange, onPersist, onToggle, onDelete }: {
  child: BudgetCategory; maximum: number; nested?: boolean;
  onChange: (id: string, value: number) => void; onPersist: () => void;
  onToggle: (child: BudgetCategory) => void; onDelete: (child: BudgetCategory) => void;
}) {
  const { colors } = useFlowndTheme();
  const enabled = child.budgetEnabled !== false;
  return <View style={[styles.editableLine, nested && styles.nestedLine]}>
    <View style={styles.lineHeading}>
      {nested ? <Text style={[styles.branch, { color: colors.textSecondary }]}>subdirectory_arrow_right</Text> : null}
      <Text style={[styles.existingName, { color: colors.text }]}>{child.name}</Text>
      <Pressable onPress={() => onToggle(child)} hitSlop={8} style={styles.inlineAction}>
        <Text style={[styles.inlineActionText, { color: colors.accent }]}>{enabled ? 'Budget attivo' : 'Senza budget'}</Text>
      </Pressable>
      <Pressable accessibilityLabel={`Elimina ${child.name}`} onPress={() => onDelete(child)} hitSlop={8}>
        <Text style={[styles.deleteIcon, { color: colors.negative }]}>delete</Text>
      </Pressable>
    </View>
    {enabled ? <View onTouchEnd={onPersist} onTouchCancel={onPersist} style={styles.existingSliderRow}>
      {maximum > 1 ? <Slider
        value={Math.max(1, Math.min(child.percentage, maximum))}
        minimumValue={1} maximumValue={maximum} step={1}
        minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.sunken}
        thumbTintColor={colors.accent} onValueChange={(value) => onChange(child.id, value)}
        style={styles.existingSlider}
      /> : <View style={styles.existingSlider} />}
      <Text style={[styles.existingValue, { color: colors.accent }]}>{Math.round(child.percentage)}%</Text>
    </View> : null}
  </View>;
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return <Pressable onPress={onPress} style={[
    styles.chip,
    { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surface },
  ]}>
    <Text style={[styles.chipText, { color: selected ? colors.accent : colors.textSecondary }]}>{label}</Text>
  </Pressable>;
}

function BackButton() {
  const { colors } = useFlowndTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={8}
    onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
    <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  intro: { fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  existingList: { gap: 8, marginBottom: 14 },
  categoryCard: { paddingVertical: 12 },
  editableLine: { gap: 7 },
  nestedList: { marginTop: 10, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  nestedLine: { paddingLeft: 5 },
  lineHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  branch: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 17 },
  existingName: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 12 },
  inlineAction: { paddingVertical: 4 },
  inlineActionText: { fontFamily: font.bodyMedium, fontSize: 9 },
  deleteIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18 },
  existingSliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  existingSlider: { flex: 1, height: 24 },
  existingValue: { width: 32, textAlign: 'right', fontFamily: font.dataMedium, fontSize: 11 },
  form: { gap: 14 },
  formHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  available: { fontFamily: font.body, fontSize: 10 },
  parentBlock: { gap: 8 },
  smallLabel: { fontFamily: font.bodyMedium, fontSize: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  chipText: { fontFamily: font.bodyMedium, fontSize: 10 },
  budgetToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#FFFFFF', fontFamily: 'MaterialSymbols_400Regular', fontSize: 16 },
  toggleTitle: { fontFamily: font.bodySemiBold, fontSize: 11 },
  toggleCopy: { fontFamily: font.body, fontSize: 9, marginTop: 1 },
  percentageHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  percentageLabel: { fontFamily: font.bodyMedium, fontSize: 12 },
  percentageValue: { fontFamily: font.dataMedium, fontSize: 13 },
  slider: { height: 30 },
  noSpace: { fontFamily: font.body, fontSize: 10, lineHeight: 15 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.68 },
});
