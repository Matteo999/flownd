import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Animated,
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
const INNER_RADIUS = 57;
const OUTER_RADIUS = 76;
const SEGMENT_CORNER_RADIUS = 5;
const SEGMENT_GAP_ANGLE = (2 * Math.PI) / 180;
const SELECTED_TRANSLATION = 11;
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

function polarPoint(radius: number, angle: number) {
  return {
    x: CHART_CENTER + Math.cos(angle) * radius,
    y: CHART_CENTER + Math.sin(angle) * radius,
  };
}

function pointValue(point: { x: number; y: number }) {
  return `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
}

// Reproduces the annular Sector geometry used by Recharts/shadcn. Unlike a
// stroked circle, inner and outer radii never change between categories.
function annularSectorPath(startAngle: number, endAngle: number) {
  const sweep = Math.max(0.0001, endAngle - startAngle);
  const cornerRadius = Math.min(
    SEGMENT_CORNER_RADIUS,
    (OUTER_RADIUS - INNER_RADIUS) / 2,
    (sweep * INNER_RADIUS) / 2.2,
  );
  const outerCornerAngle = cornerRadius / OUTER_RADIUS;
  const innerCornerAngle = cornerRadius / INNER_RADIUS;
  const outerLargeArc = sweep - outerCornerAngle * 2 > Math.PI ? 1 : 0;
  const innerLargeArc = sweep - innerCornerAngle * 2 > Math.PI ? 1 : 0;

  const outerStartEdge = polarPoint(OUTER_RADIUS - cornerRadius, startAngle);
  const outerStartCorner = polarPoint(OUTER_RADIUS, startAngle);
  const outerStartArc = polarPoint(OUTER_RADIUS, startAngle + outerCornerAngle);
  const outerEndArc = polarPoint(OUTER_RADIUS, endAngle - outerCornerAngle);
  const outerEndCorner = polarPoint(OUTER_RADIUS, endAngle);
  const outerEndEdge = polarPoint(OUTER_RADIUS - cornerRadius, endAngle);
  const innerEndEdge = polarPoint(INNER_RADIUS + cornerRadius, endAngle);
  const innerEndCorner = polarPoint(INNER_RADIUS, endAngle);
  const innerEndArc = polarPoint(INNER_RADIUS, endAngle - innerCornerAngle);
  const innerStartArc = polarPoint(INNER_RADIUS, startAngle + innerCornerAngle);
  const innerStartCorner = polarPoint(INNER_RADIUS, startAngle);
  const innerStartEdge = polarPoint(INNER_RADIUS + cornerRadius, startAngle);

  return [
    `M ${pointValue(outerStartEdge)}`,
    `Q ${pointValue(outerStartCorner)} ${pointValue(outerStartArc)}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${outerLargeArc} 1 ${pointValue(outerEndArc)}`,
    `Q ${pointValue(outerEndCorner)} ${pointValue(outerEndEdge)}`,
    `L ${pointValue(innerEndEdge)}`,
    `Q ${pointValue(innerEndCorner)} ${pointValue(innerEndArc)}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${innerLargeArc} 0 ${pointValue(innerStartArc)}`,
    `Q ${pointValue(innerStartCorner)} ${pointValue(innerStartEdge)}`,
    'Z',
  ].join(' ');
}

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
  const [selectionProgress] = useState(() => new Animated.Value(0));
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
  const segments = grouped.map((item, index) => {
    const share = total > 0 ? item.amount / total : 0;
    const previousAmount = grouped
      .slice(0, index)
      .reduce((sum, previousItem) => sum + previousItem.amount, 0);
    const startShare = total > 0 ? previousAmount / total : 0;
    const rawStartAngle = startShare * Math.PI * 2 - Math.PI / 2;
    const rawEndAngle = (startShare + share) * Math.PI * 2 - Math.PI / 2;
    const rawSweep = rawEndAngle - rawStartAngle;
    const gapAngle = grouped.length > 1
      ? Math.min(SEGMENT_GAP_ANGLE, rawSweep * 0.2)
      : 0;
    const startAngle = rawStartAngle + gapAngle / 2;
    const endAngle = rawEndAngle - gapAngle / 2;
    const middleAngle = (startShare + share / 2) * Math.PI * 2 - Math.PI / 2;
    return {
      ...item,
      color:
        item.category.toLocaleLowerCase('it-IT') === 'altro'
          ? OTHER_CATEGORY_COLOR
          : categoryColors[index % categoryColors.length],
      startShare,
      endShare: startShare + share,
      startAngle,
      endAngle,
      translateX: Math.cos(middleAngle) * SELECTED_TRANSLATION,
      translateY: Math.sin(middleAngle) * SELECTED_TRANSLATION,
    };
  });
  const selectedSegment = segments.find(
    (item) => item.category === selectedCategory,
  );
  const segmentLayers = segments.map((item) => {
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_SIZE}" height="${CHART_SIZE}" viewBox="0 0 ${CHART_SIZE} ${CHART_SIZE}">`,
      `<path d="${annularSectorPath(item.startAngle, item.endAngle)}" fill="${item.color}"/>`,
      '</svg>',
    ].join('');
    return {
      ...item,
      uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    };
  });

  function animateSelection(category: string | null) {
    selectionProgress.stopAnimation();
    if (!category) {
      Animated.timing(selectionProgress, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }).start(() => setSelectedCategory(null));
      return;
    }
    const moveOut = () => {
      selectionProgress.setValue(0);
      setSelectedCategory(category);
      Animated.spring(selectionProgress, {
        toValue: 1,
        damping: 18,
        stiffness: 220,
        mass: 0.72,
        useNativeDriver: true,
      }).start();
    };
    if (selectedCategory && category !== selectedCategory) {
      Animated.timing(selectionProgress, {
        toValue: 0,
        duration: 130,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) moveOut();
      });
      return;
    }
    if (category === selectedCategory) {
      Animated.spring(selectionProgress, {
        toValue: 1,
        damping: 18,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
      return;
    }
    moveOut();
  }

  function selectSegmentAt(event: GestureResponderEvent) {
    event.stopPropagation();
    const x = event.nativeEvent.locationX - CHART_CENTER;
    const y = event.nativeEvent.locationY - CHART_CENTER;
    const distance = Math.sqrt(x * x + y * y);
    const innerHitRadius = INNER_RADIUS - 8;
    const outerHitRadius = OUTER_RADIUS + 8;

    if (distance < innerHitRadius || distance > outerHitRadius) {
      animateSelection(null);
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
      animateSelection(null);
      return;
    }

    const pressedAngle = shareAtPress * Math.PI * 2 - Math.PI / 2;
    const pressedVisibleArc =
      pressedAngle >= segment.startAngle && pressedAngle <= segment.endAngle;
    animateSelection(pressedVisibleArc ? segment.category : null);
  }

  return (
    <Pressable
      accessible={false}
      onPress={() => animateSelection(null)}>
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
        {segmentLayers.map((item) => (
          <Animated.View
            key={item.category}
            pointerEvents="none"
            style={[
              styles.segmentLayer,
              {
                transform: [
                  {
                    translateX: selectionProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        0,
                        item.category === selectedCategory ? item.translateX : 0,
                      ],
                    }),
                  },
                  {
                    translateY: selectionProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        0,
                        item.category === selectedCategory ? item.translateY : 0,
                      ],
                    }),
                  },
                ],
              },
            ]}>
            <Image
              source={{ uri: item.uri }}
              contentFit="contain"
              cachePolicy="none"
              style={styles.chartImage}
            />
          </Animated.View>
        ))}
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
                  animateSelection(item.category);
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
  segmentLayer: { position: 'absolute', inset: 0 },
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
