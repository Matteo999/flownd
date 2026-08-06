import { Image } from 'expo-image';
import { ImageStyle, StyleProp, StyleSheet } from 'react-native';

export function BrandLogo({
  size = 44,
  variant = 'mark',
  style,
}: {
  size?: number;
  variant?: 'mark' | 'wordmark';
  style?: StyleProp<ImageStyle>;
}) {
  const isWordmark = variant === 'wordmark';
  return (
    <Image
      accessibilityLabel="Flownd"
      source={
        isWordmark
          ? require('@/assets/images/flownd-alpha.png')
          : require('@/assets/images/f-alpha.png')
      }
      contentFit="contain"
      style={[
        styles.logo,
        isWordmark
          ? { width: size, height: Math.round(size * (150 / 698)) }
          : { width: size, height: Math.round(size * (465 / 378)) },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  logo: { flexShrink: 0 },
});
