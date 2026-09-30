import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, GlassSurface, useFlowndTheme } from '@/components/flownd-ui';
import { useAppState } from '@/providers/app-provider';

export function AppHeaderActions({
  leading,
  showNotifications = false,
  glass = false,
}: {
  leading?: ReactNode;
  showNotifications?: boolean;
  // Pulsanti raggruppati in capsule di vetro, per la GlassNavBar.
  glass?: boolean;
}) {
  const { colors } = useFlowndTheme();
  const { goalNotice } = useAppState('goalNotice');
  const notifications = showNotifications ? (
    <Pressable
      accessibilityLabel={goalNotice ? 'Notifiche, nuove notifiche presenti' : 'Notifiche'}
      accessibilityRole="button"
      hitSlop={6}
      onPress={() => router.push('/notifications' as Href)}
      style={({ pressed }) => [
        glass ? styles.glassIconButton : styles.iconButton,
        pressed && styles.pressed,
      ]}>
      <Text style={[glass ? styles.glassIcon : styles.materialIcon, { color: colors.text }]}>
        notifications
      </Text>
      {goalNotice ? (
        <View
          accessibilityElementsHidden
          style={[
            styles.notificationBadge,
            glass && styles.glassNotificationBadge,
            {
              backgroundColor: colors.negative,
              borderColor: glass ? colors.surface : colors.background,
            },
          ]}
        />
      ) : null}
    </Pressable>
  ) : null;
  const profile = (
    <Pressable
      accessibilityLabel="Apri profilo"
      accessibilityRole="button"
      hitSlop={5}
      onPress={() => router.push('/settings' as Href)}
      style={({ pressed }) => pressed && styles.pressed}>
      <UserAvatar size={glass ? 38 : 32} />
    </Pressable>
  );

  if (glass) {
    return (
      <View style={styles.glassActions}>
        {leading || notifications ? (
          <GlassSurface interactive style={styles.glassCapsule}>
            {leading}
            {notifications}
          </GlassSurface>
        ) : null}
        <GlassSurface interactive style={styles.glassAvatar}>
          {profile}
        </GlassSurface>
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      {leading}
      {notifications}
      {profile}
    </View>
  );
}

export function UserAvatar({ size = 40 }: { size?: number }) {
  const { colors } = useFlowndTheme();
  const { session } = useAppState('session');
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
  glassActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glassCapsule: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 1,
  },
  glassIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 22,
    lineHeight: 24,
  },
  glassNotificationBadge: { top: 10, right: 11 },
  glassAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontFamily: font.displayBold },
  pressed: { opacity: 0.65 },
});
