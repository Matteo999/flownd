import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureSessionStorage } from '@/lib/secure-session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Configura EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY in .env.local');
}

const serverStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => undefined,
  removeItem: async (_key: string) => undefined,
};

const authStorage =
  Platform.OS === 'web'
    ? typeof window === 'undefined' ? serverStorage : AsyncStorage
    : secureSessionStorage;

export const supabase = createClient(
  supabaseUrl ?? 'https://flownd-config-missing.invalid',
  supabaseKey ?? 'flownd-config-missing',
  {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  },
);

// Su mobile il timer di refresh va sospeso in background e riattivato quando
// l'app torna in primo piano, altrimenti il token può arrivare scaduto alle API.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
