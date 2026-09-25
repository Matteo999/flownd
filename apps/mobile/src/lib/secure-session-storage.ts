import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Storage cifrato per la sessione Supabase ("LargeSecureStore").
// SecureStore (Keychain/Keystore) ha un limite di dimensione, quindi contiene
// solo una chiave AES-256 per voce; la sessione cifrata con AES-GCM resta in
// AsyncStorage. Le sessioni salvate in chiaro dalle versioni precedenti
// vengono lette una volta e riscritte cifrate.

const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function secureKeyName(storageKey: string) {
  return `flownd.session-key.${storageKey.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

function utf8Encode(value: string) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);
  const binary = unescape(encodeURIComponent(value));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function utf8Decode(bytes: Uint8Array) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return decodeURIComponent(escape(binary));
}

// Una sola promessa per voce: evita che letture/scritture concorrenti generino
// due chiavi diverse per la stessa sessione.
const keyCache = new Map<string, Promise<AESEncryptionKey | null>>();

function readKey(storageKey: string) {
  let cached = keyCache.get(storageKey);
  if (!cached) {
    cached = SecureStore.getItemAsync(secureKeyName(storageKey), KEY_OPTIONS)
      .then((encoded) => (encoded ? AESEncryptionKey.import(encoded, 'base64') : null));
    cached.catch(() => keyCache.delete(storageKey));
    keyCache.set(storageKey, cached);
  }
  return cached;
}

function readOrCreateKey(storageKey: string) {
  const next = readKey(storageKey).then(async (existing) => {
    if (existing) return existing;
    const key = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(
      secureKeyName(storageKey),
      await key.encoded('base64'),
      KEY_OPTIONS,
    );
    return key;
  });
  next.catch(() => keyCache.delete(storageKey));
  keyCache.set(storageKey, next);
  return next as Promise<AESEncryptionKey>;
}

async function encrypt(storageKey: string, value: string) {
  const key = await readOrCreateKey(storageKey);
  const sealed = await aesEncryptAsync(utf8Encode(value), key);
  return `${ENCRYPTED_PREFIX}${await sealed.combined('base64')}`;
}

async function removeEverywhere(storageKey: string) {
  keyCache.delete(storageKey);
  await AsyncStorage.removeItem(storageKey);
  await SecureStore.deleteItemAsync(secureKeyName(storageKey), KEY_OPTIONS);
}

export const secureSessionStorage = {
  async getItem(storageKey: string) {
    const stored = await AsyncStorage.getItem(storageKey);
    if (stored == null) return null;

    if (!stored.startsWith(ENCRYPTED_PREFIX)) {
      // Sessione in chiaro di una versione precedente: la migriamo subito.
      try {
        await AsyncStorage.setItem(storageKey, await encrypt(storageKey, stored));
      } catch {
        // Se la cifratura non è disponibile la sessione resta utilizzabile;
        // verrà riscritta cifrata al prossimo refresh del token.
      }
      return stored;
    }

    try {
      const key = await readKey(storageKey);
      if (!key) throw new Error('Session key missing');
      const sealed = AESSealedData.fromCombined(stored.slice(ENCRYPTED_PREFIX.length));
      return utf8Decode(await aesDecryptAsync(sealed, key));
    } catch {
      // Chiave assente (es. backup ripristinato su un altro dispositivo) o
      // dato corrotto: la sessione non è recuperabile, serve un nuovo accesso.
      await removeEverywhere(storageKey);
      return null;
    }
  },

  async setItem(storageKey: string, value: string) {
    await AsyncStorage.setItem(storageKey, await encrypt(storageKey, value));
  },

  async removeItem(storageKey: string) {
    await removeEverywhere(storageKey);
  },
};
