import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Card,
  Field,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { TransactionDateField } from '@/components/transaction-date-field';
import type { ManualFinancialAccountDraft } from '@/providers/app-provider';
import { useApp } from '@/providers/app-provider';

const accountKinds: {
  id: ManualFinancialAccountDraft['accountKind'];
  title: string;
  copy: string;
  icon: string;
  defaultName: string;
}[] = [
  {
    id: 'cash_wallet',
    title: 'Portafoglio contanti',
    copy: 'Registra incassi e pagamenti effettuati in contanti.',
    icon: 'account_balance_wallet',
    defaultName: 'Portafoglio',
  },
  {
    id: 'manual_bank',
    title: 'Conto manuale',
    copy: 'Per conti non collegati o aggiornati manualmente.',
    icon: 'account_balance',
    defaultName: 'Conto manuale',
  },
];

export default function AddManualAccountScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { createManualFinancialAccount, saving, error, clearError } = useApp();
  const [accountKind, setAccountKind] =
    useState<ManualFinancialAccountDraft['accountKind']>('cash_wallet');
  const [name, setName] = useState('Portafoglio');
  const [balance, setBalance] = useState('');
  const [balanceAsOf, setBalanceAsOf] = useState(() => new Date());
  const numericBalance = Number(balance.replace(',', '.')) || 0;
  const invalidCashBalance = accountKind === 'cash_wallet' && numericBalance < 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            style={[
              styles.close,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Aggiungi patrimonio</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={[uiStyles.title, { color: colors.text }]}>Cosa vuoi tracciare?</Text>
        <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
          Il saldo iniziale alimenta il patrimonio, ma non viene considerato
          reddito né modifica il budget.
        </Text>

        <View style={styles.kindList}>
          {accountKinds.map((option) => {
            const selected = option.id === accountKind;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  clearError();
                  const previousDefault = accountKinds.find(
                    (item) => item.id === accountKind,
                  )?.defaultName;
                  setAccountKind(option.id);
                  if (!name.trim() || name === previousDefault) {
                    setName(option.defaultName);
                  }
                }}>
                <Card
                  style={[
                    styles.kindCard,
                    {
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected
                        ? colors.accentSoft
                        : colors.surface,
                    },
                  ]}>
                  <View style={[styles.kindIcon, { backgroundColor: colors.sunken }]}>
                    <Text style={[styles.materialIcon, { color: colors.accent }]}>
                      {option.icon}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.kindTitle, { color: colors.text }]}>
                      {option.title}
                    </Text>
                    <Text style={[styles.kindCopy, { color: colors.textSecondary }]}>
                      {option.copy}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.materialIcon,
                      { color: selected ? colors.accent : colors.border },
                    ]}>
                    {selected ? 'check_circle' : 'circle'}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="Nome"
          placeholder={accountKind === 'cash_wallet' ? 'Portafoglio' : 'Conto manuale'}
          value={name}
          onChangeText={(value) => {
            clearError();
            setName(value);
          }}
        />
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
        <TransactionDateField
          label="Saldo iniziale al"
          value={balanceAsOf}
          onChange={setBalanceAsOf}
        />
        {invalidCashBalance ? (
          <Text style={[uiStyles.error, { color: colors.negative }]}>
            Il saldo del portafoglio non può essere negativo.
          </Text>
        ) : null}
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton
          disabled={!name.trim() || invalidCashBalance}
          loading={saving}
          onPress={async () => {
            const accountId = await createManualFinancialAccount({
              name: name.trim(),
              balance: numericBalance,
              accountKind,
              balanceAsOf: balanceAsOf.toISOString(),
            });
            if (accountId) router.back();
          }}>
          Inizia a tracciare
        </PrimaryButton>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontFamily: font.body, fontSize: 25, lineHeight: 28 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  kindList: { gap: 9, marginTop: 18, marginBottom: 10 },
  kindCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
  },
  kindIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  kindTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  kindCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
});
