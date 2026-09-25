import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { PrimaryButton, SecondaryButton, font, useFlowndTheme } from '@/components/flownd-ui';
import {
  APP_LOCK_GRACE_MS,
  authenticateUser,
  hydrateAppLockPreference,
  useAppLockEnabled,
} from '@/lib/app-lock';
import { signOutLocally } from '@/lib/auth';
import { useAppState } from '@/providers/app-provider';

// Copre i contenuti quando l'app non è attiva (anteprima nello switcher) e,
// se il blocco è attivo, richiede lo sblocco all'avvio e dopo 30 s in background.
export function AppLockGate() {
  const { colors } = useFlowndTheme();
  const { session } = useAppState('session');
  const lockEnabled = useAppLockEnabled();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const initialCheckDone = useRef(false);
  // Il prompt automatico parte una sola volta per blocco: il prompt stesso fa
  // passare l'app da inactive ad active e dopo un annullamento andrebbe in loop.
  const autoPrompted = useRef(false);
  const hasSession = Boolean(session);

  // Senza sessione non c'è nulla da proteggere (logout dalla schermata di blocco).
  const isLocked = locked && hasSession;

  const lock = useCallback(() => {
    autoPrompted.current = false;
    setLocked(true);
  }, []);

  const unlock = useCallback(async () => {
    setAuthenticating(true);
    try {
      if (await authenticateUser()) setLocked(false);
    } finally {
      setAuthenticating(false);
    }
  }, []);

  // Blocco all'avvio a freddo, una volta nota la sessione.
  useEffect(() => {
    if (!hasSession) {
      initialCheckDone.current = false;
      return;
    }
    if (initialCheckDone.current) return;
    initialCheckDone.current = true;
    void hydrateAppLockPreference().then((enabled) => {
      if (enabled) lock();
    });
  }, [hasSession, lock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state === 'background') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state === 'active' && backgroundedAt.current != null) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (lockEnabled && hasSession && elapsed >= APP_LOCK_GRACE_MS) lock();
      }
    });
    return () => subscription.remove();
  }, [hasSession, lock, lockEnabled]);

  // Chiede subito lo sblocco quando l'app è in primo piano e bloccata.
  useEffect(() => {
    if (!isLocked || !appActive || autoPrompted.current) return;
    autoPrompted.current = true;
    void unlock();
  }, [appActive, isLocked, unlock]);

  const coverForPrivacy = hasSession && !appActive;
  if (!isLocked && !coverForPrivacy) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <BrandLogo size={64} />
          {isLocked ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>Flownd è bloccato</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Sblocca per vedere i tuoi dati finanziari.
              </Text>
            </>
          ) : null}
        </View>
        {isLocked ? (
          <View style={styles.actions}>
            <PrimaryButton onPress={() => void unlock()} loading={authenticating}>
              Sblocca
            </PrimaryButton>
            <SecondaryButton onPress={() => void signOutLocally()}>Esci dall’account</SecondaryButton>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 2000 },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 16 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontFamily: font.bodySemiBold, fontSize: 20, marginTop: 12 },
  body: { fontFamily: font.body, fontSize: 15, textAlign: 'center' },
  actions: { gap: 10 },
});
