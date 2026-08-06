import * as Linking from 'expo-linking';
import { Redirect, router, type Href, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import {
  Card,
  Field,
  LoadingScreen,
  PrimaryButton,
  Screen,
  SecondaryButton,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';

export default function RegisterScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromOnboarding = from === 'onboarding';
  const { colors, isDark } = useFlowndTheme();
  const { session, loading, onboardingComplete } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <LoadingScreen label="Prepariamo la registrazione…" />;
  }
  if (session && onboardingComplete) {
    return <Redirect href={'/dashboard' as Href} />;
  }
  if (session && fromOnboarding) {
    return <Redirect href={'/onboarding?resume=1' as Href} />;
  }
  if (session) {
    return <Redirect href={'/onboarding' as Href} />;
  }

  const loginHref = (
    fromOnboarding ? '/login?from=onboarding' : '/login'
  ) as Href;

  function goBackToLogin() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(loginHref);
  }

  async function register() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Inserisci un indirizzo email valido.');
      return;
    }
    if (password.length < 6) {
      setError('La password deve contenere almeno 6 caratteri.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Le password non coincidono.');
      return;
    }

    setSaving(true);
    setError(null);
    const { data, error: signupError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: Linking.createURL('auth/callback', {
          queryParams: fromOnboarding ? { from: 'onboarding' } : undefined,
        }),
      },
    });
    setSaving(false);

    if (signupError) {
      setError('Non siamo riusciti a creare l’account. Verifica i dati e riprova.');
      return;
    }
    if (!data.session) {
      setConfirmationSent(true);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Torna al login"
          onPress={goBackToLogin}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.backIcon, { color: colors.accent }]}>‹</Text>
          <Text style={[styles.backText, { color: colors.accent }]}>
            Torna al login
          </Text>
        </Pressable>

        <View style={styles.brand}>
          <BrandLogo size={46} />
          <BrandLogo variant="wordmark" size={118} />
        </View>

        {confirmationSent ? (
          <>
            <View
              style={[
                styles.successIcon,
                { backgroundColor: colors.positiveSoft },
              ]}>
              <Text style={[styles.materialSymbol, { color: colors.positive }]}>
                mark_email_read
              </Text>
            </View>
            <Text
              style={[
                uiStyles.title,
                styles.centeredText,
                { color: colors.text },
              ]}>
              Controlla la tua email.
            </Text>
            <Text
              style={[
                uiStyles.subtitle,
                styles.centeredText,
                { color: colors.textSecondary },
              ]}>
              Ti abbiamo inviato il link per confermare l’account a{'\n'}
              <Text style={[styles.strong, { color: colors.text }]}>{email}</Text>
            </Text>
            <PrimaryButton onPress={goBackToLogin}>
              Torna al login
            </PrimaryButton>
          </>
        ) : (
          <>
            <Text style={[uiStyles.title, styles.centeredText, { color: colors.text }]}>
              Crea il tuo account.
            </Text>
            <Text
              style={[
                uiStyles.subtitle,
                styles.centeredText,
                { color: colors.textSecondary },
              ]}>
              Salva il tuo percorso e ritrovalo su ogni dispositivo.
            </Text>

            <Card style={styles.formCard}>
              <Field
                label="Email"
                placeholder="tu@esempio.it"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />
              <Field
                label="Password"
                placeholder="Almeno 6 caratteri"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              <Field
                label="Conferma password"
                placeholder="Ripeti la password"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={passwordConfirmation}
                onChangeText={setPasswordConfirmation}
              />
              {error ? (
                <Text style={[uiStyles.error, { color: colors.negative }]}>
                  {error}
                </Text>
              ) : null}
              <PrimaryButton onPress={register} loading={saving}>
                Crea il mio account
              </PrimaryButton>
            </Card>

            <Text style={[styles.legal, { color: colors.textSecondary }]}>
              Continuando accetti i Termini di servizio e l’Informativa privacy
              di Flownd.
            </Text>
            <SecondaryButton onPress={goBackToLogin}>
              Ho già un account
            </SecondaryButton>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
  },
  backIcon: { fontFamily: font.bodyMedium, fontSize: 28, lineHeight: 28 },
  backText: { fontFamily: font.bodySemiBold, fontSize: 13 },
  brand: { alignItems: 'center', gap: 7, marginBottom: 30 },
  centeredText: { textAlign: 'center' },
  formCard: { marginTop: 24, paddingTop: 2 },
  legal: {
    fontFamily: font.body,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
  },
  successIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  materialSymbol: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 32,
    lineHeight: 36,
  },
  strong: { fontFamily: font.bodySemiBold },
  pressed: { opacity: 0.7 },
});
