import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  Field,
  PageHeader,
  PrimaryButton,
  Screen,
  SecondaryButton,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function ManualAccountScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const accountId = Array.isArray(params.id) ? params.id[0] : params.id;
  const {
    financialAccounts,
    transactions,
    amountsVisible,
    saving,
    error,
    clearError,
    updateManualFinancialAccountOpeningBalance,
    deleteManualFinancialAccount,
  } = useApp();
  const account = financialAccounts.find(
    (item) => item.id === accountId && item.source === 'manual',
  );
  const [balanceEditorVisible, setBalanceEditorVisible] = useState(false);
  const [balance, setBalance] = useState(
    account ? String(account.openingBalance).replace('.', ',') : '',
  );
  const accountTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.financialAccountId === accountId)
        .slice(0, 12),
    [accountId, transactions],
  );
  const numericBalance = Number(balance.replace(',', '.')) || 0;

  if (!account) {
    return (
      <Screen>
        <PageHeader
          title="Conto manuale"
          leading={<BackButton onPress={() => router.back()} />}
        />
        <Card>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Conto non disponibile</Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
            Potrebbe essere stato rimosso o non essere ancora sincronizzato.
          </Text>
        </Card>
      </Screen>
    );
  }

  const cashWallet = account.accountKind === 'cash_wallet';
  const invalidBalance = cashWallet && numericBalance < 0;

  return (
    <Screen>
      <PageHeader
        title={cashWallet ? 'Portafoglio' : 'Conto manuale'}
        leading={<BackButton onPress={() => router.back()} />}
      />

      <Card
        style={[
          styles.hero,
          { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        ]}>
        <View style={styles.heroHeader}>
          <View style={[styles.accountIcon, { backgroundColor: colors.surface }]}>
            <Text style={[styles.materialIcon, { color: colors.accent }]}>
              {cashWallet ? 'account_balance_wallet' : 'account_balance'}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.accountName, { color: colors.text }]}>{account.name}</Text>
            <Text style={[styles.accountType, { color: colors.textSecondary }]}>
              {cashWallet ? 'Contanti' : 'Aggiornamento manuale'}
            </Text>
          </View>
        </View>
        <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>SALDO</Text>
        <Text style={[styles.balance, { color: colors.text }]}>
          {amountsVisible ? formatEuro(account.balance) : HIDDEN_AMOUNT}
        </Text>
        <Text style={[styles.balanceDate, { color: colors.textSecondary }]}>
          {account.balanceAsOf
            ? `Aggiornato ${formatAccountDate(account.balanceAsOf)}`
            : 'Saldo manuale'}
        </Text>
      </Card>

      <View style={styles.actions}>
        <PrimaryButton
          onPress={() =>
            router.push(`/add-transaction?accountId=${account.id}` as Href)
          }>
          Registra movimento
        </PrimaryButton>
        <SecondaryButton
          onPress={() => {
            clearError();
            setBalance(String(account.openingBalance).replace('.', ','));
            setBalanceEditorVisible((current) => !current);
          }}>
          {balanceEditorVisible ? 'Annulla' : 'Modifica saldo iniziale'}
        </SecondaryButton>
      </View>

      {balanceEditorVisible ? (
        <Card style={styles.balanceEditor}>
          <Text style={[styles.editorTitle, { color: colors.text }]}>Saldo iniziale</Text>
          <Text style={[styles.editorCopy, { color: colors.textSecondary }]}> 
            È il punto di partenza del conto e non compare nella Timeline.
            Entrate e uscite successive vanno registrate come movimenti.
          </Text>
          <Field
            label="Saldo iniziale"
            placeholder="0,00"
            suffix="€"
            keyboardType="decimal-pad"
            value={balance}
            onChangeText={(value) => {
              clearError();
              setBalance(value);
            }}
          />
          {invalidBalance ? (
            <Text style={[styles.error, { color: colors.negative }]}>
              Il saldo del portafoglio non può essere negativo.
            </Text>
          ) : null}
          {error ? <Text style={[styles.error, { color: colors.negative }]}>{error}</Text> : null}
          <PrimaryButton
            disabled={invalidBalance}
            loading={saving}
            onPress={async () => {
              const updated = await updateManualFinancialAccountOpeningBalance(
                account.id,
                numericBalance,
              );
              if (updated) setBalanceEditorVisible(false);
            }}>
            Salva saldo iniziale
          </PrimaryButton>
        </Card>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Movimenti</Text>
        <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}>
          {accountTransactions.length}
        </Text>
      </View>
      {accountTransactions.length ? (
        <View style={styles.transactionList}>
          {accountTransactions.map((transaction) => {
            const income = transaction.kind === 'income';
            return (
              <Card key={transaction.id} style={styles.transactionRow}>
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
                  <Text style={[styles.transactionName, { color: colors.text }]}>
                    {transaction.description}
                  </Text>
                  <Text style={[styles.transactionMeta, { color: colors.textSecondary }]}>
                    {transaction.category}
                    {transaction.occurredAt
                      ? ` · ${formatAccountDate(transaction.occurredAt)}`
                      : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    { color: income ? colors.positive : colors.text },
                  ]}>
                  {amountsVisible
                    ? `${income ? '+' : '−'} ${formatEuro(transaction.amount)}`
                    : HIDDEN_AMOUNT}
                </Text>
              </Card>
            );
          })}
        </View>
      ) : (
        <Card>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
            Registra la prima entrata o uscita per iniziare il dettaglio.
          </Text>
        </Card>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Elimina ${account.name}`}
        onPress={() =>
          Alert.alert(
            cashWallet ? 'Elimina portafoglio?' : 'Elimina conto manuale?',
            'Il conto e tutti i movimenti associati verranno eliminati. Questa operazione non può essere annullata.',
            [
              { text: 'Annulla', style: 'cancel' },
              {
                text: 'Elimina',
                style: 'destructive',
                onPress: () => {
                  void deleteManualFinancialAccount(account.id).then((deleted) => {
                    if (deleted) router.back();
                  });
                },
              },
            ],
          )
        }
        style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
        <Text style={[styles.deleteText, { color: colors.negative }]}>Elimina conto</Text>
      </Pressable>
    </Screen>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Indietro"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
      <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
    </Pressable>
  );
}

function formatAccountDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
  hero: { backgroundColor: 'transparent' },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  accountName: { fontFamily: font.bodySemiBold, fontSize: 14 },
  accountType: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  balanceLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.9,
    marginTop: 22,
  },
  balance: { fontFamily: font.displayBold, fontSize: 30, marginTop: 4 },
  balanceDate: { fontFamily: font.body, fontSize: 9, marginTop: 4 },
  actions: { gap: 8, marginTop: 12 },
  balanceEditor: { marginTop: 12 },
  editorTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  editorCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 16, marginTop: 3 },
  error: { fontFamily: font.bodyMedium, fontSize: 10, marginBottom: 9 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 9,
  },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  sectionCaption: { fontFamily: font.body, fontSize: 10 },
  transactionList: { gap: 8 },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionName: { fontFamily: font.bodySemiBold, fontSize: 11 },
  transactionMeta: { fontFamily: font.body, fontSize: 8, marginTop: 2 },
  transactionAmount: { fontFamily: font.dataMedium, fontSize: 10 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  emptyCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 16, marginTop: 3 },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  deleteText: { fontFamily: font.bodySemiBold, fontSize: 12 },
});
