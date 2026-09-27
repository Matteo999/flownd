import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { ApiRequestError } from '@/lib/api';

// Cache condivisa per i dati letti dalle schermate (gruppi, banche, ecc.).
// I dati principali restano per ora nell'AppProvider: la migrazione procede
// una schermata alla volta.

function shouldRetry(failureCount: number, error: unknown) {
  // Gli errori 4xx (permessi, validazione, piano) non migliorano ritentando.
  if (
    error instanceof ApiRequestError
    && error.status != null
    && error.status >= 400
    && error.status < 500
    && error.status !== 408
    && error.status !== 429
  ) {
    return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
    },
    mutations: {
      retry: 0,
    },
  },
});

if (Platform.OS !== 'web') {
  // "Focus" su mobile = app in primo piano: le query scadute si ricaricano.
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active');
    });
    return () => subscription.remove();
  });

  // Offline: le query si mettono in pausa e ripartono al ritorno della rete.
  onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return () => subscription.remove();
  });
}

export const queryKeys = {
  familyGroups: (userId: string) => ['family-groups', userId] as const,
  familyGroupDetail: (groupId: string, userId: string) =>
    ['family-group-detail', groupId, userId] as const,
  familyDashboardSummary: (groupId: string) => ['family-dashboard-summary', groupId] as const,
  bankConnections: (userId: string) => ['bank-connections', userId] as const,
  bankConnection: (connectionId: string) => ['bank-connection', connectionId] as const,
  italianBanks: () => ['banks', 'IT'] as const,
};
