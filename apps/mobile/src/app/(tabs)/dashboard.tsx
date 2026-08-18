import PagerView, {
  type PagerViewRef,
} from '@expo/ui/community/pager-view';
import { router, type Href } from 'expo-router';
import { useMemo, useRef, useState, useTransition } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { AppHeaderActions } from '@/components/app-header-actions';
import { SpendingDonutChart } from '@/components/spending-donut-chart';
import {
  HIDDEN_AMOUNT,
  type DashboardPeriod,
  formatDueDate,
  isRecentSource,
  transactionsForPeriod,
} from '@/lib/dashboard';
import {
  financialCycleForDate,
  formatFinancialCycle,
  previousFinancialCycle,
  transactionsForFinancialCycle,
} from '@/lib/financial-cycle';
import {
  categoryToBudgetGroup,
  formatEuro,
  summarizeBudgets,
} from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

const periodLabels: { id: DashboardPeriod; label: string }[] = [
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
  { id: 'year', label: 'Anno' },
];

function sensitiveEuro(value: number, visible: boolean) {
  return visible ? formatEuro(value) : HIDDEN_AMOUNT;
}

export default function DashboardScreen() {
  const { colors, isDark } = useFlowndTheme();
  const {
    draft,
    transactions,
    financialAccounts,
    planTier,
    upcomingPayments,
    coachInsight,
    amountsVisible,
    budgetCycleStartDay,
    budgetRolloverMode,
    budgetMonthlyIncome,
    firstDashboardVisit,
    dismissFirstVisit,
    toggleAmountsVisible,
  } = useApp();
  const overviewPager = useRef<PagerViewRef>(null);
  const [overviewPage, setOverviewPage] = useState(0);
  const [selectedPeriod, setSelectedPeriod] =
    useState<DashboardPeriod>('month');
  const [chartPeriod, setChartPeriod] = useState<DashboardPeriod>('month');
  const [periodPending, startPeriodTransition] = useTransition();
  const overviewForeground = isDark ? colors.background : colors.onAccent;
  const overviewSecondaryForeground = overviewForeground;

  const selectedBudgets = draft.budgets.filter((item) => item.selected);
  const budgetSummary = summarizeBudgets(selectedBudgets).filter(
    (item) => item.amount > 0,
  );
  const financialCycle = financialCycleForDate(
    new Date(),
    budgetCycleStartDay,
  );
  const previousCycle = previousFinancialCycle(financialCycle);
  const currentMonthTransactions = transactionsForFinancialCycle(
    transactions,
    financialCycle,
  ).filter((transaction) => !transaction.excludedFromTotals);
  const previousCycleTransactions = transactionsForFinancialCycle(
    transactions,
    previousCycle,
  ).filter((transaction) => !transaction.excludedFromTotals);
  const monthlyTransactions = currentMonthTransactions.filter(
    (transaction) => transaction.kind !== 'income',
  );
  const previousIncome = previousCycleTransactions
    .filter((transaction) => transaction.kind === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const previousSpent = previousCycleTransactions
    .filter((transaction) => transaction.kind !== 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const rolloverAmount =
    budgetRolloverMode === 'reset'
      ? 0
      : Math.max(0, previousIncome - previousSpent);
  const monthlyBudget = budgetMonthlyIncome + rolloverAmount;
  const chartTransactions = useMemo(
    () =>
      transactionsForPeriod(transactions, chartPeriod).filter(
        (transaction) =>
          transaction.kind !== 'income' && !transaction.excludedFromTotals,
      ),
    [chartPeriod, transactions],
  );
  const monthlySpent = monthlyTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const monthlyRemaining = monthlyBudget - monthlySpent;
  const spentByGroup = monthlyTransactions.reduce(
    (summary, transaction) => {
      const group = categoryToBudgetGroup(transaction.category);
      summary[group] += transaction.amount;
      return summary;
    },
    { needs: 0, wants: 0, savings: 0 },
  );
  const budgetRows = budgetSummary.map((budget) => {
    const allocationShare = budget.percentage / 100;
    const effectiveAmount =
      budgetMonthlyIncome * allocationShare +
      (budgetRolloverMode === 'carry'
        ? rolloverAmount * allocationShare
        : budgetRolloverMode === 'savings' && budget.id === 'savings'
          ? rolloverAmount
          : 0);
    return {
      ...budget,
      amount: effectiveAmount,
      spent: spentByGroup[budget.id],
      progress: effectiveAmount
        ? spentByGroup[budget.id] / effectiveAmount
        : 0,
    };
  });
  const budgetAlert = [...budgetRows]
    .filter((budget) => budget.progress >= 0.8)
    .sort((first, second) => second.progress - first.progress)[0];

  const aggregatedNetWorth = financialAccounts.reduce(
    (sum, account) => sum + account.balance,
    0,
  );
  const previousNetWorth = financialAccounts.reduce(
    (sum, account) => sum + (account.previousMonthBalance ?? account.balance),
    0,
  );
  const hasPreviousNetWorth = financialAccounts.some(
    (account) => account.previousMonthBalance != null,
  );
  const netWorthDelta = aggregatedNetWorth - previousNetWorth;
  const savedTowardGoal = draft.goal.savedAmount ?? 0;
  const goalProgress = draft.goal.targetAmount
    ? savedTowardGoal / draft.goal.targetAmount
    : 0;
  const hasRecentData = isRecentSource(
    transactions,
    financialAccounts.map((account) => account.lastSyncedAt),
  );
  const chartCategoryCount = useMemo(
    () =>
      new Set(
        chartTransactions.map(
          (transaction) => transaction.category.trim() || 'Altro',
        ),
      ).size,
    [chartTransactions],
  );

  return (
    <Screen
      floatingAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aggiungi una transazione"
          onPress={() => router.push('/add-transaction' as Href)}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.accent },
            pressed && styles.fabPressed,
          ]}>
          <Text style={styles.fabIcon}>add</Text>
        </Pressable>
      }>
      <PageHeader
        title="Dashboard"
        action={
          <AppHeaderActions
            leading={
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={
                  amountsVisible ? 'Nascondi tutti gli importi' : 'Mostra tutti gli importi'
                }
                accessibilityState={{ checked: amountsVisible }}
                hitSlop={8}
                onPress={() => void toggleAmountsVisible()}
                style={({ pressed }) => [
                  styles.privacyButton,
                  pressed && styles.iconPressed,
                ]}>
                <Text style={[styles.materialIcon, { color: colors.text }]}>
                  {amountsVisible ? 'visibility' : 'visibility_off'}
                </Text>
              </Pressable>
            }
          />
        }
      />

      <Card
        style={[
          styles.overviewCard,
          {
            backgroundColor: colors.accent,
            borderColor: colors.accent,
          },
        ]}>
        <PagerView
          ref={overviewPager}
          initialPage={0}
          onPageSelected={(event) =>
            setOverviewPage(event.nativeEvent.position)
          }
          style={styles.overviewPager}>
          <View key="budget" style={styles.overviewPage}>
            <Pressable
              accessibilityHint="Apre la distribuzione tra macro-categorie e categorie"
              accessibilityLabel="Modifica l’allocazione del budget"
              accessibilityRole="button"
              onPress={() => router.push('/budget' as Href)}
              style={({ pressed }) => [
                styles.budgetPageButton,
                pressed && styles.iconPressed,
              ]}>
              <View style={styles.overviewLabelRow}>
                <Text
                  style={[
                    styles.overviewLabel,
                    { color: overviewSecondaryForeground, opacity: 0.82 },
                  ]}>
                  BUDGET · {formatFinancialCycle(financialCycle).toLocaleUpperCase('it-IT')}
                </Text>
                <Text
                  accessibilityElementsHidden
                  style={[
                    styles.budgetSettingsIcon,
                    { color: overviewSecondaryForeground, opacity: 0.82 },
                  ]}>
                  tune
                </Text>
              </View>
              <Text
                accessibilityLabel={
                  amountsVisible
                    ? `${formatEuro(monthlyRemaining)} su ${formatEuro(monthlyBudget)}`
                    : 'Importi nascosti'
                }
                style={[styles.primaryAmount, { color: overviewForeground }]}>
                {amountsVisible ? (
                  <>
                    {formatEuro(monthlyRemaining)}
                    <Text
                      style={[
                        styles.totalAmount,
                        { color: overviewSecondaryForeground, opacity: 0.82 },
                      ]}>
                      {' '} su {formatEuro(monthlyBudget)}
                    </Text>
                  </>
                ) : (
                  HIDDEN_AMOUNT
                )}
              </Text>
              <View style={styles.budgetSummary}>
                {budgetRows.map((budget) => (
                  <View key={budget.id} style={styles.budgetSummaryItem}>
                    <View style={styles.budgetSummaryNameRow}>
                      <Text
                        accessibilityElementsHidden
                        style={[
                          styles.budgetSummaryIcon,
                          { color: overviewSecondaryForeground, opacity: 0.82 },
                        ]}>
                        {budget.icon}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.budgetSummaryName,
                          { color: overviewSecondaryForeground, opacity: 0.82 },
                        ]}>
                        {budget.name}
                      </Text>
                    </View>
                    <Text
                      style={[styles.budgetSummaryValue, { color: overviewForeground }]}>
                      {sensitiveEuro(
                        Math.max(0, budget.amount - budget.spent),
                        amountsVisible,
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          </View>

          <View key="net-worth" style={styles.overviewPage}>
            <Text
              style={[
                styles.overviewLabel,
                { color: overviewSecondaryForeground, opacity: 0.82 },
              ]}>
              PATRIMONIO AGGREGATO
            </Text>
            <Text style={[styles.primaryAmount, { color: overviewForeground }]}>
              {financialAccounts.length
                ? sensitiveEuro(aggregatedNetWorth, amountsVisible)
                : 'Non disponibile'}
            </Text>
            {hasPreviousNetWorth ? (
              <Text
                style={[
                  styles.delta,
                  { color: overviewForeground },
                ]}>
                {amountsVisible
                  ? `${netWorthDelta >= 0 ? '+' : '−'} ${formatEuro(Math.abs(netWorthDelta))} rispetto al mese scorso`
                  : `${HIDDEN_AMOUNT} rispetto al mese scorso`}
              </Text>
            ) : (
              <Text
                style={[
                  styles.overviewHint,
                  { color: overviewSecondaryForeground, opacity: 0.82 },
                ]}>
                {financialAccounts.length
                  ? 'Saldi bancari aggregati'
                  : 'Collega un conto o aggiungi un saldo manuale.'}
              </Text>
            )}
          </View>
        </PagerView>

        <View accessibilityRole="tablist" style={styles.pageDots}>
          {[0, 1].map((index) => {
            const selected = overviewPage === index;
            return (
              <Pressable
                key={index}
                accessibilityRole="tab"
                accessibilityLabel={index === 0 ? 'Budget mensile' : 'Patrimonio aggregato'}
                accessibilityState={{ selected }}
                hitSlop={8}
                onPress={() => overviewPager.current?.setPage(index)}
                style={[
                  styles.pageDotHit,
                  selected && {
                    backgroundColor: 'rgba(255, 255, 255, 0.18)',
                  },
                ]}>
                <View
                  style={[
                    styles.pageDot,
                    {
                      backgroundColor: selected
                        ? colors.onAccent
                        : 'rgba(255, 255, 255, 0.45)',
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </Card>

      {firstDashboardVisit ? (
        <Card
          style={[
            styles.confirmation,
            { backgroundColor: colors.positiveSoft },
          ]}>
          <View style={styles.confirmationTop}>
            <View style={[styles.check, { backgroundColor: colors.positive }]}>
              <Text style={styles.checkIcon}>check</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi conferma"
              onPress={dismissFirstVisit}>
              <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>
                close
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Ottimo inizio: il tuo spazio è pronto.
          </Text>
          <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
            Hai impostato il budget e creato l’obiettivo “{draft.goal.name}”.
          </Text>
        </Card>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Spese per categoria
        </Text>
        <View style={[styles.periodControl, { backgroundColor: colors.sunken }]}>
          {periodLabels.map((period) => {
            const selected = selectedPeriod === period.id;
            return (
              <Pressable
                key={period.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                hitSlop={4}
                onPress={() => {
                  setSelectedPeriod(period.id);
                  startPeriodTransition(() => setChartPeriod(period.id));
                }}
                style={[
                  styles.periodButton,
                  selected && { backgroundColor: colors.surface },
                ]}>
                <Text
                  style={[
                    styles.periodText,
                    { color: selected ? colors.text : colors.textSecondary },
                  ]}>
                  {period.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View accessibilityState={{ busy: periodPending }}>
        <Card style={styles.chartCard}>
          {chartCategoryCount >= 2 ? (
            <SpendingDonutChart
              amountsVisible={amountsVisible}
              transactions={chartTransactions}
            />
          ) : (
            <View style={styles.guidedState}>
              <Text style={[styles.guidedIcon, { color: colors.accent }]}>
                donut_small
              </Text>
              <Text style={[styles.guidedTitle, { color: colors.text }]}>
                La distribuzione si compone con le tue spese.
              </Text>
              <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
                Servono movimenti in almeno due categorie per mostrare un confronto utile.
              </Text>
            </View>
          )}
        </Card>
      </View>

      {coachInsight ? (
        <Card style={[styles.contentCard, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            INSIGHT DEL COACH
          </Text>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {coachInsight.title}
          </Text>
          <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
            {coachInsight.body}
          </Text>
        </Card>
      ) : null}

      {upcomingPayments.length ? (
        <Card style={styles.contentCard}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Prossime scadenze
          </Text>
          <View style={styles.deadlineList}>
            {upcomingPayments.map((payment) => (
              <View
                key={payment.id}
                style={[styles.deadlineRow, { borderBottomColor: colors.border }]}>
                <View style={styles.flex}>
                  <Text style={[styles.deadlineName, { color: colors.text }]}>
                    {payment.name}
                  </Text>
                  <Text style={[styles.deadlineDate, { color: colors.textSecondary }]}>
                    {formatDueDate(payment.dueAt)}
                  </Text>
                </View>
                <Text style={[styles.deadlineAmount, { color: colors.text }]}>
                  {sensitiveEuro(payment.amount, amountsVisible)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {draft.goal.name && draft.goal.targetAmount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apri l’obiettivo ${draft.goal.name}`}
          onPress={() => router.push('/(tabs)/goals' as Href)}
          style={({ pressed }) => pressed && styles.iconPressed}>
          <Card style={styles.contentCard}>
            <View style={styles.goalTop}>
              <View style={styles.flex}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
                  OBIETTIVO IN EVIDENZA
                </Text>
                <Text style={[styles.goalName, { color: colors.text }]}>
                  {draft.goal.name}
                </Text>
                <Text style={[styles.goalAmount, { color: colors.textSecondary }]}>
                  {amountsVisible
                    ? `${formatEuro(savedTowardGoal)} di ${formatEuro(draft.goal.targetAmount)}`
                    : `${HIDDEN_AMOUNT} di ${HIDDEN_AMOUNT}`}
                </Text>
              </View>
              <Text style={[styles.goalPercent, { color: colors.accent }]}>
                {amountsVisible ? `${Math.round(goalProgress * 100)}%` : '••%'}
              </Text>
            </View>
            <ProgressBar value={goalProgress} />
            <Text style={[styles.cardLink, { color: colors.accent }]}>
              Vai agli obiettivi
            </Text>
          </Card>
        </Pressable>
      ) : null}

      {budgetAlert ? (
        <Card
          style={[
            styles.contentCard,
            {
              backgroundColor:
                budgetAlert.progress >= 1
                  ? colors.negativeSoft
                  : colors.warningSoft,
            },
          ]}>
          <Text
            style={[
              styles.eyebrow,
              {
                color:
                  budgetAlert.progress >= 1
                    ? colors.negative
                    : colors.warning,
              },
            ]}>
            BUDGET {budgetAlert.progress >= 1 ? 'SUPERATO' : 'QUASI AL LIMITE'}
          </Text>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {budgetAlert.name}
          </Text>
          <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
            {amountsVisible
              ? budgetAlert.progress >= 1
                ? `Hai superato questa quota di ${formatEuro(budgetAlert.spent - budgetAlert.amount)}.`
                : `Restano ${formatEuro(budgetAlert.amount - budgetAlert.spent)} per questo mese.`
              : 'Gli importi sono nascosti dalla modalità privacy.'}
          </Text>
        </Card>
      ) : null}

      {!hasRecentData ? (
        <Card style={styles.contentCard}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {financialAccounts.length
              ? 'Aggiorna i tuoi dati'
              : 'Completa il tuo quadro finanziario'}
          </Text>
          <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
            {financialAccounts.length
              ? 'Importa un estratto recente per mantenere budget e insight affidabili.'
              : 'Collega la tua banca per aggiornare saldi e movimenti in automatico.'}
          </Text>
          <PrimaryButton
            onPress={() =>
              router.push(
                (planTier === 'free'
                  ? '/settings?section=accounts'
                  : '/connect-bank') as Href,
              )
            }>
            {financialAccounts.length
              ? 'Importa estratto conto'
              : 'Collega la tua banca'}
          </PrimaryButton>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  privacyButton: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCard: { marginBottom: 12, padding: 11, overflow: 'hidden' },
  overviewPager: { height: 138 },
  overviewPage: {
    flex: 1,
    paddingHorizontal: 5,
    paddingTop: 3,
    overflow: 'hidden',
  },
  budgetPageButton: { flex: 1, minHeight: 132 },
  overviewLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overviewLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  budgetSettingsIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 20,
  },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 22,
    lineHeight: 26,
  },
  primaryAmount: {
    fontFamily: font.displayBold,
    fontSize: 30,
    lineHeight: 39,
    marginTop: 7,
  },
  totalAmount: { fontFamily: font.body, fontSize: 12 },
  overviewHint: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 18 },
  delta: { fontFamily: font.dataMedium, fontSize: 11, lineHeight: 16, marginTop: 18 },
  budgetSummary: { flexDirection: 'row', gap: 5, marginTop: 18 },
  budgetSummaryItem: { flex: 1 },
  budgetSummaryNameRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  budgetSummaryIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 12,
    lineHeight: 14,
  },
  budgetSummaryName: {
    flexShrink: 1,
    fontFamily: font.bodyMedium,
    fontSize: 9,
  },
  budgetSummaryValue: {
    fontFamily: font.dataMedium,
    fontSize: 10,
    marginTop: 3,
  },
  pageDots: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pageDotHit: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageDot: { width: 7, height: 7, borderRadius: 4 },
  iconPressed: { opacity: 0.6 },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  fabPressed: { opacity: 0.86, transform: [{ scale: 0.95 }] },
  fabIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 30,
    lineHeight: 34,
  },
  confirmation: { marginBottom: 18 },
  confirmationTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 19,
    lineHeight: 22,
  },
  closeIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 22,
    lineHeight: 25,
  },
  cardTitle: {
    fontFamily: font.displaySemiBold,
    fontSize: 19,
    lineHeight: 23,
  },
  cardCopy: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  sectionHeader: { marginTop: 5, marginBottom: 10, gap: 9 },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  periodControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  periodButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodText: { fontFamily: font.bodySemiBold, fontSize: 11 },
  chartCard: { marginBottom: 12 },
  guidedState: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8 },
  guidedIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 34,
    lineHeight: 39,
    marginBottom: 7,
  },
  guidedTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 15,
    textAlign: 'center',
  },
  contentCard: { marginTop: 12 },
  eyebrow: {
    fontFamily: font.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 7,
  },
  deadlineList: { marginTop: 10 },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deadlineName: { fontFamily: font.bodyMedium, fontSize: 13 },
  deadlineDate: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  deadlineAmount: { fontFamily: font.dataMedium, fontSize: 12 },
  goalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  goalName: { fontFamily: font.bodySemiBold, fontSize: 15 },
  goalAmount: { fontFamily: font.data, fontSize: 11, marginTop: 4 },
  goalPercent: { fontFamily: font.dataMedium, fontSize: 16 },
  cardLink: {
    alignSelf: 'flex-end',
    fontFamily: font.bodySemiBold,
    fontSize: 12,
    marginTop: 10,
  },
});
