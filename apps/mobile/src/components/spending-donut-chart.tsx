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
const SELECTED_CHART_STROKE = 38;
const CIRCUMFERENCE = 2 * Math.PI * CHART_RADIUS;
const categoryColors = [
  '#18A8D8',
  '#7C5CFC',
  '#FF6685',
  '#FFB020',
  '#20C58A',
  '#E85AAD',
  '#3D8BFF',
  '#A66CFF',
  '#FF7A45',
  '#35C8D0',
  '#84C83F',
  '#F45B9B',
];
const OTHER_CATEGORY_COLOR = '#9AA3A0';

function percentageLabel(amount: number, total: number) {
  const percentage = total > 0 ? (amount / total) * 100 : 0;
  if (percentage > 0 && percentage < 1) return '<1%';
  return `${Math.round(percentage)}%`;
}

function percentageAccessibilityLabel(amount: number, total: number) {
  const percentage = total > 0 ? (amount / total) * 100 : 0;
  if (percentage > 0 && percentage < 1) return 'meno dell’uno per cento';
  return `${Math.round(percentage)} per cento`;
}

export function SpendingDonutChart({
  transactions,
  amountsVisible = true,
  totalLabel = 'TOTALE SPESO',
}: {
  transactions: ExpenseDraft[];
  amountsVisible?: boolean;
  totalLabel?: string;
}) {
  const { colors } = useFlowndTheme();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const allCategories = Array.from(
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
  const topCategories = allCategories
    .filter((item) => item.category.toLocaleLowerCase('it-IT') !== 'altro')
    .slice(0, 5);
  const total = allCategories.reduce((sum, item) => sum + item.amount, 0);
  const topTotal = topCategories.reduce((sum, item) => sum + item.amount, 0);
  const otherAmount = total - topTotal;
  const grouped = [
    ...topCategories,
    ...(otherAmount > 0 ? [{ category: 'Altro', amount: otherAmount }] : []),
  ];
  // Rounded caps extend beyond the measured arc. Reserve enough room for them
  // while preserving very small categories as visible dots.
  const gapLength =
    grouped.length > 1 ? CHART_STROKE + 3 : 0;
  const segments = grouped.map((item, index) => {
    const share = total > 0 ? item.amount / total : 0;
    const previousAmount = grouped
      .slice(0, index)
      .reduce((sum, previousItem) => sum + previousItem.amount, 0);
    const startShare = total > 0 ? previousAmount / total : 0;
    const arcLength = share * CIRCUMFERENCE;
    return {
      ...item,
      color:
        item.category.toLocaleLowerCase('it-IT') === 'altro'
          ? OTHER_CATEGORY_COLOR
          : categoryColors[index % categoryColors.length],
      startShare,
      endShare: startShare + share,
      segmentLength: Math.max(
        0.1,
        arcLength - Math.min(gapLength, arcLength * 0.75),
      ),
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
        `<circle cx="${CHART_CENTER}" cy="${CHART_CENTER}" r="${CHART_RADIUS}" fill="none" stroke="${item.color}" stroke-width="${item.category === selectedCategory ? SELECTED_CHART_STROKE : CHART_STROKE}" stroke-dasharray="${item.segmentLength} ${CIRCUMFERENCE - item.segmentLength}" stroke-dashoffset="${-item.offset}" stroke-linecap="round" transform="rotate(-90 ${CHART_CENTER} ${CHART_CENTER})"/>`,
    ),
    '</svg>',
  ].join('');
  const chartUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg)}`;

  function selectSegmentAt(event: GestureResponderEvent) {
    event.stopPropagation();
    const x = event.nativeEvent.locationX - CHART_CENTER;
    const y = event.nativeEvent.locationY - CHART_CENTER;
    const distance = Math.sqrt(x * x + y * y);
    const innerHitRadius = CHART_RADIUS - SELECTED_CHART_STROKE / 2 - 8;
    const outerHitRadius = CHART_RADIUS + SELECTED_CHART_STROKE / 2 + 8;

    if (distance < innerHitRadius || distance > outerHitRadius) {
      setSelectedCategory(null);
      return;
    }

    const angleFromTop =
      (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const shareAtPress = angleFromTop / (Math.PI * 2);
    const segment = segments.find(
      (item) =>
        shareAtPress >= item.startShare && shareAtPress < item.endShare,
    );
    if (!segment) {
      setSelectedCategory(null);
      return;
    }

    const distanceFromSegmentStart =
      (shareAtPress - segment.startShare) * CIRCUMFERENCE;
    const pressedVisibleArc = distanceFromSegmentStart <= segment.segmentLength;
    setSelectedCategory(pressedVisibleArc ? segment.category : null);
  }

  return (
    <Pressable
      accessible={false}
      onPress={() => setSelectedCategory(null)}>
      <View style={styles.totalHeader}>
        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
          {totalLabel}
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
              {percentageLabel(selectedSegment.amount, total)}
            </Text>
          </View>
        ) : null}
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
                accessibilityLabel={`Seleziona ${item.category}, ${percentageAccessibilityLabel(item.amount, total)}`}
                hitSlop={4}
                onPress={(event) => {
                  event.stopPropagation();
                  setSelectedCategory(item.category);
                }}
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
                  {percentageLabel(item.amount, total)}
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
    </Pressable>
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
