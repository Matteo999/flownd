import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card, Field, PrimaryButton, Screen, SecondaryButton, font, uiStyles, useFlowndTheme,
} from '@/components/flownd-ui';
import { formatEuro } from '@/lib/onboarding';
import {
  frequencyLabels,
  significantUpcomingPayments,
  type RecurringFrequency,
  type RecurringSeries,
  type RecurringSeriesDraft,
} from '@/lib/recurring-payments';
import { categoriesForTransactionKind } from '@/lib/transaction-categories';
import { useApp } from '@/providers/app-provider';

const frequencies = Object.keys(frequencyLabels) as RecurringFrequency[];

function asAmount(value: string) {
  return Number(value.replace(',', '.')) || 0;
}

export default function RecurringPaymentsScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{ upcoming?: string; budget?: string; edit?: string; transactionId?: string }>();
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
  const initialEdit = recurringPayments.find((item) => item.id === params.edit) ?? null;
  const seedTransaction = transactions.find((item) => item.id === params.transactionId);
  const [editor, setEditor] = useState<RecurringSeries | 'new' | null>(
    initialEdit ?? (seedTransaction ? 'new' : null),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Indietro" onPress={() => router.back()} style={styles.headerButton}>
          <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Ricorrenze</Text>
        <Pressable accessibilityLabel="Nuova ricorrenza" onPress={() => setEditor('new')} style={styles.headerButton}>
          <Text style={[styles.materialIcon, { color: colors.accent }]}>add</Text>
        </Pressable>
      </View>
      <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>Entrate e uscite previste, riconciliate con la banca quando scegli un conto Open Banking.</Text>

      {editor ? (
        <RecurringEditor
          key={editor === 'new' ? 'new' : editor.id}
          series={editor === 'new' ? null : editor}
          seed={editor === 'new' ? seedTransaction : undefined}
          accounts={financialAccounts}
          saving={saving}
          error={error}
          onCancel={() => setEditor(null)}
          onSave={async (draft) => {
            const saved = editor === 'new'
              ? seedTransaction?.id
                ? Boolean(await createRecurringFromTransaction(
                    seedTransaction.id,
                    draft,
                  ))
                : Boolean(await createRecurringPayment(draft))
              : await updateRecurringPayment(editor.id, draft);
            if (saved) setEditor(null);
          }}
        />
      ) : null}

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
                <Pressable onPress={(event) => { event.stopPropagation(); void setRecurringPaymentStatus(series.id, series.status === 'active' ? 'paused' : 'active'); }}>
                  <Text style={[styles.action, { color: colors.accent }]}>{series.status === 'active' ? 'Pausa' : 'Riattiva'}</Text>
                </Pressable>
                <Pressable onPress={(event) => {
                  event.stopPropagation();
                  Alert.alert(
                    'Eliminare la ricorrenza?',
                    'I movimenti Open Banking saranno solo scollegati e resteranno nella Timeline.',
                    [
                      { text: 'Annulla', style: 'cancel' },
                      { text: 'Solo ricorrenza', onPress: () => void deleteRecurringPayment(series.id) },
                      {
                        text: 'Anche movimenti manuali',
                        style: 'destructive',
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
  const [name, setName] = useState(series?.name ?? seed?.description ?? '');
  const [amount, setAmount] = useState(series ? String(series.amount) : seed ? String(seed.amount) : '');
  const [direction, setDirection] = useState<'expense' | 'income'>(series?.direction ?? seed?.kind ?? 'expense');
  const [frequency, setFrequency] = useState<RecurringFrequency>(series?.frequency ?? 'monthly');
  const [category, setCategory] = useState(series?.category ?? seed?.category ?? (direction === 'income' ? 'Altra entrata' : 'Altro'));
  const [nextDueOn, setNextDueOn] = useState(() => {
    if (series?.nextDueOn) return series.nextDueOn;
    const next = new Date(seed?.occurredAt ?? new Date());
    next.setMonth(next.getMonth() + 1);
    return next.toISOString().slice(0, 10);
  });
  const [accountId, setAccountId] = useState<string | null>(series?.financialAccountId ?? seed?.financialAccountId ?? null);
  const [step, setStep] = useState(0);
  const valid = name.trim() && asAmount(amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(nextDueOn);
  return (
    <Card style={styles.editor}>
      <Text style={[styles.editorTitle, { color: colors.text }]}>{series ? 'Modifica ricorrenza' : 'Nuova ricorrenza'}</Text>
      <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>PASSAGGIO {step + 1} DI 3</Text>
      {step === 0 ? <>
        <Text style={[styles.stepTitle, { color: colors.text }]}>Di quale movimento si tratta?</Text>
        {seed ? (
          <Text style={[styles.seedKind, { color: colors.textSecondary }]}>{direction === 'expense' ? 'Uscita' : 'Entrata'} dalla transazione selezionata</Text>
        ) : (
          <View style={styles.chips}>
            {(['expense', 'income'] as const).map((value) => <Choice key={value} selected={direction === value} label={value === 'expense' ? 'Uscita' : 'Entrata'} onPress={() => { setDirection(value); setCategory(value === 'income' ? 'Altra entrata' : 'Altro'); }} />)}
          </View>
        )}
        <Field label="Nome" value={name} onChangeText={setName} placeholder="es. Affitto" />
        <Field label="Importo previsto" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" suffix="€" />
      </> : null}
      {step === 1 ? <>
        <Text style={[styles.stepTitle, { color: colors.text }]}>Quando si ripete?</Text>
        <Text style={[styles.label, { color: colors.text }]}>Frequenza</Text>
        <View style={styles.chips}>{frequencies.map((value) => <Choice key={value} selected={frequency === value} label={frequencyLabels[value]} onPress={() => setFrequency(value)} />)}</View>
        <Field label="Prossima data" value={nextDueOn} onChangeText={setNextDueOn} placeholder="AAAA-MM-GG" />
      </> : null}
      {step === 2 ? <>
        <Text style={[styles.stepTitle, { color: colors.text }]}>Ultimi dettagli</Text>
        <Text style={[styles.label, { color: colors.text }]}>Categoria</Text>
        <View style={styles.chips}>{categoriesForTransactionKind(direction).map((value) => <Choice key={value} selected={category === value} label={value} onPress={() => setCategory(value)} />)}</View>
        <Text style={[styles.label, { color: colors.text }]}>Conto</Text>
        <View style={styles.chips}>
          <Choice selected={!accountId} label="Senza conto" onPress={() => setAccountId(null)} />
          {accounts.map((account) => <Choice key={account.id} selected={accountId === account.id} label={`${account.name}${account.source === 'open_banking' ? ' · Banca' : ''}`} onPress={() => setAccountId(account.id)} />)}
        </View>
        <View style={[styles.review, { backgroundColor: colors.sunken }]}>
          <Text style={[styles.reviewText, { color: colors.text }]}>{name || 'Ricorrenza'} · {frequencyLabels[frequency]}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>Prossima data {nextDueOn}</Text>
        </View>
      </> : null}
      {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
      <View style={styles.editorActions}>
        <View style={styles.flex}><SecondaryButton onPress={step === 0 ? onCancel : () => setStep((current) => current - 1)}>{step === 0 ? 'Annulla' : 'Indietro'}</SecondaryButton></View>
        <View style={styles.flex}><PrimaryButton disabled={step === 0 ? !(name.trim() && asAmount(amount) > 0) : step === 1 ? !/^\d{4}-\d{2}-\d{2}$/.test(nextDueOn) : !valid} loading={step === 2 && saving} onPress={() => step < 2 ? setStep((current) => current + 1) : void onSave({ name: name.trim(), amount: asAmount(amount), direction, frequency, category, nextDueOn, financialAccountId: accountId })}>{step === 2 ? 'Salva' : 'Continua'}</PrimaryButton></View>
      </View>
    </Card>
  );
}

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return <Pressable onPress={onPress} style={[styles.choice, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.border }]}><Text style={[styles.choiceText, { color: selected ? colors.accent : colors.text }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: font.displayBold, fontSize: 22 }, materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22 },
  list: { gap: 10, marginTop: 18, paddingBottom: 30 }, seriesCard: { gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 }, icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.bodySemiBold, fontSize: 15 }, meta: { fontFamily: font.body, fontSize: 12, marginTop: 2 },
  amount: { fontFamily: font.dataMedium, fontSize: 14 }, actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  status: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 11, textTransform: 'uppercase' }, action: { fontFamily: font.bodySemiBold, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 30, fontFamily: font.body }, editor: { marginTop: 18, gap: 12 },
  editorTitle: { fontFamily: font.displayBold, fontSize: 18 }, label: { fontFamily: font.bodySemiBold, fontSize: 13 },
  stepLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  stepTitle: { fontFamily: font.displayBold, fontSize: 16 },
  seedKind: { fontFamily: font.bodyMedium, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  choiceText: { fontFamily: font.bodySemiBold, fontSize: 11 }, editorActions: { flexDirection: 'row', gap: 10 },
  review: { padding: 12, borderRadius: 12, gap: 2 }, reviewText: { fontFamily: font.bodySemiBold, fontSize: 13 },
});
