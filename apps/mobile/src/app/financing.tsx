import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { addMonthsToDate, type Loan } from '@/lib/goals';
import { formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function FinancingScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { loans, amountsVisible } = useApp();
  const monthlyTotal = loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Indietro"
          onPress={() => router.back()}
          style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Finanziamenti</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[uiStyles.title, { color: colors.text }]}>Mutui e prestiti</Text>
      <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}> 
        Tieni separati gli impegni fissi dagli obiettivi di risparmio e valuta l’impatto di una nuova rata.
      </Text>

      {loans.length ? (
        <>
          <Card style={[styles.summary, { backgroundColor: colors.accentSoft }]}> 
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>RATE MENSILI TOTALI</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}> 
              {amountsVisible ? formatEuro(monthlyTotal) : HIDDEN_AMOUNT}
            </Text>
            <Text style={[styles.summaryCopy, { color: colors.textSecondary }]}> 
              {loans.length === 1 ? '1 finanziamento attivo' : `${loans.length} finanziamenti attivi`}
            </Text>
          </Card>
          <View style={styles.list}>
            {loans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} amountsVisible={amountsVisible} />
            ))}
          </View>
        </>
      ) : (
        <Card style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessun finanziamento attivo</Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Puoi simulare una rata prima di decidere se aggiungerla.
          </Text>
        </Card>
      )}

      <View style={styles.action}>
        <PrimaryButton onPress={() => router.push('/add-loan' as Href)}> 
          Valuta un finanziamento
        </PrimaryButton>
      </View>
    </Screen>
  );
}

function LoanCard({ loan, amountsVisible }: { loan: Loan; amountsVisible: boolean }) {
  const { colors } = useFlowndTheme();
  const deadline = addMonthsToDate(loan.startDate, loan.installmentCount);
  const goalHref = `/add-goal?name=${encodeURIComponent(`Maxirata ${loan.name}`)}&target=${encodeURIComponent(String(loan.finalBalloon ?? ''))}&deadline=${encodeURIComponent(deadline)}` as Href;
  return (
    <Card>
      <View style={styles.loanTop}>
        <View style={[styles.loanIcon, { backgroundColor: colors.sunken }]}> 
          <Text style={[styles.materialIcon, { color: colors.text }]}>account_balance</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.loanName, { color: colors.text }]}>{loan.name}</Text>
          <Text style={[styles.loanMeta, { color: colors.textSecondary }]}> 
            {loan.installmentCount} rate · dal {loan.startDate}
          </Text>
        </View>
        <Text style={[styles.loanPayment, { color: colors.text }]}> 
          {amountsVisible ? formatEuro(loan.monthlyPayment) : HIDDEN_AMOUNT}
          <Text style={[styles.loanMonth, { color: colors.textSecondary }]}>/mese</Text>
        </Text>
      </View>
      {loan.finalBalloon ? (
        <View style={[styles.balloon, { borderTopColor: colors.border }]}> 
          <Text style={[styles.balloonText, { color: colors.warning }]}> 
            Maxirata {amountsVisible ? formatEuro(loan.finalBalloon) : HIDDEN_AMOUNT}
          </Text>
          <Pressable onPress={() => router.push(goalHref)}>
            <Text style={[styles.balloonAction, { color: colors.accent }]}>Crea obiettivo</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  summary: { marginBottom: 12 },
  summaryLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  summaryValue: { fontFamily: font.dataMedium, fontSize: 27, marginTop: 8 },
  summaryCopy: { fontFamily: font.body, fontSize: 11, marginTop: 3 },
  list: { gap: 9 },
  loanTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loanIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loanName: { fontFamily: font.bodySemiBold, fontSize: 14 },
  loanMeta: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  loanPayment: { fontFamily: font.dataMedium, fontSize: 13 },
  loanMonth: { fontFamily: font.body, fontSize: 9 },
  balloon: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balloonText: { fontFamily: font.bodyMedium, fontSize: 11 },
  balloonAction: { fontFamily: font.bodySemiBold, fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 22 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  emptyCopy: { fontFamily: font.body, fontSize: 11, marginTop: 4 },
  action: { marginTop: 14 },
});
