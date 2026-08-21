import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PrimaryButton,
  Screen,
  SecondaryButton,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import {
  getBankConnection,
  type OpenBankingConnectionDetail,
  removeBankConnection,
  syncBankConnection,
} from '@/lib/open-banking';
import { formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

export default function BankConnectionScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session, amountsVisible, refreshData } = useApp();
  const [connection, setConnection] = useState<OpenBankingConnectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessToken = session?.access_token;

  useEffect(() => {
    if (!accessToken || !id) return;
    let active = true;
    getBankConnection(accessToken, id)
      .then((data) => {
        if (active) setConnection(data);
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Dettaglio non disponibile.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, id]);

  async function reload() {
    if (!accessToken || !id) return;
    setConnection(await getBankConnection(accessToken, id));
  }

  function confirmRemoval() {
    if (!connection || !accessToken) return;
    Alert.alert(
      'Rimuovere il collegamento?',
      `Flownd interromperà la sincronizzazione con ${connection.aspsp_name}. Le transazioni già importate resteranno nello storico e potrai eliminarle singolarmente.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            setError(null);
            try {
              await removeBankConnection(accessToken, connection.id);
              await refreshData();
              router.back();
            } catch (reason) {
              setError(
                reason instanceof Error ? reason.message : 'Rimozione non riuscita.',
              );
              setRemoving(false);
            }
          },
        },
      ],
    );
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
          <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {connection?.aspsp_name || 'Banca collegata'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <Card style={styles.centerCard}>
          <Text style={[styles.copy, { color: colors.textSecondary }]}>Caricamento conto…</Text>
        </Card>
      ) : connection ? (
        <>
          <Card
            style={[
              styles.hero,
              { backgroundColor: colors.accentSoft, borderColor: colors.accent },
            ]}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}> 
              PATRIMONIO PRESSO {connection.aspsp_name.toLocaleUpperCase('it')}
            </Text>
            <Text style={[styles.balance, { color: colors.text }]}> 
              {amountsVisible ? formatEuro(connection.balance) : HIDDEN_AMOUNT}
            </Text>
            <Text style={[styles.copy, { color: colors.textSecondary }]}> 
              {connection.resources.length === 1
                ? '1 conto o spazio interno sincronizzato'
                : `${connection.resources.length} conti o spazi interni sincronizzati`}
            </Text>
          </Card>

          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.text }]}> 
                {connection.importedTransactions}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Movimenti importati</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.text }]}> 
                {connection.pendingTransactions}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>In attesa</Text>
            </Card>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Conti e spazi interni</Text>
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}> 
              {connection.resources.length}
            </Text>
          </View>
          <View style={styles.resources}>
            {connection.resources.map((resource) => (
              <Card key={resource.id} style={styles.resourceRow}>
                <View style={[styles.resourceIcon, { backgroundColor: colors.sunken }]}> 
                  <Text style={[styles.materialIcon, { color: colors.accent }]}>savings</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.resourceName, { color: colors.text }]}>{resource.name}</Text>
                  <Text style={[styles.resourceMeta, { color: colors.textSecondary }]}> 
                    {[resource.product, resource.ibanLast4 ? `••${resource.ibanLast4}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Risorsa bancaria'}
                  </Text>
                  <Text style={[styles.resourceMeta, { color: colors.textSecondary }]}> 
                    {resource.importedTransactions} movimenti
                  </Text>
                </View>
                <Text style={[styles.resourceBalance, { color: colors.text }]}> 
                  {amountsVisible ? formatEuro(resource.balance) : HIDDEN_AMOUNT}
                </Text>
              </Card>
            ))}
          </View>

          <Card style={styles.infoCard}>
            <InfoRow
              label="Ultimo aggiornamento"
              value={connection.last_synced_at ? formatDateTime(connection.last_synced_at) : 'Mai'}
            />
            <InfoRow label="Consenso valido fino al" value={formatDate(connection.valid_until)} />
            <InfoRow label="Stato" value={connection.status === 'authorized' ? 'Collegato' : connection.status} />
          </Card>

          {connection.last_error ? (
            <Text style={[styles.warning, { color: colors.warning }]}> 
              Ultima sincronizzazione parziale. Puoi riprovare senza ricollegare la banca.
            </Text>
          ) : null}
          {error ? <Text style={[styles.error, { color: colors.negative }]}>{error}</Text> : null}

          <PrimaryButton
            loading={syncing}
            onPress={async () => {
              if (!accessToken) return;
              setSyncing(true);
              setError(null);
              try {
                await syncBankConnection(accessToken, connection.id);
                await refreshData();
                await reload();
              } catch (reason) {
                setError(
                  reason instanceof Error ? reason.message : 'Sincronizzazione non riuscita.',
                );
              } finally {
                setSyncing(false);
              }
            }}>
            Sincronizza ora
          </PrimaryButton>
          <SecondaryButton disabled={removing} onPress={confirmRemoval}>
            {removing ? 'Rimozione…' : 'Rimuovi collegamento'}
          </SecondaryButton>
        </>
      ) : (
        <Card style={styles.centerCard}>
          <Text style={[styles.copy, { color: colors.textSecondary }]}> 
            {error || 'Collegamento non trovato.'}
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: font.displaySemiBold, fontSize: 19 },
  headerSpacer: { width: 40 },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  hero: { marginBottom: 10 },
  eyebrow: { fontFamily: font.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  balance: { fontFamily: font.displayBold, fontSize: 31, lineHeight: 40, marginTop: 6 },
  copy: { fontFamily: font.body, fontSize: 10, lineHeight: 16 },
  statsRow: { flexDirection: 'row', gap: 9 },
  statCard: { flex: 1 },
  statValue: { fontFamily: font.dataMedium, fontSize: 19 },
  statLabel: { fontFamily: font.body, fontSize: 9, marginTop: 3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 9 },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 18 },
  sectionMeta: { fontFamily: font.dataMedium, fontSize: 10 },
  resources: { gap: 8 },
  resourceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resourceIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  resourceName: { fontFamily: font.bodySemiBold, fontSize: 12 },
  resourceMeta: { fontFamily: font.body, fontSize: 9, marginTop: 2 },
  resourceBalance: { fontFamily: font.dataMedium, fontSize: 11 },
  flex: { flex: 1 },
  infoCard: { marginTop: 18, gap: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  infoLabel: { fontFamily: font.body, fontSize: 10 },
  infoValue: { fontFamily: font.bodySemiBold, fontSize: 10, textAlign: 'right' },
  warning: { fontFamily: font.bodyMedium, fontSize: 10, lineHeight: 15, marginVertical: 10 },
  error: { fontFamily: font.bodyMedium, fontSize: 10, marginVertical: 10 },
  centerCard: { alignItems: 'center', paddingVertical: 28 },
  pressed: { opacity: 0.7 },
});
