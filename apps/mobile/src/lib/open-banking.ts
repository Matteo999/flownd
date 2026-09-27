import { queryOptions } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

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
  // Se assente, apiRequest usa il token della sessione corrente.
  accessToken: string | null | undefined,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
) {
  return apiRequest<T>(`/api/eb/${path}`, accessToken, {
    ...options,
    fallbackError: 'Open Banking non è disponibile.',
    missingConfigError: 'Configura EXPO_PUBLIC_API_URL per collegare una banca.',
  });
}

export async function listItalianBanks(accessToken?: string | null) {
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

export async function listBankConnections(accessToken?: string | null) {
  const data = await ebRequest<{ connections: OpenBankingConnection[] }>(
    'connections',
    accessToken,
  );
  return data.connections;
}

export async function getBankConnection(
  accessToken: string | null | undefined,
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

export function bankConnectionsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.bankConnections(userId),
    queryFn: () => listBankConnections(),
  });
}

export function bankConnectionQuery(connectionId: string) {
  return queryOptions({
    queryKey: queryKeys.bankConnection(connectionId),
    queryFn: () => getBankConnection(null, connectionId),
  });
}

// L'elenco delle banche cambia raramente: resta valido per un'ora.
export function italianBanksQuery() {
  return queryOptions({
    queryKey: queryKeys.italianBanks(),
    queryFn: () => listItalianBanks(),
    staleTime: 60 * 60_000,
  });
}
