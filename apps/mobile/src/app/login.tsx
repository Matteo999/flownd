import * as Linking from 'expo-linking';
import { Redirect, router, type Href, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthSocialButton } from '@/components/auth-social-button';
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

WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple' | 'facebook';
type LoginLoading = Provider | 'email' | null;

export default function LoginScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromOnboarding = from === 'onboarding';
  const { colors, isDark } = useFlowndTheme();
  const { session, loading, onboardingComplete } = useApp();
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState<LoginLoading>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <LoadingScreen label="Verifichiamo il tuo account…" />;
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

  async function processAuthUrl(url: string) {
    const parsed = Linking.parse(url);
    const code =
      typeof parsed.queryParams?.code === 'string'
        ? parsed.queryParams.code
        : null;
    if (code) {
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      return;
    }

    const hash = url.includes('#') ? url.split('#')[1] : '';
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
    }
  }

  async function signInSocial(provider: Provider) {
    setAuthLoading(provider);
    setError(null);
    const redirectTo = Linking.createURL('auth/callback', {
      queryParams: fromOnboarding ? { from: 'onboarding' } : undefined,
    });
    try {
      const { data, error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo, skipBrowserRedirect: true },
        });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error('URL OAuth non disponibile');
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );
      if (result.type === 'success') await processAuthUrl(result.url);
    } catch {
      setError(
        `Accesso con ${provider === 'facebook' ? 'Facebook' : provider === 'google' ? 'Google' : 'Apple'} non riuscito. Controlla la configurazione e riprova.`,
      );
    } finally {
      setAuthLoading(null);
    }
  }

  async function signInWithEmail() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Inserisci un indirizzo email valido.');
      return;
    }
    if (password.length < 6) {
      setError('La password deve contenere almeno 6 caratteri.');
      return;
    }

    setAuthLoading('email');
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setAuthLoading(null);
    if (signInError) {
      setError('Email o password non corrette.');
    }
  }

  const registerHref = (
    fromOnboarding ? '/register?from=onboarding' : '/register'
  ) as Href;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/onboarding' as Href);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
          onPress={goBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.backIcon, { color: colors.accent }]}>‹</Text>
          <Text style={[styles.backText, { color: colors.accent }]}>Indietro</Text>
        </Pressable>

        <View style={styles.brand}>
          <BrandLogo size={46} />
          <BrandLogo variant="wordmark" size={118} />
        </View>
        <Text style={[uiStyles.title, styles.title, { color: colors.text }]}>
          Bentornato.
        </Text>
        <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
          Accedi per ritrovare budget, obiettivi e progressi.
        </Text>

        <View style={styles.methods}>
          <AuthSocialButton
            method="email"
            label="Accedi con la mail"
            disabled={authLoading !== null}
            loading={authLoading === 'email'}
            onPress={() => {
              setEmailExpanded((current) => !current);
              setError(null);
            }}
          />
          {emailExpanded ? (
            <Card style={styles.emailCard}>
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
                placeholder="La tua password"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              <PrimaryButton
                onPress={signInWithEmail}
                loading={authLoading === 'email'}>
                Accedi
              </PrimaryButton>
            </Card>
          ) : null}

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>
              oppure continua con
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
          <AuthSocialButton
            method="google"
            label="Continua con Google"
            disabled={authLoading !== null}
            loading={authLoading === 'google'}
            onPress={() => signInSocial('google')}
          />
          <AuthSocialButton
            method="apple"
            label="Continua con Apple"
            disabled={authLoading !== null}
            loading={authLoading === 'apple'}
            onPress={() => signInSocial('apple')}
          />
          <AuthSocialButton
            method="facebook"
            label="Continua con Facebook"
            disabled={authLoading !== null}
            loading={authLoading === 'facebook'}
            onPress={() => signInSocial('facebook')}
          />
        </View>

        {error ? (
          <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text>
        ) : null}

        <View style={[styles.registerBox, { borderColor: colors.border }]}>
          <Text style={[styles.registerTitle, { color: colors.text }]}>
            Non hai ancora un account?
          </Text>
          <Text style={[styles.registerCopy, { color: colors.textSecondary }]}>
            Crea il tuo profilo Flownd in pochi passaggi.
          </Text>
          <SecondaryButton onPress={() => router.push(registerHref)}>
            Registrati
          </SecondaryButton>
        </View>
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
  title: { textAlign: 'center' },
  methods: { gap: 9, marginTop: 24 },
  emailCard: { paddingTop: 2 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 12,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontFamily: font.body, fontSize: 12 },
  registerBox: {
    marginTop: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 22,
    alignItems: 'center',
  },
  registerTitle: { fontFamily: font.bodySemiBold, fontSize: 15 },
  registerCopy: {
    fontFamily: font.body,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  pressed: { opacity: 0.7 },
});
