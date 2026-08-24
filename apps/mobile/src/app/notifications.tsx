import { router, type Href, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Card, PrimaryButton, Screen, font, useFlowndTheme } from '@/components/flownd-ui';
import { supabase } from '@/lib/supabase';
import {
  deleteTransactionImportJob,
  reportClientError,
} from '@/lib/transaction-import';
import { useApp } from '@/providers/app-provider';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  actionRoute: string | null;
};

const SWIPE_ACTION_WIDTH = 86;
const SWIPE_DELETE_THRESHOLD = 168;
const SWIPE_DISMISS_DISTANCE = 520;
const SWIPE_SPRING = { damping: 22, stiffness: 240, mass: 0.82 };

function deleteThresholdHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export default function NotificationsScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { session, dismissGoalNotice } = useApp();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!session) return undefined;
      void supabase
        .from('goal_notifications')
        .select('id,title,body,read_at,created_at,action_route')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data, error }) => {
          if (!active) return;
          setLoadError(Boolean(error));
          if (error) {
            void reportClientError(
              session.access_token,
              'notifications_load',
              error,
            );
          }
          setItems(
            (data ?? []).map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              readAt: item.read_at,
              createdAt: item.created_at,
              actionRoute: item.action_route,
            })),
          );
          setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [session]),
  );

  function openNotification(item: NotificationItem) {
    if (!session) return;
    if (item.actionRoute) router.push(item.actionRoute as Href);
    if (!item.readAt) void (async () => {
      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from('goal_notifications')
        .update({ read_at: readAt })
        .eq('user_id', session.user.id)
        .eq('id', item.id);
      if (!error) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, readAt } : entry,
          ),
        );
        await dismissGoalNotice(item.id);
      }
    })();
  }

  async function deleteNotification(item: NotificationItem) {
    if (!session) return;
    const importJobId = jobIdFromActionRoute(item.actionRoute);
    if (importJobId) {
      try {
        await deleteTransactionImportJob(session.user.id, importJobId);
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        await dismissGoalNotice(item.id);
      } catch (error) {
        setLoadError(true);
        await reportClientError(session.access_token, 'notification_delete', error);
      }
      return;
    }
    const { error } = await supabase
      .from('goal_notifications')
      .delete()
      .eq('user_id', session.user.id)
      .eq('id', item.id);
    if (error) {
      setLoadError(true);
      await reportClientError(session.access_token, 'notification_delete', error);
      return;
    }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    await dismissGoalNotice(item.id);
  }

  async function deleteAllNotifications() {
    if (!session || deletingAll) return;
    setDeletingAll(true);
    const { error: jobsError } = await supabase
      .from('transaction_import_jobs')
      .delete()
      .eq('user_id', session.user.id)
      .in('status', ['completed', 'failed']);
    if (jobsError) {
      setDeletingAll(false);
      setDeleteAllOpen(false);
      setLoadError(true);
      await reportClientError(
        session.access_token,
        'notification_import_jobs_delete_all',
        jobsError,
      );
      return;
    }
    const { error } = await supabase
      .from('goal_notifications')
      .delete()
      .eq('user_id', session.user.id);
    setDeletingAll(false);
    if (error) {
      setDeleteAllOpen(false);
      setLoadError(true);
      await reportClientError(
        session.access_token,
        'notifications_delete_all',
        error,
      );
      return;
    }
    const visibleNoticeId = items.find((item) => !item.readAt)?.id ?? items[0]?.id;
    setItems([]);
    setDeleteAllOpen(false);
    if (visibleNoticeId) await dismissGoalNotice(visibleNoticeId);
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
        {items.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Elimina tutte le notifiche"
            onPress={() => setDeleteAllOpen(true)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.deleteAllText, { color: colors.negative }]}>Elimina tutte</Text>
          </Pressable>
        ) : <View style={styles.headerSpacer} />}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : loadError ? (
        <Card>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Si è verificato un errore. Il resoconto è stato inviato agli sviluppatori.
          </Text>
        </Card>
      ) : items.length ? (
        <View style={styles.list}>
          {items.map((item) => (
            <SwipeNotificationRow
              key={item.id}
              item={item}
              onDelete={() => void deleteNotification(item)}
              onOpen={() => openNotification(item)}
            />
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
      <Modal
        animationType="fade"
        transparent
        visible={deleteAllOpen}
        onRequestClose={() => setDeleteAllOpen(false)}>
        <View style={styles.confirmRoot}>
          <Pressable
            accessibilityLabel="Chiudi conferma"
            onPress={() => setDeleteAllOpen(false)}
            style={[StyleSheet.absoluteFill, styles.confirmBackdrop]}
          />
          <Card style={[styles.confirmCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>Eliminare tutte le notifiche?</Text>
            <Text style={[styles.confirmCopy, { color: colors.textSecondary }]}>Questa operazione non può essere annullata.</Text>
            <PrimaryButton loading={deletingAll} onPress={() => void deleteAllNotifications()}>
              Elimina tutte
            </PrimaryButton>
            <Pressable
              disabled={deletingAll}
              onPress={() => setDeleteAllOpen(false)}
              style={styles.cancelButton}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Annulla</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

function SwipeNotificationRow({
  item,
  onDelete,
  onOpen,
}: {
  item: NotificationItem;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { colors } = useFlowndTheme();
  const translateX = useSharedValue(0);
  const gestureStart = useSharedValue(0);
  const deleteArmed = useSharedValue(false);
  const actionLabel = jobIdFromActionRoute(item.actionRoute) ? 'Scarta' : 'Elimina';

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const actionStyle = useAnimatedStyle(() => ({
    width: Math.max(SWIPE_ACTION_WIDTH, -translateX.value),
  }));
  const panGesture = Gesture.Pan()
    .activeOffsetX([-9, 9])
    .failOffsetY([-12, 12])
    .onStart(() => {
      gestureStart.value = translateX.value;
    })
    .onUpdate((event) => {
      // Reanimated SharedValues are intentionally mutable on the UI thread.
      // eslint-disable-next-line react-hooks/immutability
      translateX.value = Math.min(0, gestureStart.value + event.translationX);
      const crossed = -translateX.value >= SWIPE_DELETE_THRESHOLD;
      if (crossed && !deleteArmed.value) {
        deleteArmed.value = true;
        runOnJS(deleteThresholdHaptic)();
      } else if (!crossed && deleteArmed.value) {
        deleteArmed.value = false;
      }
    })
    .onEnd(() => {
      if (deleteArmed.value) {
        // eslint-disable-next-line react-hooks/immutability
        translateX.value = withSpring(
          -SWIPE_DISMISS_DISTANCE,
          SWIPE_SPRING,
          (finished) => {
            if (finished) runOnJS(onDelete)();
          },
        );
        return;
      }
      translateX.value = withSpring(
        translateX.value <= -SWIPE_ACTION_WIDTH / 2 ? -SWIPE_ACTION_WIDTH : 0,
        SWIPE_SPRING,
      );
    })
    .onFinalize(() => {
      deleteArmed.value = false;
    });

  const deleteFromButton = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    translateX.value = withSpring(
      -SWIPE_DISMISS_DISTANCE,
      SWIPE_SPRING,
      (finished) => {
        if (finished) runOnJS(onDelete)();
      },
    );
  }, [onDelete, translateX]);

  return (
    <View style={styles.swipeRow}>
      <View
        pointerEvents="none"
        style={[styles.swipeDeleteBackground, { backgroundColor: colors.negative }]}
      />
      <Animated.View
        style={[styles.swipeDelete, { backgroundColor: colors.negative }, actionStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${item.title}`}
          onPress={deleteFromButton}
          style={styles.swipeDeletePressable}>
          <Text style={[styles.materialIcon, { color: '#FFFFFF' }]}>delete</Text>
          <Text style={styles.swipeDeleteText}>{actionLabel}</Text>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={rowStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.readAt ? 'Letta' : 'Non letta'}`}
          accessibilityActions={[{ name: 'delete', label: actionLabel }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete') onDelete();
          }}
          onPress={() => {
            if (translateX.value < 0) {
              // eslint-disable-next-line react-hooks/immutability
              translateX.value = withSpring(0, SWIPE_SPRING);
            } else onOpen();
          }}>
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
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function jobIdFromActionRoute(actionRoute: string | null) {
  const match = actionRoute?.match(/[?&]jobId=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
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
  deleteAllText: { fontFamily: font.bodySemiBold, fontSize: 11 },
  loader: { marginTop: 30 },
  list: { gap: 9 },
  swipeRow: { position: 'relative', overflow: 'hidden', borderRadius: 18 },
  notification: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 18,
    overflow: 'hidden',
  },
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
  swipeDelete: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 18,
  },
  swipeDeletePressable: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteText: { color: '#FFFFFF', fontFamily: font.bodySemiBold, fontSize: 10 },
  confirmRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmBackdrop: { backgroundColor: 'rgba(4, 16, 24, 0.48)' },
  confirmCard: { width: '100%', maxWidth: 360, padding: 22 },
  confirmTitle: { fontFamily: font.bodySemiBold, fontSize: 17 },
  confirmCopy: { fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 20 },
  cancelButton: { alignItems: 'center', paddingTop: 14 },
  cancelText: { fontFamily: font.bodySemiBold, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 30 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 14, marginTop: 8 },
  emptyCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 3 },
  pressed: { opacity: 0.7 },
});
