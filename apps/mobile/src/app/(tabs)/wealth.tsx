import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppHeaderActions } from '@/components/app-header-actions';
import {
  Card,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { formatEuro } from '@/lib/onboarding';
import { listBankConnections, syncBankConnection } from '@/lib/open-banking';
import { useApp } from '@/providers/app-provider';

export default function WealthScreen() {
  const { colors } = useFlowndTheme();
  const {
    financialAccounts,
    amountsVisible,
    planTier,
    session,
    refreshData,
  } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const netWorth = financialAccounts.reduce(
    (sum, account) => sum + account.balance,
    0,
  );
  const previousNetWorth = financialAccounts.reduce(
    (sum, account) => sum + (account.previousMonthBalance ?? account.balance),
    0,
  );
  const hasPreviousData = financialAccounts.some(
    (account) => account.previousMonthBalance != null,
  );
  const delta = netWorth - previousNetWorth;
  const deltaPercentage = previousNetWorth
    ? (delta / Math.abs(previousNetWorth)) * 100
    : 0;
  const openBankingAccounts = financialAccounts.filter(
    (account) => account.source === 'open_banking',
  );
  const maxChartValue = Math.max(
    1,
    Math.abs(previousNetWorth),
    Math.abs(netWorth),
  );

  return (
    <Screen>
      <PageHeader title="Patrimonio" action={<AppHeaderActions />} />

      <Card
        style={[
          styles.hero,
          { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        ]}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>PATRIMONIO NETTO</Text>
        <Text style={[styles.netWorth, { color: colors.text }]}> 
          {amountsVisible ? formatEuro(netWorth) : HIDDEN_AMOUNT}
        </Text>
        {hasPreviousData ? (
          <Text
            style={[
              styles.delta,
              { color: delta >= 0 ? colors.positive : colors.negative },
            ]}>
            {amountsVisible
              ? `${delta >= 0 ? '+' : '−'}${formatEuro(Math.abs(delta))} · ${Math.abs(deltaPercentage).toFixed(1)}% nell’ultimo mese`
              : 'Variazione mensile nascosta'}
          </Text>
        ) : (
          <Text style={[styles.delta, { color: colors.textSecondary }]}> 
            {financialAccounts.length
              ? 'Lo storico comparirà dopo il primo mese completo.'
              : 'Aggiungi un conto per iniziare a costruire il patrimonio.'}
          </Text>
        )}
      </Card>

      {planTier !== 'free' ? (
        <View style={styles.connectAction}>
          <PrimaryButton onPress={() => router.push('/connect-bank' as Href)}>
            {openBankingAccounts.length ? 'Aggiungi un’altra banca' : 'Collega una banca'}
          </PrimaryButton>
          {openBankingAccounts.length ? (
            <SecondaryButton
              disabled={syncing}
              onPress={async () => {
                if (!session?.access_token) return;
                setSyncing(true);
                setSyncError(null);
                try {
                  const connections = await listBankConnections(session.access_token);
                  for (const connection of connections.filter(
                    (item) => item.status === 'authorized',
                  )) {
                    await syncBankConnection(session.access_token, connection.id);
                  }
                  await refreshData();
                } catch (reason) {
                  setSyncError(
                    reason instanceof Error
                      ? reason.message
                      : 'Sincronizzazione non riuscita.',
                  );
                } finally {
                  setSyncing(false);
                }
              }}>
              {syncing ? 'Sincronizzazione…' : 'Sincronizza ora'}
            </SecondaryButton>
          ) : null}
          {syncError ? (
            <Text style={[styles.syncError, { color: colors.negative }]}>{syncError}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Andamento</Text>
        <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}>Ultimo mese</Text>
      </View>
      <Card>
        {hasPreviousData ? (
          <View style={styles.chart}>
            <ChartColumn
              label="Mese scorso"
              value={previousNetWorth}
              maxValue={maxChartValue}
              visible={amountsVisible}
              color={colors.textSecondary}
            />
            <ChartColumn
              label="Oggi"
              value={netWorth}
              maxValue={maxChartValue}
              visible={amountsVisible}
              color={colors.accent}
            />
          </View>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={[styles.chartEmptyIcon, { color: colors.textSecondary }]}>show_chart</Text>
            <Text style={[styles.chartEmptyText, { color: colors.textSecondary }]}> 
              Servono almeno due rilevazioni per mostrare l’andamento.
            </Text>
          </View>
        )}
      </Card>

      {planTier !== 'free' && openBankingAccounts.length ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Conti collegati</Text>
            <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}> 
              {openBankingAccounts.length}
            </Text>
          </View>
          <View style={styles.accountList}>
            {openBankingAccounts.map((account) => (
              <Card key={account.id} style={styles.accountRow}>
                <View style={[styles.accountIcon, { backgroundColor: colors.sunken }]}> 
                  <Text style={[styles.materialIcon, { color: colors.text }]}>account_balance</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.accountName, { color: colors.text }]}>{account.name}</Text>
                  <Text style={[styles.accountMeta, { color: colors.textSecondary }]}> 
                    {account.lastSyncedAt
                      ? `Aggiornato ${formatSyncDate(account.lastSyncedAt)}`
                      : 'In attesa di sincronizzazione'}
                  </Text>
                </View>
                <Text style={[styles.accountBalance, { color: colors.text }]}> 
                  {amountsVisible ? formatEuro(account.balance) : HIDDEN_AMOUNT}
                </Text>
              </Card>
            ))}
          </View>
        </>
      ) : planTier === 'free' ? (
        <Card style={[styles.planHint, { backgroundColor: colors.sunken }]}> 
          <Text style={[styles.planHintTitle, { color: colors.text }]}>Open Banking con Pro e Max</Text>
          <Text style={[styles.planHintCopy, { color: colors.textSecondary }]}> 
            Nel piano Free il patrimonio resta aggregato e manuale. Pro collega fino a 2 banche; Max fino a 10.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function ChartColumn({
  label,
  value,
  maxValue,
  visible,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  visible: boolean;
  color: string;
}) {
  const { colors } = useFlowndTheme();
  const height = Math.max(14, (Math.abs(value) / maxValue) * 92);
  return (
    <View style={styles.chartColumn}>
      <Text style={[styles.chartValue, { color: colors.text }]}> 
        {visible ? formatEuro(value) : HIDDEN_AMOUNT}
      </Text>
      <View style={[styles.chartBar, { backgroundColor: color, height }]} />
      <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function formatSyncDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { marginBottom: 2 },
  connectAction: { marginTop: 12, gap: 8 },
  syncError: { fontFamily: font.bodyMedium, fontSize: 10 },
  eyebrow: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  netWorth: { fontFamily: font.displayBold, fontSize: 32, lineHeight: 41, marginTop: 7 },
  delta: { fontFamily: font.dataMedium, fontSize: 11, lineHeight: 17, marginTop: 5 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 9,
  },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  sectionCaption: { fontFamily: font.body, fontSize: 10 },
  chart: {
    height: 154,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 18,
  },
  chartColumn: { width: 112, alignItems: 'center' },
  chartValue: { fontFamily: font.dataMedium, fontSize: 10, marginBottom: 7 },
  chartBar: { width: 54, borderRadius: 12 },
  chartLabel: { fontFamily: font.bodyMedium, fontSize: 10, marginTop: 7 },
  chartEmpty: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  chartEmptyIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 28 },
  chartEmptyText: { fontFamily: font.body, fontSize: 11, marginTop: 7 },
  accountList: { gap: 9 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  accountName: { fontFamily: font.bodySemiBold, fontSize: 13 },
  accountMeta: { fontFamily: font.body, fontSize: 9, marginTop: 2 },
  accountBalance: { fontFamily: font.dataMedium, fontSize: 12 },
  planHint: { marginTop: 20 },
  planHintTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  planHintCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 16, marginTop: 3 },
});
