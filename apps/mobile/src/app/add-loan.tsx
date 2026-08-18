import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Field, PrimaryButton, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import { transactionsForPeriod } from '@/lib/dashboard';
import { calculateMonthlyPayment, loanSustainability, type LoanDraft } from '@/lib/goals';
import { categoryToBudgetGroup, formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

function numberValue(value: string) {
  return Number(value.replace(',', '.')) || 0;
}

export default function AddLoanScreen() {
  const { colors, isDark } = useFlowndTheme();
  const {
    draft,
    transactions,
    createLoan,
    saving,
    error,
    budgetMonthlyIncome,
  } = useApp();
  const [name, setName] = useState('');
  const [financed, setFinanced] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [installments, setInstallments] = useState('');
  const [interest, setInterest] = useState('');
  const [manualPayment, setManualPayment] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [balloon, setBalloon] = useState('');
  const draftLoan: LoanDraft = {
    name: name.trim(),
    financedAmount: numberValue(financed),
    downPayment: numberValue(downPayment),
    installmentCount: Math.round(numberValue(installments)),
    interestRate: interest ? numberValue(interest) : null,
    startDate,
    finalBalloon: balloon ? numberValue(balloon) : null,
    monthlyPayment: manualPayment ? numberValue(manualPayment) : undefined,
  };
  const calculatedPayment =
    draftLoan.monthlyPayment || calculateMonthlyPayment(draftLoan);
  const needsMacro = draft.budgets.find((item) => item.id === 'needs');
  const needsBudget = needsMacro
    ? (budgetMonthlyIncome * needsMacro.percentage) / 100
    : draft.budgets
        .filter((item) => item.parentId === 'needs')
        .reduce((sum, item) => sum + item.amount, 0);
  const needsSpent = transactionsForPeriod(transactions, 'month')
    .filter((transaction) => transaction.kind !== 'income' && categoryToBudgetGroup(transaction.category) === 'needs')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const availableNeeds = Math.max(0, needsBudget - needsSpent);
  const sustainability = loanSustainability(
    calculatedPayment,
    budgetMonthlyIncome,
    availableNeeds,
  );
  const levelColor = sustainability.level === 'low' ? colors.positive : sustainability.level === 'medium' ? colors.warning : colors.negative;
  const levelLabel = sustainability.level === 'low' ? 'Sostenibile' : sustainability.level === 'medium' ? 'Da valutare' : 'Impegnativo';
  const valid = Boolean(name.trim()) && draftLoan.financedAmount > 0 && draftLoan.installmentCount > 0 && calculatedPayment > 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.closeText, { color: colors.text }]}>×</Text></Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Nuovo finanziamento</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={[styles.icon, { backgroundColor: colors.accent }]}><Text style={styles.iconText}>account_balance</Text></View>
        <Text style={[uiStyles.title, { color: colors.text }]}>Valuta il nuovo impegno</Text>
        <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>La rata viene confrontata con la quota Necessità e con il reddito mensile.</Text>
        <Field label="Nome" placeholder="es. Auto" value={name} autoFocus onChangeText={setName} />
        <Field label="Importo finanziato" suffix="€" keyboardType="decimal-pad" value={financed} onChangeText={setFinanced} />
        <Field label="Anticipo" suffix="€" keyboardType="decimal-pad" value={downPayment} onChangeText={setDownPayment} />
        <Field label="Numero rate" keyboardType="number-pad" value={installments} onChangeText={setInstallments} />
        <Field label="Tasso annuo opzionale" suffix="%" keyboardType="decimal-pad" value={interest} onChangeText={setInterest} />
        <Field label="Rata mensile (opzionale)" suffix="€" keyboardType="decimal-pad" value={manualPayment} onChangeText={setManualPayment} />
        <Field label="Data inizio" placeholder="AAAA-MM-GG" value={startDate} onChangeText={setStartDate} />
        <Field label="Maxirata finale (opzionale)" suffix="€" keyboardType="decimal-pad" value={balloon} onChangeText={setBalloon} />

        {calculatedPayment > 0 ? (
          <Card style={styles.feasibility}>
            <View style={styles.feasibilityTop}><Text style={[styles.feasibilityLabel, { color: colors.textSecondary }]}>RATA STIMATA</Text><Text style={[styles.level, { color: levelColor }]}>{levelLabel}</Text></View>
            <Text style={[styles.payment, { color: colors.text }]}>{formatEuro(calculatedPayment)}<Text style={[styles.perMonth, { color: colors.textSecondary }]}> / mese</Text></Text>
            <Text style={[styles.feasibilityCopy, { color: colors.textSecondary }]}>{Math.round(sustainability.ratio * 100)}% del reddito mensile · {formatEuro(availableNeeds)} disponibili nella quota Necessità. Il 30% è un riferimento orientativo, non una regola di credito.</Text>
            {draftLoan.finalBalloon ? <Text style={[styles.balloonWarning, { color: colors.warning }]}>Maxirata futura: {formatEuro(draftLoan.finalBalloon)}. Dopo il salvataggio potrai creare un obiettivo dedicato.</Text> : null}
          </Card>
        ) : null}
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton disabled={!valid} loading={saving} onPress={async () => {
          const saved = await createLoan({ ...draftLoan, monthlyPayment: calculatedPayment });
          if (saved) router.back();
        }}>Salva finanziamento</PrimaryButton>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  close: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font.body, fontSize: 25, lineHeight: 28 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  icon: { width: 56, height: 56, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  iconText: { color: '#FFFFFF', fontFamily: 'MaterialSymbols_400Regular', fontSize: 26 },
  feasibility: { marginTop: 18 },
  feasibilityTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feasibilityLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  level: { fontFamily: font.bodySemiBold, fontSize: 12 },
  payment: { fontFamily: font.dataMedium, fontSize: 24, marginTop: 10 },
  perMonth: { fontFamily: font.body, fontSize: 12 },
  feasibilityCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 8 },
  balloonWarning: { fontFamily: font.bodyMedium, fontSize: 11, lineHeight: 17, marginTop: 10 },
});
