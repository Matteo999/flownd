import PagerView, {
  type PagerViewRef,
} from '@expo/ui/community/pager-view';
import { Image } from 'expo-image';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, useTransition } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

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
import { DraggableTransactionFab } from '@/components/draggable-transaction-fab';
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
  transactionsForFinancialCycle,
} from '@/lib/financial-cycle';
import {
  categoryToBudgetGroup,
  formatEuro,
  summarizeBudgets,
} from '@/lib/onboarding';
import {
  type FamilyDashboardSummary,
  fetchFamilyDashboardSummary,
  fetchFamilyGroups,
  getActiveFamilyGroupId,
  setActiveFamilyGroupId,
} from '@/lib/family';
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
    session,
    goals,
    transactions,
    goalContributions,
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
  const [familySummaries, setFamilySummaries] =
    useState<FamilyDashboardSummary[]>([]);
  const [familyGroupIndex, setFamilyGroupIndex] = useState(0);
  const [dashboardScrollEnabled, setDashboardScrollEnabled] = useState(true);
  const [selectedPeriod, setSelectedPeriod] =
    useState<DashboardPeriod>('month');
  const [chartPeriod, setChartPeriod] = useState<DashboardPeriod>('month');
  const [periodPending, startPeriodTransition] = useTransition();
  const overviewForeground = isDark ? colors.background : colors.onAccent;
  const overviewSecondaryForeground = overviewForeground;

  useFocusEffect(
    useCallback(() => {
      const userId = session?.user.id;
      if (!userId) return undefined;
      let active = true;
      const timer = setTimeout(() => {
        void Promise.all([
          fetchFamilyGroups(userId),
          getActiveFamilyGroupId(userId),
        ])
          .then(async ([groups, storedGroupId]) => {
            const summaries = await Promise.all(
              groups.map((group) => fetchFamilyDashboardSummary(group.id)),
            );
            const storedIndex = groups.findIndex((item) => item.id === storedGroupId);
            return { summaries, selectedIndex: storedIndex >= 0 ? storedIndex : 0 };
          })
          .then(({ summaries, selectedIndex }) => {
            if (!active) return;
            setFamilySummaries(summaries);
            setFamilyGroupIndex(selectedIndex);
          })
          .catch((familyError) => {
            if (__DEV__) console.error('Flownd family dashboard load failed', familyError);
            if (active) setFamilySummaries([]);
          });
      }, 0);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [session?.user.id]),
  );

  const selectedBudgets = draft.budgets.filter((item) => item.selected);
  const budgetSummary = summarizeBudgets(selectedBudgets).filter(
    (item) => item.amount > 0,
  );
  const financialCycle = financialCycleForDate(
    new Date(),
    budgetCycleStartDay,
    transactions,
  );
  const previousCycle = financialCycleForDate(
    new Date(financialCycle.start.getTime() - 1),
    budgetCycleStartDay,
    transactions,
  );
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
    .filter(
      (transaction) =>
        transaction.kind === 'income' && !transaction.excludedFromBudget,
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const previousSpent = previousCycleTransactions
    .filter(
      (transaction) =>
        transaction.kind !== 'income' && !transaction.excludedFromBudget,
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const savedThisCycle = goalContributions
    .filter((contribution) => {
      const createdAt = new Date(contribution.createdAt);
      return createdAt >= financialCycle.start && createdAt < financialCycle.end;
    })
    .reduce((sum, contribution) => sum + contribution.amount, 0);
  const savedPreviousCycle = goalContributions
    .filter((contribution) => {
      const createdAt = new Date(contribution.createdAt);
      return createdAt >= previousCycle.start && createdAt < previousCycle.end;
    })
    .reduce((sum, contribution) => sum + contribution.amount, 0);
  const rolloverAmount = budgetRolloverMode === 'carry'
    ? Math.max(0, previousIncome - previousSpent - savedPreviousCycle)
    : 0;
  const monthlyBudget = budgetMonthlyIncome + rolloverAmount;
  const chartPeriodTransactions = chartPeriod === 'month'
    ? transactionsForFinancialCycle(transactions, financialCycle)
    : transactionsForPeriod(transactions, chartPeriod);
  const chartTransactions = chartPeriodTransactions.filter(
      (transaction) =>
        transaction.kind !== 'income' && !transaction.excludedFromTotals,
    );
  const monthlySpent = monthlyTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const monthlyBudgetUsed = monthlySpent + savedThisCycle;
  const monthlyBudgetRemaining = Math.max(0, monthlyBudget - monthlyBudgetUsed);
  const spentByGroup = monthlyTransactions.reduce(
    (summary, transaction) => {
      const group = categoryToBudgetGroup(transaction.category);
      summary[group] += transaction.amount;
      return summary;
    },
    { needs: 0, wants: 0, savings: savedThisCycle },
  );
  const budgetRows = budgetSummary.map((budget) => {
    const allocationShare = budget.percentage / 100;
    const effectiveAmount =
      budgetMonthlyIncome * allocationShare +
      (budgetRolloverMode === 'carry'
        ? rolloverAmount * allocationShare
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
    .filter((budget) => budget.id !== 'savings' && budget.progress >= 0.8)
    .sort((first, second) => second.progress - first.progress)[0];

  const featuredGoal = [...goals]
    .filter((goal) => goal.status !== 'free_savings')
    .sort((first, second) => first.priority - second.priority)[0];
  const savedTowardGoal = featuredGoal?.savedAmount ?? 0;
  const goalProgress = featuredGoal?.targetAmount
    ? savedTowardGoal / featuredGoal.targetAmount
    : 0;
  const hasRecentData = isRecentSource(
    transactions,
    financialAccounts.map((account) => account.lastSyncedAt),
  );
  const hasChartTransactions = chartTransactions.length > 0;

  return (
    <Screen
      scrollEnabled={dashboardScrollEnabled}
      floatingActionPosition="free"
      floatingAction={
        <DraggableTransactionFab
          onPress={() => router.push('/add-transaction' as Href)}
        />
      }>
      <PageHeader
        title="Dashboard"
        action={
          <AppHeaderActions
            showNotifications
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
              <View style={styles.budgetOverviewContent}>
                <View style={styles.budgetOverviewCopy}>
                  <Text
                    accessibilityLabel={
                      amountsVisible
                        ? `${formatEuro(monthlyBudgetRemaining)} disponibili su ${formatEuro(monthlyBudget)}`
                        : 'Importi nascosti'
                    }
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={[styles.budgetAmount, { color: overviewForeground }]}>
                    {amountsVisible ? (
                      <>
                        {formatEuro(monthlyBudgetRemaining)}
                        <Text
                          style={[
                            styles.budgetAmountTotal,
                            { color: overviewSecondaryForeground, opacity: 0.82 },
                          ]}>
                          {' / '}{formatEuro(monthlyBudget)}
                        </Text>
                      </>
                    ) : (
                      <>
                        {HIDDEN_AMOUNT}
                        <Text
                          style={[
                            styles.budgetAmountTotal,
                            { color: overviewSecondaryForeground, opacity: 0.82 },
                          ]}>
                          {' / '}{HIDDEN_AMOUNT}
                        </Text>
                      </>
                    )}
                  </Text>
                </View>
                <BudgetRadialChart
                  amountsVisible={amountsVisible}
                  spent={monthlyBudgetUsed}
                  total={monthlyBudget}
                />
              </View>
            </Pressable>
          </View>

          <View key="family" style={styles.overviewPage}>
            <View style={styles.budgetPageButton}>
              <FamilyOverviewSlider
                amountsVisible={amountsVisible}
                foreground={overviewForeground}
                index={familyGroupIndex}
                onIndexChange={(index) => {
                  setFamilyGroupIndex(index);
                  const groupId = familySummaries[index]?.groupId;
                  if (session?.user.id && groupId) {
                    void setActiveFamilyGroupId(session.user.id, groupId);
                  }
                }}
                onOpen={() => router.push('/family' as Href)}
                onSwipeEnd={() => setDashboardScrollEnabled(true)}
                onSwipeStart={() => setDashboardScrollEnabled(false)}
                secondaryForeground={overviewSecondaryForeground}
                summaries={familySummaries}
              />
            </View>
          </View>
        </PagerView>

        <View accessibilityRole="tablist" style={styles.pageDots}>
          {[0, 1].map((index) => {
            const selected = overviewPage === index;
            return (
              <Pressable
                key={index}
                accessibilityRole="tab"
                accessibilityLabel={index === 0 ? 'Budget mensile' : 'Riepilogo famiglia'}
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
            {featuredGoal
              ? `Hai impostato il budget e creato l’obiettivo “${featuredGoal.name}”.`
              : 'Hai impostato il tuo primo budget.'}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.budgetCategoriesCard}>
        <View style={styles.budgetCategoriesHeader}>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Budget per categoria
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Modifica il budget per categoria"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/budget' as Href)}
            style={({ pressed }) => [
              styles.budgetEditButton,
              { backgroundColor: colors.accentSoft },
              pressed && styles.iconPressed,
            ]}>
            <Text style={[styles.budgetEditIcon, { color: colors.accent }]}>
              tune
            </Text>
          </Pressable>
        </View>

        <View style={styles.budgetCategoryList}>
          {budgetRows.map((budget) => {
            const visual = budget.id === 'wants'
              ? { color: colors.warning, soft: colors.warningSoft }
              : budget.id === 'savings'
                ? { color: colors.positive, soft: colors.positiveSoft }
                : { color: colors.accent, soft: colors.accentSoft };
            const progressColor = budget.progress > 1
              ? colors.negative
              : visual.color;
            return (
              <View
                key={budget.id}
                accessible
                accessibilityLabel={
                  amountsVisible
                    ? `${budget.name}: ${formatEuro(budget.spent)} su ${formatEuro(budget.amount)}, ${Math.round(budget.progress * 100)} per cento`
                    : `${budget.name}: importi nascosti`
                }
                style={styles.budgetCategoryRow}>
                <View style={styles.budgetCategoryTop}>
                  <View
                    style={[
                      styles.budgetCategoryIconBox,
                      { backgroundColor: visual.soft },
                    ]}>
                    <Text style={[styles.budgetCategoryIcon, { color: visual.color }]}>
                      {budget.icon}
                    </Text>
                  </View>
                  <View style={styles.budgetCategoryDetails}>
                    <View style={styles.budgetCategoryNameRow}>
                      <Text style={[styles.budgetCategoryName, { color: colors.text }]}>
                        {budget.name}
                      </Text>
                      <Text style={[styles.budgetCategoryPercentage, { color: progressColor }]}>
                        {amountsVisible ? `${Math.round(budget.progress * 100)}%` : '••%'}
                      </Text>
                    </View>
                    <Text style={[styles.budgetCategoryAmount, { color: colors.textSecondary }]}>
                      {amountsVisible
                        ? `${formatEuro(budget.spent)} di ${formatEuro(budget.amount)}`
                        : `${HIDDEN_AMOUNT} di ${HIDDEN_AMOUNT}`}
                    </Text>
                  </View>
                </View>
                <View style={[styles.budgetCategoryTrack, { backgroundColor: visual.soft }]}>
                  <View
                    style={[
                      styles.budgetCategoryFill,
                      {
                        backgroundColor: progressColor,
                        width: `${Math.min(100, Math.max(0, budget.progress * 100))}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </Card>

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
          {hasChartTransactions ? (
            <SpendingDonutChart
              amountsVisible={amountsVisible}
              totalLabel={
                chartPeriod === 'month'
                  ? 'TOTALE SPESO NEL CICLO'
                  : 'TOTALE SPESO'
              }
              transactions={chartTransactions}
            />
          ) : (
            <View style={styles.guidedState}>
              <Text style={[styles.guidedIcon, { color: colors.accent }]}>
                donut_small
              </Text>
              <Text style={[styles.guidedTitle, { color: colors.text }]}>
                Nessuna spesa nel periodo selezionato.
              </Text>
              <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
                Appena registri un movimento, qui vedrai la sua categoria e il totale speso.
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

      {featuredGoal ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apri l’obiettivo ${featuredGoal.name}`}
          onPress={() => router.push('/(tabs)/goals' as Href)}
          style={({ pressed }) => pressed && styles.iconPressed}>
          <Card style={styles.contentCard}>
            <View style={styles.goalTop}>
              <View style={styles.flex}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
                  OBIETTIVO IN EVIDENZA
                </Text>
                <Text style={[styles.goalName, { color: colors.text }]}>
                  {featuredGoal.name}
                </Text>
                <Text style={[styles.goalAmount, { color: colors.textSecondary }]}>
                  {amountsVisible
                    ? `${formatEuro(savedTowardGoal)} di ${formatEuro(featuredGoal.targetAmount)}`
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

const BUDGET_RADIAL_SIZE = 144;
const BUDGET_RADIAL_CENTER = BUDGET_RADIAL_SIZE / 2;
const BUDGET_RADIAL_RADIUS = 58;
const BUDGET_RADIAL_STROKE = 14;
const BUDGET_RADIAL_CIRCUMFERENCE = 2 * Math.PI * BUDGET_RADIAL_RADIUS;
const BUDGET_RADIAL_ARC_SHARE = 0.5;

function mixHexColors(from: string, to: string, amount: number) {
  const mix = Math.min(1, Math.max(0, amount));
  const fromChannels = [1, 3, 5].map((index) =>
    Number.parseInt(from.slice(index, index + 2), 16),
  );
  const toChannels = [1, 3, 5].map((index) =>
    Number.parseInt(to.slice(index, index + 2), 16),
  );
  const channels = fromChannels.map((channel, index) =>
    Math.round(channel + (toChannels[index] - channel) * mix),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function budgetGradientColors(spentProgress: number) {
  const progress = Math.min(1, Math.max(0, spentProgress));
  const milestones = progress <= 0.5
    ? {
        amount: progress / 0.5,
        from: ['#62D7AA', '#279873'],
        to: ['#FFD166', '#D99A24'],
      }
    : {
        amount: (progress - 0.5) / 0.5,
        from: ['#FFD166', '#D99A24'],
        to: ['#FF9D8B', '#D9553F'],
      };
  return {
    start: mixHexColors(milestones.from[0], milestones.to[0], milestones.amount),
    end: mixHexColors(milestones.from[1], milestones.to[1], milestones.amount),
  };
}

function BudgetRadialChart({
  spent,
  total,
  amountsVisible,
}: {
  spent: number;
  total: number;
  amountsVisible: boolean;
}) {
  const spentProgress = total > 0 ? spent / total : 0;
  const remainingProgress = total > 0 ? 1 - spentProgress : 0;
  const visibleProgress = Math.min(1, Math.max(0, remainingProgress));
  const arcLength = BUDGET_RADIAL_CIRCUMFERENCE * BUDGET_RADIAL_ARC_SHARE;
  const remainingLength = arcLength * visibleProgress;
  const gradientColors = budgetGradientColors(spentProgress);
  const radialSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BUDGET_RADIAL_SIZE}" height="${BUDGET_RADIAL_SIZE}" viewBox="0 0 ${BUDGET_RADIAL_SIZE} ${BUDGET_RADIAL_SIZE}">`,
    `<defs><linearGradient id="budgetGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${gradientColors.start}"/><stop offset="100%" stop-color="${gradientColors.end}"/></linearGradient></defs>`,
    `<circle cx="${BUDGET_RADIAL_CENTER}" cy="${BUDGET_RADIAL_CENTER}" r="${BUDGET_RADIAL_RADIUS}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="${BUDGET_RADIAL_STROKE}" stroke-dasharray="${arcLength} ${BUDGET_RADIAL_CIRCUMFERENCE - arcLength}" stroke-linecap="round" transform="rotate(180 ${BUDGET_RADIAL_CENTER} ${BUDGET_RADIAL_CENTER})"/>`,
    remainingLength > 0
      ? `<circle cx="${BUDGET_RADIAL_CENTER}" cy="${BUDGET_RADIAL_CENTER}" r="${BUDGET_RADIAL_RADIUS}" fill="none" stroke="url(#budgetGradient)" stroke-width="${BUDGET_RADIAL_STROKE}" stroke-dasharray="${remainingLength} ${BUDGET_RADIAL_CIRCUMFERENCE - remainingLength}" stroke-linecap="round" transform="rotate(180 ${BUDGET_RADIAL_CENTER} ${BUDGET_RADIAL_CENTER})"/>`
      : '',
    '</svg>',
  ].join('');
  const radialUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(radialSvg)}`;
  const percentage = Math.round(visibleProgress * 100);

  return (
    <View
      accessible
      accessibilityLabel={
        amountsVisible
          ? `${percentage} per cento del budget ancora disponibile`
          : 'Avanzamento del budget nascosto'
      }
      accessibilityRole="image"
      style={styles.budgetRadial}>
      <Image
        cachePolicy="none"
        contentFit="contain"
        pointerEvents="none"
        source={{ uri: radialUri }}
        style={styles.budgetRadialImage}
      />
      <View pointerEvents="none" style={styles.budgetRadialLabel}>
        <Text style={styles.budgetRadialPercentage}>
          {amountsVisible ? `${percentage}%` : '••%'}
        </Text>
      </View>
    </View>
  );
}

const FAMILY_SLIDE_HEIGHT = 132;

function FamilyOverviewSlider({
  summaries,
  index,
  onIndexChange,
  onOpen,
  onSwipeEnd,
  onSwipeStart,
  amountsVisible,
  foreground,
  secondaryForeground,
}: {
  summaries: FamilyDashboardSummary[];
  index: number;
  onIndexChange: (index: number) => void;
  onOpen: () => void;
  onSwipeEnd: () => void;
  onSwipeStart: () => void;
  amountsVisible: boolean;
  foreground: string;
  secondaryForeground: string;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const [transition, setTransition] = useState<{
    from: number;
    to: number;
    direction: 1 | -1;
  } | null>(null);
  const selectedIndex = summaries.length ? Math.min(index, summaries.length - 1) : 0;

  function move(direction: 1 | -1) {
    if (summaries.length < 2 || transition) return;
    const to = (selectedIndex + direction + summaries.length) % summaries.length;
    const nextTransition = { from: selectedIndex, to, direction };
    progress.setValue(0);
    setTransition(nextTransition);
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      onIndexChange(to);
      setTransition(null);
      progress.setValue(0);
    });
  }

  const verticalSwipe = Gesture.Pan()
    .enabled(summaries.length > 1)
    .activeOffsetY([-9, 9])
    .failOffsetX([-18, 18])
    .runOnJS(true)
    .onBegin(onSwipeStart)
    .onEnd((event) => {
      if (event.translationY < -28 || event.velocityY < -450) move(1);
      else if (event.translationY > 28 || event.velocityY > 450) move(-1);
    })
    .onFinalize(onSwipeEnd);

  if (!summaries.length) {
    return (
      <Pressable
        accessibilityLabel="Apri Famiglia e condivisione"
        accessibilityRole="button"
        onPress={onOpen}
        style={styles.familySlider}>
        <FamilyOverviewPage
          amountsVisible={amountsVisible}
          foreground={foreground}
          secondaryForeground={secondaryForeground}
          summary={null}
        />
      </Pressable>
    );
  }

  const currentSummary = summaries[transition?.from ?? selectedIndex] ?? null;
  const incomingSummary = transition ? summaries[transition.to] : null;
  const direction = transition?.direction ?? 1;
  return (
    <GestureDetector gesture={verticalSwipe}>
      <Pressable
        accessibilityActions={[
          { name: 'increment', label: 'Gruppo successivo' },
          { name: 'decrement', label: 'Gruppo precedente' },
        ]}
        accessibilityHint="Scorri verticalmente per cambiare gruppo"
        accessibilityLabel={`${currentSummary?.groupName ?? 'Famiglia'}, gruppo ${selectedIndex + 1} di ${summaries.length}`}
        accessibilityRole="adjustable"
        onAccessibilityAction={(event) => move(event.nativeEvent.actionName === 'decrement' ? -1 : 1)}
        onPress={onOpen}
        style={styles.familySlider}>
      <Animated.View
        style={[
          styles.familySlide,
          transition && {
            transform: [{
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -direction * FAMILY_SLIDE_HEIGHT],
              }),
            }],
          },
        ]}>
        <FamilyOverviewPage
          amountsVisible={amountsVisible}
          foreground={foreground}
          secondaryForeground={secondaryForeground}
          summary={currentSummary}
        />
      </Animated.View>
      {incomingSummary ? (
        <Animated.View
          style={[
            styles.familySlide,
            styles.familyIncomingSlide,
            {
              transform: [{
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [direction * FAMILY_SLIDE_HEIGHT, 0],
                }),
              }],
            },
          ]}>
          <FamilyOverviewPage
            amountsVisible={amountsVisible}
            foreground={foreground}
            secondaryForeground={secondaryForeground}
            summary={incomingSummary}
          />
        </Animated.View>
      ) : null}
      {summaries.length > 1 ? (
        <View pointerEvents="none" style={styles.familyGroupPosition}>
          <Text style={[styles.familyGroupPositionText, { color: secondaryForeground }]}>
            {selectedIndex + 1}/{summaries.length} · scorri
          </Text>
        </View>
      ) : null}
      </Pressable>
    </GestureDetector>
  );
}

function FamilyOverviewPage({
  summary,
  amountsVisible,
  foreground,
  secondaryForeground,
}: {
  summary: FamilyDashboardSummary | null;
  amountsVisible: boolean;
  foreground: string;
  secondaryForeground: string;
}) {
  if (!summary) {
    return (
      <>
        <Text style={[styles.overviewLabel, { color: secondaryForeground, opacity: 0.82 }]}>
          FAMIGLIA E CONDIVISIONE
        </Text>
        <Text style={[styles.familyEmptyTitle, { color: foreground }]}>Crea il tuo gruppo</Text>
        <Text style={[styles.overviewHint, { color: secondaryForeground, opacity: 0.82 }]}>
          Invita famiglia o coinquilini e scegli cosa condividere.
        </Text>
      </>
    );
  }

  const hasFamilyBudget = summary.budgetTotal > 0;
  const remaining = Math.max(0, summary.budgetTotal - summary.budgetSpent);
  const hasSharedGoals = summary.goalTarget > 0;
  const hasSharedTransactions = summary.transactionCount > 0;
  const hasSharedNetWorth = summary.netWorthTotal !== 0;
  const primaryValue = hasFamilyBudget
    ? amountsVisible
      ? formatFamilyCurrency(remaining, summary.currency)
      : HIDDEN_AMOUNT
    : hasSharedGoals
      ? amountsVisible
        ? formatFamilyCurrency(summary.goalSaved, summary.currency)
        : HIDDEN_AMOUNT
      : hasSharedTransactions
        ? amountsVisible
          ? formatFamilyCurrency(summary.budgetSpent, summary.currency)
          : HIDDEN_AMOUNT
        : hasSharedNetWorth
          ? amountsVisible
            ? formatFamilyCurrency(summary.netWorthTotal, summary.currency)
            : HIDDEN_AMOUNT
          : 'Inizia a condividere';
  const impactLabel = hasFamilyBudget
    ? 'BUDGET FAMILIARE'
    : hasSharedGoals
      ? 'OBIETTIVI CONDIVISI'
      : hasSharedTransactions
        ? 'SPESE CONDIVISE'
        : hasSharedNetWorth
          ? 'PATRIMONIO CONDIVISO'
          : 'HUB FAMIGLIA';
  const impactCaption = hasFamilyBudget
    ? amountsVisible
      ? `${formatFamilyCurrency(summary.budgetSpent, summary.currency)} spesi questo mese su ${formatFamilyCurrency(summary.budgetTotal, summary.currency)}`
      : 'Budget e spese condivise sono nascosti'
    : hasSharedGoals
      ? amountsVisible
        ? `Su ${formatFamilyCurrency(summary.goalTarget, summary.currency)} complessivi in ${summary.sharedGoalCount} obiettivi`
        : 'Avanzamento degli obiettivi nascosto'
      : hasSharedTransactions
        ? `${summary.transactionCount} movimenti condivisi questo mese`
        : hasSharedNetWorth
          ? 'Totale aggregato scelto dai partecipanti'
          : 'Scegliete budget, obiettivi o spese da condividere';
  return (
    <>
      <View style={styles.overviewLabelRow}>
        <Text numberOfLines={1} style={[styles.overviewLabel, styles.familyOverviewLabel, { color: secondaryForeground, opacity: 0.82 }]}>
          {impactLabel} · {summary.groupName.toLocaleUpperCase('it-IT')}
        </Text>
        <DashboardFamilyAvatars members={summary.members} foreground={foreground} />
      </View>
      <Text style={[styles.primaryAmount, { color: foreground }]}>
        {primaryValue}
      </Text>
      <Text numberOfLines={2} style={[styles.familyImpactCaption, { color: secondaryForeground, opacity: 0.86 }]}>
        {impactCaption}
      </Text>
    </>
  );
}

function DashboardFamilyAvatars({
  members,
  foreground,
}: {
  members: FamilyDashboardSummary['members'];
  foreground: string;
}) {
  const visibleMembers = members.slice(0, 3);
  const overflow = members.length - visibleMembers.length;
  return (
    <View style={styles.dashboardAvatars}>
      {visibleMembers.map((member, index) => (
        <DashboardFamilyAvatar key={member.userId} member={member} index={index} foreground={foreground} />
      ))}
      {overflow > 0 ? (
        <View style={[styles.dashboardAvatar, styles.dashboardAvatarOverflow, { borderColor: foreground }]}>
          <Text style={[styles.dashboardAvatarOverflowText, { color: foreground }]}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DashboardFamilyAvatar({
  member,
  index,
  foreground,
}: {
  member: FamilyDashboardSummary['members'][number];
  index: number;
  foreground: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = member.displayName.trim()[0]?.toUpperCase() || 'F';
  if (member.avatarUrl && !failed) {
    return (
      <Image
        accessibilityLabel={`Avatar di ${member.displayName}`}
        contentFit="cover"
        onError={() => setFailed(true)}
        source={{ uri: member.avatarUrl }}
        style={[styles.dashboardAvatar, index > 0 && styles.dashboardAvatarOverlap, { borderColor: foreground }]}
      />
    );
  }
  return (
    <View style={[styles.dashboardAvatar, styles.dashboardAvatarFallback, index > 0 && styles.dashboardAvatarOverlap, { borderColor: foreground }]}>
      <Text style={[styles.dashboardAvatarInitial, { color: foreground }]}>{initial}</Text>
    </View>
  );
}

function formatFamilyCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
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
  budgetOverviewContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  budgetOverviewCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
    justifyContent: 'center',
  },
  budgetAmount: {
    fontFamily: font.displayBold,
    fontSize: 29,
    lineHeight: 38,
  },
  budgetAmountTotal: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
  },
  budgetRadial: {
    width: BUDGET_RADIAL_SIZE,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  budgetRadialImage: {
    position: 'absolute',
    top: 0,
    width: BUDGET_RADIAL_SIZE,
    height: BUDGET_RADIAL_SIZE,
  },
  budgetRadialLabel: {
    position: 'absolute',
    top: 37,
    right: 0,
    left: 0,
    alignItems: 'center',
  },
  budgetRadialPercentage: {
    color: '#FFFFFF',
    fontFamily: font.dataMedium,
    fontSize: 18,
    lineHeight: 23,
  },
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
  familyOverviewLabel: { flex: 1, marginRight: 8 },
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
  familyEmptyTitle: { fontFamily: font.displayBold, fontSize: 25, lineHeight: 33, marginTop: 10 },
  familyImpactCaption: { fontFamily: font.bodyMedium, fontSize: 11, lineHeight: 16, marginTop: 13 },
  familySlider: { height: FAMILY_SLIDE_HEIGHT, overflow: 'hidden' },
  familySlide: { height: FAMILY_SLIDE_HEIGHT },
  familyIncomingSlide: { position: 'absolute', top: 0, right: 0, left: 0 },
  familyGroupPosition: { position: 'absolute', right: 0, bottom: 0 },
  familyGroupPositionText: { fontFamily: font.bodyMedium, fontSize: 9, opacity: 0.7 },
  dashboardAvatars: { flexDirection: 'row', alignItems: 'center', paddingRight: 1 },
  dashboardAvatar: { width: 27, height: 27, borderRadius: 14, borderWidth: 1.5 },
  dashboardAvatarOverlap: { marginLeft: -7 },
  dashboardAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  dashboardAvatarInitial: { fontFamily: font.displayBold, fontSize: 10 },
  dashboardAvatarOverflow: { marginLeft: -7, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  dashboardAvatarOverflowText: { fontFamily: font.dataMedium, fontSize: 8 },
  overviewHint: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 18 },
  delta: { fontFamily: font.dataMedium, fontSize: 11, lineHeight: 16, marginTop: 18 },
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
  budgetCategoriesCard: { marginBottom: 18 },
  budgetCategoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  budgetCategoriesCycle: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  budgetEditButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetEditIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 19,
    lineHeight: 22,
  },
  budgetCategoryList: { gap: 17, marginTop: 18 },
  budgetCategoryRow: { gap: 9 },
  budgetCategoryTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  budgetCategoryIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetCategoryIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  budgetCategoryDetails: { flex: 1 },
  budgetCategoryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  budgetCategoryName: { fontFamily: font.bodySemiBold, fontSize: 13 },
  budgetCategoryPercentage: { fontFamily: font.dataMedium, fontSize: 12 },
  budgetCategoryAmount: { fontFamily: font.data, fontSize: 10, marginTop: 2 },
  budgetCategoryTrack: { height: 8, borderRadius: 8, overflow: 'hidden' },
  budgetCategoryFill: { height: '100%', borderRadius: 8 },
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
