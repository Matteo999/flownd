import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Card,
  GlassIconButton,
  GlassNavBar,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { UserAvatar } from '@/components/app-header-actions';
import type { ThemePreference } from '@/constants/flownd-theme';
import {
  hydrateAppLockPreference,
  setAppLockEnabled,
  useAppLockEnabled,
} from '@/lib/app-lock';
import { deleteAccount, signOutLocally } from '@/lib/auth';
import { useAppState } from '@/providers/app-provider';

const themeOptions: {
  id: ThemePreference;
  label: string;
  icon: string;
}[] = [
  { id: 'light', label: 'Chiaro', icon: 'light_mode' },
  { id: 'dark', label: 'Scuro', icon: 'dark_mode' },
  { id: 'system', label: 'Sistema', icon: 'settings_suggest' },
];

// Altezza (sotto l'inset) a cui il centro del nome deve salire perché il titolo compaia: a metà barra.
const NAV_BAR_BOTTOM = 10;

const rowTints = {
  budget: '#457FEF',
  groups: '#7C5CE6',
  notifications: '#EE8A4A',
};

export default function ProfileScreen() {
  const {
    colors,
    themePreference,
    setThemePreference,
  } = useFlowndTheme();
  const {
    session,
    planTier,
    planSource,
    amountsVisible,
    toggleAmountsVisible,
  } = useAppState(
    'session',
    'planTier',
    'planSource',
    'amountsVisible',
    'toggleAmountsVisible',
  );
  const [deleting, setDeleting] = useState(false);
  const insets = useSafeAreaInsets();
  const nameRef = useRef<Text>(null);
  const nameThreshold = useRef<number | null>(null);
  const scrollOffset = useRef(0);
  const [nameInHeader, setNameInHeader] = useState(false);
  const appLockEnabled = useAppLockEnabled();
  const [appLockUpdating, setAppLockUpdating] = useState(false);

  useEffect(() => {
    void hydrateAppLockPreference();
  }, []);

  const metadata = session?.user.user_metadata;
  const email = session?.user.email ?? '';
  const displayName =
    (typeof metadata?.full_name === 'string' && metadata.full_name) ||
    (typeof metadata?.name === 'string' && metadata.name) ||
    email.split('@')[0] ||
    'Account Flownd';
  const planLabel = planTier === 'free' ? 'Free' : planTier === 'pro' ? 'Pro' : 'Max';

  // Il titolo compatto prende il posto del nome quando questo sale sotto la barra.
  const measureName = useCallback(() => {
    nameRef.current?.measureInWindow((_x, y, _width, height) => {
      if (height > 0) {
        nameThreshold.current =
          y + scrollOffset.current + height / 2 - (insets.top + NAV_BAR_BOTTOM);
      }
    });
  }, [insets.top]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.y;
    scrollOffset.current = offset;
    const threshold = nameThreshold.current;
    if (threshold !== null) setNameInHeader(offset >= threshold);
  }, []);

  async function toggleAppLock() {
    if (appLockUpdating) return;
    setAppLockUpdating(true);
    try {
      await setAppLockEnabled(!appLockEnabled);
    } catch (reason) {
      Alert.alert(
        'Blocco non disponibile',
        reason instanceof Error ? reason.message : 'Riprova tra poco.',
      );
    } finally {
      setAppLockUpdating(false);
    }
  }

  async function performAccountDeletion() {
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/onboarding?transition=back' as Href);
    } catch (reason) {
      Alert.alert(
        'Eliminazione non riuscita',
        reason instanceof Error
          ? reason.message
          : 'Non siamo riusciti a eliminare l’account. Riprova tra poco.',
      );
    } finally {
      setDeleting(false);
    }
  }

  function confirmAccountDeletion() {
    Alert.alert(
      'Eliminare l’account?',
      'Cancelleremo in modo definitivo transazioni, budget, obiettivi e conversazioni con il Coach. I gruppi di cui sei proprietario passeranno al membro più anziano. I collegamenti bancari verranno revocati.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Continua',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Confermi l’eliminazione?',
              'Questa operazione non può essere annullata.',
              [
                { text: 'Annulla', style: 'cancel' },
                {
                  text: 'Elimina account',
                  style: 'destructive',
                  onPress: () => void performAccountDeletion(),
                },
              ],
            ),
        },
      ],
    );
  }

  return (
    <Screen
      transparentHeaderOnScroll
      onScroll={handleScroll}
      fixedHeader={
        <GlassNavBar
          title={displayName}
          centered
          titleVisible={nameInHeader}
          leading={
            <GlassIconButton
              accessibilityLabel="Torna indietro"
              icon="arrow_back"
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/dashboard' as Href);
              }}
            />
          }
        />
      }>
      <View style={styles.identity}>
        <View style={[styles.avatarRing, { borderColor: colors.surface }]}>
          <UserAvatar size={96} />
        </View>
        <Text
          ref={nameRef}
          accessibilityRole="header"
          numberOfLines={1}
          onLayout={measureName}
          style={[styles.name, { color: colors.text }]}>
          {displayName}
        </Text>
        {email ? (
          <Text style={[styles.email, { color: colors.textSecondary }]}>{email}</Text>
        ) : null}
        <View style={[styles.planChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.planIcon, { color: colors.accent }]}>workspace_premium</Text>
          <Text style={[styles.planLabel, { color: colors.text }]}>Piano {planLabel}</Text>
        </View>
        {planSource === 'shared' ? (
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            Incluso nel piano Max del tuo gruppo
          </Text>
        ) : null}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ASPETTO</Text>
      <Card style={styles.themeCard}>
        <View accessibilityRole="radiogroup" style={styles.themeControl}>
          {themeOptions.map((option) => {
            const selected = themePreference === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Tema ${option.label}`}
                onPress={() => void setThemePreference(option.id)}
                style={[
                  styles.themeOption,
                  selected && { backgroundColor: colors.sunken },
                ]}>
                <Text
                  style={[
                    styles.themeIcon,
                    { color: selected ? colors.accent : colors.textSecondary },
                  ]}>
                  {option.icon}
                </Text>
                <Text
                  style={[
                    styles.themeLabel,
                    { color: selected ? colors.text : colors.textSecondary },
                  ]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Text style={[styles.currentTheme, { color: colors.textSecondary }]}>
        {themePreference === 'system'
          ? 'Il tema cambierà insieme alle impostazioni di sistema.'
          : `Flownd resterà in modalità ${themePreference === 'dark' ? 'scura' : 'chiara'}.`}
      </Text>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PREFERENZE</Text>
      <Card style={styles.list}>
        <ProfileRow
          icon="account_balance_wallet"
          tint={rowTints.budget}
          label="Budget"
          caption="Allocazione, categorie e mese finanziario"
          onPress={() => router.push('/budget' as Href)}
        />
        <ProfileRow
          icon="group"
          tint={rowTints.groups}
          label="Gruppi"
          caption="Membri, permessi, split e budget condivisi"
          onPress={() => router.push('/family' as Href)}
        />
        <ProfileRow
          icon="notifications"
          tint={rowTints.notifications}
          label="Notifiche"
          caption="Avvisi di budget, ricorrenze e attività del gruppo"
          onPress={() => router.push('/notifications' as Href)}
        />
        <ProfileRow
          icon={amountsVisible ? 'visibility' : 'visibility_off'}
          tint={colors.accent}
          label="Importi visibili"
          caption={
            amountsVisible
              ? 'Gli importi sono mostrati nelle schermate principali'
              : 'Gli importi sensibili sono nascosti'
          }
          trailing={<SwitchVisual on={amountsVisible} />}
          accessibilityRole="switch"
          accessibilityState={{ checked: amountsVisible }}
          onPress={() => void toggleAmountsVisible()}
        />
        <ProfileRow
          icon={appLockEnabled ? 'lock' : 'lock_open'}
          tint={colors.positive}
          label="Blocca Flownd"
          caption={
            appLockEnabled
              ? 'Face ID, impronta o codice all’apertura e dopo 30 secondi in background'
              : 'Richiedi lo sblocco del dispositivo per aprire l’app'
          }
          trailing={<SwitchVisual on={appLockEnabled} />}
          accessibilityRole="switch"
          accessibilityState={{ checked: appLockEnabled, busy: appLockUpdating }}
          last
          onPress={() => void toggleAppLock()}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ACCOUNT</Text>
      <Pressable
        accessibilityRole="button"
        disabled={deleting}
        onPress={async () => {
          await signOutLocally();
          router.replace('/onboarding?transition=back' as Href);
        }}
        style={({ pressed }) => [
          styles.signOut,
          { backgroundColor: colors.negativeSoft },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.signOutIcon, { color: colors.negative }]}>logout</Text>
        <Text style={[styles.signOutText, { color: colors.negative }]}>Esci da Flownd</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Elimina definitivamente il tuo account e tutti i dati"
        accessibilityState={{ disabled: deleting, busy: deleting }}
        disabled={deleting}
        onPress={confirmAccountDeletion}
        style={({ pressed }) => [styles.deleteAccount, pressed && styles.pressed]}>
        {deleting ? (
          <ActivityIndicator color={colors.negative} />
        ) : (
          <Text style={[styles.deleteAccountText, { color: colors.textSecondary }]}>
            Elimina account
          </Text>
        )}
      </Pressable>
      <Text style={[styles.version, { color: colors.textSecondary }]}>
        Flownd {Constants.expoConfig?.version ?? ''}
      </Text>
    </Screen>
  );
}

function SwitchVisual({ on }: { on: boolean }) {
  const { colors } = useFlowndTheme();
  return (
    <View
      style={[styles.switchTrack, { backgroundColor: on ? colors.accent : colors.sunken }]}>
      <View
        style={[
          styles.switchThumb,
          { backgroundColor: colors.surface, transform: [{ translateX: on ? 18 : 0 }] },
        ]}
      />
    </View>
  );
}

function ProfileRow({
  icon,
  tint,
  label,
  caption,
  trailing,
  onPress,
  last = false,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  icon: string;
  tint: string;
  label: string;
  caption: string;
  trailing?: ReactNode;
  onPress: () => void;
  last?: boolean;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: { checked: boolean; busy?: boolean };
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.rowIcon, { backgroundColor: `${tint}22` }]}>
        <Text style={[styles.materialIcon, { color: tint }]}>{icon}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.caption, { color: colors.textSecondary }]}>{caption}</Text>
      </View>
      {trailing ?? (
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { alignItems: 'center', marginTop: 56, gap: 4 },
  avatarRing: { borderWidth: 4, borderRadius: 56, padding: 4, marginBottom: 10 },
  name: { fontFamily: font.displayBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.3, maxWidth: '100%' },
  email: { fontFamily: font.body, fontSize: 13 },
  planChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
  planIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 16 },
  planLabel: { fontFamily: font.bodySemiBold, fontSize: 12 },
  version: { fontFamily: font.body, fontSize: 11, textAlign: 'center', marginTop: 14 },
  caption: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  sectionLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1.1, marginTop: 24, marginBottom: 8 },
  themeCard: { padding: 5 },
  themeControl: { flexDirection: 'row' },
  themeOption: { flex: 1, minHeight: 68, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  themeIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22 },
  themeLabel: { fontFamily: font.bodySemiBold, fontSize: 11 },
  currentTheme: { fontFamily: font.body, fontSize: 11, lineHeight: 15, marginTop: 8, marginLeft: 4 },
  list: { paddingVertical: 4, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 70, gap: 12, paddingVertical: 10 },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: font.bodyMedium, fontSize: 14 },
  chevron: { fontFamily: font.body, fontSize: 24 },
  switchTrack: { width: 42, height: 24, borderRadius: 12, padding: 3 },
  switchThumb: { width: 18, height: 18, borderRadius: 9 },
  signOut: { minHeight: 54, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 19 },
  signOutText: { fontFamily: font.bodySemiBold, fontSize: 13 },
  deleteAccount: { minHeight: 48, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  deleteAccountText: { fontFamily: font.bodySemiBold, fontSize: 13, textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
});
