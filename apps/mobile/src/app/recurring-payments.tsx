import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';

import {
  Card, Field, PrimaryButton, Screen, SecondaryButton,
  font, uiStyles, useFlowndTheme,
} from '@/components/flownd-ui';
import { formatEuro } from '@/lib/onboarding';
import {
  frequencyLabels, significantUpcomingPayments, type RecurringFrequency,
  type RecurringSeries, type RecurringSeriesDraft,
} from '@/lib/recurring-payments';
import {
  expenseTransactionCategories, incomeTransactionCategories, transactionCategories,
} from '@/lib/transaction-categories';
import { useApp } from '@/providers/app-provider';

const frequencies = Object.keys(frequencyLabels) as RecurringFrequency[];
const categoryOptions = [...new Set<string>(transactionCategories)];
const incomeCategorySet = new Set<string>(incomeTransactionCategories);
const expenseCategorySet = new Set<string>(expenseTransactionCategories);

function asAmount(value: string) {
  return Number(value.replace(',', '.')) || 0;
}

function nextRecurringDate(value: string, frequency: RecurringFrequency, anchorDay?: number) {
  const current = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (frequency === 'weekly' || frequency === 'biweekly') {
    current.setDate(current.getDate() + (frequency === 'weekly' ? 7 : 14));
    return current.toISOString().slice(0, 10);
  }
  const months = {
    monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
  }[frequency];
  const wantedDay = anchorDay ?? current.getDate();
  current.setDate(1);
  current.setMonth(current.getMonth() + months);
  const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  current.setDate(Math.min(wantedDay, lastDay));
  return current.toISOString().slice(0, 10);
}

function nextFutureRecurringDate(value: string, frequency: RecurringFrequency) {
  const anchorDay = new Date(`${value.slice(0, 10)}T12:00:00`).getDate();
  const today = new Date().toISOString().slice(0, 10);
  let next = nextRecurringDate(value, frequency, anchorDay);
  while (next <= today) next = nextRecurringDate(next, frequency, anchorDay);
  return next;
}

export default function RecurringPaymentsScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{
    upcoming?: string; budget?: string; edit?: string; transactionId?: string;
  }>();
  const {
    recurringPayments, financialAccounts, budgetMonthlyIncome, saving, error,
    transactions, createRecurringPayment, createRecurringFromTransaction,
    updateRecurringPayment, setRecurringPaymentStatus, deleteRecurringPayment,
  } = useApp();
  const visible = useMemo(
    () => params.upcoming === 'significant'
      ? significantUpcomingPayments(
          recurringPayments,
          params.budget == null ? budgetMonthlyIncome : Number(params.budget),
        )
      : recurringPayments,
    [budgetMonthlyIncome, params.budget, params.upcoming, recurringPayments],
  );
  const seedTransaction = transactions.find((item) => item.id === params.transactionId);
  const initialEdit = recurringPayments.find((item) => item.id === params.edit) ?? null;
  const [editor, setEditor] = useState<RecurringSeries | 'new' | null | undefined>(undefined);
  const resolvedEditor = editor === undefined
    ? initialEdit ?? (seedTransaction ? 'new' : null)
    : editor;

  return (
    <Screen>
      <RecurringHeader onAdd={() => setEditor('new')} />

      <View style={styles.list}>
        {visible.map((series) => (
          <Pressable key={series.id} onPress={() => setEditor(series)}>
            <Card style={styles.seriesCard}>
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: series.direction === 'income' ? colors.positiveSoft : colors.accentSoft }]}>
                  <Text style={[styles.materialIcon, { color: series.direction === 'income' ? colors.positive : colors.accent }]}>
                    {series.direction === 'income' ? 'south_west' : 'north_east'}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: colors.text }]}>{series.name}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{frequencyLabels[series.frequency]} · {series.nextDueOn}</Text>
                </View>
                <Text style={[styles.amount, { color: series.direction === 'income' ? colors.positive : colors.text }]}>
                  {series.direction === 'income' ? '+' : '−'} {formatEuro(series.amount)}
                </Text>
              </View>
              <View style={styles.actions}>
                <Text style={[styles.status, { color: series.status === 'active' ? colors.positive : colors.textSecondary }]}>
                  {series.settlementMode === 'review' ? 'Scegli il conto' : series.status === 'active' ? 'Attiva' : 'In pausa'}
                </Text>
                <Pressable onPress={(event) => {
                  event.stopPropagation();
                  void setRecurringPaymentStatus(series.id, series.status === 'active' ? 'paused' : 'active');
                }}>
                  <Text style={[styles.action, { color: colors.accent }]}>{series.status === 'active' ? 'Pausa' : 'Riattiva'}</Text>
                </Pressable>
                <Pressable onPress={(event) => {
                  event.stopPropagation();
                  Alert.alert(
                    'Eliminare la ricorrenza?',
                    'I movimenti Open Banking saranno scollegati e resteranno nella Timeline.',
                    [
                      { text: 'Annulla', style: 'cancel' },
                      { text: 'Solo ricorrenza', onPress: () => void deleteRecurringPayment(series.id) },
                      {
                        text: 'Anche movimenti manuali', style: 'destructive',
                        onPress: () => void deleteRecurringPayment(series.id, true),
                      },
                    ],
                  );
                }}>
                  <Text style={[styles.action, { color: colors.negative }]}>Elimina</Text>
                </Pressable>
              </View>
            </Card>
          </Pressable>
        ))}
        {!visible.length ? <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessuna ricorrenza da mostrare.</Text> : null}
      </View>

      {resolvedEditor ? (
        <RecurringEditor
          key={resolvedEditor === 'new' ? `new-${seedTransaction?.id ?? 'manual'}` : resolvedEditor.id}
          series={resolvedEditor === 'new' ? null : resolvedEditor}
          seed={resolvedEditor === 'new' ? seedTransaction : undefined}
          accounts={financialAccounts}
          saving={saving}
          error={error}
          onCancel={() => setEditor(null)}
          onSave={async (draft) => {
            const saved = resolvedEditor === 'new'
              ? seedTransaction?.id
                ? Boolean(await createRecurringFromTransaction(seedTransaction.id, draft))
                : Boolean(await createRecurringPayment(draft))
              : await updateRecurringPayment(resolvedEditor.id, draft);
            if (saved) setEditor(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function RecurringEditor({ series, seed, accounts, saving, error, onCancel, onSave }: {
  series: RecurringSeries | null;
  seed?: ReturnType<typeof useApp>['transactions'][number];
  accounts: ReturnType<typeof useApp>['financialAccounts'];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (draft: RecurringSeriesDraft) => Promise<void>;
}) {
  const { colors } = useFlowndTheme();
  const initialDirection = series?.direction ?? seed?.kind ?? 'expense';
  const [name, setName] = useState(series?.name ?? seed?.description ?? '');
  const [amount, setAmount] = useState(series ? String(series.amount) : seed ? String(seed.amount) : '');
  const [direction, setDirection] = useState<'expense' | 'income'>(initialDirection);
  const [frequency, setFrequency] = useState<RecurringFrequency>(series?.frequency ?? 'monthly');
  const [category, setCategory] = useState(series?.category ?? seed?.category ?? (initialDirection === 'income' ? 'Altra entrata' : 'Altro'));
  const [accountId, setAccountId] = useState<string | null>(series?.financialAccountId ?? seed?.financialAccountId ?? null);
  const [openDropdown, setOpenDropdown] = useState<'frequency' | 'category' | 'account' | null>(null);
  const valid = Boolean(name.trim() && asAmount(amount) > 0);
  const accountLabel = accountId
    ? accounts.find((account) => account.id === accountId)?.name ?? 'Conto non disponibile'
    : 'Senza conto';

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <Pressable accessibilityLabel="Chiudi popup" onPress={onCancel} style={styles.modalBackdrop} />
        <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.editorTitle, { color: colors.text }]}>{series ? 'Modifica ricorrenza' : 'Nuova ricorrenza'}</Text>
            <Pressable accessibilityLabel="Chiudi" hitSlop={8} onPress={onCancel}>
              <Text style={[styles.materialIcon, { color: colors.textSecondary }]}>close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
            <Field autoFocus={!series && !seed} label="Nome" value={name} onChangeText={setName} placeholder="es. Affitto" />
            <Field label="Importo previsto" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" suffix="€" />
            <Dropdown
              label="Frequenza" value={frequencyLabels[frequency]}
              open={openDropdown === 'frequency'}
              onToggle={() => setOpenDropdown((current) => current === 'frequency' ? null : 'frequency')}
              options={frequencies.map((value) => ({
                label: frequencyLabels[value], selected: value === frequency,
                onPress: () => { setFrequency(value); setOpenDropdown(null); },
              }))}
            />
            <Dropdown
              label="Categoria" value={category}
              open={openDropdown === 'category'}
              onToggle={() => setOpenDropdown((current) => current === 'category' ? null : 'category')}
              options={categoryOptions.map((value) => ({
                label: value, selected: value === category,
                onPress: () => {
                  setCategory(value);
                  const incomeOnly = incomeCategorySet.has(value) && !expenseCategorySet.has(value);
                  if (incomeOnly) setDirection('income');
                  else if (value !== 'Giroconto') setDirection('expense');
                  setOpenDropdown(null);
                },
              }))}
            />
            <Dropdown
              label="Conto" value={accountLabel}
              open={openDropdown === 'account'}
              onToggle={() => setOpenDropdown((current) => current === 'account' ? null : 'account')}
              options={[
                {
                  label: 'Senza conto', selected: !accountId,
                  onPress: () => { setAccountId(null); setOpenDropdown(null); },
                },
                ...accounts.map((account) => ({
                  label: `${account.name}${account.source === 'open_banking' ? ' · Banca' : ''}`,
                  selected: account.id === accountId,
                  onPress: () => { setAccountId(account.id); setOpenDropdown(null); },
                })),
              ]}
            />
            {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
            <View style={styles.editorActions}>
              <View style={styles.flex}><SecondaryButton onPress={onCancel}>Annulla</SecondaryButton></View>
              <View style={styles.flex}>
                <PrimaryButton
                  disabled={!valid}
                  loading={saving}
                  onPress={() => {
                    const anchor = series && frequency === series.frequency
                      ? series.nextDueOn
                      : seed?.occurredAt ?? new Date().toISOString();
                    const nextDueOn = series && frequency === series.frequency
                      ? series.nextDueOn
                      : nextFutureRecurringDate(anchor, frequency);
                    void onSave({
                      name: name.trim(), amount: asAmount(amount), direction, frequency,
                      category, nextDueOn, financialAccountId: accountId,
                    });
                  }}>
                  Salva
                </PrimaryButton>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Dropdown({ label, value, open, onToggle, options }: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  options: { label: string; selected: boolean; onPress: () => void }[];
}) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.dropdownWrap}>
      <Text style={[styles.dropdownLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.dropdownTrigger}>
          <Text numberOfLines={1} style={[styles.dropdownValue, { color: colors.text }]}>{value}</Text>
          <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>{open ? 'expand_less' : 'expand_more'}</Text>
        </Pressable>
        {open ? (
          <ScrollView nestedScrollEnabled style={[styles.dropdownMenu, { borderTopColor: colors.border }]}>
            {options.map((option) => (
              <Pressable key={option.label} onPress={option.onPress} style={[styles.dropdownOption, option.selected && { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.dropdownOptionText, { color: option.selected ? colors.accent : colors.text }]}>{option.label}</Text>
                {option.selected ? <Text style={[styles.dropdownCheck, { color: colors.accent }]}>check</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function RecurringHeader({ onAdd }: { onAdd: () => void }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.header}>
      <BackButton />
      <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>Ricorrenze</Text>
      <AddButton onPress={onAdd} />
    </View>
  );
}

function BackButton() {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={8}
      onPress={() => router.back()}
      style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
      <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
    </Pressable>
  );
}

function AddButton({ onPress }: { onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Nuova ricorrenza" hitSlop={8} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.addButton, { backgroundColor: colors.accent }]}><Text style={styles.addIcon}>add</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 24 },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: font.bodySemiBold, fontSize: 14 },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  backButton: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addIcon: { color: '#FFFFFF', fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  pressed: { opacity: 0.68 },
  list: { gap: 10, paddingBottom: 30 },
  seriesCard: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.bodySemiBold, fontSize: 15 },
  meta: { fontFamily: font.body, fontSize: 12, marginTop: 2 },
  amount: { fontFamily: font.dataMedium, fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  status: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 11, textTransform: 'uppercase' },
  action: { fontFamily: font.bodySemiBold, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 30, fontFamily: font.body },
  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 14, 11, 0.55)' },
  modalCard: { maxWidth: 520, maxHeight: '86%', width: '100%', alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  editorTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  editorContent: { paddingBottom: 2 },
  editorActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  dropdownWrap: { marginTop: 16 },
  dropdownLabel: { fontFamily: font.bodySemiBold, fontSize: 13, marginBottom: 7 },
  dropdown: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dropdownTrigger: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  dropdownValue: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13 },
  dropdownIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  dropdownMenu: { maxHeight: 190, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 5 },
  dropdownOption: { minHeight: 42, marginHorizontal: 5, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  dropdownOptionText: { flex: 1, fontFamily: font.body, fontSize: 12 },
  dropdownCheck: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18, lineHeight: 21 },
});
