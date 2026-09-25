import { Redirect, router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import {
  Card,
  Field,
  LoadingScreen,
  PrimaryButton,
  Screen,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';

export default function ResetPasswordScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { session, loading } = useApp();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <LoadingScreen label="Verifichiamo il link…" />;
  if (!session) return <Redirect href={'/login' as Href} />;

  async function savePassword() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La password deve contenere almeno ${MIN_PASSWORD_LENGTH} caratteri.`);
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Le password non coincidono.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(
        updateError.code === 'same_password'
          ? 'Scegli una password diversa da quella attuale.'
          : 'Non siamo riusciti a salvare la nuova password. Riprova.',
      );
      return;
    }
    router.replace('/' as Href);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen>
        <View style={styles.brand}>
          <BrandLogo size={46} />
          <BrandLogo variant="wordmark" size={118} />
        </View>
        <Text style={[uiStyles.title, styles.centeredText, { color: colors.text }]}>
          Scegli una nuova password.
        </Text>
        <Text style={[uiStyles.subtitle, styles.centeredText, { color: colors.textSecondary }]}>
          Userai questa password per accedere a Flownd da ora in poi.
        </Text>
        <Card style={styles.formCard}>
          <Field
            label="Nuova password"
            placeholder={`Almeno ${MIN_PASSWORD_LENGTH} caratteri`}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
          />
          <Field
            label="Conferma password"
            placeholder="Ripeti la password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            value={passwordConfirmation}
            onChangeText={setPasswordConfirmation}
          />
          {error ? (
            <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text>
          ) : null}
          <PrimaryButton onPress={savePassword} loading={saving}>
            Salva password
          </PrimaryButton>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  brand: { alignItems: 'center', gap: 7, marginTop: 24, marginBottom: 30 },
  centeredText: { textAlign: 'center' },
  formCard: { marginTop: 24, paddingTop: 2 },
});
