import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';

export type AuthMethod = 'email' | 'google' | 'apple' | 'facebook';

export function AuthSocialButton({
  method,
  label,
  onPress,
  disabled = false,
  loading = false,
}: {
  method: AuthMethod;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useFlowndTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.surface, borderColor: colors.border },
        disabled && !loading && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <View style={styles.iconSlot}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : method === 'google' ? (
          <Image
            source={require('@/assets/images/google-g.svg')}
            contentFit="contain"
            style={styles.googleIcon}
          />
        ) : method === 'email' ? (
          <Text style={[styles.materialSymbol, { color: colors.accent }]}>
            mail
          </Text>
        ) : method === 'apple' && Platform.OS === 'ios' ? (
          <SymbolView name="apple.logo" size={20} tintColor={colors.text} />
        ) : method === 'apple' ? (
          <Text style={[styles.fallbackIcon, { color: colors.text }]}>A</Text>
        ) : (
          <Text style={[styles.facebookIcon, { color: '#1877F2' }]}>f</Text>
        )}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.iconSlot} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  iconSlot: { width: 30, alignItems: 'center' },
  googleIcon: { width: 20, height: 20 },
  materialSymbol: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 22,
    lineHeight: 25,
  },
  fallbackIcon: { fontFamily: font.bodySemiBold, fontSize: 20 },
  facebookIcon: { fontFamily: font.bodySemiBold, fontSize: 22 },
  label: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.bodySemiBold,
    fontSize: 15,
  },
  disabled: { opacity: 0.46 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
