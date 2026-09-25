import { router, type Href } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BackButton,
  Card,
  PageHeader,
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

export default function ProfileScreen() {
  const {
    colors,
    themePreference,
    setThemePreference,
  } = useFlowndTheme();
  const {
    session,
    planTier,
    amountsVisible,
    toggleAmountsVisible,
  } = useAppState(
    'session',
    'planTier',
    'amountsVisible',
    'toggleAmountsVisible',
  );
  const [deleting, setDeleting] = useState(false);
  const appLockEnabled = useAppLockEnabled();
  const [appLockUpdating, setAppLockUpdating] = useState(false);

  useEffect(() => {
    void hydrateAppLockPreference();
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
      'Cancelleremo in modo definitivo transazioni, budget, obiettivi, conversazioni con il Coach e i gruppi di cui sei proprietario. I collegamenti bancari verranno revocati.',
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
    <Screen>
      <PageHeader
        title="Profilo"
        leading={
          <BackButton />
        }
      />

      <Card style={styles.identity}>
        <UserAvatar size={48} />
        <View style={styles.flex}>
          <Text style={[styles.email, { color: colors.text }]}>
            {session?.user.email ?? 'Account Flownd'}
          </Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            Piano {planTier === 'free' ? 'Free' : planTier === 'pro' ? 'Pro' : 'Max'}
          </Text>
        </View>
        <View style={[styles.verified, { backgroundColor: colors.positiveSoft }]}>
          <Text style={[styles.materialIcon, { color: colors.positive }]}>verified</Text>
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ASPETTO</Text>
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Tema dell’app</Text>
        <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
          Scegli un aspetto fisso oppure segui automaticamente il dispositivo.
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={[styles.themeControl, { backgroundColor: colors.sunken }]}>
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
                  selected && {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
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
        <Text style={[styles.currentTheme, { color: colors.textSecondary }]}>
          {themePreference === 'system'
            ? 'Il tema cambierà insieme alle impostazioni di sistema.'
            : `Flownd resterà in modalità ${themePreference === 'dark' ? 'scura' : 'chiara'}.`}
        </Text>
      </Card>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PREFERENZE</Text>
      <View style={styles.list}>
        <ProfileRow
          icon="account_balance_wallet"
          label="Budget"
          caption="Allocazione, categorie e mese finanziario"
          onPress={() => router.push('/budget' as Href)}
        />
        <ProfileRow
          icon="group"
          label="Gruppi"
          caption="Membri, permessi, split e budget condivisi"
          onPress={() => router.push('/family' as Href)}
        />
        <ProfileRow
          icon={amountsVisible ? 'visibility' : 'visibility_off'}
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
          label="Blocca Flownd"
          caption={
            appLockEnabled
              ? 'Face ID, impronta o codice all’apertura e dopo 30 secondi in background'
              : 'Richiedi lo sblocco del dispositivo per aprire l’app'
          }
          trailing={<SwitchVisual on={appLockEnabled} />}
          accessibilityRole="switch"
          accessibilityState={{ checked: appLockEnabled, busy: appLockUpdating }}
          onPress={() => void toggleAppLock()}
        />
      </View>

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
  label,
  caption,
  trailing,
  onPress,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  icon: string;
  label: string;
  caption: string;
  trailing?: ReactNode;
  onPress: () => void;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: { checked: boolean; busy?: boolean };
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.row}>
        <View style={[styles.rowIcon, { backgroundColor: colors.sunken }]}>
          <Text style={[styles.materialIcon, { color: colors.textSecondary }]}>
            {icon}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            {caption}
          </Text>
        </View>
        {trailing ?? (
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  email: { fontFamily: font.bodySemiBold, fontSize: 14 },
  caption: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  verified: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  sectionLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1.1, marginTop: 24, marginBottom: 8 },
  cardTitle: { fontFamily: font.bodySemiBold, fontSize: 15 },
  cardCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 3 },
  themeControl: { flexDirection: 'row', borderRadius: 12, padding: 3, marginTop: 15 },
  themeOption: { flex: 1, minHeight: 68, borderRadius: 9, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4 },
  themeIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22 },
  themeLabel: { fontFamily: font.bodySemiBold, fontSize: 11 },
  currentTheme: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 10 },
  list: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 70, gap: 11 },
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
