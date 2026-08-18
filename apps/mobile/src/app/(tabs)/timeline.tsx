import { router, useLocalSearchParams, type Href } from 'expo-router';
import {
  memo,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from 'react';
import {
  Animated,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
import { TransactionDateField } from '@/components/transaction-date-field';
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

function shiftTimelinePeriod(
  date: Date,
  period: DashboardPeriod,
  direction: -1 | 1,
) {
  const shifted = new Date(date);
  if (period === 'week') {
    const start = periodStart(date, 'week');
    shifted.setTime(start.getTime());
    shifted.setDate(start.getDate() + (direction < 0 ? -1 : 13));
    shifted.setHours(23, 59, 59, 999);
  }
  if (period === 'month') {
    shifted.setDate(1);
    shifted.setMonth(shifted.getMonth() + direction + 1, 0);
  }
  if (period === 'year') {
    shifted.setFullYear(shifted.getFullYear() + direction, 11, 31);
  }
  return periodStart(shifted, period) >= periodStart(new Date(), period)
    ? new Date()
    : shifted;
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

export default function TimelineScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{
    category?: string | string[];
    period?: string | string[];
  }>();
  const {
    transactions,
    amountsVisible,
    categorizeTransactions,
    updateTransaction,
    deleteTransaction,
    saving,
    error,
    clearError,
  } = useApp();
  const paramCategory = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const requestedPeriod = Array.isArray(params.period)
    ? params.period[0]
    : params.period;
  const initialPeriod = dashboardPeriod(requestedPeriod) ?? 'month';
  const [filtersOpen, setFiltersOpen] = useState(Boolean(paramCategory));
  const [query, setQuery] = useState('');
  const [editingTransaction, setEditingTransaction] =
    useState<ExpenseDraft | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkCategoryVisible, setBulkCategoryVisible] = useState(false);
  const [selectedPeriod, setSelectedPeriod] =
    useState<DashboardPeriod>(initialPeriod);
  const [contentPeriod, setContentPeriod] =
    useState<DashboardPeriod>(initialPeriod);
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());
  const [periodPending, startPeriodTransition] = useTransition();

  const selectPeriod = useCallback(
    (period: DashboardPeriod) => {
      setSelectedPeriod(period);
      setPeriodAnchor(new Date());
      startPeriodTransition(() => setContentPeriod(period));
    },
    [startPeriodTransition],
  );

  const periodLabel = useMemo(
    () => formatPeriodAnchor(periodAnchor, contentPeriod),
    [contentPeriod, periodAnchor],
  );
  const currentPeriod = isCurrentTimelinePeriod(periodAnchor, contentPeriod);

  const categoryFilter = paramCategory ?? '';
  const filtersVisible = filtersOpen || Boolean(categoryFilter);

  const { summary, bins, groups, visibleTransactions } = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('it');
    const normalizedCategory = categoryFilter.toLocaleLowerCase('it');
    const visibleTransactions = transactionsForPeriod(
      transactions,
      contentPeriod,
      periodAnchor,
    ).filter((transaction) => {
      const category = transaction.category.trim() || 'Altro';
      const normalizedTransactionCategory = category.toLocaleLowerCase('it');
      const matchesCategory =
        !normalizedCategory ||
        normalizedTransactionCategory === normalizedCategory;
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
      bins: buildTimelineBins(visibleTransactions, contentPeriod, periodAnchor),
      groups: groupTimelineTransactions(visibleTransactions, contentPeriod),
      visibleTransactions,
    };
  }, [categoryFilter, contentPeriod, periodAnchor, query, transactions]);
  const sections = useMemo<TimelineSection[]>(
    () => groups.map((group) => ({ ...group, data: group.transactions })),
    [groups],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          transactions.map(
            (transaction) => transaction.category.trim() || 'Altro',
          ),
        ),
      ).sort((first, second) => first.localeCompare(second, 'it')),
    [transactions],
  );
  const selectableTransactions = useMemo(
    () =>
      visibleTransactions.filter(
        (transaction) => transaction.id && !transaction.internalTransfer,
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
    router.setParams({ category: undefined, period: undefined });
  }

  return (
    <Screen
      scroll={false}
      scrollHeaderWithContent
      style={styles.virtualizedScreen}
      floatingAction={selectionMode ? undefined :
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
      <ScreenScrollBridge>
        {(onScroll) => (
          <Animated.SectionList<ExpenseDraft, TimelineSection>
            accessibilityState={{ busy: periodPending }}
            sections={sections}
            keyExtractor={(transaction, index) =>
              transaction.id ??
              `${transaction.occurredAt ?? 'undated'}-${transaction.description}-${index}`
            }
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.timelineContent}
            ListHeaderComponent={
              <>
                <PageHeader
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
                            <Text
                              style={[styles.materialIcon, { color: colors.text }]}>
                              {selectionMode ? 'close' : 'checklist'}
                            </Text>
                          </Pressable>
                          {!selectionMode ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={
                                filtersVisible
                                  ? 'Chiudi ricerca e filtri'
                                  : 'Apri ricerca e filtri'
                              }
                              onPress={() =>
                                setFiltersOpen((current) => !current)
                              }
                              style={({ pressed }) => [
                                styles.headerButton,
                                pressed && styles.pressed,
                              ]}>
                              <Text
                                style={[styles.materialIcon, { color: colors.text }]}>
                                filter_list
                              </Text>
                              {categoryFilter || query ? (
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
                      <BulkAction
                        accent
                        disabled={!selectedTransactions.length}
                        label="Categorizza"
                        onPress={() => setBulkCategoryVisible(true)}
                      />
                    </View>
                  </Card>
                ) : null}

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
                        shiftTimelinePeriod(date, contentPeriod, -1),
                      )
                    }
                    style={({ pressed }) => [
                      styles.periodArrow,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.materialIcon, { color: colors.text }]}>
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
                        shiftTimelinePeriod(date, contentPeriod, 1),
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

                {filtersVisible ? (
                  <Card style={styles.filterPanel}>
                    <View
                      style={[
                        styles.searchField,
                        {
                          backgroundColor: colors.sunken,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.searchIcon,
                          { color: colors.textSecondary },
                        ]}>
                        search
                      </Text>
                      <TextInput
                        accessibilityLabel="Cerca movimenti"
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Cerca descrizione o categoria"
                        placeholderTextColor={colors.textSecondary}
                        selectionColor={colors.accent}
                        style={[styles.searchInput, { color: colors.text }]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.filterLabel,
                        { color: colors.textSecondary },
                      ]}>
                      CATEGORIA
                    </Text>
                    <View style={styles.categoryChips}>
                      {categories.map((category) => {
                        const selected = categoryFilter === category;
                        return (
                          <Pressable
                            key={category}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() =>
                              router.setParams({
                                category: selected ? undefined : category,
                              })
                            }
                            style={[
                              styles.categoryChip,
                              {
                                backgroundColor: selected
                                  ? colors.accentSoft
                                  : colors.sunken,
                              },
                            ]}>
                            <Text
                              style={[
                                styles.categoryChipText,
                                {
                                  color: selected
                                    ? colors.accent
                                    : colors.textSecondary,
                                },
                              ]}>
                              {category}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {categoryFilter || query ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={clearFilters}
                        style={({ pressed }) => [
                          styles.clearFilters,
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.clearFiltersText,
                            { color: colors.accent },
                          ]}>
                          Rimuovi filtri
                        </Text>
                      </Pressable>
                    ) : null}
                  </Card>
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
                  {categoryFilter || query
                    ? 'Nessun movimento corrisponde ai filtri.'
                    : 'Qui appariranno i tuoi movimenti.'}
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {categoryFilter || query
                    ? 'Modifica la ricerca, la categoria o il periodo.'
                    : 'Aggiungine uno manualmente o importa un estratto conto.'}
                </Text>
                {categoryFilter || query ? (
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
                  <Text
                    style={[styles.date, { color: colors.textSecondary }]}>
                    {section.caption}
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
          onClose={() => {
            clearError();
            setEditingTransaction(null);
          }}
          onSave={async (transactionId, changes) => {
            const updated = await updateTransaction(transactionId, changes);
            if (updated) setEditingTransaction(null);
          }}
          onDelete={
            ['manual', 'onboarding'].includes(editingTransaction.source ?? '')
              ? (transactionId) => {
                  Alert.alert(
                    'Eliminare la transazione?',
                    'Questa operazione rimuove definitivamente il movimento manuale.',
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
  const occurredAt = transaction.occurredAt
    ? new Date(transaction.occurredAt)
    : new Date();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        selectionMode
          ? `${selected ? 'Deseleziona' : 'Seleziona'} ${transaction.description}`
          : `Modifica transazione ${transaction.description}`
      }
      accessibilityState={{ selected: selectionMode ? selected : undefined }}
      disabled={!transaction.id || (selectionMode && transaction.internalTransfer)}
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
              {income ? 'south_west' : 'north_east'}
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
            <Text style={[styles.transactionDate, { color: colors.textSecondary }]}> 
              {transactionTimeFormatter.format(occurredAt)}
            </Text>
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

function BulkCategoryModal({
  transactions,
  saving,
  error,
  onClose,
  onSave,
}: {
  transactions: ExpenseDraft[];
  saving: boolean;
  error: string | null;
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
            {kind === 'expense' ? (
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
  onClose,
  onSave,
  onDelete,
}: {
  transaction: ExpenseDraft;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (transactionId: string, changes: TransactionUpdate) => Promise<void>;
  onDelete?: (transactionId: string) => void;
}) {
  const { colors } = useFlowndTheme();
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
  const categoryOptions = categoriesForTransactionKind(kind);
  const numericAmount = Number(amount.replace(',', '.')) || 0;

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi modifica transazione"
          onPress={onClose}
          style={styles.modalBackdrop}
        />
        <View
          style={[
            styles.editSheet,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetEyebrow, { color: colors.accent }]}>TRANSAZIONE</Text>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Modifica movimento</Text>
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
            contentContainerStyle={styles.sheetContent}>
            <View style={[styles.kindControl, { backgroundColor: colors.sunken }]}> 
              {([
                { id: 'expense', label: 'Uscita' },
                { id: 'income', label: 'Entrata' },
              ] as const).map((option) => {
                const selected = kind === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setKind(option.id);
                      setCategory(
                        option.id === 'income' ? 'Altra entrata' : 'Altro',
                      );
                      setCategoriesOpen(false);
                    }}
                    style={[
                      styles.kindButton,
                      selected && { backgroundColor: colors.surface },
                    ]}>
                    <Text
                      style={[
                        styles.kindText,
                        { color: selected ? colors.text : colors.textSecondary },
                      ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
              {categoriesOpen ? (
                <View style={[styles.editorDropdownMenu, { borderTopColor: colors.border }]}> 
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
                          <Text style={[styles.editorDropdownCheck, { color: colors.accent }]}> 
                            check
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            {kind === 'income' ? (
              <Text style={[styles.incomeHint, { color: colors.textSecondary }]}>
                Tredicesima, rimborsi e giroconti non aumentano il budget
                mensile. Riclassifica qui le entrate bancarie errate.
              </Text>
            ) : null}
            {error ? <Text style={[styles.sheetError, { color: colors.negative }]}>{error}</Text> : null}
            {onDelete && transaction.id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Elimina transazione manuale"
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
              onPress={() => {
                if (!transaction?.id) return;
                void onSave(transaction.id, {
                  description: description.trim(),
                  amount: numericAmount,
                  category,
                  kind,
                  occurredAt: occurredAt.toISOString(),
                });
              }}>
              Salva modifiche
            </PrimaryButton>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  virtualizedScreen: { paddingBottom: 0 },
  timelineContent: { paddingTop: 10, paddingBottom: 110 },
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
  filterPanel: { marginBottom: 12 },
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
  filterLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.9,
    marginTop: 14,
    marginBottom: 8,
  },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryChip: {
    minHeight: 32,
    borderRadius: 9,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  categoryChipText: { fontFamily: font.bodyMedium, fontSize: 11 },
  clearFilters: { alignSelf: 'flex-end', paddingTop: 13, paddingHorizontal: 2 },
  clearFiltersText: { fontFamily: font.bodySemiBold, fontSize: 12 },
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
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 12, 9, 0.42)',
  },
  editSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingHorizontal: 20,
    paddingBottom: 18,
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
  sheetContent: { paddingBottom: 12 },
  kindControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 4,
  },
  kindButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindText: { fontFamily: font.bodySemiBold, fontSize: 12 },
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
  },
  deleteButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { fontFamily: font.bodySemiBold, fontSize: 12 },
});
