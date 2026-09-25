import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { PrimaryButton, SecondaryButton, font, useFlowndTheme } from '@/components/flownd-ui';
import { signOutLocally } from '@/lib/auth';
import { useApp } from '@/providers/app-provider';

// Mostrata quando l'utente è autenticato ma il profilo non si carica
// (offline, backend non raggiungibile). Evita di rimandarlo all'onboarding.
export function ProfileUnavailableScreen() {
  const { colors } = useFlowndTheme();
  const { error, retryProfile } = useApp();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <BrandLogo size={56} />
        <Text style={[styles.icon, { color: colors.textSecondary }]}>cloud_off</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Non riusciamo a caricare i tuoi dati
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {error ?? 'Controlla la connessione e riprova.'} I tuoi dati sono al sicuro.
        </Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton onPress={() => void retryProfile()}>Riprova</PrimaryButton>
        <SecondaryButton onPress={() => void signOutLocally()}>Esci</SecondaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 16 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  icon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 40, marginTop: 12 },
  title: { fontFamily: font.bodySemiBold, fontSize: 20, textAlign: 'center' },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  actions: { gap: 10 },
});
