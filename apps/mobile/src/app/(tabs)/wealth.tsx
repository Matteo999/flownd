import { type Href, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

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
  buildNetWorthHistory,
  type NetWorthHistoryPoint,
} from '@/lib/wealth-history';
import {
  listBankConnections,
  type OpenBankingConnection,
  syncBankConnection,
} from '@/lib/open-banking';
import { useApp } from '@/providers/app-provider';

export default function WealthScreen() {
  const { colors } = useFlowndTheme();
  const {
    financialAccounts,
    transactions,
    amountsVisible,
    planTier,
    session,
    refreshData,
  } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [connections, setConnections] = useState<OpenBankingConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const netWorth = financialAccounts.reduce(
    (sum, account) => sum + account.balance,
    0,
  );
  const netWorthHistory = buildNetWorthHistory({
    currentNetWorth: netWorth,
    financialAccountIds: financialAccounts.map((account) => account.id),
    transactions,
  });
  const previousNetWorth = netWorthHistory[0]?.value ?? netWorth;
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
  const accessToken = session?.access_token;

  useFocusEffect(useCallback(() => {
    if (!accessToken) {
      setConnectionsLoading(false);
      return;
    }
    let active = true;
    setConnectionsLoading(true);
    listBankConnections(accessToken)
      .then((items) => {
        if (active) setConnections(items);
      })
      .catch((reason) => {
        if (!active) return;
        setSyncError(
          reason instanceof Error ? reason.message : 'Collegamenti non disponibili.',
        );
      })
      .finally(() => {
        if (active) setConnectionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]));

  async function reloadConnections() {
    if (!accessToken) return;
    setConnections(await listBankConnections(accessToken));
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
        'Passa al piano Max per collegare fino a 10 banche e completare il tuo patrimonio.',
        [{ text: 'Non ora', style: 'cancel' }, { text: 'Ho capito' }],
      );
      return;
    }
    if (planTier === 'max' && authorizedConnections.length >= 10) {
      Alert.alert(
        'Limite collegamenti raggiunto',
        'Il piano Max consente fino a 10 collegamenti bancari attivi.',
      );
      return;
    }
    router.push('/connect-bank' as Href);
  }

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
            Aggiungi un conto per iniziare a costruire il patrimonio.
          </Text>
        )}
      </Card>

      <Card style={styles.trendCard}>
        {hasPreviousData ? (
          <NetWorthLineChart
            points={netWorthHistory}
            amountsVisible={amountsVisible}
          />
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={[styles.chartEmptyIcon, { color: colors.textSecondary }]}>show_chart</Text>
            <Text style={[styles.chartEmptyText, { color: colors.textSecondary }]}>
              Aggiungi un conto per iniziare a ricostruire l’andamento.
            </Text>
          </View>
        )}
      </Card>

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

      {authorizedConnections.length && planTier !== 'free' ? (
        <View style={styles.syncAction}>
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
                setSyncError(reason instanceof Error ? reason.message : 'Sincronizzazione non riuscita.');
              } finally {
                setSyncing(false);
              }
            }}>
            {syncing ? 'Sincronizzazione…' : 'Sincronizza ora'}
          </SecondaryButton>
        </View>
      ) : null}
      {syncError ? (
        <Text style={[styles.syncError, { color: colors.negative }]}>{syncError}</Text>
      ) : null}
    </Screen>
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

function NetWorthLineChart({
  points,
  amountsVisible,
}: {
  points: NetWorthHistoryPoint[];
  amountsVisible: boolean;
}) {
  const { colors } = useFlowndTheme();
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const plotLeft = 52;
  const plotRight = Math.max(plotLeft, width - 10);
  const plotTop = 28;
  const plotBottom = 130;
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;
  const scalePadding =
    valueRange === 0
      ? Math.max(1, Math.abs(maxValue) * 0.02)
      : valueRange * 0.08;
  const chartMinValue = minValue - scalePadding;
  const chartMaxValue = maxValue + scalePadding;
  const chartValueRange = chartMaxValue - chartMinValue;
  const coordinates = points.map((point, index) => ({
    x:
      points.length === 1
        ? width / 2
        : plotLeft +
          ((plotRight - plotLeft) * index) / Math.max(1, points.length - 1),
    y:
      plotBottom -
      ((point.value - chartMinValue) / chartValueRange) *
        (plotBottom - plotTop),
  }));
  const selectedPoint =
    selectedIndex == null ? null : points[selectedIndex] ?? null;
  const selectedCoordinate =
    selectedIndex == null ? null : coordinates[selectedIndex] ?? null;
  const path = curvedChartPath(coordinates, plotTop, plotBottom);
  const axisTicks = [
    { value: chartMaxValue, y: plotTop },
    {
      value: chartMinValue + chartValueRange / 2,
      y: (plotTop + plotBottom) / 2,
    },
    { value: chartMinValue, y: plotBottom },
  ];
  const chartSvg = width
    ? [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="166" viewBox="0 0 ${width} 166">`,
        `<line x1="${plotLeft}" x2="${plotLeft}" y1="${plotTop}" y2="${plotBottom}" stroke="${colors.border}" stroke-width="1"/>`,
        ...axisTicks.map(
          (tick) =>
            `<path d="M ${plotLeft} ${tick.y} H ${plotRight}" stroke="${colors.border}" stroke-width="0.5" stroke-dasharray="3 4"/>`,
        ),
        `<path d="${path}" fill="none" stroke="${colors.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
        ...coordinates.map(
          (coordinate) =>
            `<circle cx="${coordinate.x}" cy="${coordinate.y}" r="3.5" fill="${colors.surface}" stroke="${colors.accent}" stroke-width="2"/>`,
        ),
        '</svg>',
      ].join('')
    : '';
  const chartSvgUri = chartSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg)}`
    : null;

  function selectPointAt(locationX: number) {
    if (!points.length || plotRight <= plotLeft) return;
    const ratio = Math.max(
      0,
      Math.min(1, (locationX - plotLeft) / (plotRight - plotLeft)),
    );
    setSelectedIndex(Math.round(ratio * (points.length - 1)));
  }

  return (
    <View
      accessibilityLabel="Andamento del patrimonio negli ultimi 30 giorni"
      style={styles.lineChart}
      onTouchStart={(event) => selectPointAt(event.nativeEvent.locationX)}
      onTouchMove={(event) => selectPointAt(event.nativeEvent.locationX)}
      onTouchEnd={() => setSelectedIndex(null)}
      onTouchCancel={() => setSelectedIndex(null)}
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
          {axisTicks.map((tick, index) => (
            <View
              key={`axis-${index}`}
              pointerEvents="none"
              style={[
                styles.chartAxisLabel,
                { top: tick.y - 8, width: plotLeft - 7 },
              ]}>
              <Text
                numberOfLines={1}
                style={[styles.chartAxisText, { color: colors.textSecondary }]}>
                {formatChartAxisValue(tick.value, amountsVisible)}
              </Text>
            </View>
          ))}
          {selectedCoordinate ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.chartSelectionGuide,
                  {
                    backgroundColor: colors.accent,
                    left: selectedCoordinate.x - 1,
                    top: selectedCoordinate.y,
                    height: plotBottom - selectedCoordinate.y,
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
                    left: selectedCoordinate.x - 7,
                    top: selectedCoordinate.y - 7,
                  },
                ]}
              />
            </>
          ) : null}
          {selectedPoint && selectedCoordinate ? (
            <View
              pointerEvents="none"
              style={[
                styles.chartTooltip,
                {
                  backgroundColor: colors.text,
                  left: Math.max(
                    0,
                    Math.min(width - 104, selectedCoordinate.x - 52),
                  ),
                  top: Math.max(0, selectedCoordinate.y - 40),
                },
              ]}>
              <Text style={[styles.chartTooltipText, { color: colors.background }]}>
                {amountsVisible ? formatEuro(selectedPoint.value) : HIDDEN_AMOUNT}
              </Text>
            </View>
          ) : null}
          {points.map((point, index) => {
            const selected = selectedIndex === index;
            return (
              <View
                key={`label-${point.key}`}
                pointerEvents="none"
                style={[
                  styles.chartLabelWrap,
                  {
                    left: Math.max(
                      plotLeft - 23,
                      Math.min(width - 46, coordinates[index].x - 23),
                    ),
                    backgroundColor: selected
                      ? colors.accentSoft
                      : 'transparent',
                  },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.chartLabel,
                    { color: selected ? colors.accent : colors.textSecondary },
                    selected && styles.chartLabelSelected,
                  ]}>
                  {point.label}
                </Text>
              </View>
            );
          })}
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
  hero: { marginBottom: 2 },
  trendCard: { marginTop: 10 },
  emptyAction: { marginTop: 14, gap: 7 },
  syncAction: { marginTop: 24, marginBottom: 4, gap: 7 },
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
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  addButton: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  lineChart: { height: 166, position: 'relative' },
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
  chartAxisText: { fontFamily: font.data, fontSize: 8 },
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
    width: 104,
    minHeight: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    zIndex: 5,
  },
  chartTooltipText: { fontFamily: font.dataMedium, fontSize: 10 },
  chartLabelWrap: {
    position: 'absolute',
    top: 136,
    width: 46,
    minHeight: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  chartLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 8,
    textAlign: 'center',
  },
  chartLabelSelected: { fontFamily: font.bodySemiBold },
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
  skeletonName: { height: 12, borderRadius: 6 },
  skeletonMeta: { width: '32%', height: 8, borderRadius: 4, marginTop: 6 },
  skeletonBalance: { width: 66, height: 12, borderRadius: 6 },
  chevron: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 19 },
  pressed: { opacity: 0.7 },
  planHintCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 16, marginTop: 3 },
});
