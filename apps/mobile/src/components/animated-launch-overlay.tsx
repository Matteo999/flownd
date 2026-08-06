import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { useApp } from '@/providers/app-provider';

export function AnimatedLaunchOverlay() {
  const { loading } = useApp();
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(0.94));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.035,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.97,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale]);

  useEffect(() => {
    if (loading) return;
    scale.stopAnimation();
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1,
        damping: 12,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [loading, opacity, scale]);

  if (!visible) return null;

  return (
    <Animated.View
      accessibilityLabel="Flownd sta caricando"
      style={[
        styles.overlay,
        { backgroundColor: '#0F1712', opacity },
      ]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <BrandLogo size={78} />
      </Animated.View>
      <View style={[styles.dot, { backgroundColor: '#45D5B6' }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 24,
    opacity: 0.7,
  },
});
