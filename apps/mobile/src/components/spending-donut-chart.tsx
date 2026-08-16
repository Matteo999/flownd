import { Image } from 'expo-image';
import { useState } from 'react';
import {
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import type { ExpenseDraft } from '@/lib/onboarding';
import { formatEuro } from '@/lib/onboarding';

const CHART_SIZE = 190;
const CHART_CENTER = CHART_SIZE / 2;
const CHART_RADIUS = 68;
const CHART_STROKE = 22;
const SELECTED_CHART_STROKE = 30;
const CIRCUMFERENCE = 2 * Math.PI * CHART_RADIUS;
const categoryColors = [
  '#256B7E',
  '#45A98D',
  '#E0A63D',
  '#6D75C9',
  '#D06A61',
  '#8A6E55',
  '#2F83C5',
  '#76A84B',
  '#C27BAD',
  '#B8763E',
  '#547A66',
  '#8A65B5',
];

export function SpendingDonutChart({
  transactions,
  amountsVisible = true,
}: {
  transactions: ExpenseDraft[];
  amountsVisible?: boolean;
}) {
  const { colors } = useFlowndTheme();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
  // Keep the combined whitespace around 2% of the ring. A fixed gap per slice
  // can otherwise erase small categories as their number grows.
  const gapLength =
    grouped.length > 1 ? (CIRCUMFERENCE * 0.02) / grouped.length : 0;
  const segments = grouped.map((item, index) => {
    const share = total > 0 ? item.amount / total : 0;
    const previousAmount = grouped
      .slice(0, index)
      .reduce((sum, previousItem) => sum + previousItem.amount, 0);
    const startShare = total > 0 ? previousAmount / total : 0;
    const arcLength = share * CIRCUMFERENCE;
    return {
      ...item,
      color: categoryColors[index % categoryColors.length],
      startShare,
      endShare: startShare + share,
      // Never spend more than 20% of a small slice on its gap.
      segmentLength: arcLength - Math.min(gapLength, arcLength * 0.2),
      offset: startShare * CIRCUMFERENCE,
    };
  });
  const selectedSegment = segments.find(
    (item) => item.category === selectedCategory,
  );
  const orderedSegments = selectedSegment
    ? [
        ...segments.filter((item) => item.category !== selectedCategory),
        selectedSegment,
      ]
    : segments;
  const chartSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_SIZE}" height="${CHART_SIZE}" viewBox="0 0 ${CHART_SIZE} ${CHART_SIZE}">`,
    `<circle cx="${CHART_CENTER}" cy="${CHART_CENTER}" r="${CHART_RADIUS}" fill="none" stroke="${colors.sunken}" stroke-width="${CHART_STROKE}"/>`,
    ...orderedSegments.map(
      (item) =>
        `<circle cx="${CHART_CENTER}" cy="${CHART_CENTER}" r="${CHART_RADIUS}" fill="none" stroke="${item.color}" stroke-width="${item.category === selectedCategory ? SELECTED_CHART_STROKE : CHART_STROKE}" stroke-dasharray="${item.segmentLength} ${CIRCUMFERENCE - item.segmentLength}" stroke-dashoffset="${-item.offset}" stroke-linecap="butt" transform="rotate(-90 ${CHART_CENTER} ${CHART_CENTER})"/>`,
    ),
    '</svg>',
  ].join('');
  const chartUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg)}`;

  function selectSegmentAt(event: GestureResponderEvent) {
    const x = event.nativeEvent.locationX - CHART_CENTER;
    const y = event.nativeEvent.locationY - CHART_CENTER;
    const distance = Math.sqrt(x * x + y * y);
    const innerHitRadius = CHART_RADIUS - SELECTED_CHART_STROKE / 2 - 8;
    const outerHitRadius = CHART_RADIUS + SELECTED_CHART_STROKE / 2 + 8;

    if (distance < innerHitRadius || distance > outerHitRadius) return;

    const angleFromTop =
      (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const shareAtPress = angleFromTop / (Math.PI * 2);
    const segment = segments.find(
      (item) =>
        shareAtPress >= item.startShare && shareAtPress < item.endShare,
    );
    if (segment) setSelectedCategory(segment.category);
  }

  return (
    <View>
      <View style={styles.totalHeader}>
        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
          TOTALE SPESO
        </Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
          style={[styles.totalAmount, { color: colors.text }]}>
          {amountsVisible ? formatEuro(total) : HIDDEN_AMOUNT}
        </Text>
      </View>

      <Pressable
        accessible={false}
        onPress={selectSegmentAt}
        style={({ pressed }) => [
          styles.chartWrap,
          pressed && styles.chartPressed,
        ]}>
        <Image
          source={{ uri: chartUri }}
          contentFit="contain"
          cachePolicy="none"
          style={styles.chartImage}
        />
      </Pressable>

      <View style={styles.selectionSlot}>
        {selectedSegment ? (
          <View
            accessibilityLiveRegion="polite"
            style={[styles.selectionPill, { backgroundColor: colors.sunken }]}>
            <View
              style={[
                styles.selectionDot,
                { backgroundColor: selectedSegment.color },
              ]}
            />
            <Text style={[styles.selectionText, { color: colors.text }]}>
              {selectedSegment.category}
            </Text>
            <Text
              style={[styles.selectionValue, { color: colors.textSecondary }]}>
              {amountsVisible ? formatEuro(selectedSegment.amount) : HIDDEN_AMOUNT}
              {' · '}
              {Math.round((selectedSegment.amount / total) * 100)}%
            </Text>
          </View>
        ) : (
          <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
            Tocca una fetta per vedere la categoria
          </Text>
        )}
      </View>

      {grouped.length ? (
        <View style={styles.legend}>
          {segments.map((item) => {
            const selected = item.category === selectedCategory;
            return (
              <Pressable
                key={item.category}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Seleziona ${item.category}, ${Math.round((item.amount / total) * 100)} per cento`}
                hitSlop={4}
                onPress={() => setSelectedCategory(item.category)}
                style={({ pressed }) => [
                  styles.legendRow,
                  selected && { backgroundColor: colors.sunken },
                  pressed && styles.pressed,
                ]}>
                <View
                  style={[styles.legendDot, { backgroundColor: item.color }]}
                />
                <Text style={[styles.legendLabel, { color: colors.text }]}>
                  {item.category}
                </Text>
                <Text
                  style={[styles.legendValue, { color: colors.textSecondary }]}>
                  {amountsVisible ? formatEuro(item.amount) : HIDDEN_AMOUNT}
                </Text>
                <Text
                  style={[
                    styles.legendPercent,
                    { color: colors.textSecondary },
                  ]}>
                  {Math.round((item.amount / total) * 100)}%
                </Text>
              </Pressable>
            );
          })}
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
  totalHeader: { alignItems: 'center', marginBottom: 2 },
  totalLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  totalAmount: {
    alignSelf: 'stretch',
    fontFamily: font.dataMedium,
    fontSize: 22,
    lineHeight: 29,
    marginTop: 2,
    paddingHorizontal: 12,
    textAlign: 'center',
  },
  chartWrap: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartImage: { width: CHART_SIZE, height: CHART_SIZE },
  chartPressed: { opacity: 0.92 },
  selectionSlot: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  selectionPill: {
    minHeight: 30,
    maxWidth: '100%',
    borderRadius: 15,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  selectionText: {
    flexShrink: 1,
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  selectionValue: {
    fontFamily: font.dataMedium,
    fontSize: 10,
    marginLeft: 7,
  },
  tapHint: { fontFamily: font.body, fontSize: 10 },
  legend: { gap: 4, marginTop: 8 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 7,
  },
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
