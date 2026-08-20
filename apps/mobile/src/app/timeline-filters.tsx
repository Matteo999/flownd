import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Field,
  PrimaryButton,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { TransactionDateField } from '@/components/transaction-date-field';
import { useApp } from '@/providers/app-provider';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsedDate(value: string | undefined, fallback: Date) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export default function TimelineFiltersScreen() {
  const { colors, isDark } = useFlowndTheme();
  const insets = useSafeAreaInsets();
  const { transactions } = useApp();
  const params = useLocalSearchParams<{
    query?: string | string[];
    categories?: string | string[];
    start?: string | string[];
    end?: string | string[];
    fallbackStart?: string | string[];
    fallbackEnd?: string | string[];
  }>();
  const now = new Date();
  const fallbackStart = parsedDate(first(params.fallbackStart), now);
  const fallbackEnd = parsedDate(first(params.fallbackEnd), now);
  const initialStart = first(params.start);
  const initialEnd = first(params.end);
  const [query, setQuery] = useState(first(params.query) ?? '');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(first(params.categories) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [customDatesEnabled, setCustomDatesEnabled] = useState(
    Boolean(initialStart && initialEnd),
  );
  const [start, setStart] = useState(() => parsedDate(initialStart, fallbackStart));
  const [end, setEnd] = useState(() => parsedDate(initialEnd, fallbackEnd));
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          transactions.map(
            (transaction) => transaction.category.trim() || 'Altro',
          ),
        ),
      ).sort((left, right) => left.localeCompare(right, 'it')),
    [transactions],
  );

  function toggleCategory(category: string) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  function applyFilters() {
    router.dismissTo({
      pathname: '/(tabs)/timeline',
      params: {
        filterToken: String(Date.now()),
        filterQuery: query.trim(),
        filterCategories: JSON.stringify(selectedCategories),
        filterStart: customDatesEnabled ? start.toISOString() : '',
        filterEnd: customDatesEnabled ? end.toISOString() : '',
      },
    } as Href);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen scroll={false} style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi filtri"
            onPress={() => router.back()}
            style={[
              styles.close,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Filtri</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          <Field
            label="Ricerca"
            placeholder="Descrizione o categoria"
            value={query}
            onChangeText={setQuery}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: customDatesEnabled }}
            onPress={() => setCustomDatesEnabled((current) => !current)}
            style={styles.dateToggle}>
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: customDatesEnabled ? colors.accent : colors.surface,
                  borderColor: customDatesEnabled ? colors.accent : colors.border,
                },
              ]}>
              {customDatesEnabled ? (
                <Text style={[styles.check, { color: colors.onAccent }]}>check</Text>
              ) : null}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.toggleTitle, { color: colors.text }]}>Intervallo di date</Text>
              <Text style={[styles.toggleCopy, { color: colors.textSecondary }]}> 
                Se disattivato viene usato il periodo selezionato nella Timeline.
              </Text>
            </View>
          </Pressable>

          {customDatesEnabled ? (
            <View style={styles.dateFields}>
              <TransactionDateField
                label="Dal"
                value={start}
                maximumDate={end}
                onChange={(date) => {
                  const next = new Date(date);
                  next.setHours(0, 0, 0, 0);
                  setStart(next);
                }}
              />
              <TransactionDateField
                label="Al"
                value={end}
                minimumDate={start}
                onChange={(date) => {
                  const next = new Date(date);
                  next.setHours(23, 59, 59, 999);
                  setEnd(next);
                }}
              />
            </View>
          ) : null}

          <Text style={[styles.label, { color: colors.text }]}>Categorie</Text>
          <View
            style={[
              styles.dropdown,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: categoriesOpen }}
              onPress={() => setCategoriesOpen((current) => !current)}
              style={styles.dropdownTrigger}>
              <Text style={[styles.dropdownValue, { color: colors.text }]}> 
                {selectedCategories.length === 0
                  ? 'Tutte le categorie'
                  : selectedCategories.length === 1
                    ? selectedCategories[0]
                    : `${selectedCategories.length} categorie`}
              </Text>
              <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}> 
                {categoriesOpen ? 'expand_less' : 'expand_more'}
              </Text>
            </Pressable>
            {categoriesOpen ? (
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={[styles.dropdownMenu, { borderTopColor: colors.border }]}>
                <FilterOption
                  label="Tutte le categorie"
                  selected={selectedCategories.length === 0}
                  onPress={() => setSelectedCategories([])}
                />
                {categories.map((category) => (
                  <FilterOption
                    key={category}
                    label={category}
                    selected={selectedCategories.includes(category)}
                    onPress={() => toggleCategory(category)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.actions,
            { borderTopColor: colors.border, paddingBottom: Math.max(22, insets.bottom + 12) },
          ]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setQuery('');
              setSelectedCategories([]);
              setCustomDatesEnabled(false);
              setCategoriesOpen(false);
            }}
            style={styles.resetButton}>
            <Text style={[styles.resetText, { color: colors.accent }]}>Azzera</Text>
          </Pressable>
          <View style={styles.applyButton}>
            <PrimaryButton compact onPress={applyFilters}>Applica filtri</PrimaryButton>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function FilterOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && { backgroundColor: colors.accentSoft },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.optionText, { color: selected ? colors.accent : colors.text }]}> 
        {label}
      </Text>
      {selected ? <Text style={[styles.check, { color: colors.accent }]}>check</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { paddingBottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  close: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font.body, fontSize: 25, lineHeight: 28 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  content: { flex: 1 },
  dateToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 20, paddingVertical: 5 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  check: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18, lineHeight: 21 },
  toggleTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  toggleCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  dateFields: { gap: 2 },
  label: { fontFamily: font.bodySemiBold, fontSize: 13, marginTop: 18, marginBottom: 9 },
  dropdown: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dropdownTrigger: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  dropdownValue: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13 },
  dropdownIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  dropdownMenu: { maxHeight: 220, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 5 },
  option: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, marginHorizontal: 5, paddingHorizontal: 10 },
  optionText: { flex: 1, fontFamily: font.body, fontSize: 12 },
  pressed: { opacity: 0.68 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 12 },
  resetButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 8 },
  resetText: { fontFamily: font.bodySemiBold, fontSize: 12 },
  applyButton: { flex: 1 },
});
