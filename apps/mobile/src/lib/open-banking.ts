import { apiRequest } from '@/lib/api';

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

export type OpenBankingResource = {
  id: string;
  name: string;
  product: string | null;
  accountType: string | null;
  ibanLast4: string | null;
  balance: number;
  previousMonthBalance: number | null;
  currency: string;
  lastSyncedAt: string | null;
  importedTransactions: number;
  pendingTransactions: number;
};

export type OpenBankingConnectionDetail = OpenBankingConnection & {
  resources: OpenBankingResource[];
  importedTransactions: number;
  pendingTransactions: number;
};

async function ebRequest<T>(
  path: string,
  accessToken: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
) {
  return apiRequest<T>(`/api/eb/${path}`, accessToken, {
    ...options,
    fallbackError: 'Open Banking non è disponibile.',
    missingConfigError: 'Configura EXPO_PUBLIC_API_URL per collegare una banca.',
  });
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
    body: {
      bankName: bank.name,
      bankCountry: bank.country,
      returnUrl,
    },
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
    body: { connectionId },
    // La sincronizzazione scarica saldi e movimenti da tutti i conti collegati.
    timeoutMs: 120_000,
  });
}

export async function listBankConnections(accessToken: string) {
  const data = await ebRequest<{ connections: OpenBankingConnection[] }>(
    'connections',
    accessToken,
  );
  return data.connections;
}

export async function getBankConnection(
  accessToken: string,
  connectionId: string,
) {
  return ebRequest<OpenBankingConnectionDetail>(
    `connections?id=${encodeURIComponent(connectionId)}`,
    accessToken,
  );
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
