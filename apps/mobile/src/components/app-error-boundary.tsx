import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkColors, lightColors } from '@/constants/flownd-theme';
import { supabase } from '@/lib/supabase';
import { reportClientError } from '@/lib/transaction-import';

// Schermata di fallback per gli errori di render. Non dipende dai provider
// dell'app (tema, dati), che potrebbero essere proprio la causa dell'errore.
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => reportClientError(data.session?.access_token, 'render_crash', error))
      .catch(() => undefined);
  }, [error]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Qualcosa non ha funzionato
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Abbiamo inviato un resoconto agli sviluppatori. I tuoi dati non sono stati modificati.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.buttonText, { color: colors.onAccent }]}>Riprova</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 16 },
  content: { flex: 1, justifyContent: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
