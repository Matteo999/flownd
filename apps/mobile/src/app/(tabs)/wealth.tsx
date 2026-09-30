import { type Href, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Slider } from '@expo/ui/community/slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppHeaderActions } from '@/components/app-header-actions';
import {
  Card,
  GlassSegmentedControl,
  GlassIconButton,
  GlassNavBar,
  LargeTitle,
  PrimaryButton,
  SecondaryButton,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { formatEuro } from '@/lib/onboarding';
import {
  buildNetWorthHistory,
  type NetWorthHistoryPoint,
} from '@/lib/wealth-history';
import {
  buildForecastEvents,
  computeSavingsBaseline,
  FORECAST_HISTORY_MONTHS,
  type ForecastEvent,
  forecastBand,
  monthsToReach,
  nextNetWorthMilestone,
  projectNetWorth,
} from '@/lib/wealth-forecast';
import {
  bankConnectionsQuery,
  type OpenBankingConnection,
  syncBankConnection,
} from '@/lib/open-banking';
import { queryKeys } from '@/lib/query-client';
import { useAppState } from '@/providers/app-provider';

const NO_CONNECTIONS: OpenBankingConnection[] = [];
const HORIZONS = [
  { months: 6, label: '6M', long: '6 mesi' },
  { months: 12, label: '1A', long: '12 mesi' },
  { months: 36, label: '3A', long: '3 anni' },
  { months: 60, label: '5A', long: '5 anni' },
] as const;
const MAX_HORIZON = HORIZONS[HORIZONS.length - 1].months;
const ACCOUNT_COLORS = ['#3D8BFF', '#20C58A', '#8B6CFF', '#FFB020', '#FF6685', '#18A8D8'];

function forecastMonthDate(offset: number, now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function longMonth(offset: number) {
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
    .format(forecastMonthDate(offset));
}

function shortMonth(date: Date) {
  const month = new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date);
  return date.getFullYear() === new Date().getFullYear()
    ? month
    : `${month} ${String(date.getFullYear()).slice(2)}`;
}

function roundUpTo25(value: number) {
  return Math.ceil(value / 25) * 25;
}

function signedEuro(value: number) {
  return `${value >= 0 ? '+' : '−'}${formatEuro(Math.abs(value))}`;
}

export default function WealthScreen() {
  const { colors } = useFlowndTheme();
  const {
    financialAccounts,
    transactions,
    recurringPayments,
    amountsVisible,
    planTier,
    session,
    refreshData,
  } = useAppState(
    'financialAccounts',
    'transactions',
    'recurringPayments',
    'amountsVisible',
    'planTier',
    'session',
    'refreshData',
  );
  const [syncing, setSyncing] = useState(false);
  const [syncRotation] = useState(() => new Animated.Value(0));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<number>(12);
  const [extraSaving, setExtraSaving] = useState(0);
  const [disabledEventIds, setDisabledEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const userId = session?.user.id;
  const connectionsQuery = useQuery({
    ...bankConnectionsQuery(userId ?? ''),
    enabled: Boolean(userId),
  });
  const connections = connectionsQuery.data ?? NO_CONNECTIONS;
  const connectionsLoading = connectionsQuery.isPending && Boolean(userId);
  const connectionsError =
    connectionsQuery.error instanceof Error ? connectionsQuery.error.message : null;
  const queryClient = useQueryClient();
  const netWorth = financialAccounts.reduce(
    (sum, account) => sum + account.balance,
    0,
  );
  const financialAccountIds = useMemo(
    () => financialAccounts.map((account) => account.id),
    [financialAccounts],
  );
  const lastMonthHistory = useMemo(
    () => buildNetWorthHistory({ currentNetWorth: netWorth, financialAccountIds, transactions }),
    [financialAccountIds, netWorth, transactions],
  );
  const chartHistory = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - FORECAST_HISTORY_MONTHS);
    return buildNetWorthHistory({
      currentNetWorth: netWorth,
      financialAccountIds,
      transactions,
      now,
      days: Math.round((now.getTime() - start.getTime()) / 86_400_000),
      pointCount: FORECAST_HISTORY_MONTHS + 1,
    });
  }, [financialAccountIds, netWorth, transactions]);
  const previousNetWorth = lastMonthHistory[0]?.value ?? netWorth;
  const hasPreviousData = financialAccounts.length > 0;
  const delta = netWorth - previousNetWorth;
  const deltaPercentage = previousNetWorth
    ? (delta / Math.abs(previousNetWorth)) * 100
    : 0;
  const authorizedConnections = connections.filter(
    (connection) => connection.status === 'authorized',
  );
  const manualAccounts = financialAccounts.filter(
    (account) => account.source === 'manual',
  );

  // Previsione (solo Max): risparmio medio, eventi e proiezione sull'orizzonte scelto.
  const forecastEnabled = planTier === 'max' && hasPreviousData;
  const baseline = useMemo(
    () => forecastEnabled
      ? computeSavingsBaseline({ transactions, financialAccountIds, recurringPayments })
      : null,
    [financialAccountIds, forecastEnabled, recurringPayments, transactions],
  );
  const forecastEvents = useMemo(
    () => baseline
      ? buildForecastEvents({ recurringPayments, transactions, financialAccountIds, horizon: MAX_HORIZON })
      : [],
    [baseline, financialAccountIds, recurringPayments, transactions],
  );
  const forecast = useMemo(() => {
    if (!baseline) return null;
    const baseSaving = Math.round(baseline.monthly);
    const monthlySaving = baseSaving + extraSaving;
    const allEventIds = new Set(forecastEvents.map((event) => event.id));
    const enabledEventIds = new Set(
      [...allEventIds].filter((id) => !disabledEventIds.has(id)),
    );
    const median = projectNetWorth({
      netWorth, monthlySaving, events: forecastEvents, enabledEventIds, months: horizon,
    });
    const band = forecastBand(median, baseline.sigma);
    const milestone = nextNetWorthMilestone(netWorth);
    const reachMonths = monthsToReach(milestone, {
      netWorth, monthlySaving, events: forecastEvents, enabledEventIds,
    });
    const baselineReachMonths = monthsToReach(milestone, {
      netWorth, monthlySaving: baseSaving, events: forecastEvents, enabledEventIds: allEventIds,
    });
    const sliderSpan = Math.max(300, Math.abs(baseSaving) * 0.6);
    return {
      baseSaving,
      monthlySaving,
      enabledEventIds,
      median,
      ...band,
      milestone,
      reachMonths,
      baselineReachMonths,
      sliderMin: -roundUpTo25(sliderSpan),
      sliderMax: roundUpTo25(sliderSpan * 2),
    };
  }, [baseline, disabledEventIds, extraSaving, forecastEvents, horizon, netWorth]);
  const horizonInfo = HORIZONS.find((item) => item.months === horizon) ?? HORIZONS[1];

  // Al ritorno sulla schermata (es. dopo aver collegato una banca) rilegge se scaduti.
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    void queryClient.refetchQueries({ queryKey: queryKeys.bankConnections(userId), stale: true });
  }, [queryClient, userId]));

  async function reloadConnections() {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.bankConnections(userId) });
  }

  const canSync = authorizedConnections.length > 0 && planTier !== 'free';

  useEffect(() => {
    if (!syncing) {
      syncRotation.stopAnimation();
      syncRotation.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(syncRotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [syncRotation, syncing]);

  async function syncAllConnections() {
    if (!session?.access_token || syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      for (const connection of authorizedConnections) {
        await syncBankConnection(session.access_token, connection.id);
      }
      await refreshData();
      await reloadConnections();
    } catch (reason) {
      setSyncError(reason instanceof Error ? reason.message : 'Sincronizzazione non riuscita.');
    } finally {
      setSyncing(false);
    }
  }

  function toggleEvent(id: string) {
    setDisabledEventIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addBankConnection() {
    if (planTier === 'free') {
      Alert.alert(
        'Collega le banche con Pro',
        'Passa al piano Pro per collegare fino a 2 banche e aggiornare automaticamente saldi e movimenti.',
        [{ text: 'Non ora', style: 'cancel' }, { text: 'Ho capito' }],
      );
      return;
    }
    if (planTier === 'pro' && authorizedConnections.length >= 2) {
      Alert.alert(
        'Hai raggiunto il limite Pro',
        'Passa al piano Max per collegare fino a 4 banche e condividere Pro con altre 2 persone.',
        [{ text: 'Non ora', style: 'cancel' }, { text: 'Ho capito' }],
      );
      return;
    }
    if (planTier === 'max' && authorizedConnections.length >= 4) {
      Alert.alert(
        'Limite collegamenti raggiunto',
        'Il piano Max consente fino a 4 collegamenti bancari attivi.',
      );
      return;
    }
    router.push('/connect-bank' as Href);
  }

  const netWorthLabel = amountsVisible ? formatEuro(netWorth) : HIDDEN_AMOUNT;
  const decimalIndex = amountsVisible ? netWorthLabel.indexOf(',') : -1;
  const milestoneDiff =
    forecast
    && forecast.reachMonths != null
    && forecast.baselineReachMonths != null
    && forecast.reachMonths !== forecast.baselineReachMonths
      ? forecast.baselineReachMonths - forecast.reachMonths
      : 0;
  const forecastDelta = forecast ? forecast.median[horizon] - netWorth : 0;

  return (
    <Screen
      animateFirstFocus
      transparentHeaderOnScroll
      onRefresh={refreshData}
      fixedHeader={
        <GlassNavBar
          title="Patrimonio"
          actions={
            <>
              {canSync ? (
                <GlassIconButton
                  accessibilityLabel={syncing ? 'Sincronizzazione in corso' : 'Sincronizza i conti collegati'}
                  onPress={() => void syncAllConnections()}>
                  <Animated.Text
                    style={[
                      styles.syncIcon,
                      {
                        color: colors.text,
                        transform: [{
                          rotate: syncRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        }],
                      },
                    ]}>
                    sync
                  </Animated.Text>
                </GlassIconButton>
              ) : null}
              <AppHeaderActions glass />
            </>
          }
        />
      }>
      <LargeTitle title="Patrimonio" />

      <View style={styles.hero}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>PATRIMONIO NETTO</Text>
        <View style={styles.netWorthRow}>
          <Text style={[styles.netWorth, { color: colors.text }]}>
            {decimalIndex > 0 ? netWorthLabel.slice(0, decimalIndex) : netWorthLabel}
          </Text>
          {decimalIndex > 0 ? (
            <Text style={[styles.netWorthDecimals, { color: colors.text }]}>
              {netWorthLabel.slice(decimalIndex)}
            </Text>
          ) : null}
        </View>
        {hasPreviousData ? (
          <View style={styles.deltaRow}>
            <View
              style={[
                styles.deltaPill,
                { backgroundColor: delta >= 0 ? colors.positiveSoft : colors.negativeSoft },
              ]}>
              <Text
                style={[
                  styles.deltaIcon,
                  { color: delta >= 0 ? colors.positive : colors.negative },
                ]}>
                {delta >= 0 ? 'arrow_upward' : 'arrow_downward'}
              </Text>
              <Text
                style={[
                  styles.deltaText,
                  { color: delta >= 0 ? colors.positive : colors.negative },
                ]}>
                {amountsVisible
                  ? `${signedEuro(delta)} · ${Math.abs(deltaPercentage).toFixed(1).replace('.', ',')}%`
                  : HIDDEN_AMOUNT}
              </Text>
            </View>
            <Text style={[styles.deltaCaption, { color: colors.textSecondary }]}>
              nell’ultimo mese
            </Text>
          </View>
        ) : (
          <Text style={[styles.deltaCaption, styles.heroEmpty, { color: colors.textSecondary }]}>
            Aggiungi un conto per iniziare a costruire il patrimonio.
          </Text>
        )}
      </View>

      {forecast ? (
        <GlassSegmentedControl
          options={HORIZONS.map((item) => ({
            id: String(item.months),
            label: item.label,
            accessibilityLabel: `Previsione a ${item.long}`,
          }))}
          selectedIndex={Math.max(0, HORIZONS.findIndex((item) => item.months === horizon))}
          onChange={(index) => setHorizon(HORIZONS[index].months)}
          style={styles.horizonSwitch}
        />
      ) : null}

      <Card style={styles.trendCard}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          {forecast ? 'Andamento e previsione' : 'Andamento'}
        </Text>
        <Text style={[styles.cardCaption, { color: colors.textSecondary }]}>
          Ultimi {FORECAST_HISTORY_MONTHS} mesi{forecast ? ` · prossimi ${horizonInfo.long}` : ''}
        </Text>
        {hasPreviousData ? (
          <>
            <WealthChart
              history={chartHistory}
              forecast={
                forecast
                  ? {
                      median: forecast.median,
                      low: forecast.low,
                      high: forecast.high,
                      horizon,
                      milestone: forecast.milestone,
                      markers: forecastEvents.flatMap((event) =>
                        forecast.enabledEventIds.has(event.id)
                          ? event.offsets
                              .filter((offset) => offset <= horizon)
                              .map((offset) => ({ offset, positive: event.amount > 0 }))
                          : []),
                    }
                  : null
              }
              amountsVisible={amountsVisible}
            />
            {forecast ? <ChartLegend /> : null}
          </>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={[styles.chartEmptyIcon, { color: colors.textSecondary }]}>show_chart</Text>
            <Text style={[styles.chartEmptyText, { color: colors.textSecondary }]}>
              Aggiungi un conto per iniziare a ricostruire l’andamento.
            </Text>
          </View>
        )}
      </Card>

      {forecast && baseline ? (
        <>
          <Card style={styles.forecastCard}>
            <View style={styles.forecastHeader}>
              <View style={styles.flex}>
                <Text style={[styles.forecastEyebrow, { color: colors.textSecondary }]}>
                  PREVISIONE · {longMonth(horizon).toUpperCase()}
                </Text>
                <Text style={[styles.forecastValue, { color: colors.text }]}>
                  {amountsVisible ? formatEuro(Math.round(forecast.median[horizon])) : HIDDEN_AMOUNT}
                </Text>
                <Text style={[styles.forecastRange, { color: colors.textSecondary }]}>
                  {amountsVisible
                    ? `tra ${formatEuro(Math.round(forecast.low[horizon]))} e ${formatEuro(Math.round(forecast.high[horizon]))}`
                    : HIDDEN_AMOUNT}
                </Text>
              </View>
              <View
                style={[
                  styles.forecastDelta,
                  { backgroundColor: forecastDelta >= 0 ? colors.positiveSoft : colors.negativeSoft },
                ]}>
                <Text
                  style={[
                    styles.forecastDeltaText,
                    { color: forecastDelta >= 0 ? colors.positive : colors.negative },
                  ]}>
                  {amountsVisible ? signedEuro(Math.round(forecastDelta)) : HIDDEN_AMOUNT}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.whatIfHeader}>
              <Text style={[styles.whatIfTitle, { color: colors.text }]}>E se risparmiassi…</Text>
              <Text style={[styles.whatIfValue, { color: colors.accent }]}>
                {formatEuro(forecast.monthlySaving)}/mese
              </Text>
            </View>
            <Text style={[styles.whatIfCaption, { color: colors.textSecondary }]}>
              {extraSaving === 0
                ? `La tua media degli ultimi ${baseline.months} mesi`
                : `${signedEuro(extraSaving)} rispetto alla tua media di ${formatEuro(forecast.baseSaving)}`}
            </Text>
            <Slider
              value={extraSaving}
              minimumValue={forecast.sliderMin}
              maximumValue={forecast.sliderMax}
              step={25}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.sunken}
              thumbTintColor={colors.accent}
              onValueChange={(value) => setExtraSaving(Math.round(value / 25) * 25)}
              style={styles.slider}
            />
            <View style={styles.sliderLabels}>
              <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
                {formatEuro(forecast.baseSaving + forecast.sliderMin)}
              </Text>
              <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
                {formatEuro(forecast.baseSaving + forecast.sliderMax)}
              </Text>
            </View>

            {forecastEvents.length ? (
              <>
                <Text style={[styles.eventsTitle, { color: colors.textSecondary }]}>EVENTI PREVISTI</Text>
                {forecastEvents.map((event, index) => (
                  <ForecastEventRow
                    key={event.id}
                    event={event}
                    enabled={!disabledEventIds.has(event.id)}
                    last={index === forecastEvents.length - 1}
                    amountsVisible={amountsVisible}
                    onToggle={() => toggleEvent(event.id)}
                  />
                ))}
              </>
            ) : null}

            <Text style={[styles.forecastNote, { color: colors.textSecondary }]}>
              Basata sui tuoi risparmi medi degli ultimi {baseline.months} mesi completi, esclusi gli
              eventi qui sopra. L’intervallo all’80% usa la variabilità di quei mesi.
            </Text>
          </Card>

          <Card style={styles.milestoneCard}>
            <View style={[styles.milestoneIcon, { backgroundColor: colors.positiveSoft }]}>
              <Text style={[styles.materialIconLarge, { color: colors.positive }]}>flag</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.milestoneTitle, { color: colors.text }]}>Prossimo traguardo</Text>
              <Text style={[styles.milestoneCaption, { color: colors.textSecondary }]}>
                Patrimonio di {amountsVisible ? formatEuro(forecast.milestone) : HIDDEN_AMOUNT}
              </Text>
              <View style={[styles.milestoneTrack, { backgroundColor: colors.positiveSoft }]}>
                <View
                  style={[
                    styles.milestoneFill,
                    {
                      backgroundColor: colors.positive,
                      width: `${Math.max(0, Math.min(100, (netWorth / forecast.milestone) * 100))}%`,
                    },
                  ]}
                />
              </View>
            </View>
            <View style={styles.milestoneWhen}>
              <Text style={[styles.milestoneCaption, { color: colors.textSecondary }]}>Previsto</Text>
              <Text style={[styles.milestoneDate, { color: colors.text }]}>
                {forecast.reachMonths == null ? 'Oltre 20 anni' : longMonth(forecast.reachMonths)}
              </Text>
              <Text
                style={[
                  styles.milestoneDiff,
                  {
                    color: milestoneDiff > 0
                      ? colors.positive
                      : milestoneDiff < 0
                        ? colors.negative
                        : colors.textSecondary,
                  },
                ]}>
                {milestoneDiff === 0
                  ? 'Scenario attuale'
                  : `${Math.abs(milestoneDiff)} ${Math.abs(milestoneDiff) === 1 ? 'mese' : 'mesi'} ${milestoneDiff > 0 ? 'prima' : 'dopo'}`}
              </Text>
            </View>
          </Card>
        </>
      ) : forecastEnabled ? (
        <Card style={styles.forecastCard}>
          <View style={styles.lockedRow}>
            <View style={[styles.milestoneIcon, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.materialIconLarge, { color: colors.accent }]}>hourglass_top</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.milestoneTitle, { color: colors.text }]}>Previsione in preparazione</Text>
              <Text style={[styles.lockedCopy, { color: colors.textSecondary }]}>
                Servono almeno 2 mesi completi di movimenti sui tuoi conti per stimare quanto risparmi
                ogni mese.
              </Text>
            </View>
          </View>
        </Card>
      ) : hasPreviousData ? (
        <Card style={styles.forecastCard}>
          <View style={styles.lockedRow}>
            <View style={[styles.milestoneIcon, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.materialIconLarge, { color: colors.accent }]}>auto_graph</Text>
            </View>
            <View style={styles.flex}>
              <View style={styles.lockedTitleRow}>
                <Text style={[styles.milestoneTitle, { color: colors.text }]}>Previsione del patrimonio</Text>
                <View style={[styles.maxBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.maxBadgeText, { color: colors.onAccent }]}>MAX</Text>
                </View>
              </View>
              <Text style={[styles.lockedCopy, { color: colors.textSecondary }]}>
                Scopri dove sarà il tuo patrimonio tra 6 mesi o 5 anni, prova scenari di risparmio e
                vedi quando raggiungi il prossimo traguardo. Disponibile con il piano Max.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {financialAccounts.length > 1 ? (
        <AccountComposition
          accounts={financialAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            balance: account.balance,
          }))}
        />
      ) : null}

      {manualAccounts.length ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Conti manuali</Text>
            <View style={styles.sectionHeaderActions}>
              <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}>{manualAccounts.length}</Text>
              <AddButton
                label="Aggiungi conto manuale"
                onPress={() => router.push('/add-manual-account' as Href)}
              />
            </View>
          </View>
          <View style={styles.accountList}>
            {manualAccounts.map((account) => {
              const cashWallet = account.accountKind === 'cash_wallet';
              return (
                <Pressable
                  key={account.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Apri ${account.name}`}
                  onPress={() =>
                    router.push(`/manual-account?id=${account.id}` as Href)
                  }
                  style={({ pressed }) => pressed && styles.pressed}>
                  <Card style={styles.accountRow}>
                    <View style={[styles.accountIcon, { backgroundColor: colors.sunken }]}>
                      <Text style={[styles.materialIcon, { color: colors.accent }]}>
                        {cashWallet ? 'account_balance_wallet' : 'account_balance'}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.accountName, { color: colors.text }]}>
                        {account.name}
                      </Text>
                      <Text style={[styles.accountMeta, { color: colors.textSecondary }]}>
                        {cashWallet ? 'Contanti' : 'Saldo manuale'}
                      </Text>
                    </View>
                    <Text style={[styles.accountBalance, { color: colors.text }]}>
                      {amountsVisible ? formatEuro(account.balance) : HIDDEN_AMOUNT}
                    </Text>
                    <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <View style={styles.emptyAction}>
          <SecondaryButton onPress={() => router.push('/add-manual-account' as Href)}>
            Aggiungi conto o contanti
          </SecondaryButton>
        </View>
      )}

      {connectionsLoading && !connections.length ? (
        <ConnectedAccountsSkeleton />
      ) : authorizedConnections.length ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Conti collegati</Text>
            <View style={styles.sectionHeaderActions}>
              <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}>{authorizedConnections.length}</Text>
              <AddButton label="Aggiungi conto collegato" onPress={addBankConnection} />
            </View>
          </View>
          <View style={styles.accountList}>
            {authorizedConnections.map((connection) => (
              <Pressable
                key={connection.id}
                accessibilityRole="button"
                accessibilityLabel={`Apri il dettaglio di ${connection.aspsp_name}`}
                onPress={() =>
                  router.push(`/bank-connection?id=${connection.id}` as Href)
                }
                style={({ pressed }) => pressed && styles.pressed}>
                <Card style={styles.accountRow}>
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
                  <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.emptyAction}>
          <PrimaryButton disabled={connectionsLoading} onPress={addBankConnection}>
            Collega una banca
          </PrimaryButton>
          {planTier === 'free' ? (
            <Text style={[styles.planHintCopy, { color: colors.textSecondary }]}>
              Disponibile con Pro (2 banche) e Max (10 banche).
            </Text>
          ) : null}
        </View>
      )}

      {syncError ?? connectionsError ? (
        <Text style={[styles.syncError, { color: colors.negative }]}>
          {syncError ?? connectionsError}
        </Text>
      ) : null}
    </Screen>
  );
}

function ChartLegend() {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendLine, { backgroundColor: colors.accent }]} />
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>Storico</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.legendDots}>
          {[0, 1, 2].map((dot) => (
            <View key={dot} style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          ))}
        </View>
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>Previsione</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendBand, { backgroundColor: colors.accentSoft }]} />
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>Intervallo 80%</Text>
      </View>
    </View>
  );
}

function ForecastEventRow({
  event,
  enabled,
  last,
  amountsVisible,
  onToggle,
}: {
  event: ForecastEvent;
  enabled: boolean;
  last: boolean;
  amountsVisible: boolean;
  onToggle: () => void;
}) {
  const { colors } = useFlowndTheme();
  const positive = event.amount > 0;
  const tone = positive ? colors.positive : colors.negative;
  return (
    <View
      style={[
        styles.eventRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}>
      <View
        style={[
          styles.eventIcon,
          { backgroundColor: positive ? colors.positiveSoft : colors.sunken },
        ]}>
        <Text style={[styles.eventIconText, { color: tone }]}>{event.icon}</Text>
      </View>
      <View style={[styles.flex, !enabled && styles.eventDisabled]}>
        <Text numberOfLines={1} style={[styles.eventName, { color: colors.text }]}>{event.name}</Text>
        <Text style={[styles.eventWhen, { color: colors.textSecondary }]}>
          {longMonth(event.offsets[0])} · {event.cadence}
        </Text>
      </View>
      <Text style={[styles.eventAmount, { color: tone }, !enabled && styles.eventDisabled]}>
        {amountsVisible ? signedEuro(event.amount) : HIDDEN_AMOUNT}
      </Text>
      <Switch
        accessibilityLabel={`Includi ${event.name} nella previsione`}
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ true: colors.accent, false: colors.sunken }}
      />
    </View>
  );
}

function AccountComposition({
  accounts,
}: {
  accounts: { id: string; name: string; balance: number }[];
}) {
  const { colors } = useFlowndTheme();
  const positive = accounts
    .filter((account) => account.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const total = positive.reduce((sum, account) => sum + account.balance, 0);
  if (total <= 0 || positive.length < 2) return null;
  return (
    <View style={styles.composition}>
      <View style={styles.compositionBar}>
        {positive.map((account, index) => (
          <View
            key={account.id}
            style={{
              flex: account.balance / total,
              backgroundColor: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length],
            }}
          />
        ))}
      </View>
      <View style={styles.compositionLegend}>
        {positive.map((account, index) => (
          <View key={account.id} style={styles.legendItem}>
            <View
              style={[
                styles.compositionDot,
                { backgroundColor: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] },
              ]}
            />
            <Text numberOfLines={1} style={[styles.legendText, { color: colors.textSecondary }]}>
              {account.name} · {Math.round((account.balance / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.addButton,
        { backgroundColor: colors.accentSoft },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.addButtonText, { color: colors.accent }]}>add</Text>
    </Pressable>
  );
}

function ConnectedAccountsSkeleton() {
  const { colors } = useFlowndTheme();
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View
      accessibilityLabel="Caricamento conti collegati"
      accessibilityRole="progressbar">
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Conti collegati</Text>
      </View>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.accountList, { opacity }]}>
        {[0, 1].map((index) => (
          <Card key={index} style={styles.accountRow}>
            <View style={[styles.accountIcon, { backgroundColor: colors.sunken }]} />
            <View style={styles.flex}>
              <View
                style={[
                  styles.skeletonName,
                  { backgroundColor: colors.sunken, width: index ? '42%' : '55%' },
                ]}
              />
              <View style={[styles.skeletonMeta, { backgroundColor: colors.sunken }]} />
            </View>
            <View style={[styles.skeletonBalance, { backgroundColor: colors.sunken }]} />
          </Card>
        ))}
      </Animated.View>
    </View>
  );
}

type ChartCoordinate = { x: number; y: number };

function curvedChartPath(
  points: ChartCoordinate[],
  minY: number,
  maxY: number,
) {
  if (!points.length) return '';
  const clampY = (value: number) => Math.max(minY, Math.min(maxY, value));
  return points.slice(0, -1).reduce((path, point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const controlOneX = point.x + (next.x - previous.x) / 6;
    const controlOneY = clampY(point.y + (next.y - previous.y) / 6);
    const controlTwoX = next.x - (following.x - point.x) / 6;
    const controlTwoY = clampY(next.y - (following.y - point.y) / 6);
    return `${path} C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function formatChartAxisValue(value: number, visible: boolean) {
  if (!visible) return '•••';
  const absoluteValue = Math.abs(value);
  const compactValue = (divisor: number, suffix: string) => {
    const formatted = (value / divisor).toFixed(1).replace(/\.0$/, '');
    return `${formatted}${suffix}`;
  };
  if (absoluteValue >= 1_000_000_000) return compactValue(1_000_000_000, 'B');
  if (absoluteValue >= 1_000_000) return compactValue(1_000_000, 'M');
  if (absoluteValue >= 1_000) return compactValue(1_000, 'k');
  return String(Math.round(value));
}

type ChartForecast = {
  median: number[];
  low: number[];
  high: number[];
  horizon: number;
  milestone: number;
  markers: { offset: number; positive: boolean }[];
};

const CHART_HEIGHT = 180;
const PLOT_LEFT = 42;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 150;

function WealthChart({
  history,
  forecast,
  amountsVisible,
}: {
  history: NetWorthHistoryPoint[];
  forecast: ChartForecast | null;
  amountsVisible: boolean;
}) {
  const { colors } = useFlowndTheme();
  const [width, setWidth] = useState(0);
  // Indice selezionato: da -historySteps (primo punto storico) a horizon.
  const [selected, setSelected] = useState<number | null>(null);
  const historySteps = history.length - 1;
  const horizon = forecast?.horizon ?? 0;
  const span = Math.max(1, historySteps + horizon);
  const plotRight = Math.max(PLOT_LEFT, width - 8);
  const historyValues = history.map((point) => point.value);
  let minValue = Math.min(...historyValues, ...(forecast?.low ?? []));
  let maxValue = Math.max(...historyValues, ...(forecast?.high ?? []));
  const showMilestone =
    forecast != null && forecast.milestone > minValue && forecast.milestone < maxValue * 1.12;
  if (showMilestone) maxValue = Math.max(maxValue, forecast.milestone);
  const range = maxValue - minValue;
  const padding = range === 0 ? Math.max(1, Math.abs(maxValue) * 0.02) : range * 0.08;
  minValue -= padding;
  maxValue += padding;
  const x = (index: number) =>
    PLOT_LEFT + ((index + historySteps) / span) * (plotRight - PLOT_LEFT);
  const y = (value: number) =>
    PLOT_BOTTOM - ((value - minValue) / (maxValue - minValue)) * (PLOT_BOTTOM - PLOT_TOP);
  const valueAt = (index: number) =>
    index <= 0 ? history[index + historySteps].value : forecast!.median[index];
  const r = (value: number) => value.toFixed(1);

  const historyPath = curvedChartPath(
    history.map((point, index) => ({ x: x(index - historySteps), y: y(point.value) })),
    PLOT_TOP,
    PLOT_BOTTOM,
  );
  const line = (values: number[]) =>
    values.map((value, index) => `${index ? 'L' : 'M'} ${r(x(index))} ${r(y(value))}`).join(' ');
  const bandPath = forecast
    ? `${line(forecast.high)} ${forecast.low
        .map((value, index) => ({ value, index }))
        .reverse()
        .map(({ value, index }) => `L ${r(x(index))} ${r(y(value))}`)
        .join(' ')} Z`
    : '';
  const ticks = [maxValue - padding, (maxValue + minValue) / 2, minValue + padding];
  const today = history[historySteps];

  const chartSvg = width
    ? [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CHART_HEIGHT}" viewBox="0 0 ${width} ${CHART_HEIGHT}">`,
        ...ticks.map(
          (tick) =>
            `<path d="M ${PLOT_LEFT} ${r(y(tick))} H ${plotRight}" stroke="${colors.border}" stroke-width="0.5" stroke-dasharray="3 4" fill="none"/>`,
        ),
        forecast
          ? `<path d="${bandPath}" fill="${colors.accent}" fill-opacity="0.12" stroke="none"/>`
          : '',
        showMilestone
          ? `<path d="M ${PLOT_LEFT} ${r(y(forecast.milestone))} H ${plotRight}" stroke="${colors.positive}" stroke-width="1.2" stroke-dasharray="5 4" fill="none"/>`
          : '',
        forecast
          ? `<path d="M ${r(x(0))} ${PLOT_TOP} V ${PLOT_BOTTOM}" stroke="${colors.textSecondary}" stroke-width="1" stroke-dasharray="2 3" opacity="0.6" fill="none"/>`
          : '',
        `<path d="${historyPath}" fill="none" stroke="${colors.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
        forecast
          ? `<path d="${line(forecast.median)}" fill="none" stroke="${colors.accent}" stroke-width="2.2" stroke-dasharray="1 5" stroke-linecap="round" stroke-linejoin="round"/>`
          : '',
        ...(forecast?.markers ?? []).map(
          (marker) =>
            `<circle cx="${r(x(marker.offset))}" cy="${r(y(forecast!.median[marker.offset]))}" r="3.5" fill="${colors.surface}" stroke="${marker.positive ? colors.positive : colors.negative}" stroke-width="2"/>`,
        ),
        `<circle cx="${r(x(0))}" cy="${r(y(today.value))}" r="5" fill="${colors.accent}" stroke="${colors.surface}" stroke-width="2.5"/>`,
        '</svg>',
      ].join('')
    : '';
  const chartSvgUri = chartSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg)}`
    : null;

  const xLabels: { key: string; index: number; label: string; align: 'left' | 'center' | 'right'; strong?: boolean }[] = [
    { key: 'start', index: -historySteps, label: shortMonth(history[0].date), align: 'left' },
  ];
  if (forecast) {
    xLabels.push({ key: 'today', index: 0, label: 'oggi', align: 'center', strong: true });
    if (horizon >= 12) {
      const middle = Math.round(horizon / 2);
      xLabels.push({ key: 'middle', index: middle, label: shortMonth(forecastMonthDate(middle)), align: 'center' });
    }
    xLabels.push({ key: 'end', index: horizon, label: shortMonth(forecastMonthDate(horizon)), align: 'right' });
  } else {
    const middle = -Math.round(historySteps / 2);
    xLabels.push({ key: 'middle', index: middle, label: shortMonth(history[middle + historySteps].date), align: 'center' });
    xLabels.push({ key: 'today', index: 0, label: 'oggi', align: 'right', strong: true });
  }

  function selectAt(locationX: number) {
    if (plotRight <= PLOT_LEFT) return;
    const ratio = Math.max(0, Math.min(1, (locationX - PLOT_LEFT) / (plotRight - PLOT_LEFT)));
    setSelected(Math.round(ratio * span) - historySteps);
  }

  const selectedValue = selected == null ? null : valueAt(selected);
  const selectedX = selected == null ? 0 : x(selected);
  const selectedY = selectedValue == null ? 0 : y(selectedValue);
  const tooltipWidth = 128;
  const selectedDate =
    selected == null
      ? ''
      : selected === 0
        ? 'Oggi'
        : selected < 0
          ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
              .format(history[selected + historySteps].date)
          : longMonth(selected);

  return (
    <View
      accessibilityLabel={
        forecast
          ? `Andamento del patrimonio negli ultimi ${FORECAST_HISTORY_MONTHS} mesi e previsione per i prossimi ${horizon} mesi`
          : `Andamento del patrimonio negli ultimi ${FORECAST_HISTORY_MONTHS} mesi`
      }
      style={styles.lineChart}
      onTouchStart={(event) => selectAt(event.nativeEvent.locationX)}
      onTouchMove={(event) => selectAt(event.nativeEvent.locationX)}
      onTouchEnd={() => setSelected(null)}
      onTouchCancel={() => setSelected(null)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width ? (
        <>
          <Image
            pointerEvents="none"
            source={chartSvgUri}
            cachePolicy="none"
            contentFit="fill"
            style={styles.chartImage}
          />
          {ticks.map((tick, index) => (
            <View
              key={`axis-${index}`}
              pointerEvents="none"
              style={[styles.chartAxisLabel, { top: y(tick) - 8, width: PLOT_LEFT - 4 }]}>
              <Text numberOfLines={1} style={[styles.chartAxisText, { color: colors.textSecondary }]}>
                {formatChartAxisValue(tick, amountsVisible)}
              </Text>
            </View>
          ))}
          {showMilestone ? (
            <Text
              pointerEvents="none"
              style={[
                styles.milestoneTag,
                { color: colors.positive, top: y(forecast.milestone) - 16 },
              ]}>
              Traguardo · {formatChartAxisValue(forecast.milestone, amountsVisible)}
            </Text>
          ) : null}
          {xLabels.map((item) => {
            const labelWidth = 56;
            const left =
              item.align === 'left'
                ? x(item.index)
                : item.align === 'right'
                  ? x(item.index) - labelWidth
                  : x(item.index) - labelWidth / 2;
            return (
              <Text
                key={item.key}
                pointerEvents="none"
                numberOfLines={1}
                style={[
                  styles.chartLabel,
                  {
                    left,
                    width: labelWidth,
                    textAlign: item.align,
                    color: item.strong ? colors.text : colors.textSecondary,
                  },
                  item.strong && styles.chartLabelStrong,
                ]}>
                {item.label}
              </Text>
            );
          })}
          {selected != null && selectedValue != null ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.chartSelectionGuide,
                  {
                    backgroundColor: colors.accent,
                    left: selectedX - 1,
                    top: selectedY,
                    height: PLOT_BOTTOM - selectedY,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.chartSelectedPoint,
                  {
                    backgroundColor: colors.accent,
                    borderColor: colors.surface,
                    left: selectedX - 7,
                    top: selectedY - 7,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.chartTooltip,
                  {
                    backgroundColor: colors.text,
                    width: tooltipWidth,
                    left: Math.max(0, Math.min(width - tooltipWidth, selectedX - tooltipWidth / 2)),
                    top: Math.max(-6, selectedY - (selected > 0 ? 62 : 48)),
                  },
                ]}>
                <Text style={[styles.chartTooltipDate, { color: colors.background }]}>
                  {selectedDate}
                </Text>
                <Text style={[styles.chartTooltipText, { color: colors.background }]}>
                  {amountsVisible ? formatEuro(Math.round(selectedValue)) : HIDDEN_AMOUNT}
                </Text>
                {selected > 0 && forecast ? (
                  <Text style={[styles.chartTooltipDate, { color: colors.background }]}>
                    {amountsVisible
                      ? `${formatChartAxisValue(forecast.low[selected], true)} – ${formatChartAxisValue(forecast.high[selected], true)}`
                      : HIDDEN_AMOUNT}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </>
      ) : null}
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
  hero: { paddingTop: 4, paddingBottom: 18 },
  heroEmpty: { marginTop: 8 },
  emptyAction: { marginTop: 14, gap: 7 },
  syncIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 24 },
  syncError: { fontFamily: font.bodyMedium, fontSize: 10 },
  eyebrow: { fontFamily: font.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  netWorthRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  netWorth: { fontFamily: font.displayBold, fontSize: 42, lineHeight: 50, letterSpacing: -1 },
  netWorthDecimals: { fontFamily: font.displaySemiBold, fontSize: 22, letterSpacing: -0.3 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
    paddingLeft: 5,
    paddingRight: 9,
    borderRadius: 12,
  },
  deltaIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 15, lineHeight: 16 },
  deltaText: { fontFamily: font.dataMedium, fontSize: 11 },
  deltaCaption: { fontFamily: font.bodyMedium, fontSize: 11 },
  horizonSwitch: { marginBottom: 12 },
  trendCard: { marginBottom: 12 },
  cardTitle: { fontFamily: font.displaySemiBold, fontSize: 16 },
  cardCaption: { fontFamily: font.body, fontSize: 11, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, height: 3, borderRadius: 2 },
  legendDots: { width: 14, flexDirection: 'row', justifyContent: 'space-between' },
  legendDot: { width: 3, height: 3, borderRadius: 2 },
  legendBand: { width: 14, height: 9, borderRadius: 3 },
  legendText: { fontFamily: font.body, fontSize: 10 },
  forecastCard: { marginBottom: 12 },
  forecastHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  forecastEyebrow: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  forecastValue: {
    fontFamily: font.displayBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.4,
    marginTop: 3,
  },
  forecastRange: { fontFamily: font.bodyMedium, fontSize: 11 },
  forecastDelta: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forecastDeltaText: { fontFamily: font.dataMedium, fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 16, marginBottom: 14 },
  whatIfHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  whatIfTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  whatIfValue: { fontFamily: font.displayBold, fontSize: 15 },
  whatIfCaption: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  slider: { height: 36, marginTop: 4 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { fontFamily: font.body, fontSize: 9 },
  eventsTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 4,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  eventIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventIconText: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18 },
  eventName: { fontFamily: font.bodySemiBold, fontSize: 12 },
  eventWhen: { fontFamily: font.body, fontSize: 10, marginTop: 1 },
  eventAmount: { fontFamily: font.dataMedium, fontSize: 12 },
  eventDisabled: { opacity: 0.4 },
  forecastNote: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 12 },
  milestoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  milestoneIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  materialIconLarge: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  milestoneTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  milestoneCaption: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  milestoneTrack: { height: 6, borderRadius: 3, marginTop: 7, overflow: 'hidden' },
  milestoneFill: { height: '100%', borderRadius: 3 },
  milestoneWhen: { alignItems: 'flex-end' },
  milestoneDate: { fontFamily: font.displayBold, fontSize: 13, marginTop: 1, textTransform: 'capitalize' },
  milestoneDiff: { fontFamily: font.bodySemiBold, fontSize: 10, marginTop: 2 },
  lockedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lockedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  lockedCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  maxBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  maxBadgeText: { fontFamily: font.bodySemiBold, fontSize: 9, letterSpacing: 0.6 },
  composition: { marginTop: 12, gap: 8 },
  compositionBar: { flexDirection: 'row', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden' },
  compositionLegend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  compositionDot: { width: 7, height: 7, borderRadius: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 9,
  },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  sectionCaption: { fontFamily: font.body, fontSize: 10 },
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  addButton: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  lineChart: { height: CHART_HEIGHT, position: 'relative', marginTop: 12 },
  chartImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  chartAxisLabel: {
    position: 'absolute',
    left: 0,
    height: 16,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 5,
  },
  chartAxisText: { fontFamily: font.data, fontSize: 9 },
  milestoneTag: {
    position: 'absolute',
    right: 8,
    fontFamily: font.bodySemiBold,
    fontSize: 9,
  },
  chartLabel: {
    position: 'absolute',
    top: PLOT_BOTTOM + 12,
    fontFamily: font.body,
    fontSize: 10,
  },
  chartLabelStrong: { fontFamily: font.bodySemiBold },
  chartSelectionGuide: { position: 'absolute', width: 2, opacity: 0.25 },
  chartSelectedPoint: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
  },
  chartTooltip: {
    position: 'absolute',
    borderRadius: 10,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    zIndex: 5,
  },
  chartTooltipDate: { fontFamily: font.bodyMedium, fontSize: 9, opacity: 0.75, textTransform: 'capitalize' },
  chartTooltipText: { fontFamily: font.dataMedium, fontSize: 12 },
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
  accountMeta: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  accountBalance: { fontFamily: font.dataMedium, fontSize: 12 },
  skeletonName: { height: 12, borderRadius: 6 },
  skeletonMeta: { width: '32%', height: 8, borderRadius: 4, marginTop: 6 },
  skeletonBalance: { width: 66, height: 12, borderRadius: 6 },
  chevron: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 19 },
  pressed: { opacity: 0.7 },
  planHintCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 16, marginTop: 3 },
});
