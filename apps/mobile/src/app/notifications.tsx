import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen, font, useFlowndTheme } from '@/components/flownd-ui';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { session, dismissGoalNotice } = useApp();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!session) return undefined;
      void supabase
        .from('goal_notifications')
        .select('id,title,body,read_at,created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data, error }) => {
          if (!active) return;
          setLoadError(Boolean(error));
          setItems(
            (data ?? []).map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              readAt: item.read_at,
              createdAt: item.created_at,
            })),
          );
          setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [session]),
  );

  async function markAsRead(item: NotificationItem) {
    if (!session || item.readAt) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from('goal_notifications')
      .update({ read_at: readAt })
      .eq('user_id', session.user.id)
      .eq('id', item.id);
    if (error) return;
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, readAt } : entry,
      ),
    );
    await dismissGoalNotice(item.id);
  }

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Indietro"
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifiche</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : loadError ? (
        <Card>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Non riesco a caricare le notifiche in questo momento.
          </Text>
        </Card>
      ) : items.length ? (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.readAt ? 'Letta' : 'Non letta'}`}
              onPress={() => void markAsRead(item)}
              style={({ pressed }) => pressed && styles.pressed}>
              <Card
                style={[
                  styles.notification,
                  !item.readAt && {
                    backgroundColor: colors.accentSoft,
                    borderColor: colors.accent,
                  },
                ]}>
                <View
                  style={[
                    styles.notificationIcon,
                    { backgroundColor: item.readAt ? colors.sunken : colors.surface },
                  ]}>
                  <Text style={[styles.materialIcon, { color: colors.accent }]}>notifications</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                    {!item.readAt ? (
                      <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
                    ) : null}
                  </View>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
                  <Text style={[styles.date, { color: colors.textSecondary }]}> 
                    {formatNotificationDate(item.createdAt)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card style={styles.empty}>
          <Text style={[styles.emptyIcon, { color: colors.textSecondary }]}>notifications_none</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Tutto sotto controllo</Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Le notifiche importanti compariranno qui.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  loader: { marginTop: 30 },
  list: { gap: 9 },
  notification: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  notificationIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 13 },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  body: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 3 },
  date: { fontFamily: font.data, fontSize: 9, marginTop: 7 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 30 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 14, marginTop: 8 },
  emptyCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 3 },
  pressed: { opacity: 0.7 },
});
