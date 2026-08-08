import { Platform } from 'react-native';

export type OpenBankingBank = {
  name: string;
  country: string;
  logo: string | null;
  psuTypes: string[];
};

export type OpenBankingConnection = {
  id: string;
  aspsp_name: string;
  status: 'authorized' | 'expired' | 'revoked' | 'error';
  valid_until: string;
  last_synced_at: string | null;
  last_error: string | null;
  balance: number;
  currency: string;
};

type ApiErrorBody = { error?: string; code?: string };

function apiEndpoint(path: string) {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return `${configured}/api/eb/${path}`;
  if (Platform.OS === 'web') return `/api/eb/${path}`;
  throw new Error('Configura EXPO_PUBLIC_API_URL per collegare una banca.');
}

async function ebRequest<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
) {
  const response = await fetch(apiEndpoint(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body: (T & ApiErrorBody) | null = null;
  try {
    body = text ? (JSON.parse(text) as T & ApiErrorBody) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error || 'Open Banking non è disponibile.');
  }
  if (!body) throw new Error('Il backend Open Banking ha risposto in modo non valido.');
  return body;
}

export async function listItalianBanks(accessToken: string) {
  const data = await ebRequest<{ banks: OpenBankingBank[] }>(
    'banks?country=IT',
    accessToken,
  );
  return data.banks;
}

export async function beginBankAuthorization(
  accessToken: string,
  bank: OpenBankingBank,
  returnUrl: string,
) {
  return ebRequest<{ authorizationUrl: string }>('auth', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      bankName: bank.name,
      bankCountry: bank.country,
      returnUrl,
    }),
  });
}

export async function syncBankConnection(accessToken: string, connectionId: string) {
  return ebRequest<{
    accounts: number;
    imported: number;
    linked: number;
    pending: number;
    internalTransfers: number;
  }>('sync', accessToken, {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  });
}

export async function listBankConnections(accessToken: string) {
  const data = await ebRequest<{ connections: OpenBankingConnection[] }>(
    'connections',
    accessToken,
  );
  return data.connections;
}

export async function removeBankConnection(
  accessToken: string,
  connectionId: string,
) {
  return ebRequest<{ removed: boolean }>(
    `connections?id=${encodeURIComponent(connectionId)}`,
    accessToken,
    { method: 'DELETE' },
  );
}
