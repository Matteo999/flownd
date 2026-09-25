import * as Linking from 'expo-linking';
import { apiRequest } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// Flusso PKCE: i link di ritorno contengono solo un `code` monouso, che vale
// esclusivamente insieme al code verifier salvato su questo dispositivo.
// I token in chiaro nei deep link non vengono mai accettati.
export async function exchangeAuthCode(code: string) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return;
  // Su Android lo stesso redirect può arrivare sia a openAuthSessionAsync sia
  // alla route auth/callback: il secondo scambio fallisce ma la sessione c'è.
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw error;
}

export function authCodeFromUrl(url: string) {
  const { queryParams } = Linking.parse(url);
  return typeof queryParams?.code === 'string' ? queryParams.code : null;
}

export async function completeAuthFromUrl(url: string) {
  const code = authCodeFromUrl(url);
  if (!code) throw new Error('Codice di autenticazione mancante');
  await exchangeAuthCode(code);
}

// Minimo per le nuove password (registrazione e reset). Il login non applica
// questo limite per non bloccare account creati con la regola precedente.
export const MIN_PASSWORD_LENGTH = 8;

// Elimina definitivamente l'account: il backend revoca i consensi bancari e
// cancella l'utente da Supabase Auth (i dati applicativi seguono in cascata).
export async function deleteAccount() {
  await apiRequest<{ deleted: boolean }>(
    '/api/transaction-tools?action=account-delete',
    null,
    {
      body: { confirm: true },
      timeoutMs: 45_000,
      fallbackError: 'Non siamo riusciti a eliminare l’account. Riprova tra poco.',
      missingConfigError: 'Configura EXPO_PUBLIC_API_URL per eliminare l’account.',
    },
  );
  await signOutLocally();
}

// Chiude la sessione anche offline: se la revoca remota fallisce, rimuove
// comunque la sessione salvata sul dispositivo.
export async function signOutLocally() {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
}
