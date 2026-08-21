import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Card,
  GradientButton,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { formatDateItalian, formatEuro } from '@/lib/onboarding';
import {
  analyzeTransactionFile,
  duplicateIndexes,
  GENERIC_OPERATION_ERROR,
  type ImportedTransaction,
  reportClientError,
  scanTransactionImage,
} from '@/lib/transaction-import';
import { suggestTransactionCategory } from '@/lib/transaction-categories';
import { useApp } from '@/providers/app-provider';

type ImportMode = 'file' | 'ai';

export default function TransactionImportScreen() {
  const { colors, isDark } = useFlowndTheme();
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const requestedMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const mode: ImportMode = requestedMode === 'ai' ? 'ai' : 'file';
  const {
    addTransaction,
    clearError,
    error,
    planTier,
    saving,
    session,
    transactions,
  } = useApp();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImportedTransaction[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const duplicates = useMemo(
    () => duplicateIndexes(candidates, transactions),
    [candidates, transactions],
  );
  const selected = candidates.filter(
    (_, index) => !duplicates.has(index) && !excluded.has(index),
  );

  async function showOperationalError(context: string, reason: unknown) {
    setAnalysisError(GENERIC_OPERATION_ERROR);
    await reportClientError(session?.access_token, context, reason);
  }

  function showCandidates(items: ImportedTransaction[]) {
    setCandidates(items);
    setExcluded(new Set());
    setAnalysisError(null);
  }

  async function chooseFile() {
    if (!session?.access_token) {
      return showOperationalError('transaction_file_missing_session', new Error('Missing session'));
    }
    clearError();
    setAnalysisError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 3 * 1024 * 1024) {
        throw new Error(`File too large: ${asset.size} bytes`);
      }
      setAnalyzing(true);
      const base64 = await new File(asset.uri).base64();
      const response = await analyzeTransactionFile(session.access_token, {
        name: asset.name,
        base64,
      });
      showCandidates(response.transactions);
    } catch (reason) {
      await showOperationalError('transaction_file_import', reason);
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeImage(asset: ImagePicker.ImagePickerAsset) {
    if (!session?.access_token) {
      return showOperationalError('transaction_image_missing_session', new Error('Missing session'));
    }
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const context = ImageManipulator.manipulate(asset.uri);
      if (asset.width > 1600) context.resize({ width: 1600, height: null });
      const rendered = await context.renderAsync();
      const image = await rendered.saveAsync({
        base64: true,
        compress: 0.72,
        format: SaveFormat.JPEG,
      });
      if (!image.base64) throw new Error('Non è stato possibile preparare l’immagine.');
      const response = await scanTransactionImage(
        session.access_token,
        `data:image/jpeg;base64,${image.base64}`,
      );
      showCandidates(response.transactions);
    } catch (reason) {
      await showOperationalError('transaction_image_analysis', reason);
    } finally {
      setAnalyzing(false);
    }
  }

  async function chooseScreenshot() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) await analyzeImage(result.assets[0]);
    } catch (reason) {
      await showOperationalError('transaction_image_picker', reason);
    }
  }

  async function takeReceiptPhoto() {
    try {
      if (Platform.OS === 'ios' && !Device.isDevice) {
        throw new Error('Camera unavailable on iOS Simulator');
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return Alert.alert(
          'Accesso alla fotocamera',
          'Consenti a Flownd di usare la fotocamera per fotografare lo scontrino.',
        );
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.back,
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) await analyzeImage(result.assets[0]);
    } catch (reason) {
      await showOperationalError('transaction_camera', reason);
    }
  }

  async function importSelected() {
    for (const item of selected) {
      const saved = await addTransaction({
        ...item,
        category:
          item.category ??
          suggestTransactionCategory(item.description, item.kind ?? 'expense'),
        source: mode === 'ai' ? 'ai_scan' : 'file_import',
      });
      if (!saved) {
        await showOperationalError('transaction_import_save', new Error('addTransaction returned false'));
        return;
      }
    }
    Alert.alert(
      'Transazioni importate',
      `${selected.length} ${selected.length === 1 ? 'transazione aggiunta' : 'transazioni aggiunte'} senza duplicati.`,
      [{ text: 'Fine', onPress: () => router.dismissAll() }],
    );
  }

  const isPaid = planTier !== 'free';
  const title = mode === 'ai' ? 'Scansiona con Flownd AI' : 'Importa con Flownd AI';

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
          onPress={() => router.back()}
          style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.backIcon, { color: colors.text }]}>arrow_back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!candidates.length ? (
        <>
          <Text style={[uiStyles.title, { color: colors.text }]}>
            {mode === 'ai' ? 'Da immagine a transazione' : 'Carica il tuo estratto'}
          </Text>
          <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
            {mode === 'ai'
              ? 'Flownd riconosce una foto dello scontrino o le transazioni visibili in uno screenshot. Confermi sempre tu prima del salvataggio.'
              : 'Flownd AI riconosce le transazioni anche quando CSV, PDF e XLSX hanno strutture e colonne differenti.'}
          </Text>
          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoIcon, { color: colors.positive }]}>verified_user</Text>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {mode === 'ai'
                  ? 'L’immagine viene compressa, analizzata e non viene conservata.'
                  : 'Il file viene analizzato da Flownd AI e non viene conservato.'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoIcon, { color: colors.accent }]}>difference</Text>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Data, importo e descrizione vengono confrontati con lo storico per escludere i duplicati.
              </Text>
            </View>
          </Card>

          {mode === 'file' ? (
            <GradientButton onPress={chooseFile} disabled={analyzing}>
              ✦ Scegli CSV, PDF o XLSX
            </GradientButton>
          ) : !isPaid ? (
            <Card style={styles.paywallCard}>
              <Text style={[styles.paywallTitle, { color: colors.text }]}>Disponibile con Pro e Max</Text>
              <Text style={[styles.paywallCopy, { color: colors.textSecondary }]}>
                Il riconoscimento IA di scontrini e screenshot è riservato ai piani a pagamento.
              </Text>
            </Card>
          ) : (
            <>
              <GradientButton onPress={takeReceiptPhoto} disabled={analyzing}>
                ✦ Fotografa uno scontrino
              </GradientButton>
              <GradientButton onPress={chooseScreenshot} disabled={analyzing}>
                ✦ Scegli uno screenshot
              </GradientButton>
            </>
          )}
          {analyzing ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                {mode === 'ai' ? 'Riconoscimento IA in corso…' : 'Analisi del file…'}
              </Text>
            </View>
          ) : null}
          {analysisError ? <Text style={[uiStyles.error, { color: colors.negative }]}>{analysisError}</Text> : null}
        </>
      ) : (
        <>
          <Text style={[uiStyles.title, { color: colors.text }]}>Controlla prima di importare</Text>
          <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
            {selected.length} da importare · {duplicates.size} duplicati esclusi
          </Text>
          <View style={styles.list}>
            {candidates.map((item, index) => {
              const duplicate = duplicates.has(index);
              const omitted = excluded.has(index);
              const active = !duplicate && !omitted;
              const category = item.category ?? suggestTransactionCategory(item.description, item.kind ?? 'expense');
              return (
                <Pressable
                  key={`${item.occurredAt}:${item.amount}:${index}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active, disabled: duplicate }}
                  disabled={duplicate}
                  onPress={() => setExcluded((current) => {
                    const next = new Set(current);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })}
                  style={[
                    styles.transaction,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    !active && styles.inactive,
                  ]}
                >
                  <Text style={[styles.check, { color: duplicate ? colors.warning : colors.accent }]}>
                    {duplicate ? 'difference' : active ? 'check_circle' : 'radio_button_unchecked'}
                  </Text>
                  <View style={styles.transactionCopy}>
                    <Text numberOfLines={1} style={[styles.description, { color: colors.text }]}>{item.description}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {formatDateItalian(item.occurredAt ?? '')} · {category}{duplicate ? ' · Duplicato' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: item.kind === 'income' ? colors.positive : colors.text }]}>
                    {item.kind === 'income' ? '+' : '−'}{formatEuro(item.amount)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {error || analysisError ? (
            <Text style={[uiStyles.error, { color: colors.negative }]}>{GENERIC_OPERATION_ERROR}</Text>
          ) : null}
          <PrimaryButton disabled={!selected.length} loading={saving} onPress={importSelected}>
            Importa {selected.length || ''} transazioni
          </PrimaryButton>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  close: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  infoCard: { marginTop: 22, gap: 14 },
  infoRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  infoIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20, lineHeight: 23 },
  infoText: { flex: 1, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  paywallCard: { marginTop: 18 },
  paywallTitle: { fontFamily: font.bodySemiBold, fontSize: 14, marginBottom: 5 },
  paywallCopy: { fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  loadingRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { fontFamily: font.bodyMedium, fontSize: 12 },
  list: { gap: 9, marginTop: 20 },
  transaction: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inactive: { opacity: 0.48 },
  check: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  transactionCopy: { flex: 1 },
  description: { fontFamily: font.bodyMedium, fontSize: 13, marginBottom: 3 },
  meta: { fontFamily: font.body, fontSize: 10 },
  amount: { fontFamily: font.dataMedium, fontSize: 12 },
});
