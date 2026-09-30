import { Image } from 'expo-image';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  Card,
  GlassNavBar,
  GlassSegmentedControl,
  LargeTitle,
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
  formatWholeEuro,
  summarizeBudgets,
} from '@/lib/onboarding';
import {
  type FamilyDashboardSummary,
  familyDashboardSummaryQuery,
  familyGroupsQuery,
  getActiveFamilyGroupId,
  setActiveFamilyGroupId,
} from '@/lib/family';
import { queryKeys } from '@/lib/query-client';
import { useAppState } from '@/providers/app-provider';
import { frequencyLabels } from '@/lib/recurring-payments';

const periodLabels: { id: DashboardPeriod; label: string }[] = [
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
  { id: 'year', label: 'Anno' },
];

const CATEGORY_TILE_VISUALS = [
  { color: '#3D8BFF', soft: '#EAF3FF', darkSoft: '#173A63' },
  { color: '#FF8A3D', soft: '#FFF0E7', darkSoft: '#57331F' },
  { color: '#27D69A', soft: '#E5FBF3', darkSoft: '#164D3B' },
];

// Risultato stabile tra i render finché i dati non cambiano.
function combineFamilySummaries(
  results: { data?: FamilyDashboardSummary }[],
): FamilyDashboardSummary[] {
  return results
    .map((result) => result.data)
    .filter((summary): summary is FamilyDashboardSummary => Boolean(summary));
}

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
  const userId = session?.user.id;
  const familyGroupsResult = useQuery({
    ...familyGroupsQuery(userId ?? ''),
    enabled: Boolean(userId),
  });
  const familyGroups = familyGroupsResult.data;
  const familySummaries = useQueries({
    queries: (familyGroups ?? []).map((group) => familyDashboardSummaryQuery(group.id)),
    combine: combineFamilySummaries,
  });
  const [familyGroupIndex, setFamilyGroupIndex] = useState(0);
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] =
    useState<DashboardPeriod>('month');
  const [chartPeriod, setChartPeriod] = useState<DashboardPeriod>('month');
  const [periodPending, startPeriodTransition] = useTransition();

  // Gruppo selezionato l'ultima volta (preferenza locale per utente).
  useEffect(() => {
    if (!userId || !familyGroups?.length) return;
    let active = true;
    void getActiveFamilyGroupId(userId).then((storedGroupId) => {
      if (!active) return;
      const storedIndex = familyGroups.findIndex((item) => item.id === storedGroupId);
      setFamilyGroupIndex(storedIndex >= 0 ? storedIndex : 0);
    });
    return () => {
      active = false;
    };
  }, [familyGroups, userId]);

  // Al ritorno sulla dashboard rilegge gruppi e riepiloghi solo se scaduti.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void queryClient.refetchQueries({ queryKey: queryKeys.familyGroups(userId), stale: true });
      void queryClient.refetchQueries({ queryKey: ['family-dashboard-summary'], stale: true });
    }, [queryClient, userId]),
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
  const scopeProgress = useDerivedValue(() => (
    pageWidth.value > 0 ? -pageTranslateX.value / pageWidth.value : 0
  ));
  const handleDashboardScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextAtTop = event.nativeEvent.contentOffset.y <= 1;
      setDashboardAtTop((current) => current === nextAtTop ? current : nextAtTop);
    },
    [],
  );
  const activeDashboardPageHeight = dashboardPageHeights[dashboardScope];
  const categoryTileWidth = Math.max(0, (dashboardPageWidth - 40 - 16) / 3);

  return (
    <Screen
      animateFirstFocus
      transparentHeaderOnScroll
      onRefresh={refreshData}
      onScroll={handleDashboardScroll}
      fixedHeader={
        <GlassNavBar
          title="Dashboard"
          actions={
            <AppHeaderActions
              glass
              showNotifications
              leading={
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel={
                    amountsVisible ? 'Nascondi tutti gli importi' : 'Mostra tutti gli importi'
                  }
                  accessibilityState={{ checked: amountsVisible }}
                  hitSlop={6}
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
      }
      floatingActionPosition="free"
      floatingAction={
        <DraggableTransactionFab
          onPress={() => router.push('/add-transaction' as Href)}
        />
      }>
      <LargeTitle title="Dashboard" />
      <GlassSegmentedControl
        fontSize={14}
        options={[
          { id: 'personal', label: 'Personale' },
          { id: 'groups', label: 'Gruppi' },
        ]}
        progress={scopeProgress}
        selectedIndex={dashboardScope === 'groups' ? 1 : 0}
        onChange={(index) => selectDashboardScope(index === 1 ? 'groups' : 'personal')}
        style={styles.scopeSwitch}
      />

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

      <View style={styles.hero}>
        {renderedScope === 'personal' ? (
          <>
            <Pressable
              accessibilityHint="Apre la distribuzione tra macro-categorie e categorie"
              accessibilityLabel="Modifica l’allocazione del budget"
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.push('/budget' as Href)}
              style={({ pressed }) => [styles.heroLabelRow, pressed && styles.iconPressed]}>
              <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
                BUDGET · {formatFinancialCycle(financialCycle).toLocaleUpperCase('it-IT')}
              </Text>
              <Text style={[styles.heroLabelIcon, { color: colors.textSecondary }]}>tune</Text>
            </Pressable>
            <BudgetGauge
              amountsVisible={amountsVisible}
              remainingLabel={formatWholeEuro(monthlyBudgetRemaining)}
              spent={monthlyBudgetUsed}
              total={monthlyBudget}
              totalLabel={formatWholeEuro(monthlyBudget)}
            />
            {groupMonthlyAllocation > 0 ? (
              <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
                {amountsVisible
                  ? `${formatWholeEuro(grossBudgetMonthlyIncome)} mensili · ${formatWholeEuro(groupMonthlyAllocation)} ai gruppi`
                  : `${HIDDEN_AMOUNT} mensili · ${HIDDEN_AMOUNT} ai gruppi`}
              </Text>
            ) : null}
          </>
        ) : activeFamilySummary ? (
          <>
            <Pressable
              accessibilityHint="Apre la sezione Gruppi"
              accessibilityLabel={`Apri il gruppo ${activeFamilySummary.groupName}`}
              accessibilityRole="button"
              onPress={() => router.push('/family' as Href)}
              style={({ pressed }) => [styles.heroGroupRow, pressed && styles.iconPressed]}>
              <DashboardFamilyAvatars
                borderColor={colors.background}
                fallbackBackground={colors.accentSoft}
                foreground={colors.accent}
                members={activeFamilySummary.members}
              />
              <Text numberOfLines={1} style={[styles.heroGroupName, { color: colors.text }]}>
                {activeFamilySummary.groupName}
              </Text>
              <Text style={[styles.heroLabelIcon, styles.heroChevron, { color: colors.textSecondary }]}>
                chevron_right
              </Text>
            </Pressable>
            {activeFamilySummary.budgetTotal > 0 ? (
              <>
                <Pressable
                  accessibilityLabel="Apri il budget del gruppo"
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => router.push('/family' as Href)}
                  style={({ pressed }) => [styles.heroLabelRow, pressed && styles.iconPressed]}>
                  <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
                    BUDGET CONDIVISO
                  </Text>
                  <Text style={[styles.heroLabelIcon, { color: colors.textSecondary }]}>tune</Text>
                </Pressable>
                <BudgetGauge
                  amountsVisible={amountsVisible}
                  remainingLabel={formatFamilyCurrency(
                    activeFamilySummary.budgetRemaining,
                    activeFamilySummary.currency,
                  )}
                  spent={activeFamilySummary.budgetSpent}
                  total={activeFamilySummary.budgetTotal}
                  totalLabel={formatFamilyCurrency(
                    activeFamilySummary.budgetTotal,
                    activeFamilySummary.currency,
                  )}
                />
                <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
                  {amountsVisible
                    ? `${formatFamilyCurrency(activeFamilySummary.budgetCovered, activeFamilySummary.currency)} coperti · ${formatFamilyCurrency(activeFamilySummary.budgetSpent, activeFamilySummary.currency)} spesi`
                    : `${HIDDEN_AMOUNT} coperti · ${HIDDEN_AMOUNT} spesi`}
                </Text>
              </>
            ) : (
              <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
                Nessun budget condiviso · {activeFamilySummary.memberCount}{' '}
                {activeFamilySummary.memberCount === 1 ? 'partecipante' : 'partecipanti'}
              </Text>
            )}
          </>
        ) : (
          <Pressable
            accessibilityHint="Apre la sezione Gruppi"
            accessibilityLabel="Crea il tuo gruppo"
            accessibilityRole="button"
            onPress={() => router.push('/family' as Href)}
            style={({ pressed }) => [styles.heroEmpty, pressed && styles.iconPressed]}>
            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>GRUPPI</Text>
            <Text style={[styles.familyEmptyTitle, { color: colors.text }]}>Crea il tuo gruppo</Text>
            <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
              Invita altre persone e scegli cosa condividere.
            </Text>
          </Pressable>
        )}
      </View>

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

      <View style={styles.tilesHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Budget per categoria
        </Text>
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
          style={({ pressed }) => pressed && styles.iconPressed}>
          <Text style={[styles.tilesLink, { color: colors.accent }]}>Modifica</Text>
        </Pressable>
      </View>
      {(() => {
        const tiles = renderedScope === 'groups'
          ? (activeFamilySummary?.budgets ?? []).map((budget, index) => {
              const visual = CATEGORY_TILE_VISUALS[index % CATEGORY_TILE_VISUALS.length];
              return {
                id: budget.id,
                name: budget.category,
                icon: 'category',
                color: visual.color,
                soft: isDark ? visual.darkSoft : visual.soft,
                progress: budget.monthlyLimit > 0 ? budget.spent / budget.monthlyLimit : 0,
                spentLabel: formatFamilyCurrency(budget.spent, activeFamilySummary!.currency),
                amountLabel: formatFamilyCurrency(budget.monthlyLimit, activeFamilySummary!.currency),
              };
            })
          : budgetRows.map((budget) => {
              const visual = CATEGORY_TILE_VISUALS[
                budget.id === 'wants' ? 1 : budget.id === 'savings' ? 2 : 0
              ];
              return {
                id: budget.id,
                name: budget.name,
                icon: budget.icon,
                color: visual.color,
                soft: isDark ? visual.darkSoft : visual.soft,
                progress: budget.progress,
                spentLabel: formatWholeEuro(budget.spent),
                amountLabel: formatWholeEuro(budget.amount),
              };
            });
        if (!tiles.length) {
          return (
            <Card style={styles.tilesEmpty}>
              <Text style={[styles.emptyBudgetCopy, { color: colors.textSecondary }]}>
                {renderedScope === 'groups'
                  ? 'Nessun budget per categoria impostato per questo gruppo.'
                  : 'Nessun budget per categoria impostato.'}
              </Text>
            </Card>
          );
        }
        return (
          <View style={styles.tiles}>
            {tiles.map((tile) => {
              const tileColor = tile.progress > 1 ? colors.negative : tile.color;
              return (
                <Card
                  key={tile.id}
                  style={[styles.tile, { width: categoryTileWidth }]}>
                  <View
                    accessible
                    accessibilityLabel={
                      amountsVisible
                        ? `${tile.name}: ${tile.spentLabel} su ${tile.amountLabel}, ${Math.round(tile.progress * 100)} per cento`
                        : `${tile.name}: importi nascosti`
                    }>
                    <View style={[styles.tileIconBox, { backgroundColor: tile.soft }]}>
                      <Text style={[styles.tileIcon, { color: tile.color }]}>{tile.icon}</Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.tileName, { color: colors.text }]}>
                      {tile.name}
                    </Text>
                    <Text style={[styles.tilePercentage, { color: tileColor }]}>
                      {amountsVisible ? `${Math.round(tile.progress * 100)}%` : '••%'}
                    </Text>
                    <View style={[styles.tileTrack, { backgroundColor: tile.soft }]}>
                      <View
                        style={[
                          styles.tileFill,
                          {
                            backgroundColor: tileColor,
                            width: `${Math.min(100, Math.max(0, tile.progress * 100))}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      numberOfLines={2}
                      style={[styles.tileAmounts, { color: colors.textSecondary }]}>
                      {amountsVisible ? tile.spentLabel : HIDDEN_AMOUNT}
                      {'\n'}di {amountsVisible ? tile.amountLabel : HIDDEN_AMOUNT}
                    </Text>
                  </View>
                </Card>
              );
            })}
          </View>
        );
      })()}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Spese per categoria
        </Text>
        <GlassSegmentedControl
          options={periodLabels}
          selectedIndex={Math.max(0, periodLabels.findIndex((period) => period.id === selectedPeriod))}
          onChange={(index) => {
            const period = periodLabels[index].id;
            setSelectedPeriod(period);
            startPeriodTransition(() => setChartPeriod(period));
          }}
        />
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
                      ? `${series.direction === 'income' ? '+' : '−'} ${formatWholeEuro(series.amount)}`
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
                    ? `${formatWholeEuro(savedTowardGoal)} di ${formatWholeEuro(featuredGoal.targetAmount)}`
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
                ? `Hai superato questa quota di ${formatWholeEuro(budgetAlert.spent - budgetAlert.amount)}.`
                : `Restano ${formatWholeEuro(budgetAlert.amount - budgetAlert.spent)} per questo mese.`
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

const GAUGE_SIZE = 250;
const GAUGE_CENTER = GAUGE_SIZE / 2;
const GAUGE_RADIUS = 104;
const GAUGE_STROKE = 18;
const GAUGE_HEIGHT = 136;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

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

// Semicerchio del budget rimanente, direttamente sul gradiente della schermata.
function BudgetGauge({
  spent,
  total,
  remainingLabel,
  totalLabel,
  amountsVisible,
}: {
  spent: number;
  total: number;
  remainingLabel: string;
  totalLabel: string;
  amountsVisible: boolean;
}) {
  const { colors, isDark } = useFlowndTheme();
  const spentProgress = total > 0 ? spent / total : 0;
  const visibleProgress = Math.min(1, Math.max(0, total > 0 ? 1 - spentProgress : 0));
  const arcLength = GAUGE_CIRCUMFERENCE / 2;
  const remainingLength = arcLength * visibleProgress;
  const trackColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(22,33,29,0.08)';
  const gaugeSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GAUGE_SIZE}" height="${GAUGE_SIZE}" viewBox="0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}">`,
    `<circle cx="${GAUGE_CENTER}" cy="${GAUGE_CENTER}" r="${GAUGE_RADIUS}" fill="none" stroke="${trackColor}" stroke-width="${GAUGE_STROKE}" stroke-dasharray="${arcLength} ${GAUGE_CIRCUMFERENCE - arcLength}" stroke-linecap="round" transform="rotate(180 ${GAUGE_CENTER} ${GAUGE_CENTER})"/>`,
    remainingLength > 0
      ? `<circle cx="${GAUGE_CENTER}" cy="${GAUGE_CENTER}" r="${GAUGE_RADIUS}" fill="none" stroke="${budgetArcColor(spentProgress)}" stroke-width="${GAUGE_STROKE}" stroke-dasharray="${remainingLength} ${GAUGE_CIRCUMFERENCE - remainingLength}" stroke-linecap="round" transform="rotate(180 ${GAUGE_CENTER} ${GAUGE_CENTER})"/>`
      : '',
    '</svg>',
  ].join('');
  const gaugeUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(gaugeSvg)}`;

  return (
    <View
      accessible
      accessibilityLabel={
        amountsVisible
          ? `${remainingLabel} disponibili su ${totalLabel}, ${Math.round(visibleProgress * 100)} per cento del budget`
          : 'Budget nascosto'
      }
      accessibilityRole="image"
      style={styles.gauge}>
      <Image
        cachePolicy="none"
        contentFit="contain"
        pointerEvents="none"
        source={{ uri: gaugeUri }}
        style={styles.gaugeImage}
      />
      <View pointerEvents="none" style={styles.gaugeCenter}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          numberOfLines={1}
          style={[styles.gaugeAmount, { color: colors.text }]}>
          {amountsVisible ? remainingLabel : HIDDEN_AMOUNT}
        </Text>
        <Text numberOfLines={1} style={[styles.gaugeCaption, { color: colors.textSecondary }]}>
          disponibili su {amountsVisible ? totalLabel : HIDDEN_AMOUNT}
        </Text>
      </View>
    </View>
  );
}

function DashboardFamilyAvatars({
  members,
  foreground,
  borderColor,
  fallbackBackground,
}: {
  members: FamilyDashboardSummary['members'];
  foreground: string;
  borderColor: string;
  fallbackBackground: string;
}) {
  const visibleMembers = members.slice(0, 3);
  const overflow = members.length - visibleMembers.length;
  return (
    <View style={styles.dashboardAvatars}>
      {visibleMembers.map((member, index) => (
        <DashboardFamilyAvatar
          key={member.userId}
          borderColor={borderColor}
          fallbackBackground={fallbackBackground}
          foreground={foreground}
          index={index}
          member={member}
        />
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.dashboardAvatar,
            styles.dashboardAvatarOverlap,
            styles.dashboardAvatarFallback,
            { borderColor, backgroundColor: fallbackBackground },
          ]}>
          <Text style={[styles.dashboardAvatarOverflowText, { color: foreground }]}>
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
  borderColor,
  fallbackBackground,
}: {
  member: FamilyDashboardSummary['members'][number];
  index: number;
  foreground: string;
  borderColor: string;
  fallbackBackground: string;
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
          index > 0 && styles.dashboardAvatarOverlap,
          { borderColor },
        ]}
      />
    );
  }
  return (
    <View
      style={[
        styles.dashboardAvatar,
        styles.dashboardAvatarFallback,
        index > 0 && styles.dashboardAvatarOverlap,
        { borderColor, backgroundColor: fallbackBackground },
      ]}>
      <Text style={[styles.dashboardAvatarInitial, { color: foreground }]}>
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
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardTabPressed: { opacity: 0.62 },
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
  recurrencesCard: { gap: 14 },
  recurrencesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recurrencesTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  recurrencesList: { gap: 11 },
  recurrenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recurrenceName: { fontFamily: font.bodySemiBold, fontSize: 14 },
  recurrenceMeta: { fontFamily: font.body, fontSize: 11, marginTop: 2 },
  recurrenceAmount: { fontFamily: font.dataMedium, fontSize: 13 },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 22,
    lineHeight: 26,
  },
  familyEmptyTitle: { fontFamily: font.displayBold, fontSize: 25, lineHeight: 33, marginTop: 10 },
  dashboardAvatars: { flexDirection: 'row', alignItems: 'center', paddingRight: 1 },
  dashboardAvatar: { width: 27, height: 27, borderRadius: 14, borderWidth: 1.5 },
  dashboardAvatarOverlap: { marginLeft: -7 },
  dashboardAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  dashboardAvatarInitial: { fontFamily: font.displayBold, fontSize: 10 },
  dashboardAvatarOverflowText: { fontFamily: font.dataMedium, fontSize: 8 },
  iconPressed: { opacity: 0.6 },
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
  emptyBudgetCopy: { fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  sectionHeader: { marginTop: 5, marginBottom: 10, gap: 9 },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
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
  scopeSwitch: { marginTop: 12, marginBottom: 16 },
  hero: { alignItems: 'center', paddingTop: 2, paddingBottom: 18 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  heroLabel: { fontFamily: font.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  heroLabelIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 16, lineHeight: 18 },
  heroChevron: { fontSize: 18, lineHeight: 20 },
  heroCaption: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    textAlign: 'center',
  },
  heroGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    maxWidth: '100%',
    paddingLeft: 8,
    paddingRight: 6,
    marginBottom: 6,
  },
  heroGroupName: { flexShrink: 1, fontFamily: font.bodySemiBold, fontSize: 13 },
  heroEmpty: { alignItems: 'center', paddingVertical: 18 },
  gauge: {
    width: GAUGE_SIZE,
    height: GAUGE_HEIGHT,
    marginTop: 10,
    overflow: 'hidden',
  },
  gaugeImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
  },
  gaugeCenter: {
    position: 'absolute',
    top: 58,
    left: 30,
    right: 30,
    alignItems: 'center',
  },
  gaugeAmount: {
    fontFamily: font.displayBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  gaugeCaption: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18 },
  tilesHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tilesLink: { fontFamily: font.bodySemiBold, fontSize: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  tilesEmpty: { marginBottom: 18 },
  tile: { padding: 12 },
  tileIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 17, lineHeight: 20 },
  tileName: { fontFamily: font.bodySemiBold, fontSize: 12, marginTop: 10 },
  tilePercentage: { fontFamily: font.dataMedium, fontSize: 18, lineHeight: 24, marginTop: 2 },
  tileTrack: { height: 6, borderRadius: 6, overflow: 'hidden', marginTop: 6 },
  tileFill: { height: '100%', borderRadius: 6 },
  tileAmounts: { fontFamily: font.data, fontSize: 10, lineHeight: 14, marginTop: 7 },
});
