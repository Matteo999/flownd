import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field, PrimaryButton, Screen, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import { TransactionDateField } from '@/components/transaction-date-field';
import {
  categoriesForTransactionKind,
  suggestPersonalizedTransactionCategory,
  suggestTransactionCategory,
} from '@/lib/transaction-categories';
import { useApp } from '@/providers/app-provider';

export default function AddTransactionScreen() {
  const { colors, isDark } = useFlowndTheme();
  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  const accountId = Array.isArray(params.accountId)
    ? params.accountId[0]
    : params.accountId;
  const {
    addTransaction,
    financialAccounts,
    planTier,
    transactions,
    saving,
    error,
    clearError,
  } = useApp();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    accountId ?? null,
  );
  const [accountsOpen, setAccountsOpen] = useState(false);
  const manualAccounts = financialAccounts.filter(
    (account) => account.source === 'manual',
  );
  const selectedAccount = manualAccounts.find(
    (account) => account.id === selectedAccountId,
  );
  const effectiveAccountId = selectedAccount?.id ?? null;
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const suggestedCategory = useMemo(
    () =>
      planTier === 'free'
        ? suggestTransactionCategory(description, kind)
        : suggestPersonalizedTransactionCategory(
            description,
            kind,
            transactions,
          ),
    [description, kind, planTier, transactions],
  );
  const category = categoryOverride ?? suggestedCategory;
  const categoryOptions = categoriesForTransactionKind(kind);
  const numericAmount = Number(amount.replace(',', '.')) || 0;
  const insufficientCash = Boolean(
    selectedAccount?.accountKind === 'cash_wallet' &&
      kind === 'expense' &&
      numericAmount > selectedAccount.balance,
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Nuova transazione</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View
          accessibilityRole="tablist"
          style={[styles.kindControl, { backgroundColor: colors.sunken }]}>
          {([
            { id: 'expense', label: 'Uscita' },
            { id: 'income', label: 'Entrata' },
          ] as const).map((option) => {
            const selected = kind === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  clearError();
                  setKind(option.id);
                  setCategoryOverride(null);
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
        <Text style={[uiStyles.title, { color: colors.text }]}>
          {kind === 'income' ? 'Cosa hai ricevuto?' : 'Cosa hai pagato?'}
        </Text>
        <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
          Inserisci descrizione e importo della transazione.
        </Text>
        <Field
          label="Descrizione"
          placeholder={
            kind === 'income' ? 'es. stipendio di luglio' : 'es. pranzo al bar'
          }
          value={description}
          autoFocus
          onChangeText={(value) => {
            clearError();
            setDescription(value);
          }}
        />
        <Field
          label="Importo"
          placeholder="0,00"
          suffix="€"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(value) => {
            clearError();
            setAmount(value);
          }}
        />
        <TransactionDateField value={occurredAt} onChange={setOccurredAt} />
        <Text style={[styles.categoryTitle, { color: colors.text }]}>Conto</Text>
        <View
          style={[
            styles.categoryDropdown,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: accountsOpen }}
            onPress={() => {
              setCategoriesOpen(false);
              setAccountsOpen((current) => !current);
            }}
            style={({ pressed }) => [styles.categoryTrigger, pressed && styles.pressed]}>
            <Text style={[styles.categoryValue, { color: colors.text }]}>
              {selectedAccount?.name ?? 'Automatico'}
            </Text>
            <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>
              {accountsOpen ? 'expand_less' : 'expand_more'}
            </Text>
          </Pressable>
          {accountsOpen ? (
            <View style={[styles.categoryMenu, { borderTopColor: colors.border }]}>
              {[null, ...manualAccounts].map((option) => {
                const optionId = option?.id ?? null;
                const selected = effectiveAccountId === optionId;
                return (
                  <Pressable
                    key={optionId ?? 'none'}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      clearError();
                      setSelectedAccountId(optionId);
                      setAccountsOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.categoryOption,
                      selected && { backgroundColor: colors.accentSoft },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.categoryOptionText, { color: selected ? colors.accent : colors.text }]}>
                      {option?.name ?? 'Automatico'}
                    </Text>
                    {selected ? <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <Text style={[styles.categoryTitle, { color: colors.text }]}>Categoria</Text>
        <View
          style={[
            styles.categoryDropdown,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Categoria selezionata: ${category}`}
            accessibilityState={{ expanded: categoriesOpen }}
            onPress={() => {
              setAccountsOpen(false);
              setCategoriesOpen((current) => !current);
            }}
            style={({ pressed }) => [
              styles.categoryTrigger,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.categoryValue, { color: colors.text }]}>{category}</Text>
            <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>
              {categoriesOpen ? 'expand_less' : 'expand_more'}
            </Text>
          </Pressable>
          {categoriesOpen ? (
            <View style={[styles.categoryMenu, { borderTopColor: colors.border }]}>
              {categoryOptions.map((option) => {
                const selected = category === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      clearError();
                      setCategoryOverride(option);
                      setCategoriesOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.categoryOption,
                      selected && { backgroundColor: colors.accentSoft },
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.categoryOptionText,
                        { color: selected ? colors.accent : colors.text },
                      ]}>
                      {option}
                    </Text>
                    {selected ? (
                      <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        {kind === 'income' ? (
          <Text style={[styles.categoryHint, { color: colors.textSecondary }]}>
            Tredicesima, rimborsi e giroconti restano visibili ma non aumentano
            il budget mensile.
          </Text>
        ) : null}
        {insufficientCash ? (
          <Text style={[uiStyles.error, { color: colors.negative }]}>
            Il portafoglio non contiene abbastanza contanti.
          </Text>
        ) : null}
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton
          disabled={!description.trim() || numericAmount <= 0 || insufficientCash}
          loading={saving}
          onPress={async () => {
            const saved = await addTransaction({
              description: description.trim(),
              amount: numericAmount,
              category,
              kind,
              occurredAt: occurredAt.toISOString(),
              financialAccountId: effectiveAccountId,
            });
            if (saved) router.back();
          }}>
          Aggiungi {kind === 'income' ? 'entrata' : 'uscita'}
        </PrimaryButton>
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
  kindControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 22,
  },
  kindButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindText: { fontFamily: font.bodySemiBold, fontSize: 13 },
  categoryTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    marginTop: 18,
    marginBottom: 9,
  },
  categoryDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  categoryTrigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  categoryValue: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13 },
  dropdownIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  categoryMenu: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 5 },
  categoryOption: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  categoryOptionText: { flex: 1, fontFamily: font.body, fontSize: 12 },
  categoryHint: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  optionCheck: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  pressed: { opacity: 0.68 },
});
