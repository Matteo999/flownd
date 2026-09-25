import { useNetworkState } from 'expo-network';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, useFlowndTheme } from '@/components/flownd-ui';
import { useAppState } from '@/providers/app-provider';

// Avviso non bloccante quando il dispositivo è offline. Al ritorno della
// connessione ricarica i dati, perché il realtime potrebbe aver perso eventi.
export function OfflineBanner() {
  const { colors } = useFlowndTheme();
  const insets = useSafeAreaInsets();
  const { isConnected, isInternetReachable } = useNetworkState();
  const { refreshData } = useAppState('refreshData');
  const offline = isConnected === false || isInternetReachable === false;
  const wasOffline = useRef(false);

  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      void refreshData();
    }
  }, [offline, refreshData]);

  if (!offline) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.container, { top: insets.top + 6 }]}>
      <View style={[styles.pill, { backgroundColor: colors.text }]}>
        <Text style={[styles.icon, { color: colors.background }]}>cloud_off</Text>
        <Text style={[styles.text, { color: colors.background }]}>
          Sei offline: i dati potrebbero non essere aggiornati
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  icon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 16 },
  text: { fontFamily: font.bodySemiBold, fontSize: 13 },
});
