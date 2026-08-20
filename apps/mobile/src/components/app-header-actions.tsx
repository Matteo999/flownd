import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';
import { useApp } from '@/providers/app-provider';

export function AppHeaderActions({
  leading,
  showNotifications = false,
}: {
  leading?: ReactNode;
  showNotifications?: boolean;
}) {
  const { colors } = useFlowndTheme();
  const { goalNotice } = useApp();

  return (
    <View style={styles.actions}>
      {leading}
      {showNotifications ? (
        <Pressable
          accessibilityLabel={goalNotice ? 'Notifiche, nuove notifiche presenti' : 'Notifiche'}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => router.push('/notifications' as Href)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Text style={[styles.materialIcon, { color: colors.text }]}>notifications</Text>
          {goalNotice ? (
            <View
              accessibilityElementsHidden
              style={[
                styles.notificationBadge,
                { backgroundColor: colors.negative, borderColor: colors.background },
              ]}
            />
          ) : null}
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel="Apri profilo"
        accessibilityRole="button"
        hitSlop={5}
        onPress={() => router.push('/settings' as Href)}
        style={({ pressed }) => pressed && styles.pressed}>
        <UserAvatar size={32} />
      </Pressable>
    </View>
  );
}

export function UserAvatar({ size = 40 }: { size?: number }) {
  const { colors } = useFlowndTheme();
  const { session } = useApp();
  const [imageFailed, setImageFailed] = useState(false);
  const metadata = session?.user.user_metadata;
  const avatarUrl =
    typeof metadata?.avatar_url === 'string'
      ? metadata.avatar_url
      : typeof metadata?.picture === 'string'
        ? metadata.picture
        : null;
  const displayName =
    (typeof metadata?.full_name === 'string' && metadata.full_name) ||
    (typeof metadata?.name === 'string' && metadata.name) ||
    session?.user.email ||
    'Flownd';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (avatarUrl && !imageFailed) {
    return (
      <Image
        accessibilityLabel={`Avatar di ${displayName}`}
        contentFit="cover"
        onError={() => setImageFailed(true)}
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        transition={120}
      />
    );
  }

  return (
    <View
      accessibilityLabel={`Avatar di ${displayName}`}
      style={[
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accentSoft,
          borderColor: colors.accent,
        },
      ]}>
      <Text
        style={[
          styles.avatarInitials,
          { color: colors.accent, fontSize: Math.max(10, size * 0.34) },
        ]}>
        {initials || 'F'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  avatarFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontFamily: font.displayBold },
  pressed: { opacity: 0.65 },
});
