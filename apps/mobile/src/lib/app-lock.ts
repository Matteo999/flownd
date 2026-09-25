import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSyncExternalStore } from 'react';

// Preferenza "Blocca Flownd" (Face ID / impronta / codice del dispositivo).
// È una scelta del dispositivo, non dell'account: resta locale.

const STORAGE_KEY = 'flownd:app-lock-enabled';
// Dopo quanto tempo in background serve di nuovo lo sblocco.
export const APP_LOCK_GRACE_MS = 30_000;

let enabled = false;
let hydrated = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  enabled = next;
  listeners.forEach((listener) => listener());
}

export async function hydrateAppLockPreference() {
  if (hydrated) return enabled;
  try {
    publish((await AsyncStorage.getItem(STORAGE_KEY)) === 'true');
  } catch {
    publish(false);
  }
  hydrated = true;
  return enabled;
}

export function useAppLockEnabled() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => enabled,
  );
}

export async function biometricAvailability() {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return { available: hasHardware && isEnrolled, hasHardware };
}

export async function authenticateUser(promptMessage = 'Sblocca Flownd') {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Annulla',
    fallbackLabel: 'Usa codice',
  });
  return result.success;
}

// Attivare richiede una verifica immediata, così l'utente sa che funziona.
export async function setAppLockEnabled(next: boolean) {
  if (next) {
    const { available } = await biometricAvailability();
    if (!available) {
      throw new Error('Configura Face ID, impronta o un codice sul dispositivo per usare il blocco.');
    }
    if (!(await authenticateUser('Conferma per attivare il blocco'))) return false;
  }
  await AsyncStorage.setItem(STORAGE_KEY, String(next));
  publish(next);
  return true;
}

export async function clearAppLockPreference() {
  await AsyncStorage.removeItem(STORAGE_KEY);
  publish(false);
}
