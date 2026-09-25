import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Client unico per le Serverless Functions Flownd: risolve l'URL, applica un
// timeout, rinnova il token una volta su 401 e normalizza gli errori.

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiRequestError extends Error {
  status: number | null;
  code: string | null;
  path: string;

  constructor(message: string, path: string, status: number | null, code: string | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.path = path;
    this.status = status;
    this.code = code;
  }
}

export function apiUrl(path: string) {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return `${configured}${path}`;
  if (Platform.OS === 'web') return path;
  if (__DEV__) {
    // In sviluppo il backend locale (`npm run dev:api`) gira sulla porta 3000
    // della stessa macchina che serve Metro.
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host) return `http://${host}:3000${path}`;
  }
  return null;
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string>;
  timeoutMs?: number;
  // Messaggio mostrato quando il backend non restituisce un errore leggibile.
  fallbackError?: string;
  // Messaggio mostrato se l'URL dell'API non è configurato.
  missingConfigError?: string;
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T>(
  path: string,
  accessToken: string | null | undefined,
  options: ApiRequestOptions = {},
): Promise<T> {
  const fallbackError = options.fallbackError ?? 'Il servizio non è disponibile. Riprova tra poco.';
  const base = apiUrl(path);
  if (!base) {
    throw new ApiRequestError(
      options.missingConfigError ?? 'Configura EXPO_PUBLIC_API_URL per collegare il backend.',
      path,
      null,
      'API_URL_MISSING',
    );
  }
  const url = options.query
    ? `${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams(options.query).toString()}`
    : base;
  const hasBody = options.body !== undefined;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const send = (token: string | null | undefined) =>
    fetchWithTimeout(
      url,
      {
        method: options.method ?? (hasBody ? 'POST' : 'GET'),
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body: hasBody ? JSON.stringify(options.body) : undefined,
      },
      timeoutMs,
    );

  let response: Response;
  try {
    let token = accessToken;
    if (!token) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    }
    response = await send(token);
    if (response.status === 401) {
      const { data, error } = await supabase.auth.refreshSession();
      const refreshed = data.session?.access_token;
      if (!error && refreshed) response = await send(refreshed);
    }
  } catch (reason) {
    const aborted = reason instanceof Error && reason.name === 'AbortError';
    throw new ApiRequestError(
      aborted
        ? 'La richiesta sta impiegando troppo tempo. Controlla la connessione e riprova.'
        : 'Connessione non disponibile. Controlla la rete e riprova.',
      path,
      null,
      aborted ? 'TIMEOUT' : 'NETWORK',
    );
  }

  const text = await response.text();
  let data: (T & { error?: string; code?: string }) | null = null;
  try {
    data = text ? (JSON.parse(text) as T & { error?: string; code?: string }) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiRequestError(
      data?.error || fallbackError,
      path,
      response.status,
      data?.code ?? null,
    );
  }
  if (data == null) {
    throw new ApiRequestError(fallbackError, path, response.status, 'INVALID_RESPONSE');
  }
  return data;
}
