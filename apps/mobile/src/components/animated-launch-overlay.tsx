import { useEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Animated, Easing, StyleSheet } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { useApp } from '@/providers/app-provider';

export function AnimatedLaunchOverlay() {
  const { loading } = useApp();
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const [logoOpacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(1));
  const nativeSplashHidden = useRef(false);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.025,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.985,
          duration: 720,
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
    const timer = setTimeout(() => {
      scale.stopAnimation(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoOpacity, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.075,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) setVisible(false);
        });
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [loading, logoOpacity, opacity, scale]);

  if (!visible) return null;

  return (
    <Animated.View
      accessibilityLabel="Flownd sta caricando"
      style={[
        styles.overlay,
        { backgroundColor: '#0F1712', opacity },
      ]}
      onLayout={() => {
        if (nativeSplashHidden.current) return;
        nativeSplashHidden.current = true;
        void SplashScreen.hideAsync();
      }}>
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale }] }}>
        <BrandLogo size={88} />
      </Animated.View>
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
});
