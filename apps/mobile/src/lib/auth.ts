import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

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

function apiUrl(path: string) {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return `${configured}${path}`;
  return Platform.OS === 'web' ? path : null;
}

// Elimina definitivamente l'account: il backend revoca i consensi bancari e
// cancella l'utente da Supabase Auth (i dati applicativi seguono in cascata).
export async function deleteAccount() {
  const url = apiUrl('/api/transaction-tools?action=account-delete');
  if (!url) throw new Error('Configura EXPO_PUBLIC_API_URL per eliminare l’account.');
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('La sessione è scaduta. Accedi di nuovo.');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ confirm: true }),
  });
  if (!response.ok) {
    let message = 'Non siamo riusciti a eliminare l’account. Riprova tra poco.';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Risposta non JSON: resta il messaggio generico.
    }
    throw new Error(message);
  }
  await signOutLocally();
}

// Chiude la sessione anche offline: se la revoca remota fallisce, rimuove
// comunque la sessione salvata sul dispositivo.
export async function signOutLocally() {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
}
