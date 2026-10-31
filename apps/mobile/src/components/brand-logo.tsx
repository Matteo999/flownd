import { Image } from 'expo-image';
import { ImageStyle, StyleProp, StyleSheet } from 'react-native';

import { useFlowndTheme } from '@/constants/flownd-theme';

const sources = {
  mark: {
    light: require('@/assets/images/brand/mark-light.png'),
    dark: require('@/assets/images/brand/mark-dark.png'),
  },
  wordmark: {
    light: require('@/assets/images/brand/wordmark-light.png'),
    dark: require('@/assets/images/brand/wordmark-dark.png'),
  },
};

export function BrandLogo({
  size = 44,
  variant = 'mark',
  tone,
  style,
}: {
  size?: number;
  variant?: 'mark' | 'wordmark';
  // Forza la versione per sfondo chiaro/scuro; di default segue il tema.
  tone?: 'light' | 'dark';
  style?: StyleProp<ImageStyle>;
}) {
  const { isDark } = useFlowndTheme();
  const isWordmark = variant === 'wordmark';
  const resolvedTone = tone ?? (isDark ? 'dark' : 'light');
  return (
    <Image
      accessibilityLabel="Flownd"
      source={sources[variant][resolvedTone]}
      contentFit="contain"
      style={[
        styles.logo,
        isWordmark
          ? { width: size, height: Math.round(size * (928 / 4585)) }
          : { width: size, height: size },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  logo: { flexShrink: 0 },
});
