import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

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
import {
  listBankConnections,
  type OpenBankingConnection,
  removeBankConnection,
  syncBankConnection,
} from '@/lib/open-banking';
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
  const [connections, setConnections] = useState<OpenBankingConnection[]>([]);
  const [removingConnectionId, setRemovingConnectionId] = useState<string | null>(null);
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
  const authorizedConnections = connections.filter(
    (connection) => connection.status === 'authorized',
  );
  const accessToken = session?.access_token;

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    listBankConnections(accessToken)
      .then((items) => {
        if (active) setConnections(items);
      })
      .catch((reason) => {
        if (!active) return;
        setSyncError(
          reason instanceof Error ? reason.message : 'Collegamenti non disponibili.',
        );
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function reloadConnections() {
    if (!accessToken) return;
    setConnections(await listBankConnections(accessToken));
  }
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
            {authorizedConnections.length ? 'Aggiungi un’altra banca' : 'Collega una banca'}
          </PrimaryButton>
          {authorizedConnections.length ? (
            <SecondaryButton
              disabled={syncing}
              onPress={async () => {
                if (!session?.access_token) return;
                setSyncing(true);
                setSyncError(null);
                try {
                  for (const connection of authorizedConnections) {
                    await syncBankConnection(session.access_token, connection.id);
                  }
                  await refreshData();
                  await reloadConnections();
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

      {authorizedConnections.length ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Conti collegati</Text>
            <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}> 
              {authorizedConnections.length}
            </Text>
          </View>
          <View style={styles.accountList}>
            {authorizedConnections.map((connection) => (
              <Card key={connection.id} style={styles.connectionCard}>
                <View style={styles.accountRow}>
                  <View style={[styles.accountIcon, { backgroundColor: colors.sunken }]}>
                    <Text style={[styles.materialIcon, { color: colors.text }]}>account_balance</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.accountName, { color: colors.text }]}>
                      {connection.aspsp_name}
                    </Text>
                    <Text style={[styles.accountMeta, { color: colors.textSecondary }]}>
                      {connection.last_synced_at
                        ? `Aggiornato ${formatSyncDate(connection.last_synced_at)}`
                        : 'In attesa di sincronizzazione'}
                    </Text>
                  </View>
                  <Text style={[styles.accountBalance, { color: colors.text }]}>
                    {amountsVisible ? formatEuro(connection.balance) : HIDDEN_AMOUNT}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Rimuovi collegamento ${connection.aspsp_name}`}
                  disabled={removingConnectionId === connection.id}
                  onPress={() => {
                    Alert.alert(
                      'Rimuovere il collegamento?',
                      `Flownd interromperà la sincronizzazione con ${connection.aspsp_name}. Le transazioni già importate resteranno nello storico.`,
                      [
                        { text: 'Annulla', style: 'cancel' },
                        {
                          text: 'Rimuovi',
                          style: 'destructive',
                          onPress: async () => {
                            if (!session?.access_token) return;
                            setRemovingConnectionId(connection.id);
                            setSyncError(null);
                            try {
                              await removeBankConnection(
                                session.access_token,
                                connection.id,
                              );
                              await refreshData();
                              await reloadConnections();
                            } catch (reason) {
                              setSyncError(
                                reason instanceof Error
                                  ? reason.message
                                  : 'Rimozione non riuscita.',
                              );
                            } finally {
                              setRemovingConnectionId(null);
                            }
                          },
                        },
                      ],
                    );
                  }}
                  style={({ pressed }) => [
                    styles.removeConnection,
                    { borderTopColor: colors.border },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.removeIcon, { color: colors.negative }]}>delete</Text>
                  <Text style={[styles.removeText, { color: colors.negative }]}>
                    {removingConnectionId === connection.id
                      ? 'Rimozione…'
                      : 'Rimuovi collegamento'}
                  </Text>
                </Pressable>
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
  connectionCard: { paddingBottom: 0, overflow: 'hidden' },
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
  removeConnection: {
    minHeight: 40,
    marginTop: 12,
    marginHorizontal: -16,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  removeIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 17 },
  removeText: { fontFamily: font.bodySemiBold, fontSize: 10 },
  pressed: { opacity: 0.7 },
  planHint: { marginTop: 20 },
  planHintTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  planHintCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 16, marginTop: 3 },
});
