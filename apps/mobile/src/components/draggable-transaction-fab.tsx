import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFlowndTheme } from '@/components/flownd-ui';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';

const BUTTON_SIZE = 60;
const EDGE_MARGIN = 14;
const HEADER_CLEARANCE = 70;
const BOTTOM_CLEARANCE = 112;
const BOUNDS_SPRING = { damping: 18, stiffness: 135, mass: 0.9 } as const;
const EDGE_SPRING = { damping: 12, stiffness: 72, mass: 1.08 } as const;

type FabSide = 'left' | 'right';
type FabPreference = { side: FabSide; yRatio: number };

const preferenceValues = new Map<string, FabPreference>();
const settlingInstances = new Set<symbol>();
const preferenceListeners = new Map<
  string,
  Set<(preference: FabPreference) => void>
>();

function publishPreference(userId: string, preference: FabPreference) {
  preferenceValues.set(userId, preference);
  preferenceListeners.get(userId)?.forEach((listener) => listener(preference));
}

function subscribePreference(
  userId: string,
  listener: (preference: FabPreference) => void,
) {
  const listeners = preferenceListeners.get(userId) ?? new Set();
  listeners.add(listener);
  preferenceListeners.set(userId, listeners);
  const current = preferenceValues.get(userId);
  if (current) listener(current);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) preferenceListeners.delete(userId);
  };
}

function storageKey(userId: string) {
  return `flownd:transaction-fab:${userId}`;
}

function validPreference(value: unknown): FabPreference | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FabPreference> & { xRatio?: number };
  const side = candidate.side === 'left' || candidate.side === 'right'
    ? candidate.side
    : Number.isFinite(Number(candidate.xRatio))
      ? Number(candidate.xRatio) < 0.5 ? 'left' : 'right'
      : null;
  const yRatio = Number(candidate.yRatio);
  if (!side || !Number.isFinite(yRatio)) return null;
  return {
    side,
    yRatio: Math.max(0, Math.min(1, yRatio)),
  };
}

function rubberBand(value: number, minimum: number, maximum: number) {
  'worklet';
  if (value < minimum) return minimum - (minimum - value) * 0.22;
  if (value > maximum) return maximum + (value - maximum) * 0.22;
  return value;
}

export function DraggableTransactionFab({ onPress }: { onPress: () => void }) {
  const { colors } = useFlowndTheme();
  const { session } = useApp();
  const insets = useSafeAreaInsets();
  const initialPreference = session?.user.id
    ? preferenceValues.get(session.user.id)
    : null;
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [instanceId] = useState(() => Symbol('transaction-fab'));
  const [preference, setPreference] = useState<FabPreference>(
    initialPreference ?? { side: 'right', yRatio: 1 },
  );
  const [preferenceLoaded, setPreferenceLoaded] = useState(
    () => !session?.user.id || Boolean(initialPreference),
  );
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    const userId = session?.user.id;
    let active = true;
    if (!userId) return;
    const unsubscribe = subscribePreference(userId, (next) => {
      if (active) setPreference(next);
    });
    void (async () => {
      try {
        const cached = validPreference(
          JSON.parse((await AsyncStorage.getItem(storageKey(userId))) ?? 'null'),
        );
        if (active && cached) {
          publishPreference(userId, cached);
          setPreferenceLoaded(true);
        }
      } catch {
        // Una preferenza locale non valida non deve bloccare il pulsante.
      }
      const { data } = await supabase
        .from('profiles')
        .select('transaction_fab_side,transaction_fab_y_ratio')
        .eq('id', userId)
        .maybeSingle();
      const remote = validPreference(
        data
          ? {
              side: data.transaction_fab_side,
              yRatio: data.transaction_fab_y_ratio,
            }
          : null,
      );
      if (active && remote) {
        publishPreference(userId, remote);
        await AsyncStorage.setItem(storageKey(userId), JSON.stringify(remote));
      }
      if (active) setPreferenceLoaded(true);
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [session?.user.id]);

  const minimumX = EDGE_MARGIN;
  const maximumX = Math.max(minimumX, layout.width - BUTTON_SIZE - EDGE_MARGIN);
  const minimumY = insets.top + HEADER_CLEARANCE;
  const maximumY = Math.max(
    minimumY,
    layout.height - BUTTON_SIZE - BOTTOM_CLEARANCE,
  );

  useEffect(() => {
    if (!preferenceLoaded || !layout.width || !layout.height) return;
    if (settlingInstances.has(instanceId)) return;
    const nextX = preference.side === 'left' ? minimumX : maximumX;
    const nextY = minimumY + preference.yRatio * (maximumY - minimumY);
    translateX.value = nextX;
    translateY.value = nextY;
  }, [
    layout.height,
    layout.width,
    instanceId,
    maximumX,
    maximumY,
    minimumX,
    minimumY,
    preference.side,
    preference.yRatio,
    preferenceLoaded,
    translateX,
    translateY,
  ]);

  const persistPosition = useCallback(
    (side: FabSide, yRatio: number) => {
      settlingInstances.add(instanceId);
      const next = {
        side,
        yRatio: Math.max(0, Math.min(1, yRatio)),
      };
      setPreference(next);
      const userId = session?.user.id;
      if (!userId) return;
      publishPreference(userId, next);
      void AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
      void supabase
        .from('profiles')
        .update({
          transaction_fab_side: next.side,
          transaction_fab_y_ratio: next.yRatio,
        })
        .eq('id', userId);
    },
    [instanceId, session?.user.id],
  );

  const finishSettlingPosition = useCallback(() => {
    settlingInstances.delete(instanceId);
  }, [instanceId]);

  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      // eslint-disable-next-line react-hooks/immutability
      translateX.value = rubberBand(
        startX.value + event.translationX,
        minimumX,
        maximumX,
      );
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = rubberBand(
        startY.value + event.translationY,
        minimumY,
        maximumY,
      );
    })
    .onEnd((event) => {
      const releasedX = translateX.value;
      const projectedX = releasedX + event.velocityX * 0.12;
      const side: FabSide = projectedX + BUTTON_SIZE / 2 < layout.width / 2
        ? 'left'
        : 'right';
      const targetX = side === 'left' ? minimumX : maximumX;
      const projectedY = translateY.value + event.velocityY * 0.12;
      const targetY = Math.max(minimumY, Math.min(maximumY, projectedY));
      // eslint-disable-next-line react-hooks/immutability
      translateX.value = withSpring(
        targetX,
        {
          ...EDGE_SPRING,
          velocity: event.velocityX,
          overshootClamping: false,
        },
        () => {
          runOnJS(finishSettlingPosition)();
        },
      );
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = withSpring(targetY, {
        ...BOUNDS_SPRING,
        velocity: event.velocityY,
        overshootClamping: false,
      });
      const yRange = maximumY - minimumY;
      runOnJS(persistPosition)(
        side,
        yRange > 0 ? (targetY - minimumY) / yRange : 0,
      );
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: preferenceLoaded ? 1 : 0,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  function captureLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={captureLayout}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.position, animatedStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aggiungi una transazione"
            accessibilityHint="Trascina per spostare il pulsante"
            onPress={onPress}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent },
              pressed && styles.pressed,
            ]}>
            <Text style={styles.icon}>add</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', top: 0, left: 0 },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.95 }] },
  icon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 30,
    lineHeight: 34,
  },
});
