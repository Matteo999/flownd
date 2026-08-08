import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  Field,
  PrimaryButton,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import {
  beginBankAuthorization,
  listItalianBanks,
  type OpenBankingBank,
  syncBankConnection,
} from '@/lib/open-banking';
import { useApp } from '@/providers/app-provider';

export default function ConnectBankScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { session, planTier, refreshData } = useApp();
  const [banks, setBanks] = useState<OpenBankingBank[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OpenBankingBank | null>(null);
  const [loading, setLoading] = useState(planTier !== 'free');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token || planTier === 'free') {
      return;
    }
    let active = true;
    listItalianBanks(session.access_token)
      .then((items) => {
        if (active) setBanks(items);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Banche non disponibili.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [planTier, session?.access_token]);

  const visibleBanks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('it');
    return (needle
      ? banks.filter((bank) => bank.name.toLocaleLowerCase('it').includes(needle))
      : banks
    ).slice(0, 24);
  }, [banks, query]);

  async function connect() {
    if (!selected || !session?.access_token) return;
    setConnecting(true);
    setError(null);
    try {
      const returnUrl = Linking.createURL('open-banking');
      const authorization = await beginBankAuthorization(
        session.access_token,
        selected,
        returnUrl,
      );
      const result = await WebBrowser.openAuthSessionAsync(
        authorization.authorizationUrl,
        returnUrl,
      );
      if (result.type !== 'success') return;
      const parsed = new URL(result.url);
      if (parsed.searchParams.get('status') !== 'connected') {
        throw new Error('Il collegamento non è stato completato dalla banca.');
      }
      const connectionId = parsed.searchParams.get('connectionId');
      if (!connectionId) throw new Error('Connessione bancaria non riconosciuta.');
      await syncBankConnection(session.access_token, connectionId);
      await refreshData();
      router.back();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Non siamo riusciti a collegare la banca.',
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={[styles.backIcon, { color: colors.text }]}>arrow_back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Collega una banca</Text>
        <View style={styles.headerSpacer} />
      </View>

      {planTier === 'free' ? (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Disponibile con Pro e Max</Text>
          <Text style={[styles.copy, { color: colors.textSecondary }]}> 
            Nel piano Free continui a gestire le transazioni manualmente. Con Pro puoi collegare fino a 2 banche; con Max fino a 10.
          </Text>
        </Card>
      ) : (
        <>
          <Text style={[styles.copy, { color: colors.textSecondary }]}> 
            Seleziona il tuo istituto. L’accesso avviene sul sito della banca: Flownd non vede né salva le credenziali.
          </Text>
          <Field
            label="Cerca banca"
            placeholder="es. Intesa, N26, ING"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setSelected(null);
            }}
          />
          <View style={styles.bankList}>
            {loading ? (
              <Text style={[styles.copy, { color: colors.textSecondary }]}>Caricamento banche…</Text>
            ) : visibleBanks.length ? (
              visibleBanks.map((bank) => {
                const active = selected?.name === bank.name;
                return (
                  <Pressable
                    key={`${bank.country}:${bank.name}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => setSelected(bank)}
                    style={({ pressed }) => [
                      styles.bank,
                      { backgroundColor: colors.surface, borderColor: active ? colors.accent : colors.border },
                      pressed && styles.pressed,
                    ]}>
                    <View style={[styles.bankIcon, { backgroundColor: colors.sunken }]}> 
                      <Text style={[styles.materialIcon, { color: colors.accent }]}>account_balance</Text>
                    </View>
                    <Text style={[styles.bankName, { color: colors.text }]}>{bank.name}</Text>
                    {active ? <Text style={[styles.materialIcon, { color: colors.accent }]}>check_circle</Text> : null}
                  </Pressable>
                );
              })
            ) : (
              <Text style={[styles.copy, { color: colors.textSecondary }]}>Nessuna banca trovata.</Text>
            )}
          </View>
          {error ? <Text style={[styles.error, { color: colors.negative }]}>{error}</Text> : null}
          <PrimaryButton disabled={!selected} loading={connecting} onPress={connect}>
            Continua con la banca
          </PrimaryButton>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 23 },
  title: { flex: 1, textAlign: 'center', fontFamily: font.displaySemiBold, fontSize: 19 },
  headerSpacer: { width: 40 },
  cardTitle: { fontFamily: font.bodySemiBold, fontSize: 15 },
  copy: { fontFamily: font.body, fontSize: 11, lineHeight: 17 },
  bankList: { gap: 7, marginTop: 12, marginBottom: 18 },
  bank: { minHeight: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bankIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bankName: { flex: 1, fontFamily: font.bodyMedium, fontSize: 12 },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  error: { fontFamily: font.bodyMedium, fontSize: 11, marginBottom: 12 },
  pressed: { opacity: 0.72 },
});
