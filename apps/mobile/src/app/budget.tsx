import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  Card,
  PageHeader,
  ProgressBar,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import {
  BudgetCategory,
  categoryToBudgetGroup,
  formatEuro,
  summarizeBudgets,
} from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function BudgetScreen() {
  const { colors } = useFlowndTheme();
  const { draft, error, updateBudgetAmount } = useApp();
  const [budgets, setBudgets] = useState<BudgetCategory[]>(
    draft.budgets.filter((item) => item.selected),
  );
  const groups = useMemo(() => summarizeBudgets(budgets), [budgets]);
  const expenseGroup = categoryToBudgetGroup(draft.expense.category);

  function updateAmount(id: string, amount: number) {
    setBudgets((items) =>
      items.map((item) => (item.id === id ? { ...item, amount } : item)),
    );
  }

  return (
    <Screen>
      <PageHeader title="Budget" />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Le tre quote definiscono il piano. Le categorie sotto ogni quota ti
        aiutano a capire dove stai spendendo.
      </Text>

      <View style={styles.list}>
        {groups.map((group) => {
          const spent =
            expenseGroup === group.id && draft.expense.amount > 0
              ? draft.expense.amount
              : 0;
          const progress = group.amount ? spent / group.amount : 0;
          return (
            <Card key={group.id}>
              <View style={styles.top}>
                <View style={styles.category}>
                  <View
                    style={[
                      styles.groupIcon,
                      { backgroundColor: colors.accentSoft },
                    ]}>
                    <Text style={[styles.emoji, { color: colors.accent }]}>
                      {group.emoji}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.name, { color: colors.text }]}>
                      {group.name}
                    </Text>
                    <Text
                      style={[
                        styles.groupCaption,
                        { color: colors.textSecondary },
                      ]}>
                      {group.children.length
                        ? `${group.children.length} categorie collegate`
                        : 'Quota del piano'}
                    </Text>
                  </View>
                </View>
                {group.macro ? (
                  <AmountEditor
                    label={`Budget ${group.name}`}
                    value={group.macro.amount}
                    onChange={(amount) => updateAmount(group.macro!.id, amount)}
                    onCommit={(amount) =>
                      void updateBudgetAmount(group.macro!.id, amount)
                    }
                  />
                ) : (
                  <Text style={[styles.groupTotal, { color: colors.text }]}>
                    {formatEuro(group.amount)}
                  </Text>
                )}
              </View>

              <View style={styles.meta}>
                <Text style={[styles.spent, { color: colors.text }]}>
                  {formatEuro(spent)} utilizzati
                </Text>
                <Text
                  style={[
                    styles.remaining,
                    {
                      color:
                        progress >= 0.8
                          ? colors.warning
                          : colors.textSecondary,
                    },
                  ]}>
                  {group.amount
                    ? `${formatEuro(Math.max(0, group.amount - spent))} disponibili`
                    : 'Quota da impostare'}
                </Text>
              </View>
              <ProgressBar value={progress} warning={progress >= 0.8} />

              {group.children.length ? (
                <View
                  style={[
                    styles.children,
                    { borderTopColor: colors.border },
                  ]}>
                  {group.children.map((child) => (
                    <View key={child.id} style={styles.childRow}>
                      <Text
                        style={[
                          styles.childEmoji,
                          { color: colors.textSecondary },
                        ]}>
                        {child.emoji}
                      </Text>
                      <Text style={[styles.childName, { color: colors.text }]}>
                        {child.name}
                      </Text>
                      <AmountEditor
                        label={`Budget ${child.name}`}
                        value={child.amount}
                        compact
                        onChange={(amount) => updateAmount(child.id, amount)}
                        onCommit={(amount) =>
                          void updateBudgetAmount(child.id, amount)
                        }
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>
      {error ? (
        <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text>
      ) : null}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Ristoranti, Shopping e le altre categorie restano disponibili come
        dettaglio, senza confondersi con la regola 50/30/20.
      </Text>
    </Screen>
  );
}

function AmountEditor({
  label,
  value,
  onChange,
  onCommit,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  compact?: boolean;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View
      style={[
        styles.editor,
        compact && styles.editorCompact,
        { backgroundColor: colors.sunken },
      ]}>
      <Text style={[styles.euro, { color: colors.textSecondary }]}>€</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={(text) => onChange(Number(text.replace(/\D/g, '')) || 0)}
        onEndEditing={() => onCommit(value)}
        style={[styles.input, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -12,
    marginBottom: 18,
  },
  list: { gap: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontFamily: font.bodySemiBold, fontSize: 18 },
  name: { fontFamily: font.bodySemiBold, fontSize: 15 },
  groupCaption: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  groupTotal: { fontFamily: font.dataMedium, fontSize: 13 },
  editor: {
    height: 38,
    minWidth: 84,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
  },
  editorCompact: { height: 34, minWidth: 76 },
  euro: { fontFamily: font.data, fontSize: 11 },
  input: {
    fontFamily: font.dataMedium,
    fontSize: 13,
    minWidth: 48,
    textAlign: 'right',
    paddingVertical: 6,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  spent: { fontFamily: font.data, fontSize: 10 },
  remaining: { fontFamily: font.data, fontSize: 10 },
  children: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingTop: 7 },
  childRow: { flexDirection: 'row', alignItems: 'center', minHeight: 43 },
  childEmoji: { width: 28, fontFamily: font.body, fontSize: 15 },
  childName: { flex: 1, fontFamily: font.bodyMedium, fontSize: 12 },
  hint: { fontFamily: font.body, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 14 },
});
