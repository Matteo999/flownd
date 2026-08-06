import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import type { ExpenseDraft } from '@/lib/onboarding';
import { formatEuro } from '@/lib/onboarding';

const CHART_SIZE = 190;
const CHART_CENTER = CHART_SIZE / 2;
const CHART_RADIUS = 68;
const CHART_STROKE = 22;
const SEGMENT_HIT_SIZE = 44;
const CIRCUMFERENCE = 2 * Math.PI * CHART_RADIUS;
const categoryColors = [
  '#256B7E',
  '#45A98D',
  '#E0A63D',
  '#6D75C9',
  '#D06A61',
  '#8A6E55',
];

export function SpendingDonutChart({
  transactions,
  amountsVisible = true,
  onSelectCategory,
}: {
  transactions: ExpenseDraft[];
  amountsVisible?: boolean;
  onSelectCategory?: (category: string) => void;
}) {
  const { colors } = useFlowndTheme();
  const grouped = Array.from(
    transactions.reduce((categories, transaction) => {
      const category = transaction.category.trim() || 'Altro';
      categories.set(
        category,
        (categories.get(category) ?? 0) + transaction.amount,
      );
      return categories;
    }, new Map<string, number>()),
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((first, second) => second.amount - first.amount);
  const total = grouped.reduce((sum, item) => sum + item.amount, 0);
  const segments = grouped.map((item, index) => {
    const share = total > 0 ? item.amount / total : 0;
    const previousShare = grouped
      .slice(0, index)
      .reduce(
        (sum, previousItem) =>
          sum + (total > 0 ? previousItem.amount / total : 0),
        0,
      );
    return {
      ...item,
      midShare: previousShare + share / 2,
      segmentLength: Math.max(
        0,
        share * CIRCUMFERENCE - (grouped.length > 1 ? 3 : 0),
      ),
      offset: previousShare * CIRCUMFERENCE,
    };
  });
  const chartSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_SIZE}" height="${CHART_SIZE}" viewBox="0 0 ${CHART_SIZE} ${CHART_SIZE}">`,
    `<circle cx="${CHART_CENTER}" cy="${CHART_CENTER}" r="${CHART_RADIUS}" fill="none" stroke="${colors.sunken}" stroke-width="${CHART_STROKE}"/>`,
    ...segments.map(
      (item, index) =>
        `<circle cx="${CHART_CENTER}" cy="${CHART_CENTER}" r="${CHART_RADIUS}" fill="none" stroke="${categoryColors[index % categoryColors.length]}" stroke-width="${CHART_STROKE}" stroke-dasharray="${item.segmentLength} ${CIRCUMFERENCE - item.segmentLength}" stroke-dashoffset="${-item.offset}" stroke-linecap="butt" transform="rotate(-90 ${CHART_CENTER} ${CHART_CENTER})"/>`,
    ),
    '</svg>',
  ].join('');
  const chartUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg)}`;

  return (
    <View>
      <View
        accessibilityRole="image"
        accessibilityLabel={
          amountsVisible
            ? `Totale speso ${formatEuro(total)}, suddiviso in ${grouped.length} categorie`
            : `Spese suddivise in ${grouped.length} categorie, importi nascosti`
        }
        style={styles.chartWrap}>
        <Image
          source={{ uri: chartUri }}
          contentFit="contain"
          cachePolicy="none"
          style={styles.chartImage}
        />
        <View pointerEvents="none" style={styles.chartCenter}>
          <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>
            TOTALE SPESO
          </Text>
          <Text style={[styles.centerAmount, { color: colors.text }]}>
            {amountsVisible ? formatEuro(total) : HIDDEN_AMOUNT}
          </Text>
        </View>
        {onSelectCategory
          ? segments.map((item) => {
              const angle = item.midShare * Math.PI * 2 - Math.PI / 2;
              const hitRadius = CHART_RADIUS;
              return (
                <Pressable
                  key={item.category}
                  accessibilityRole="button"
                  accessibilityLabel={`Filtra la Timeline per ${item.category}`}
                  hitSlop={4}
                  onPress={() => onSelectCategory(item.category)}
                  style={({ pressed }) => [
                    styles.segmentHit,
                    {
                      left:
                        CHART_CENTER +
                        Math.cos(angle) * hitRadius -
                        SEGMENT_HIT_SIZE / 2,
                      top:
                        CHART_CENTER +
                        Math.sin(angle) * hitRadius -
                        SEGMENT_HIT_SIZE / 2,
                    },
                    pressed && styles.pressed,
                  ]}
                />
              );
            })
          : null}
      </View>

      {grouped.length ? (
        <View style={styles.legend}>
          {grouped.map((item, index) => (
            <Pressable
              key={item.category}
              accessibilityRole={onSelectCategory ? 'button' : undefined}
              onPress={
                onSelectCategory
                  ? () => onSelectCategory(item.category)
                  : undefined
              }
              style={({ pressed }) => [
                styles.legendRow,
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.legendDot,
                  {
                    backgroundColor:
                      categoryColors[index % categoryColors.length],
                  },
                ]}
              />
              <Text style={[styles.legendLabel, { color: colors.text }]}>
                {item.category}
              </Text>
              <Text
                style={[styles.legendValue, { color: colors.textSecondary }]}>
                {amountsVisible ? formatEuro(item.amount) : HIDDEN_AMOUNT}
              </Text>
              <Text
                style={[styles.legendPercent, { color: colors.textSecondary }]}>
                {Math.round((item.amount / total) * 100)}%
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Aggiungi una spesa per visualizzare la distribuzione per categoria.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartWrap: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartImage: { width: CHART_SIZE, height: CHART_SIZE },
  segmentHit: {
    position: 'absolute',
    width: SEGMENT_HIT_SIZE,
    height: SEGMENT_HIT_SIZE,
    borderRadius: 22,
  },
  chartCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 50,
  },
  centerLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  centerAmount: {
    fontFamily: font.dataMedium,
    fontSize: 18,
    lineHeight: 24,
    marginTop: 3,
  },
  legend: { gap: 10, marginTop: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  legendDot: { width: 9, height: 9, borderRadius: 5, marginRight: 9 },
  legendLabel: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  legendValue: { fontFamily: font.dataMedium, fontSize: 11 },
  legendPercent: {
    width: 38,
    marginLeft: 8,
    textAlign: 'right',
    fontFamily: font.data,
    fontSize: 10,
  },
  empty: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.55 },
});
