import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
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
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { TransactionDateField } from '@/components/transaction-date-field';
import { HIDDEN_AMOUNT, transactionsForPeriod } from '@/lib/dashboard';
import type { ExpenseDraft } from '@/lib/onboarding';
import { formatEuro } from '@/lib/onboarding';
import { categoriesForTransactionKind } from '@/lib/transaction-categories';
import {
  buildTimelineBins,
  groupTimelineTransactions,
  summarizeTransactions,
} from '@/lib/timeline';
import {
  type DashboardPeriod,
  type TransactionUpdate,
  useApp,
} from '@/providers/app-provider';

const periods: { id: DashboardPeriod; label: string }[] = [
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
  { id: 'year', label: 'Anno' },
];

export default function TimelineScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{
    category?: string | string[];
    period?: string | string[];
  }>();
  const {
    transactions,
    amountsVisible,
    dashboardPeriod,
    setDashboardPeriod,
    updateTransaction,
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
  const [filtersOpen, setFiltersOpen] = useState(Boolean(paramCategory));
  const [query, setQuery] = useState('');
  const [editingTransaction, setEditingTransaction] =
    useState<ExpenseDraft | null>(null);

  useEffect(() => {
    if (
      requestedPeriod === 'week' ||
      requestedPeriod === 'month' ||
      requestedPeriod === 'year'
    ) {
      setDashboardPeriod(requestedPeriod);
    }
  }, [requestedPeriod, setDashboardPeriod]);

  const categoryFilter = paramCategory ?? '';
  const filtersVisible = filtersOpen || Boolean(categoryFilter);

  const periodTransactions = transactionsForPeriod(
    transactions,
    dashboardPeriod,
  );
  const visibleTransactions = periodTransactions.filter((transaction) => {
    const category = transaction.category.trim() || 'Altro';
    const matchesCategory =
      !categoryFilter ||
      category.toLocaleLowerCase('it') ===
        categoryFilter.toLocaleLowerCase('it');
    const normalizedQuery = query.trim().toLocaleLowerCase('it');
    const matchesQuery =
      !normalizedQuery ||
      transaction.description.toLocaleLowerCase('it').includes(normalizedQuery) ||
      category.toLocaleLowerCase('it').includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });
  const summary = summarizeTransactions(visibleTransactions);
  const bins = buildTimelineBins(visibleTransactions, dashboardPeriod);
  const groups = groupTimelineTransactions(
    visibleTransactions,
    dashboardPeriod,
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
  function clearFilters() {
    setQuery('');
    router.setParams({ category: undefined, period: undefined });
  }

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
        title="Timeline"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              filtersVisible ? 'Chiudi ricerca e filtri' : 'Apri ricerca e filtri'
            }
            onPress={() => setFiltersOpen((current) => !current)}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.materialIcon, { color: colors.text }]}>
              filter_list
            </Text>
            {categoryFilter || query ? (
              <View
                style={[styles.filterIndicator, { backgroundColor: colors.accent }]}
              />
            ) : null}
          </Pressable>
        }
      />

      <View style={[styles.periodControl, { backgroundColor: colors.sunken }]}>
        {periods.map((period) => {
          const selected = dashboardPeriod === period.id;
          return (
            <Pressable
              key={period.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setDashboardPeriod(period.id)}
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

      {filtersVisible ? (
        <Card style={styles.filterPanel}>
          <View
            style={[
              styles.searchField,
              { backgroundColor: colors.sunken, borderColor: colors.border },
            ]}>
            <Text style={[styles.searchIcon, { color: colors.textSecondary }]}>
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
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>
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
              <Text style={[styles.clearFiltersText, { color: colors.accent }]}>
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
            color={summary.net >= 0 ? colors.positive : colors.negative}
            amountsVisible={amountsVisible}
            signed
          />
        </View>
        <IncomeExpenseChart bins={bins} />
      </Card>

      {groups.length ? (
        <View style={styles.groups}>
          {groups.map((group) => (
            <View key={group.key}>
              <View style={styles.groupHeader}>
                <View style={styles.flex}>
                  <Text style={[styles.day, { color: colors.text }]}>
                    {group.label}
                  </Text>
                  <Text style={[styles.date, { color: colors.textSecondary }]}>
                    {group.caption}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.groupTotal,
                    {
                      color:
                        group.total >= 0 ? colors.positive : colors.text,
                    },
                  ]}>
                  {amountsVisible
                    ? `${group.total >= 0 ? '+' : '−'} ${formatEuro(Math.abs(group.total))}`
                    : HIDDEN_AMOUNT}
                </Text>
              </View>
              <Card style={styles.transactionCard}>
                {group.transactions.map((transaction, index) => (
                  <TransactionRow
                    key={
                      transaction.id ??
                      `${transaction.occurredAt ?? group.key}-${transaction.description}-${index}`
                    }
                    transaction={transaction}
                    last={index === group.transactions.length - 1}
                    amountsVisible={amountsVisible}
                    onEdit={() => setEditingTransaction(transaction)}
                  />
                ))}
              </Card>
            </View>
          ))}
        </View>
      ) : (
        <Card style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.materialIcon, { color: colors.accent }]}>
              receipt_long
            </Text>
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {categoryFilter || query
              ? 'Nessun movimento corrisponde ai filtri.'
              : 'Qui appariranno i tuoi movimenti.'}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {categoryFilter || query
              ? 'Modifica la ricerca, la categoria o il periodo.'
              : 'Aggiungine uno manualmente o importa un estratto conto.'}
          </Text>
          {categoryFilter || query ? (
            <PrimaryButton onPress={clearFilters}>Rimuovi filtri</PrimaryButton>
          ) : (
            <PrimaryButton onPress={() => router.push('/add-transaction' as Href)}>
              Aggiungi transazione
            </PrimaryButton>
          )}
        </Card>
      )}
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
        />
      ) : null}
    </Screen>
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
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
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
                    backgroundColor: colors.accent,
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

function TransactionRow({
  transaction,
  last,
  amountsVisible,
  onEdit,
}: {
  transaction: ExpenseDraft;
  last: boolean;
  amountsVisible: boolean;
  onEdit: () => void;
}) {
  const { colors } = useFlowndTheme();
  const income = transaction.kind === 'income';
  const occurredAt = transaction.occurredAt
    ? new Date(transaction.occurredAt)
    : new Date();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Modifica transazione ${transaction.description}`}
      disabled={!transaction.id}
      onPress={onEdit}
      style={({ pressed }) => [
        styles.transactionWrap,
        pressed && styles.transactionPressed,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      <View style={styles.transaction}>
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
        <View style={styles.flex}>
          <Text style={[styles.description, { color: colors.text }]}>
            {transaction.description}
          </Text>
          <View style={styles.transactionMeta}>
            <Text style={[styles.category, { color: colors.textSecondary }]}>
              {transaction.category}
            </Text>
            <Text style={[styles.transactionDate, { color: colors.textSecondary }]}> 
              {new Intl.DateTimeFormat('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(occurredAt)}
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
}

function EditTransactionModal({
  transaction,
  saving,
  error,
  onClose,
  onSave,
}: {
  transaction: ExpenseDraft;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (transactionId: string, changes: TransactionUpdate) => Promise<void>;
}) {
  const { colors } = useFlowndTheme();
  const initialKind = transaction.kind === 'income' ? 'income' : 'expense';
  const initialCategory = transaction.category === 'Entrate'
    ? 'Entrata'
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
        ? 'Entrata'
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
                      setCategory(option.id === 'income' ? 'Entrata' : 'Altro');
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
            {error ? <Text style={[styles.sheetError, { color: colors.negative }]}>{error}</Text> : null}
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
  pressed: { opacity: 0.65 },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
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
  periodControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 3,
    marginBottom: 12,
  },
  periodButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodText: { fontFamily: font.bodySemiBold, fontSize: 11 },
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
  groups: { gap: 20 },
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
  transactionCard: { paddingVertical: 0 },
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
});
