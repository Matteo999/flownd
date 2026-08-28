import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Alert,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  Card,
  Field,
  PageHeader,
  PrimaryButton,
  Screen,
  ScreenScrollBridge,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { AppHeaderActions } from '@/components/app-header-actions';
import { DraggableTransactionFab } from '@/components/draggable-transaction-fab';
import { TransactionDateField } from '@/components/transaction-date-field';
import { TransactionKindSelector } from '@/components/transaction-kind-selector';
import {
  HIDDEN_AMOUNT,
  type DashboardPeriod,
  transactionsForPeriod,
} from '@/lib/dashboard';
import type { ExpenseDraft } from '@/lib/onboarding';
import { formatEuro } from '@/lib/onboarding';
import {
  categoriesForTransactionKind,
  normalizeTransactionDescription,
} from '@/lib/transaction-categories';
import {
  buildTimelineBins,
  buildTimelineRangeBins,
  groupTimelineTransactions,
  summarizeTransactions,
  type TimelineGroup,
} from '@/lib/timeline';
import { type TransactionUpdate, useApp } from '@/providers/app-provider';

const periods: { id: DashboardPeriod; label: string }[] = [
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
  { id: 'year', label: 'Anno' },
];

const transactionTimeFormatter = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
});

function transactionTimeLabel(transaction: ExpenseDraft, occurredAt: Date) {
  const knownTime = transaction.occurredTime?.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (knownTime) return `${knownTime[1]}:${knownTime[2]}`;
  if (['open_banking', 'file_import', 'ai_scan'].includes(transaction.source ?? '')) {
    return null;
  }
  return transactionTimeFormatter.format(occurredAt);
}

type TimelineSection = TimelineGroup & { data: ExpenseDraft[] };

function dashboardPeriod(value: string | undefined): DashboardPeriod | null {
  return value === 'week' || value === 'month' || value === 'year'
    ? value
    : null;
}

function periodStart(date: Date, period: DashboardPeriod) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
  } else if (period === 'month') {
    start.setDate(1);
  } else {
    start.setMonth(0, 1);
  }
  return start;
}

function isCurrentTimelinePeriod(date: Date, period: DashboardPeriod) {
  return periodStart(date, period).getTime() ===
    periodStart(new Date(), period).getTime();
}

function anchorForTimelinePeriod(date: Date, period: DashboardPeriod) {
  const now = new Date();
  if (isCurrentTimelinePeriod(date, period)) return now;
  if (period === 'week') {
    const end = periodStart(date, 'week');
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }
  if (period === 'month') {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function shiftTimelinePeriod(
  date: Date,
  period: DashboardPeriod,
  direction: -1 | 1,
) {
  const shifted = periodStart(date, period);
  if (period === 'week') {
    shifted.setDate(shifted.getDate() + direction * 7);
  }
  if (period === 'month') {
    shifted.setMonth(shifted.getMonth() + direction);
  }
  if (period === 'year') {
    shifted.setFullYear(shifted.getFullYear() + direction);
  }
  if (shifted >= periodStart(new Date(), period)) return new Date();
  return anchorForTimelinePeriod(shifted, period);
}

function formatPeriodAnchor(date: Date, period: DashboardPeriod) {
  if (period === 'year') return String(date.getFullYear());
  if (period === 'month') {
    return new Intl.DateTimeFormat('it-IT', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
  const start = periodStart(date, 'week');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const formatter = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function calendarDayNumber(date: Date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

function customRangeDayCount(range: { start: Date; end: Date }) {
  return Math.max(
    1,
    calendarDayNumber(range.end) - calendarDayNumber(range.start) + 1,
  );
}

function formatCustomDateRange(range: { start: Date; end: Date }) {
  const startFormatter = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year:
      range.start.getFullYear() === range.end.getFullYear()
        ? undefined
        : 'numeric',
  });
  const endFormatter = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${startFormatter.format(range.start)} – ${endFormatter.format(range.end)}`;
}

export default function TimelineScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{
    category?: string | string[];
    period?: string | string[];
    filterToken?: string | string[];
    filterQuery?: string | string[];
    filterCategories?: string | string[];
    filterStart?: string | string[];
    filterEnd?: string | string[];
  }>();
  const {
    transactions,
    financialAccounts,
    amountsVisible,
    planTier,
    categorizeTransactions,
    updateTransaction,
    deleteTransaction,
    saving,
    error,
    clearError,
    refreshData,
  } = useApp();
  const paramCategory = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const requestedPeriod = Array.isArray(params.period)
    ? params.period[0]
    : params.period;
  const initialPeriod = dashboardPeriod(requestedPeriod) ?? 'month';
  const [query, setQuery] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>(
    paramCategory ? [paramCategory] : [],
  );
  const [customDateRange, setCustomDateRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [editingTransaction, setEditingTransaction] =
    useState<ExpenseDraft | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkCategoryVisible, setBulkCategoryVisible] = useState(false);
  const [selectedPeriod, setSelectedPeriod] =
    useState<DashboardPeriod>(initialPeriod);
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Rilegge i movimenti al ritorno dai form/import, anche con tab native congelate.
      void refreshData();
    }, [refreshData]),
  );

  const refreshTimeline = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshData, refreshing]);

  const appliedFilterToken = Array.isArray(params.filterToken)
    ? params.filterToken[0]
    : params.filterToken;
  const appliedFilterTokenRef = useRef<string | undefined>(undefined);
  const appliedFilterQuery = Array.isArray(params.filterQuery)
    ? params.filterQuery[0]
    : params.filterQuery;
  const appliedFilterCategories = Array.isArray(params.filterCategories)
    ? params.filterCategories[0]
    : params.filterCategories;
  const appliedFilterStart = Array.isArray(params.filterStart)
    ? params.filterStart[0]
    : params.filterStart;
  const appliedFilterEnd = Array.isArray(params.filterEnd)
    ? params.filterEnd[0]
    : params.filterEnd;
  useFocusEffect(
    useCallback(() => {
      if (
        !appliedFilterToken ||
        appliedFilterTokenRef.current === appliedFilterToken
      ) return;
      appliedFilterTokenRef.current = appliedFilterToken;
      setQuery(appliedFilterQuery ?? '');
      try {
        const parsed = JSON.parse(appliedFilterCategories ?? '[]');
        setCategoryFilters(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCategoryFilters([]);
      }
      if (appliedFilterStart && appliedFilterEnd) {
        const start = new Date(appliedFilterStart);
        const end = new Date(appliedFilterEnd);
        setCustomDateRange(
          Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
            ? null
            : { start, end },
        );
      } else {
        setCustomDateRange(null);
      }
      router.setParams({ category: undefined });
    }, [
      appliedFilterCategories,
      appliedFilterEnd,
      appliedFilterQuery,
      appliedFilterStart,
      appliedFilterToken,
    ]),
  );

  function openFiltersScreen() {
    const fallbackStart = periodStart(periodAnchor, selectedPeriod);
    const fallbackEnd = new Date(periodAnchor);
    router.push({
      pathname: '/timeline-filters',
      params: {
        query,
        categories: JSON.stringify(categoryFilters),
        start: customDateRange?.start.toISOString() ?? '',
        end: customDateRange?.end.toISOString() ?? '',
        fallbackStart: fallbackStart.toISOString(),
        fallbackEnd: fallbackEnd.toISOString(),
      },
    } as Href);
  }

  function selectPeriod(period: DashboardPeriod) {
    setSelectedPeriod(period);
    setPeriodAnchor((current) => anchorForTimelinePeriod(current, period));
  }

  const periodLabel = useMemo(
    () => formatPeriodAnchor(periodAnchor, selectedPeriod),
    [periodAnchor, selectedPeriod],
  );
  const currentPeriod = isCurrentTimelinePeriod(periodAnchor, selectedPeriod);

  const hasActiveFilters = Boolean(
    query.trim() || categoryFilters.length || customDateRange,
  );
  const customRangeDays = customDateRange
    ? customRangeDayCount(customDateRange)
    : 0;
  const customRangeGranularity =
    customRangeDays <= 14
      ? 'giornaliero'
      : customRangeDays <= 90
        ? 'settimanale'
        : 'mensile';

  const { summary, bins, groups, visibleTransactions } = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('it');
    const normalizedCategories = new Set(
      categoryFilters.map((category) => category.toLocaleLowerCase('it')),
    );
    const periodTransactions = customDateRange
      ? transactions.filter((transaction) => {
          if (!transaction.occurredAt) return false;
          const occurredAt = new Date(transaction.occurredAt);
          return occurredAt >= customDateRange.start && occurredAt <= customDateRange.end;
        })
      : transactionsForPeriod(transactions, selectedPeriod, periodAnchor);
    const visibleTransactions = periodTransactions.filter((transaction) => {
      const category = transaction.category.trim() || 'Altro';
      const normalizedTransactionCategory = category.toLocaleLowerCase('it');
      const matchesCategory =
        !normalizedCategories.size ||
        normalizedCategories.has(normalizedTransactionCategory);
      const matchesQuery =
        !normalizedQuery ||
        transaction.description
          .toLocaleLowerCase('it')
          .includes(normalizedQuery) ||
        normalizedTransactionCategory.includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
    return {
      summary: summarizeTransactions(visibleTransactions),
      bins: customDateRange
        ? buildTimelineRangeBins(
            visibleTransactions,
            customDateRange.start,
            customDateRange.end,
          )
        : buildTimelineBins(visibleTransactions, selectedPeriod, periodAnchor),
      groups: groupTimelineTransactions(
        visibleTransactions,
        customDateRange && customRangeDayCount(customDateRange) > 90
          ? 'year'
          : customDateRange
            ? 'month'
            : selectedPeriod,
      ),
      visibleTransactions,
    };
  }, [categoryFilters, customDateRange, periodAnchor, query, selectedPeriod, transactions]);
  const sections = useMemo<TimelineSection[]>(
    () => groups.map((group) => ({ ...group, data: group.transactions })),
    [groups],
  );
  const selectableTransactions = useMemo(
    () =>
      visibleTransactions.filter(
        (transaction) =>
          transaction.id &&
          !transaction.internalTransfer &&
          transaction.source !== 'manual_balance_adjustment',
      ),
    [visibleTransactions],
  );
  const selectedTransactions = useMemo(
    () =>
      selectableTransactions.filter(
        (transaction) =>
          transaction.id && selectedTransactionIds.has(transaction.id),
      ),
    [selectableTransactions, selectedTransactionIds],
  );
  const selectedKind = selectedTransactions[0]?.kind ?? 'expense';
  const visibleExpenseCount = selectableTransactions.filter(
    (transaction) => (transaction.kind ?? 'expense') === 'expense',
  ).length;
  const visibleIncomeCount = selectableTransactions.length - visibleExpenseCount;

  function closeSelectionMode() {
    setBulkCategoryVisible(false);
    setSelectedTransactionIds(new Set());
    setSelectionMode(false);
  }

  function toggleTransactionSelection(transaction: ExpenseDraft) {
    if (!transaction.id || transaction.internalTransfer) return;
    const transactionKind = transaction.kind ?? 'expense';
    if (
      !selectedTransactionIds.has(transaction.id) &&
      selectedTransactions.length &&
      selectedKind !== transactionKind
    ) {
      Alert.alert(
        'Tipi diversi',
        'Entrate e uscite vanno categorizzate separatamente.',
      );
      return;
    }
    setSelectionMode(true);
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      if (next.has(transaction.id!)) next.delete(transaction.id!);
      else next.add(transaction.id!);
      return next;
    });
  }

  function selectVisibleKind(kind: 'expense' | 'income') {
    setSelectedTransactionIds(
      new Set(
        selectableTransactions
          .filter((transaction) => (transaction.kind ?? 'expense') === kind)
          .flatMap((transaction) => (transaction.id ? [transaction.id] : [])),
      ),
    );
  }

  function selectSimilarTransactions() {
    if (!selectedTransactions.length) return;
    const descriptionKeys = new Set(
      selectedTransactions.map((transaction) =>
        normalizeTransactionDescription(transaction.description),
      ),
    );
    setSelectedTransactionIds(
      new Set(
        selectableTransactions
          .filter(
            (transaction) =>
              (transaction.kind ?? 'expense') === selectedKind &&
              descriptionKeys.has(
                normalizeTransactionDescription(transaction.description),
              ),
          )
          .flatMap((transaction) => (transaction.id ? [transaction.id] : [])),
      ),
    );
  }
  function clearFilters() {
    setQuery('');
    setCategoryFilters([]);
    setCustomDateRange(null);
    router.setParams({ category: undefined });
  }

  return (
    <Screen
      scroll={false}
      style={styles.virtualizedScreen}
      floatingActionPosition={selectionMode ? 'center' : 'free'}
      floatingAction={
        selectionMode ? (
          selectedTransactions.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Categorizza ${selectedTransactions.length} movimenti`}
              onPress={() => setBulkCategoryVisible(true)}
              style={({ pressed }) => [
                styles.categorizeFloatingAction,
                { backgroundColor: colors.accent },
                pressed && styles.fabPressed,
              ]}>
              <Text style={[styles.categorizeFloatingIcon, { color: colors.onAccent }]}>category</Text>
              <Text style={[styles.categorizeFloatingText, { color: colors.onAccent }]}>
                Categorizza · {selectedTransactions.length}
              </Text>
            </Pressable>
          ) : undefined
        ) : (
          <DraggableTransactionFab
            onPress={() => router.push('/add-transaction' as Href)}
          />
        )
      }>
      <View style={styles.timelineHeaderLayer}>
        <PageHeader
          collapseInPlace
          compactBorderless
          title="Timeline"
          action={
            <AppHeaderActions
              leading={
                <View style={styles.headerTools}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      selectionMode
                        ? 'Chiudi selezione multipla'
                        : 'Seleziona più movimenti'
                    }
                    onPress={() =>
                      selectionMode
                        ? closeSelectionMode()
                        : setSelectionMode(true)
                    }
                    style={({ pressed }) => [
                      styles.headerButton,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.materialIcon, { color: colors.text }]}>
                      {selectionMode ? 'close' : 'checklist'}
                    </Text>
                  </Pressable>
                  {!selectionMode ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Apri filtri"
                      onPress={openFiltersScreen}
                      style={({ pressed }) => [
                        styles.headerButton,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.materialIcon, { color: colors.text }]}>
                        discover_tune
                      </Text>
                      {hasActiveFilters ? (
                        <View
                          style={[
                            styles.filterIndicator,
                            { backgroundColor: colors.accent },
                          ]}
                        />
                      ) : null}
                    </Pressable>
                  ) : null}
                </View>
              }
            />
          }
        />
      </View>
      <ScreenScrollBridge>
        {(onScroll) => (
          <Animated.SectionList<ExpenseDraft, TimelineSection>
            style={styles.timelineList}
            sections={sections}
            keyExtractor={(transaction, index) =>
              transaction.id ??
              `${transaction.occurredAt ?? 'undated'}-${transaction.description}-${index}`
            }
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={60}
            windowSize={5}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshTimeline}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.timelineContent}
            ListHeaderComponent={
              <>
                {selectionMode ? (
                  <Card
                    style={[
                      styles.bulkToolbar,
                      { backgroundColor: colors.accentSoft },
                    ]}>
                    <View style={styles.bulkToolbarHeader}>
                      <Text style={[styles.bulkToolbarTitle, { color: colors.text }]}>
                        {selectedTransactions.length
                          ? `${selectedTransactions.length} selezionati`
                          : 'Scegli i movimenti'}
                      </Text>
                      {selectedTransactions.length ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelectedTransactionIds(new Set())}>
                          <Text style={[styles.bulkToolbarLink, { color: colors.accent }]}>
                            Deseleziona
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.bulkActions}>
                      <BulkAction
                        disabled={!visibleExpenseCount}
                        label={`Uscite (${visibleExpenseCount})`}
                        onPress={() => selectVisibleKind('expense')}
                      />
                      <BulkAction
                        disabled={!visibleIncomeCount}
                        label={`Entrate (${visibleIncomeCount})`}
                        onPress={() => selectVisibleKind('income')}
                      />
                      {selectedTransactions.length ? (
                        <BulkAction
                          label="Seleziona simili"
                          onPress={selectSimilarTransactions}
                        />
                      ) : null}
                    </View>
                  </Card>
                ) : null}

                {customDateRange ? (
                  <View
                    style={[
                      styles.customRangeBanner,
                      { backgroundColor: colors.accentSoft },
                    ]}>
                    <Text
                      style={[styles.customRangeIcon, { color: colors.accent }]}>
                      date_range
                    </Text>
                    <View style={styles.flex}>
                      <Text
                        style={[styles.customRangeTitle, { color: colors.text }]}>
                        Intervallo personalizzato
                      </Text>
                      <Text
                        style={[
                          styles.customRangeCopy,
                          { color: colors.textSecondary },
                        ]}>
                        {formatCustomDateRange(customDateRange)} · {customRangeDays}{' '}
                        giorni · grafico {customRangeGranularity}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Modifica intervallo personalizzato"
                      onPress={openFiltersScreen}
                      style={({ pressed }) => [
                        styles.customRangeEdit,
                        pressed && styles.pressed,
                      ]}>
                      <Text
                        style={[
                          styles.customRangeEditText,
                          { color: colors.accent },
                        ]}>
                        Modifica
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View
                      style={[
                        styles.periodControl,
                        { backgroundColor: colors.sunken },
                      ]}>
                      {periods.map((period) => {
                        const selected = selectedPeriod === period.id;
                        return (
                          <Pressable
                            key={period.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            hitSlop={4}
                            onPress={() => selectPeriod(period.id)}
                            style={[
                              styles.periodButton,
                              selected && { backgroundColor: colors.surface },
                            ]}>
                            <Text
                              style={[
                                styles.periodText,
                                {
                                  color: selected
                                    ? colors.text
                                    : colors.textSecondary,
                                },
                              ]}>
                              {period.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.periodNavigator}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Periodo precedente"
                        hitSlop={8}
                        onPress={() =>
                          setPeriodAnchor((date) =>
                            shiftTimelinePeriod(date, selectedPeriod, -1),
                          )
                        }
                        style={({ pressed }) => [
                          styles.periodArrow,
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[styles.materialIcon, { color: colors.text }]}>
                          chevron_left
                        </Text>
                      </Pressable>
                      <Text style={[styles.periodRange, { color: colors.text }]}>
                        {periodLabel}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Periodo successivo"
                        accessibilityState={{ disabled: currentPeriod }}
                        disabled={currentPeriod}
                        hitSlop={8}
                        onPress={() =>
                          setPeriodAnchor((date) =>
                            shiftTimelinePeriod(date, selectedPeriod, 1),
                          )
                        }
                        style={({ pressed }) => [
                          styles.periodArrow,
                          currentPeriod && styles.periodArrowDisabled,
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.materialIcon,
                            { color: colors.text },
                          ]}>
                          chevron_right
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}

                {hasActiveFilters ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Rimuovi tutti i filtri"
                    onPress={clearFilters}
                    style={({ pressed }) => [
                      styles.quickClearFilters,
                      { backgroundColor: colors.sunken },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.quickClearIcon, { color: colors.accent }]}>
                      filter_alt_off
                    </Text>
                    <Text style={[styles.quickClearText, { color: colors.accent }]}>
                      Azzera filtri
                    </Text>
                  </Pressable>
                ) : null}

                <Card style={styles.chartCard}>
                  <View style={styles.summaryRow}>
                    <SummaryValue
                      label="Entrate"
                      value={summary.income}
                      color={colors.positive}
                      amountsVisible={amountsVisible}
                    />
                    <SummaryValue
                      label="Uscite"
                      value={summary.expense}
                      color={colors.text}
                      amountsVisible={amountsVisible}
                    />
                    <SummaryValue
                      label="Saldo netto"
                      value={summary.net}
                      color={
                        summary.net >= 0 ? colors.positive : colors.negative
                      }
                      amountsVisible={amountsVisible}
                      signed
                    />
                  </View>
                  <IncomeExpenseChart bins={bins} />
                </Card>
              </>
            }
            ListEmptyComponent={
              <Card style={styles.empty}>
                <View
                  style={[
                    styles.emptyIcon,
                    { backgroundColor: colors.accentSoft },
                  ]}>
                  <Text
                    style={[styles.materialIcon, { color: colors.accent }]}>
                    receipt_long
                  </Text>
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {hasActiveFilters
                    ? 'Nessun movimento corrisponde ai filtri.'
                    : 'Qui appariranno i tuoi movimenti.'}
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {hasActiveFilters
                    ? 'Modifica la ricerca, la categoria o il periodo.'
                    : 'Aggiungine uno manualmente o importa un estratto conto.'}
                </Text>
                {hasActiveFilters ? (
                  <PrimaryButton onPress={clearFilters}>
                    Rimuovi filtri
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    onPress={() =>
                      router.push('/add-transaction' as Href)
                    }>
                    Aggiungi transazione
                  </PrimaryButton>
                )}
              </Card>
            }
            renderSectionHeader={({ section }) => (
              <View style={styles.groupHeader}>
                <View style={styles.flex}>
                  <Text style={[styles.day, { color: colors.text }]}>
                    {section.label}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.groupTotal,
                    {
                      color:
                        section.total >= 0 ? colors.positive : colors.text,
                    },
                  ]}>
                  {amountsVisible
                    ? `${section.total >= 0 ? '+' : '−'} ${formatEuro(Math.abs(section.total))}`
                    : HIDDEN_AMOUNT}
                </Text>
              </View>
            )}
            renderItem={({ item, index, section }) => {
              const first = index === 0;
              const last = index === section.data.length - 1;
              return (
                <View
                  style={[
                    styles.transactionCell,
                    {
                      backgroundColor:
                        item.id && selectedTransactionIds.has(item.id)
                          ? colors.accentSoft
                          : colors.surface,
                      borderColor: colors.border,
                    },
                    first && styles.transactionCellFirst,
                    last && styles.transactionCellLast,
                  ]}>
                  <TransactionRow
                    transaction={item}
                    last={last}
                    amountsVisible={amountsVisible}
                    selectionMode={selectionMode}
                    selected={Boolean(
                      item.id && selectedTransactionIds.has(item.id),
                    )}
                    onEdit={setEditingTransaction}
                    onSelect={toggleTransactionSelection}
                  />
                </View>
              );
            }}
          />
        )}
      </ScreenScrollBridge>
      {editingTransaction ? (
        <EditTransactionModal
          key={editingTransaction.id ?? editingTransaction.occurredAt}
          transaction={editingTransaction}
          saving={saving}
          error={error}
          allowRemember={planTier !== 'free'}
          onClose={() => {
            clearError();
            setEditingTransaction(null);
          }}
          onSave={async (transactionId, changes) => {
            return updateTransaction(transactionId, changes);
          }}
          onDelete={
            (
              ['manual', 'onboarding', 'ai_scan', 'file_import'].includes(
                editingTransaction.source ?? '',
              ) ||
              (['open_banking', 'manual_open_banking'].includes(
                editingTransaction.source ?? '',
              ) &&
                !financialAccounts.some(
                  (account) =>
                    account.id === editingTransaction.financialAccountId,
                ))
            )
              ? (transactionId) => {
                  Alert.alert(
                    'Eliminare la transazione?',
                    'Questa operazione rimuove definitivamente il movimento.',
                    [
                      { text: 'Annulla', style: 'cancel' },
                      {
                        text: 'Elimina',
                        style: 'destructive',
                        onPress: () => {
                          void deleteTransaction(transactionId).then((deleted) => {
                            if (deleted) setEditingTransaction(null);
                          });
                        },
                      },
                    ],
                  );
                }
              : undefined
          }
        />
      ) : null}
      {bulkCategoryVisible && selectedTransactions.length ? (
        <BulkCategoryModal
          key={`${selectedKind}-${selectedTransactions.length}`}
          transactions={selectedTransactions}
          saving={saving}
          error={error}
          allowRemember={planTier !== 'free'}
          onClose={() => {
            clearError();
            setBulkCategoryVisible(false);
          }}
          onSave={async (category, rememberSimilar) => {
            const ids = selectedTransactions.flatMap((transaction) =>
              transaction.id ? [transaction.id] : [],
            );
            const updated = await categorizeTransactions(
              ids,
              category,
              rememberSimilar,
            );
            if (updated) closeSelectionMode();
          }}
        />
      ) : null}
    </Screen>
  );
}

function BulkAction({
  label,
  onPress,
  accent = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bulkAction,
        {
          backgroundColor: accent ? colors.accent : colors.surface,
          borderColor: accent ? colors.accent : colors.border,
        },
        disabled && styles.bulkActionDisabled,
        pressed && styles.pressed,
      ]}>
      <Text
        style={[
          styles.bulkActionText,
          { color: accent ? colors.onAccent : colors.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryValue({
  label,
  value,
  color,
  amountsVisible,
  signed = false,
}: {
  label: string;
  value: number;
  color: string;
  amountsVisible: boolean;
  signed?: boolean;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.summaryAmount, { color }]}>
        {amountsVisible
          ? `${signed && value > 0 ? '+' : signed && value < 0 ? '−' : ''}${formatEuro(Math.abs(value))}`
          : HIDDEN_AMOUNT}
      </Text>
    </View>
  );
}

function IncomeExpenseChart({
  bins,
}: {
  bins: ReturnType<typeof buildTimelineBins>;
}) {
  const { colors } = useFlowndTheme();
  const maxValue = Math.max(
    1,
    ...bins.flatMap((bin) => [bin.income, bin.expense]),
  );
  const hasData = bins.some((bin) => bin.income > 0 || bin.expense > 0);

  return (
    <View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.positive }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Entrate
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.negative }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Uscite
          </Text>
        </View>
      </View>
      <View style={styles.plot}>
        {bins.map((bin) => (
          <View key={bin.key} style={styles.bin}>
            <View style={styles.bars}>
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: colors.positive,
                    height: Math.max(2, (bin.income / maxValue) * 92),
                    opacity: bin.income ? 1 : 0.18,
                  },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: colors.negative,
                    height: Math.max(2, (bin.expense / maxValue) * 92),
                    opacity: bin.expense ? 1 : 0.18,
                  },
                ]}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.binLabel, { color: colors.textSecondary }]}>
              {bin.label}
            </Text>
          </View>
        ))}
      </View>
      {!hasData ? (
        <Text style={[styles.plotEmpty, { color: colors.textSecondary }]}>
          Nessun movimento nel periodo selezionato.
        </Text>
      ) : null}
    </View>
  );
}

const TransactionRow = memo(function TransactionRow({
  transaction,
  last,
  amountsVisible,
  selectionMode,
  selected,
  onEdit,
  onSelect,
}: {
  transaction: ExpenseDraft;
  last: boolean;
  amountsVisible: boolean;
  selectionMode: boolean;
  selected: boolean;
  onEdit: (transaction: ExpenseDraft) => void;
  onSelect: (transaction: ExpenseDraft) => void;
}) {
  const { colors } = useFlowndTheme();
  const income = transaction.kind === 'income';
  const balanceAdjustment = transaction.source === 'manual_balance_adjustment';
  const occurredAt = transaction.occurredAt
    ? new Date(transaction.occurredAt)
    : new Date();
  const timeLabel = transactionTimeLabel(transaction, occurredAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        selectionMode
          ? `${selected ? 'Deseleziona' : 'Seleziona'} ${transaction.description}`
          : balanceAdjustment
            ? transaction.description
            : `Modifica transazione ${transaction.description}`
      }
      accessibilityState={{ selected: selectionMode ? selected : undefined }}
      disabled={
        !transaction.id ||
        balanceAdjustment ||
        (selectionMode && transaction.internalTransfer)
      }
      onPress={() =>
        selectionMode ? onSelect(transaction) : onEdit(transaction)
      }
      style={({ pressed }) => [
        styles.transactionWrap,
        pressed && styles.transactionPressed,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      <View style={styles.transaction}>
        {selectionMode ? (
          <View
            style={[
              styles.selectionCheckbox,
              {
                backgroundColor: selected ? colors.accent : colors.surface,
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}>
            {selected ? (
              <Text style={[styles.selectionCheck, { color: colors.onAccent }]}>
                check
              </Text>
            ) : null}
          </View>
        ) : (
          <View
            style={[
              styles.transactionIcon,
              {
                backgroundColor: income
                  ? colors.positiveSoft
                  : colors.accentSoft,
              },
            ]}>
            <Text
              style={[
                styles.materialIcon,
                { color: income ? colors.positive : colors.accent },
              ]}>
              {balanceAdjustment ? 'tune' : income ? 'south_west' : 'north_east'}
            </Text>
          </View>
        )}
        <View style={styles.flex}>
          <Text style={[styles.description, { color: colors.text }]}>
            {transaction.description}
          </Text>
          <View style={styles.transactionMeta}>
            <Text style={[styles.category, { color: colors.textSecondary }]}>
              {transaction.internalTransfer ? 'Trasferimento interno' : transaction.category}
            </Text>
            {timeLabel ? (
              <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
                {timeLabel}
              </Text>
            ) : null}
          </View>
        </View>
        <Text
          style={[
            styles.amount,
            { color: income ? colors.positive : colors.text },
          ]}>
          {amountsVisible
            ? `${income ? '+' : '−'} ${formatEuro(transaction.amount)}`
            : HIDDEN_AMOUNT}
        </Text>
      </View>
    </Pressable>
  );
});

// Conservato temporaneamente per compatibilità con presentazioni già montate.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TimelineFiltersModal({
  categories,
  selectedCategories,
  customDateRange,
  fallbackDateRange,
  query,
  onClose,
  onApply,
}: {
  categories: string[];
  selectedCategories: string[];
  customDateRange: { start: Date; end: Date } | null;
  fallbackDateRange: { start: Date; end: Date };
  query: string;
  onClose: () => void;
  onApply: (
    query: string,
    categories: string[],
    dateRange: { start: Date; end: Date } | null,
  ) => void;
}) {
  const { colors, isDark } = useFlowndTheme();
  const insets = useSafeAreaInsets();
  const initialInsets = initialWindowMetrics?.insets;
  const topInset = Math.max(
    insets.top,
    initialInsets?.top ?? 0,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 20,
  );
  const leftInset = Math.max(insets.left, initialInsets?.left ?? 0);
  const rightInset = Math.max(insets.right, initialInsets?.right ?? 0);
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftCategories, setDraftCategories] =
    useState<string[]>(selectedCategories);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [customDatesEnabled, setCustomDatesEnabled] = useState(
    Boolean(customDateRange),
  );
  const [draftStart, setDraftStart] = useState(
    customDateRange?.start ?? fallbackDateRange.start,
  );
  const [draftEnd, setDraftEnd] = useState(
    customDateRange?.end ?? fallbackDateRange.end,
  );

  function toggleCategory(category: string) {
    setDraftCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
      visible
      onRequestClose={onClose}>
      <View
        style={[
          styles.fullFilterRoot,
          {
            backgroundColor: colors.background,
            paddingLeft: leftInset,
            paddingRight: rightInset,
          },
        ]}>
          <View
            style={[
              styles.fullFilterHeader,
              {
                borderBottomColor: colors.border,
                paddingTop: topInset + 8,
              },
            ]}>
            <View style={styles.flex}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filtri</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi filtri"
              onPress={onClose}
              style={({ pressed }) => [
                styles.sheetClose,
                { backgroundColor: colors.sunken },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.sheetCloseText, { color: colors.text }]}>×</Text>
            </Pressable>
          </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.fullFilterBody}>
          <View style={styles.fullFilterContent}>
            <Text style={[styles.filterModalLabel, { color: colors.textSecondary }]}>
              RICERCA
            </Text>
            <View
              style={[
                styles.searchField,
                { backgroundColor: colors.sunken, borderColor: colors.border },
              ]}>
              <Text style={[styles.searchIcon, { color: colors.textSecondary }]}>search</Text>
              <TextInput
                accessibilityLabel="Cerca movimenti"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                value={draftQuery}
                onChangeText={setDraftQuery}
                placeholder="Descrizione o categoria"
                placeholderTextColor={colors.textSecondary}
                selectionColor={colors.accent}
                style={[styles.searchInput, { color: colors.text }]}
              />
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: customDatesEnabled }}
              onPress={() => setCustomDatesEnabled((current) => !current)}
              style={styles.customDateToggle}>
              <View
                style={[
                  styles.filterCheckbox,
                  {
                    backgroundColor: customDatesEnabled
                      ? colors.accent
                      : colors.surface,
                    borderColor: customDatesEnabled
                      ? colors.accent
                      : colors.border,
                  },
                ]}>
                {customDatesEnabled ? (
                  <Text style={[styles.selectionCheck, { color: colors.onAccent }]}>
                    check
                  </Text>
                ) : null}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.customDateTitle, { color: colors.text }]}>
                  Usa un intervallo di date
                </Text>
                <Text style={[styles.customDateCopy, { color: colors.textSecondary }]}>
                  Se disattivato, viene usato il periodo selezionato nella Timeline.
                </Text>
              </View>
            </Pressable>

            {customDatesEnabled ? (
              <View style={styles.dateRangeFields}>
                <TransactionDateField
                  label="Dal"
                  value={draftStart}
                  maximumDate={draftEnd}
                  onChange={(date) => {
                    const next = new Date(date);
                    next.setHours(0, 0, 0, 0);
                    setDraftStart(next);
                  }}
                />
                <TransactionDateField
                  label="Al"
                  value={draftEnd}
                  minimumDate={draftStart}
                  onChange={(date) => {
                    const next = new Date(date);
                    next.setHours(23, 59, 59, 999);
                    setDraftEnd(next);
                  }}
                />
              </View>
            ) : null}

            <Text style={[styles.filterModalLabel, { color: colors.textSecondary }]}>
              CATEGORIE
            </Text>
            <View
              style={[
                styles.filterDropdown,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: categoryOpen }}
                accessibilityLabel="Scegli categorie"
                onPress={() => setCategoryOpen((current) => !current)}
                style={styles.filterDropdownTrigger}>
                <Text style={[styles.filterDropdownValue, { color: colors.text }]}>
                  {draftCategories.length === 0
                    ? 'Tutte le categorie'
                    : draftCategories.length === 1
                      ? draftCategories[0]
                      : `${draftCategories.length} categorie`}
                </Text>
                <Text
                  style={[
                    styles.editorDropdownIcon,
                    { color: colors.textSecondary },
                  ]}>
                  {categoryOpen ? 'expand_less' : 'expand_more'}
                </Text>
              </Pressable>
              {categoryOpen ? (
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={[
                    styles.filterDropdownMenu,
                    { borderTopColor: colors.border },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: draftCategories.length === 0 }}
                    onPress={() => setDraftCategories([])}
                    style={({ pressed }) => [
                      styles.filterDropdownOption,
                      draftCategories.length === 0 && {
                        backgroundColor: colors.accentSoft,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.filterDropdownOptionText,
                        {
                          color: draftCategories.length === 0
                            ? colors.accent
                            : colors.text,
                        },
                      ]}>
                      Tutte le categorie
                    </Text>
                  </Pressable>
                  {categories.map((option) => {
                    const selected = draftCategories.includes(option);
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() => toggleCategory(option)}
                        style={({ pressed }) => [
                          styles.filterDropdownOption,
                          selected && { backgroundColor: colors.accentSoft },
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.filterDropdownOptionText,
                            { color: selected ? colors.accent : colors.text },
                          ]}>
                          {option}
                        </Text>
                        {selected ? (
                          <Text style={[styles.editorDropdownCheck, { color: colors.accent }]}>
                            check
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
          </View>

          <View
            style={[
              styles.filterModalActions,
              {
                borderTopColor: colors.border,
                paddingBottom: 26,
              },
            ]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraftQuery('');
                setDraftCategories([]);
                setCustomDatesEnabled(false);
                setCategoryOpen(false);
              }}
              style={({ pressed }) => [
                styles.resetFiltersButton,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.resetFiltersText, { color: colors.accent }]}>Azzera</Text>
            </Pressable>
            <View style={styles.applyFiltersButton}>
              <PrimaryButton
                compact
                onPress={() =>
                  onApply(
                    draftQuery.trim(),
                    draftCategories,
                    customDatesEnabled
                      ? { start: draftStart, end: draftEnd }
                      : null,
                  )
                }>
                Applica filtri
              </PrimaryButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function BulkCategoryModal({
  transactions,
  saving,
  error,
  allowRemember,
  onClose,
  onSave,
}: {
  transactions: ExpenseDraft[];
  saving: boolean;
  error: string | null;
  allowRemember: boolean;
  onClose: () => void;
  onSave: (category: string, rememberSimilar: boolean) => Promise<void>;
}) {
  const { colors } = useFlowndTheme();
  const kind = transactions[0]?.kind === 'income' ? 'income' : 'expense';
  const options = categoriesForTransactionKind(kind);
  const sharedCategory = transactions.every(
    (transaction) => transaction.category === transactions[0]?.category,
  )
    ? transactions[0]?.category
    : null;
  const initialCategory = options.find((option) => option === sharedCategory)
    ?? (kind === 'income' ? 'Altra entrata' : 'Altro');
  const [category, setCategory] = useState<string>(initialCategory);
  const [rememberSimilar, setRememberSimilar] = useState(false);

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi categorizzazione multipla"
          onPress={onClose}
          style={styles.modalBackdrop}
        />
        <View
          style={[
            styles.bulkSheet,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={[styles.sheetEyebrow, { color: colors.accent }]}>
                {transactions.length} MOVIMENTI
              </Text>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Scegli la categoria
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              onPress={onClose}
              style={({ pressed }) => [
                styles.sheetClose,
                { backgroundColor: colors.sunken },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.sheetCloseText, { color: colors.text }]}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.bulkSheetContent}>
            <View style={styles.bulkCategoryGrid}>
              {options.map((option) => {
                const selected = option === category;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(option)}
                    style={({ pressed }) => [
                      styles.bulkCategoryOption,
                      {
                        backgroundColor: selected
                          ? colors.accentSoft
                          : colors.surface,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.bulkCategoryOptionText,
                        { color: selected ? colors.accent : colors.text },
                      ]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {kind === 'expense' && allowRemember ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberSimilar }}
                onPress={() => setRememberSimilar((current) => !current)}
                style={styles.rememberRule}>
                <View
                  style={[
                    styles.rememberCheckbox,
                    {
                      backgroundColor: rememberSimilar
                        ? colors.accent
                        : colors.surface,
                      borderColor: rememberSimilar ? colors.accent : colors.border,
                    },
                  ]}>
                  {rememberSimilar ? (
                    <Text style={[styles.selectionCheck, { color: colors.onAccent }]}>
                      check
                    </Text>
                  ) : null}
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.rememberTitle, { color: colors.text }]}>
                    Ricorda per il futuro
                  </Text>
                  <Text style={[styles.rememberCopy, { color: colors.textSecondary }]}>
                    Applica la categoria ai prossimi movimenti Open Banking con
                    una descrizione simile.
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {error ? (
              <Text style={[styles.sheetError, { color: colors.negative }]}>{error}</Text>
            ) : null}
            <PrimaryButton
              loading={saving}
              onPress={() => void onSave(category, rememberSimilar)}>
              Applica a {transactions.length} movimenti
            </PrimaryButton>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EditTransactionModal({
  transaction,
  saving,
  error,
  allowRemember,
  onClose,
  onSave,
  onDelete,
}: {
  transaction: ExpenseDraft;
  saving: boolean;
  error: string | null;
  allowRemember: boolean;
  onClose: () => void;
  onSave: (transactionId: string, changes: TransactionUpdate) => Promise<boolean>;
  onDelete?: (transactionId: string) => void;
}) {
  const { colors } = useFlowndTheme();
  const insets = useSafeAreaInsets();
  const initialKind = transaction.kind === 'income' ? 'income' : 'expense';
  const initialCategory = ['Entrata', 'Entrate'].includes(transaction.category)
    ? 'Altra entrata'
    : transaction.category;
  const initialOptions = categoriesForTransactionKind(initialKind);
  const [kind, setKind] = useState<'expense' | 'income'>(initialKind);
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(
    String(transaction.amount).replace('.', ','),
  );
  const transactionDate = transaction.occurredAt
    ? new Date(transaction.occurredAt)
    : new Date();
  const [occurredAt, setOccurredAt] = useState(
    Number.isNaN(transactionDate.getTime()) ? new Date() : transactionDate,
  );
  const [category, setCategory] = useState(
    initialOptions.some((option) => option === initialCategory)
      ? initialCategory
      : initialKind === 'income'
        ? 'Altra entrata'
        : 'Altro',
  );
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [rememberSimilar, setRememberSimilar] = useState(false);
  const categoryOptions = categoriesForTransactionKind(kind);
  const numericAmount = Number(amount.replace(',', '.')) || 0;
  const [sheetTranslateY] = useState(() => new Animated.Value(480));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [keyboardLift] = useState(() => new Animated.Value(0));
  const closeSheet = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(sheetTranslateY, {
        toValue: 720,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(onClose);
  }, [backdropOpacity, onClose, sheetTranslateY]);

  useEffect(() => {
    keyboardLift.setValue(0);
    Animated.parallel([
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 24,
        stiffness: 240,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, keyboardLift, sheetTranslateY]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      Animated.timing(keyboardLift, {
        toValue: -event.endCoordinates.height,
        duration: event.duration ?? 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: event.duration ?? 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardLift]);

  const sheetPanGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetY(4)
      .failOffsetX([-24, 24])
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onBegin(() => {
        sheetTranslateY.stopAnimation();
        Keyboard.dismiss();
      })
      .onUpdate((event) => {
        sheetTranslateY.setValue(Math.max(0, event.translationY));
      })
      .onEnd((event) => {
        if (event.translationY > 110 || event.velocityY > 1050) {
          closeSheet();
          return;
        }
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      })
      .onFinalize((_event, succeeded) => {
        if (succeeded) return;
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }),
    [closeSheet, sheetTranslateY],
  );

  return (
    <Modal
      animationType="none"
      transparent
      visible
      onRequestClose={closeSheet}>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi modifica transazione"
            onPress={closeSheet}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <GestureDetector gesture={sheetPanGesture}>
          <Animated.View
            style={[
              styles.editSheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 18),
                transform: [
                  { translateY: sheetTranslateY },
                  { translateY: keyboardLift },
                ],
              },
            ]}>
          <View
            pointerEvents="none"
            style={[
              styles.keyboardBackgroundExtension,
              { backgroundColor: colors.background },
            ]}
          />
          <View>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Modifica movimento</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Chiudi"
                onPress={closeSheet}
                style={({ pressed }) => [
                  styles.sheetClose,
                  { backgroundColor: colors.sunken },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.sheetCloseIcon, { color: colors.text }]}>close</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.sheetContent}>
            <TransactionKindSelector
              value={kind}
              onChange={(nextKind) => {
                setKind(nextKind);
                if (nextKind === 'income') setRememberSimilar(false);
                setCategory(nextKind === 'income' ? 'Altra entrata' : 'Altro');
                setCategoriesOpen(false);
              }}
            />
            <Field
              label="Descrizione"
              value={description}
              onChangeText={setDescription}
              placeholder="Descrizione della transazione"
            />
            <Field
              label="Importo"
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
              suffix="€"
            />
            <TransactionDateField value={occurredAt} onChange={setOccurredAt} />
            <Text style={[styles.editorCategoryTitle, { color: colors.text }]}>Categoria</Text>
            <View
              style={[
                styles.editorDropdown,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Categoria selezionata: ${category}`}
                accessibilityState={{ expanded: categoriesOpen }}
                onPress={() => setCategoriesOpen((current) => !current)}
                style={({ pressed }) => [
                  styles.editorDropdownTrigger,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.editorDropdownValue, { color: colors.text }]}> 
                  {category}
                </Text>
                <Text style={[styles.editorDropdownIcon, { color: colors.textSecondary }]}> 
                  {categoriesOpen ? 'expand_less' : 'expand_more'}
                </Text>
              </Pressable>
            </View>
            {kind === 'income' ? (
              <Text style={[styles.incomeHint, { color: colors.textSecondary }]}>
                Tredicesima, rimborsi e giroconti non aumentano il budget
                mensile.
              </Text>
            ) : null}
            {kind === 'expense' && allowRemember ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberSimilar }}
                onPress={() => setRememberSimilar((current) => !current)}
                style={styles.rememberRule}>
                <View
                  style={[
                    styles.rememberCheckbox,
                    {
                      backgroundColor: rememberSimilar
                        ? colors.accent
                        : colors.surface,
                      borderColor: rememberSimilar ? colors.accent : colors.border,
                    },
                  ]}>
                  {rememberSimilar ? (
                    <Text style={[styles.selectionCheck, { color: colors.onAccent }]}>check</Text>
                  ) : null}
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.rememberTitle, { color: colors.text }]}>
                    Ricorda per il futuro
                  </Text>
                  <Text style={[styles.rememberCopy, { color: colors.textSecondary }]}>
                    Applica questa categoria ai prossimi movimenti Open Banking
                    con una descrizione simile.
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {error ? <Text style={[styles.sheetError, { color: colors.negative }]}>{error}</Text> : null}
            {onDelete && transaction.id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Elimina transazione"
                disabled={saving}
                onPress={() => onDelete(transaction.id!)}
                style={({ pressed }) => [
                  styles.deleteButton,
                  { borderColor: colors.negative },
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.deleteButtonText,
                    { color: colors.negative },
                  ]}>
                  Elimina transazione
                </Text>
              </Pressable>
            ) : null}
            <PrimaryButton
              disabled={!transaction?.id || !description.trim() || numericAmount <= 0}
              loading={saving}
              onPress={async () => {
                if (!transaction?.id) return;
                const updated = await onSave(transaction.id, {
                  description: description.trim(),
                  amount: numericAmount,
                  category,
                  kind,
                  occurredAt: occurredAt.toISOString(),
                  rememberSimilar,
                });
                if (updated) closeSheet();
              }}>
              Salva modifiche
            </PrimaryButton>
          </View>
          {categoriesOpen ? (
            <View style={styles.categoryPopoverLayer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Chiudi categorie"
                onPress={() => setCategoriesOpen(false)}
                style={StyleSheet.absoluteFill}
              />
              <View
                style={[
                  styles.categoryPopover,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <View style={styles.categoryPopoverHeader}>
                  <Text style={[styles.categoryPopoverTitle, { color: colors.text }]}>
                    Scegli categoria
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Chiudi categorie"
                    onPress={() => setCategoriesOpen(false)}
                    hitSlop={8}>
                    <Text style={[styles.editorDropdownIcon, { color: colors.textSecondary }]}>close</Text>
                  </Pressable>
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.categoryPopoverScroll}>
                  {categoryOptions.map((option) => {
                    const selected = category === option;
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setCategory(option);
                          setCategoriesOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.editorDropdownOption,
                          selected && { backgroundColor: colors.accentSoft },
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.editorDropdownOptionText,
                            { color: selected ? colors.accent : colors.text },
                          ]}>
                          {option}
                        </Text>
                        {selected ? (
                          <Text style={[styles.editorDropdownCheck, { color: colors.accent }]}>check</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          ) : null}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  virtualizedScreen: { paddingBottom: 0 },
  timelineHeaderLayer: { zIndex: 50 },
  timelineList: { flex: 1, zIndex: 0 },
  timelineContent: { paddingTop: 18, paddingBottom: 110 },
  pressed: { opacity: 0.65 },
  headerTools: { flexDirection: 'row', alignItems: 'center' },
  headerButton: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  filterIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bulkToolbar: { marginBottom: 12, gap: 12 },
  bulkToolbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulkToolbarTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  bulkToolbarLink: { fontFamily: font.bodySemiBold, fontSize: 11 },
  bulkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  bulkAction: {
    minHeight: 36,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  bulkActionDisabled: { opacity: 0.42 },
  bulkActionText: { fontFamily: font.bodySemiBold, fontSize: 10 },
  periodControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 3,
    marginBottom: 12,
  },
  periodButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodText: { fontFamily: font.bodySemiBold, fontSize: 11 },
  periodNavigator: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  periodArrow: {
    width: 42,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodArrowDisabled: { opacity: 0.25 },
  periodRange: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  customRangeBanner: {
    minHeight: 62,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 12,
  },
  customRangeIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  customRangeTitle: { fontFamily: font.bodySemiBold, fontSize: 12 },
  customRangeCopy: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  customRangeEdit: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  customRangeEditText: { fontFamily: font.bodySemiBold, fontSize: 10 },
  quickClearFilters: {
    alignSelf: 'flex-end',
    minHeight: 34,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  quickClearIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 17,
    lineHeight: 20,
  },
  quickClearText: { fontFamily: font.bodySemiBold, fontSize: 10 },
  searchField: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 19,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 14,
    paddingVertical: 10,
  },
  filterModalLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.9,
    marginTop: 14,
    marginBottom: 8,
  },
  fullFilterRoot: { flex: 1 },
  fullFilterBody: { flex: 1 },
  fullFilterHeader: {
    minHeight: 70,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  fullFilterContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  filterDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  filterDropdownTrigger: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  filterDropdownValue: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 13,
  },
  filterDropdownMenu: {
    maxHeight: 220,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 5,
  },
  filterDropdownOption: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    marginHorizontal: 5,
    paddingHorizontal: 10,
  },
  filterDropdownOptionText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 12,
  },
  filterModalActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  resetFiltersButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  resetFiltersText: { fontFamily: font.bodySemiBold, fontSize: 12 },
  applyFiltersButton: { flex: 1 },
  customDateToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 22,
    paddingVertical: 5,
  },
  filterCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customDateTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  customDateCopy: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  dateRangeFields: { gap: 2 },
  chartCard: { marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontFamily: font.bodyMedium, fontSize: 10 },
  summaryAmount: { fontFamily: font.dataMedium, fontSize: 13, marginTop: 4 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 18,
    marginBottom: 5,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: font.body, fontSize: 9 },
  plot: {
    height: 124,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  bin: { flex: 1, minWidth: 0, alignItems: 'center' },
  bars: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  bar: { width: 5, minHeight: 2, borderRadius: 2 },
  binLabel: {
    fontFamily: font.data,
    fontSize: 8,
    textAlign: 'center',
    marginTop: 5,
  },
  plotEmpty: {
    fontFamily: font.body,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 9,
  },
  day: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    textTransform: 'capitalize',
  },
  date: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  groupTotal: { fontFamily: font.dataMedium, fontSize: 12 },
  transactionCell: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  transactionCellFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  transactionCellLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    marginBottom: 20,
  },
  transactionWrap: { paddingVertical: 4 },
  transactionPressed: { opacity: 0.7 },
  transaction: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  selectionCheck: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 17,
    lineHeight: 19,
  },
  description: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 3,
  },
  category: { fontFamily: font.bodyMedium, fontSize: 10 },
  transactionDate: { fontFamily: font.data, fontSize: 9 },
  amount: { fontFamily: font.dataMedium, fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: font.displaySemiBold,
    fontSize: 20,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
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
  categorizeFloatingAction: {
    minWidth: 210,
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  categorizeFloatingIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  categorizeFloatingText: { fontFamily: font.bodySemiBold, fontSize: 14 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 12, 9, 0.42)',
  },
  editSheet: {
    maxHeight: '88%',
    overflow: 'hidden',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingHorizontal: 20,
  },
  keyboardBackgroundExtension: {
    position: 'absolute',
    right: -1,
    bottom: -640,
    left: -1,
    height: 642,
  },
  bulkSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  bulkSheetContent: { paddingBottom: 12 },
  bulkCategoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkCategoryOption: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkCategoryOptionText: { fontFamily: font.bodyMedium, fontSize: 11 },
  rememberRule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 18,
    paddingVertical: 5,
  },
  rememberCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberTitle: { fontFamily: font.bodySemiBold, fontSize: 12 },
  rememberCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetEyebrow: {
    fontFamily: font.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  sheetTitle: {
    fontFamily: font.displaySemiBold,
    fontSize: 22,
    lineHeight: 28,
    marginTop: 1,
  },
  sheetClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: { fontFamily: font.body, fontSize: 25, lineHeight: 27 },
  sheetCloseIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  sheetContent: { paddingBottom: 12, gap: 13 },
  editorCategoryTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    marginTop: 18,
    marginBottom: 9,
  },
  editorDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  editorDropdownTrigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  editorDropdownValue: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 13,
  },
  editorDropdownIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  editorDropdownMenu: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 5,
  },
  categoryPopoverLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(4, 12, 9, 0.16)',
  },
  categoryPopover: {
    maxHeight: '76%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  categoryPopoverHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
  },
  categoryPopoverTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  categoryPopoverScroll: { maxHeight: 340 },
  editorDropdownOption: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  editorDropdownOptionText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 12,
  },
  editorDropdownCheck: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  sheetError: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  incomeHint: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
  },
  deleteButton: {
    minHeight: 44,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { fontFamily: font.bodySemiBold, fontSize: 12 },
});
