import { Image } from 'expo-image';
import { router, type Href, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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
import { useAppState } from '@/providers/app-provider';
import { frequencyLabels } from '@/lib/recurring-payments';

const periodLabels: { id: DashboardPeriod; label: string }[] = [
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
  { id: 'year', label: 'Anno' },
];

export default function DashboardScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { width: windowWidth } = useWindowDimensions();
  const {
    draft,
    session,
    goals,
    transactions,
    goalContributions,
    financialAccounts,
    planTier,
    recurringPayments,
    coachInsight,
    amountsVisible,
    budgetCycleStartDay,
    budgetRolloverMode,
    grossBudgetMonthlyIncome,
    groupMonthlyAllocation,
    previousGroupMonthlyAllocation,
    budgetMonthlyIncome,
    firstDashboardVisit,
    dismissFirstVisit,
    toggleAmountsVisible,
    refreshData,
  } = useAppState(
    'refreshData',
    'draft',
    'session',
    'goals',
    'transactions',
    'goalContributions',
    'financialAccounts',
    'planTier',
    'recurringPayments',
    'coachInsight',
    'amountsVisible',
    'budgetCycleStartDay',
    'budgetRolloverMode',
    'grossBudgetMonthlyIncome',
    'groupMonthlyAllocation',
    'previousGroupMonthlyAllocation',
    'budgetMonthlyIncome',
    'firstDashboardVisit',
    'dismissFirstVisit',
    'toggleAmountsVisible',
  );
  const [dashboardScope, setDashboardScope] =
    useState<'personal' | 'groups'>('personal');
  const [dashboardAtTop, setDashboardAtTop] = useState(true);
  const [dashboardPageHeights, setDashboardPageHeights] = useState({
    personal: 0,
    groups: 0,
  });
  const [familySummaries, setFamilySummaries] =
    useState<FamilyDashboardSummary[]>([]);
  const [familyGroupIndex, setFamilyGroupIndex] = useState(0);
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
    (transaction) => transaction.kind !== 'income' && !transaction.excludedFromBudget,
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
    ? Math.max(
        0,
        previousIncome
          - previousGroupMonthlyAllocation
          - previousSpent
          - savedPreviousCycle,
      )
    : 0;
  const monthlyBudget = budgetMonthlyIncome + rolloverAmount;
  const dashboardRecurrences = [...recurringPayments]
    .filter((item) => item.status === 'active' || item.status === 'paused')
    .sort((first, second) => first.nextDueOn.localeCompare(second.nextDueOn));
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
  const activeFamilySummary =
    familySummaries[familyGroupIndex] ?? familySummaries[0] ?? null;
  const groupChartTransactions = transactionsForPeriod(
    (activeFamilySummary?.expenses ?? []).map((expense) => ({
      id: expense.id,
      description: activeFamilySummary?.groupName ?? 'Spesa del gruppo',
      amount: expense.amount,
      category: expense.category === 'wants'
        ? 'Desideri'
        : expense.category === 'savings'
          ? 'Risparmi'
          : 'Necessità',
      kind: 'expense' as const,
      occurredAt: expense.occurredAt,
    })),
    chartPeriod,
  );
  const [dashboardPageWidth, setDashboardPageWidth] = useState(
    Math.max(1, windowWidth),
  );
  const pageTranslateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
  const pageWidth = useSharedValue(dashboardPageWidth);
  const activePage = useSharedValue(0);

  /* Reanimated SharedValues are intentionally mutable on the UI thread. */
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    pageWidth.value = dashboardPageWidth;
    pageTranslateX.value = -activePage.value * dashboardPageWidth;
  }, [activePage, dashboardPageWidth, pageTranslateX, pageWidth]);

  const selectDashboardScope = useCallback(
    (nextScope: 'personal' | 'groups') => {
      if (nextScope === dashboardScope) return;
      const nextPage = nextScope === 'groups' ? 1 : 0;
      setDashboardScope(nextScope);
      activePage.value = nextPage;
      pageTranslateX.value = withTiming(-nextPage * pageWidth.value, {
        duration: 260,
      });
    },
    [activePage, dashboardScope, pageTranslateX, pageWidth],
  );
  const dashboardSwipe = useMemo(
    () =>
      Gesture.Pan()
        .enabled(dashboardAtTop)
        .activeOffsetX([-12, 12])
        .failOffsetY([-16, 16])
        .onStart(() => {
          gestureStartX.value = pageTranslateX.value;
        })
        .onUpdate((event) => {
          const nextPosition = gestureStartX.value + event.translationX;
          pageTranslateX.value = Math.min(
            0,
            Math.max(-pageWidth.value, nextPosition),
          );
        })
        .onEnd((event) => {
          const projectedPosition = pageTranslateX.value + event.velocityX * 0.16;
          const nextPage = projectedPosition <= -pageWidth.value / 2 ? 1 : 0;
          activePage.value = nextPage;
          pageTranslateX.value = withSpring(-nextPage * pageWidth.value, {
            damping: 24,
            stiffness: 240,
            mass: 0.82,
          });
          runOnJS(setDashboardScope)(nextPage === 1 ? 'groups' : 'personal');
        }),
    [activePage, dashboardAtTop, gestureStartX, pageTranslateX, pageWidth],
  );
  /* eslint-enable react-hooks/immutability */
  const dashboardTrackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageTranslateX.value }],
  }));
  const dashboardTabIndicatorStyle = useAnimatedStyle(() => {
    const progress = pageWidth.value > 0
      ? -pageTranslateX.value / pageWidth.value
      : 0;
    const tabWidth = pageWidth.value / 2;
    return {
      width: tabWidth,
      transform: [{ translateX: progress * tabWidth }],
    };
  });
  const handleDashboardScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextAtTop = event.nativeEvent.contentOffset.y <= 1;
      setDashboardAtTop((current) => current === nextAtTop ? current : nextAtTop);
    },
    [],
  );
  const activeDashboardPageHeight = dashboardPageHeights[dashboardScope];

  return (
    <Screen
      animateFirstFocus
      onRefresh={refreshData}
      onScroll={handleDashboardScroll}
      floatingActionPosition="free"
      floatingAction={
        <DraggableTransactionFab
          onPress={() => router.push('/add-transaction' as Href)}
        />
      }>
      <PageHeader
        collapseInPlace
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
      <View
        accessibilityRole="tablist"
        style={[
          styles.dashboardTabs,
          {
            borderBottomColor: isDark
              ? 'rgba(255,255,255,0.28)'
              : 'rgba(11,36,27,0.22)',
          },
        ]}>
        {([
          { id: 'personal', label: 'Personale' },
          { id: 'groups', label: 'Gruppi' },
        ] as const).map((tab) => {
          const selected = dashboardScope === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => selectDashboardScope(tab.id)}
              style={({ pressed }) => [
                styles.dashboardTab,
                pressed && styles.dashboardTabPressed,
              ]}>
              <Text
                style={[
                  styles.dashboardTabLabel,
                  { color: selected ? colors.text : colors.textSecondary },
                  selected && styles.dashboardTabLabelSelected,
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dashboardTabIndicator,
            { backgroundColor: colors.accent },
            dashboardTabIndicatorStyle,
          ]}
        />
      </View>

      <GestureDetector gesture={dashboardSwipe}>
        <View
          onLayout={(event) => {
            const measuredWidth = event.nativeEvent.layout.width;
            if (Math.abs(measuredWidth - dashboardPageWidth) > 0.5) {
              setDashboardPageWidth(measuredWidth);
            }
          }}
          style={[
            styles.dashboardPagesViewport,
            activeDashboardPageHeight > 0 && { height: activeDashboardPageHeight },
          ]}>
          <Animated.View
            style={[
              styles.dashboardPagesTrack,
              { width: dashboardPageWidth * 2 },
              dashboardTrackStyle,
            ]}>
            {(['personal', 'groups'] as const).map((renderedScope) => (
              <View
                key={renderedScope}
                onLayout={(event) => {
                  const measuredHeight = event.nativeEvent.layout.height;
                  setDashboardPageHeights((current) => (
                    Math.abs(current[renderedScope] - measuredHeight) <= 0.5
                      ? current
                      : { ...current, [renderedScope]: measuredHeight }
                  ));
                }}
                style={[styles.dashboardMainView, { width: dashboardPageWidth }]}>

      {renderedScope === 'groups' && familySummaries.length > 1 ? (
        <View style={styles.groupChips}>
          {familySummaries.map((summary, index) => {
            const selected = index === familyGroupIndex;
            return (
              <Pressable
                key={summary.groupId}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  setFamilyGroupIndex(index);
                  if (session?.user.id) {
                    void setActiveFamilyGroupId(session.user.id, summary.groupId);
                  }
                }}
                style={({ pressed }) => [
                  styles.groupChip,
                  {
                    backgroundColor: selected ? colors.accent : colors.sunken,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                  pressed && styles.dashboardTabPressed,
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.groupChipLabel,
                    { color: selected ? colors.onAccent : colors.textSecondary },
                  ]}>
                  {summary.groupName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Card
        style={[
          styles.overviewCard,
          {
            backgroundColor: colors.accent,
            borderColor: colors.accent,
          },
        ]}>
        <View style={styles.overviewContent}>
          {renderedScope === 'personal' ? (
            <View style={styles.overviewPage}>
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
                    {groupMonthlyAllocation > 0 ? (
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.personalAllocationCaption,
                          { color: overviewSecondaryForeground, opacity: 0.82 },
                        ]}>
                        {amountsVisible
                          ? `${formatEuro(grossBudgetMonthlyIncome)} mensili · ${formatEuro(groupMonthlyAllocation)} ai gruppi`
                          : `${HIDDEN_AMOUNT} mensili · ${HIDDEN_AMOUNT} ai gruppi`}
                      </Text>
                    ) : null}
                  </View>
                  <BudgetRadialChart
                    amountsVisible={amountsVisible}
                    spent={monthlyBudgetUsed}
                    textColor={overviewForeground}
                    total={monthlyBudget}
                  />
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={styles.overviewPage}>
              <Pressable
                accessibilityHint="Apre la sezione Gruppi"
                accessibilityLabel={
                  activeFamilySummary
                    ? `Apri il gruppo ${activeFamilySummary.groupName}`
                    : 'Apri Gruppi'
                }
                accessibilityRole="button"
                onPress={() => router.push('/family' as Href)}
                style={({ pressed }) => [
                  styles.budgetPageButton,
                  pressed && styles.iconPressed,
                ]}>
                {activeFamilySummary && activeFamilySummary.budgetTotal > 0 ? (
                  <>
                    <View style={styles.overviewLabelRow}>
                      <View style={styles.familyOverviewLabel}>
                        <Text
                          style={[
                            styles.overviewLabel,
                            { color: overviewSecondaryForeground, opacity: 0.82 },
                          ]}>
                          BUDGET CONDIVISO
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.groupBudgetName,
                            { color: overviewForeground },
                          ]}>
                          {activeFamilySummary.groupName}
                        </Text>
                      </View>
                      <DashboardFamilyAvatars
                        foreground={overviewForeground}
                        members={activeFamilySummary.members}
                      />
                    </View>
                    <View style={styles.budgetOverviewContent}>
                      <View style={styles.budgetOverviewCopy}>
                        <Text
                          accessibilityLabel={
                            amountsVisible
                              ? `${formatFamilyCurrency(Math.max(0, activeFamilySummary.budgetTotal - activeFamilySummary.budgetSpent), activeFamilySummary.currency)} disponibili su ${formatFamilyCurrency(activeFamilySummary.budgetTotal, activeFamilySummary.currency)}`
                              : 'Importi nascosti'
                          }
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                          numberOfLines={1}
                          style={[
                            styles.budgetAmount,
                            styles.groupBudgetAmount,
                            { color: overviewForeground },
                          ]}>
                          {amountsVisible ? (
                            <>
                              {formatFamilyCurrency(
                                activeFamilySummary.budgetRemaining,
                                activeFamilySummary.currency,
                              )}
                              <Text
                                style={[
                                  styles.budgetAmountTotal,
                                  styles.groupBudgetAmountTotal,
                                  {
                                    color: overviewSecondaryForeground,
                                    opacity: 0.82,
                                  },
                                ]}>
                                {' / '}
                                {formatFamilyCurrency(
                                  activeFamilySummary.budgetTotal,
                                  activeFamilySummary.currency,
                                )}
                              </Text>
                            </>
                          ) : (
                            <>
                              {HIDDEN_AMOUNT}
                              <Text
                                style={[
                                  styles.budgetAmountTotal,
                                  styles.groupBudgetAmountTotal,
                                  {
                                    color: overviewSecondaryForeground,
                                    opacity: 0.82,
                                  },
                                ]}>
                                {' / '}{HIDDEN_AMOUNT}
                              </Text>
                            </>
                          )}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.personalAllocationCaption,
                            styles.groupBudgetCaption,
                            { color: overviewSecondaryForeground, opacity: 0.82 },
                          ]}>
                          {amountsVisible
                            ? `${formatFamilyCurrency(activeFamilySummary.budgetCovered, activeFamilySummary.currency)} coperti · ${formatFamilyCurrency(activeFamilySummary.budgetSpent, activeFamilySummary.currency)} spesi`
                            : `${HIDDEN_AMOUNT} coperti · ${HIDDEN_AMOUNT} spesi`}
                        </Text>
                      </View>
                      <BudgetRadialChart
                        amountsVisible={amountsVisible}
                        spent={activeFamilySummary.budgetSpent}
                        textColor={overviewForeground}
                        total={activeFamilySummary.budgetTotal}
                      />
                    </View>
                  </>
                ) : activeFamilySummary ? (
                  <View style={styles.familyMembersOverview}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.overviewLabel,
                        { color: overviewSecondaryForeground, opacity: 0.82 },
                      ]}>
                      {activeFamilySummary.groupName.toLocaleUpperCase('it-IT')}
                    </Text>
                    <DashboardFamilyAvatars
                      foreground={overviewForeground}
                      large
                      members={activeFamilySummary.members}
                    />
                    <Text
                      style={[
                        styles.familyMembersCaption,
                        { color: overviewSecondaryForeground, opacity: 0.86 },
                      ]}>
                      Nessun budget condiviso · {activeFamilySummary.memberCount}{' '}
                      {activeFamilySummary.memberCount === 1 ? 'partecipante' : 'partecipanti'}
                    </Text>
                  </View>
                ) : (
                  <FamilyOverviewPage
                    amountsVisible={amountsVisible}
                    foreground={overviewForeground}
                    secondaryForeground={overviewSecondaryForeground}
                    summary={null}
                  />
                )}
              </Pressable>
            </View>
          )}
        </View>
      </Card>

      {renderedScope === 'personal' && firstDashboardVisit ? (
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
            accessibilityLabel={
              renderedScope === 'personal'
                ? 'Modifica il budget per categoria'
                : 'Apri il budget del gruppo'
            }
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              router.push((renderedScope === 'personal' ? '/budget' : '/family') as Href)
            }
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
          {renderedScope === 'groups' ? (
            activeFamilySummary?.budgets.length ? (
              activeFamilySummary.budgets.map((budget, index) => {
                const groupBudgetColors = ['#3D8BFF', '#FF8A3D', '#27D69A'];
                const groupBudgetSoftColors = isDark
                  ? ['#173A63', '#57331F', '#164D3B']
                  : ['#EAF3FF', '#FFF0E7', '#E5FBF3'];
                const visualIndex = index % groupBudgetColors.length;
                const progress = budget.monthlyLimit > 0
                  ? budget.spent / budget.monthlyLimit
                  : 0;
                return (
                  <View
                    key={budget.id}
                    accessible
                    accessibilityLabel={
                      amountsVisible
                        ? `${budget.category}: ${formatFamilyCurrency(budget.spent, activeFamilySummary.currency)} su ${formatFamilyCurrency(budget.monthlyLimit, activeFamilySummary.currency)}`
                        : `${budget.category}: importo nascosto`
                    }
                    style={styles.budgetCategoryRow}>
                    <View style={styles.budgetCategoryTop}>
                      <View
                        style={[
                          styles.budgetCategoryIconBox,
                          { backgroundColor: groupBudgetSoftColors[visualIndex] },
                        ]}>
                        <Text
                          style={[
                            styles.budgetCategoryIcon,
                            { color: groupBudgetColors[visualIndex] },
                          ]}>
                          category
                        </Text>
                      </View>
                      <View style={styles.budgetCategoryDetails}>
                        <View style={styles.budgetCategoryNameRow}>
                          <Text
                            style={[styles.budgetCategoryName, { color: colors.text }]}>
                            {budget.category}
                          </Text>
                          <Text
                            style={[
                              styles.budgetCategoryPercentage,
                              { color: groupBudgetColors[visualIndex] },
                            ]}>
                            {amountsVisible ? `${Math.round(progress * 100)}%` : '••%'}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.budgetCategoryAmount,
                            { color: colors.textSecondary },
                          ]}>
                          {amountsVisible
                            ? `${formatFamilyCurrency(budget.spent, activeFamilySummary.currency)} di ${formatFamilyCurrency(budget.monthlyLimit, activeFamilySummary.currency)}`
                            : `${HIDDEN_AMOUNT} di ${HIDDEN_AMOUNT}`}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.budgetCategoryTrack,
                        { backgroundColor: groupBudgetSoftColors[visualIndex] },
                      ]}>
                      <View
                        style={[
                          styles.budgetCategoryFill,
                          {
                            backgroundColor: groupBudgetColors[visualIndex],
                            width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyBudgetCopy, { color: colors.textSecondary }]}>
                Nessun budget per categoria impostato per questo gruppo.
              </Text>
            )
          ) : budgetRows.map((budget) => {
            const visual = budget.id === 'wants'
              ? { color: '#FF8A3D', soft: isDark ? '#57331F' : '#FFF0E7' }
              : budget.id === 'savings'
                ? { color: '#27D69A', soft: isDark ? '#164D3B' : '#E5FBF3' }
                : { color: '#3D8BFF', soft: isDark ? '#173A63' : '#EAF3FF' };
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
          {(renderedScope === 'groups' ? groupChartTransactions.length > 0 : hasChartTransactions) ? (
            <SpendingDonutChart
              amountsVisible={amountsVisible}
              totalLabel={
                chartPeriod === 'month'
                  ? 'TOTALE SPESO NEL CICLO'
                  : 'TOTALE SPESO'
              }
              transactions={renderedScope === 'groups' ? groupChartTransactions : chartTransactions}
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

      {renderedScope === 'personal' && dashboardRecurrences.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apri ${dashboardRecurrences.length} ricorrenze`}
          onPress={() => router.push('/recurring-payments' as Href)}
          style={({ pressed }) => pressed && styles.iconPressed}>
          <Card style={styles.recurrencesCard}>
            <View style={styles.recurrencesHeader}>
              <View style={styles.flex}>
                <Text style={[styles.recurrencesTitle, { color: colors.text }]}>Ricorrenze</Text>
              </View>
              <Text style={[styles.materialIcon, { color: colors.textSecondary }]}>chevron_right</Text>
            </View>
            <View style={styles.recurrencesList}>
              {dashboardRecurrences.slice(0, 3).map((series) => (
                <View key={series.id} style={styles.recurrenceRow}>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.recurrenceName, { color: colors.text }]}>{series.name}</Text>
                    <Text style={[styles.recurrenceMeta, { color: colors.textSecondary }]}>
                      {series.status === 'paused' ? 'In pausa' : frequencyLabels[series.frequency]}
                    </Text>
                  </View>
                  <Text style={[styles.recurrenceAmount, { color: series.direction === 'income' ? colors.positive : colors.text }]}>
                    {amountsVisible
                      ? `${series.direction === 'income' ? '+' : '−'} ${formatEuro(series.amount)}`
                      : HIDDEN_AMOUNT}
                  </Text>
                </View>
              ))}
            </View>
            {dashboardRecurrences.length > 3 ? (
              <Text style={[styles.cardLink, { color: colors.accent }]}>Altre {dashboardRecurrences.length - 3} ricorrenze</Text>
            ) : null}
          </Card>
        </Pressable>
      ) : null}

      {renderedScope === 'personal' && coachInsight ? (
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

      {renderedScope === 'personal' && featuredGoal ? (
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

      {renderedScope === 'groups' && activeFamilySummary?.goalTarget ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apri gli obiettivi condivisi di ${activeFamilySummary.groupName}`}
          onPress={() => router.push('/family' as Href)}
          style={({ pressed }) => pressed && styles.iconPressed}>
          <Card style={styles.contentCard}>
            <View style={styles.goalTop}>
              <View style={styles.flex}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
                  {activeFamilySummary.sharedGoalCount === 1
                    ? 'OBIETTIVO CONDIVISO'
                    : 'OBIETTIVI CONDIVISI'}
                </Text>
                <Text style={[styles.goalName, { color: colors.text }]}>
                  {activeFamilySummary.groupName}
                </Text>
                <Text style={[styles.goalAmount, { color: colors.textSecondary }]}>
                  {amountsVisible
                    ? `${formatFamilyCurrency(activeFamilySummary.goalSaved, activeFamilySummary.currency)} di ${formatFamilyCurrency(activeFamilySummary.goalTarget, activeFamilySummary.currency)}`
                    : `${HIDDEN_AMOUNT} di ${HIDDEN_AMOUNT}`}
                </Text>
              </View>
              <Text style={[styles.goalPercent, { color: colors.accent }]}>
                {amountsVisible
                  ? `${Math.round((activeFamilySummary.goalSaved / activeFamilySummary.goalTarget) * 100)}%`
                  : '••%'}
              </Text>
            </View>
            <ProgressBar
              value={activeFamilySummary.goalSaved / activeFamilySummary.goalTarget}
            />
            <Text style={[styles.cardLink, { color: colors.accent }]}>Apri il gruppo</Text>
          </Card>
        </Pressable>
      ) : null}

      {renderedScope === 'personal' && budgetAlert ? (
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

      {renderedScope === 'personal' && !hasRecentData ? (
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
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
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

function budgetArcColor(spentProgress: number) {
  const progress = Math.min(1, Math.max(0, spentProgress));
  return progress <= 0.5
    ? mixHexColors('#20C58A', '#FFBF3F', progress / 0.5)
    : mixHexColors('#FFBF3F', '#F05A4F', (progress - 0.5) / 0.5);
}

function BudgetRadialChart({
  spent,
  textColor,
  total,
  amountsVisible,
}: {
  spent: number;
  textColor: string;
  total: number;
  amountsVisible: boolean;
}) {
  const spentProgress = total > 0 ? spent / total : 0;
  const remainingProgress = total > 0 ? 1 - spentProgress : 0;
  const visibleProgress = Math.min(1, Math.max(0, remainingProgress));
  const arcLength = BUDGET_RADIAL_CIRCUMFERENCE * BUDGET_RADIAL_ARC_SHARE;
  const remainingLength = arcLength * visibleProgress;
  const arcColor = budgetArcColor(spentProgress);
  const radialSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BUDGET_RADIAL_SIZE}" height="${BUDGET_RADIAL_SIZE}" viewBox="0 0 ${BUDGET_RADIAL_SIZE} ${BUDGET_RADIAL_SIZE}">`,
    `<circle cx="${BUDGET_RADIAL_CENTER}" cy="${BUDGET_RADIAL_CENTER}" r="${BUDGET_RADIAL_RADIUS}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="${BUDGET_RADIAL_STROKE}" stroke-dasharray="${arcLength} ${BUDGET_RADIAL_CIRCUMFERENCE - arcLength}" stroke-linecap="round" transform="rotate(180 ${BUDGET_RADIAL_CENTER} ${BUDGET_RADIAL_CENTER})"/>`,
    remainingLength > 0
      ? `<circle cx="${BUDGET_RADIAL_CENTER}" cy="${BUDGET_RADIAL_CENTER}" r="${BUDGET_RADIAL_RADIUS}" fill="none" stroke="${arcColor}" stroke-width="${BUDGET_RADIAL_STROKE}" stroke-dasharray="${remainingLength} ${BUDGET_RADIAL_CIRCUMFERENCE - remainingLength}" stroke-linecap="round" transform="rotate(180 ${BUDGET_RADIAL_CENTER} ${BUDGET_RADIAL_CENTER})"/>`
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
        <Text style={[styles.budgetRadialPercentage, { color: textColor }]}>
          {amountsVisible ? `${percentage}%` : '••%'}
        </Text>
      </View>
    </View>
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
          GRUPPI
        </Text>
        <Text style={[styles.familyEmptyTitle, { color: foreground }]}>Crea il tuo gruppo</Text>
        <Text style={[styles.overviewHint, { color: secondaryForeground, opacity: 0.82 }]}>
          Invita altre persone e scegli cosa condividere.
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
    ? 'BUDGET DEL GRUPPO'
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
  large = false,
}: {
  members: FamilyDashboardSummary['members'];
  foreground: string;
  large?: boolean;
}) {
  const visibleMembers = members.slice(0, large ? 4 : 3);
  const overflow = members.length - visibleMembers.length;
  return (
    <View style={[styles.dashboardAvatars, large && styles.dashboardAvatarsLarge]}>
      {visibleMembers.map((member, index) => (
        <DashboardFamilyAvatar
          key={member.userId}
          foreground={foreground}
          index={index}
          large={large}
          member={member}
        />
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.dashboardAvatar,
            styles.dashboardAvatarOverflow,
            large && styles.dashboardAvatarLarge,
            large && styles.dashboardAvatarOverlapLarge,
            { borderColor: foreground },
          ]}>
          <Text
            style={[
              styles.dashboardAvatarOverflowText,
              large && styles.dashboardAvatarOverflowTextLarge,
              { color: foreground },
            ]}>
            +{overflow}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function DashboardFamilyAvatar({
  member,
  index,
  foreground,
  large,
}: {
  member: FamilyDashboardSummary['members'][number];
  index: number;
  foreground: string;
  large: boolean;
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
        style={[
          styles.dashboardAvatar,
          large && styles.dashboardAvatarLarge,
          index > 0 && (large ? styles.dashboardAvatarOverlapLarge : styles.dashboardAvatarOverlap),
          { borderColor: foreground },
        ]}
      />
    );
  }
  return (
    <View
      style={[
        styles.dashboardAvatar,
        styles.dashboardAvatarFallback,
        large && styles.dashboardAvatarLarge,
        index > 0 && (large ? styles.dashboardAvatarOverlapLarge : styles.dashboardAvatarOverlap),
        { borderColor: foreground },
      ]}>
      <Text
        style={[
          styles.dashboardAvatarInitial,
          large && styles.dashboardAvatarInitialLarge,
          { color: foreground },
        ]}>
        {initial}
      </Text>
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
  dashboardTabs: {
    minHeight: 40,
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    marginHorizontal: -20,
    marginTop: 2,
    marginBottom: 14,
  },
  dashboardTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dashboardTabPressed: { opacity: 0.62 },
  dashboardTabLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  dashboardTabLabelSelected: { fontFamily: font.bodySemiBold },
  dashboardTabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    height: 4,
  },
  dashboardPagesViewport: {
    marginHorizontal: -20,
    overflow: 'hidden',
  },
  dashboardPagesTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dashboardMainView: { flexShrink: 0, paddingHorizontal: 20 },
  groupChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  groupChip: {
    minHeight: 32,
    maxWidth: 150,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  groupChipLabel: { fontFamily: font.bodySemiBold, fontSize: 11 },
  overviewCard: { marginBottom: 12, padding: 11, overflow: 'hidden' },
  overviewContent: { height: 138 },
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
  groupBudgetAmount: { fontSize: 29, lineHeight: 38 },
  budgetAmountTotal: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
  },
  groupBudgetAmountTotal: { fontSize: 14 },
  personalAllocationCaption: {
    fontFamily: font.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  groupBudgetCaption: { fontSize: 12, lineHeight: 17 },
  recurrencesCard: { gap: 14 },
  recurrencesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recurrencesTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  recurrencesList: { gap: 11 },
  recurrenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recurrenceName: { fontFamily: font.bodySemiBold, fontSize: 14 },
  recurrenceMeta: { fontFamily: font.body, fontSize: 11, marginTop: 2 },
  recurrenceAmount: { fontFamily: font.dataMedium, fontSize: 13 },
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
  groupBudgetName: {
    fontFamily: font.displaySemiBold,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 1,
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
  familyEmptyTitle: { fontFamily: font.displayBold, fontSize: 25, lineHeight: 33, marginTop: 10 },
  familyImpactCaption: { fontFamily: font.bodyMedium, fontSize: 11, lineHeight: 16, marginTop: 13 },
  familyMembersOverview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  familyMembersCaption: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  dashboardAvatars: { flexDirection: 'row', alignItems: 'center', paddingRight: 1 },
  dashboardAvatarsLarge: { flex: 1, justifyContent: 'center', paddingRight: 0 },
  dashboardAvatar: { width: 27, height: 27, borderRadius: 14, borderWidth: 1.5 },
  dashboardAvatarLarge: { width: 48, height: 48, borderRadius: 24, borderWidth: 2 },
  dashboardAvatarOverlap: { marginLeft: -7 },
  dashboardAvatarOverlapLarge: { marginLeft: -12 },
  dashboardAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  dashboardAvatarInitial: { fontFamily: font.displayBold, fontSize: 10 },
  dashboardAvatarInitialLarge: { fontSize: 16 },
  dashboardAvatarOverflow: { marginLeft: -7, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  dashboardAvatarOverflowText: { fontFamily: font.dataMedium, fontSize: 8 },
  dashboardAvatarOverflowTextLarge: { fontSize: 12 },
  overviewHint: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 18 },
  delta: { fontFamily: font.dataMedium, fontSize: 11, lineHeight: 16, marginTop: 18 },
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
  emptyBudgetCopy: { fontFamily: font.body, fontSize: 13, lineHeight: 19 },
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
