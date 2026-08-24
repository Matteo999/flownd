import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Card,
  Field,
  GradientButton,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { TransactionDateField } from '@/components/transaction-date-field';
import { type ExpenseDraft, formatDateItalian, formatEuro } from '@/lib/onboarding';
import {
  analyzeTransactionFile,
  duplicateIndexes,
  GENERIC_OPERATION_ERROR,
  getTransactionImportJob,
  type ImportedTransaction,
  reportClientError,
  scanTransactionImage,
} from '@/lib/transaction-import';
import {
  categoriesForTransactionKind,
  suggestPersonalizedTransactionCategory,
  suggestTransactionCategory,
} from '@/lib/transaction-categories';
import { type FinancialAccount, useApp } from '@/providers/app-provider';

type ImportMode = 'file' | 'ai';

export default function TransactionImportScreen() {
  const { colors, isDark } = useFlowndTheme();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    source?: string | string[];
    assetUri?: string | string[];
    assetWidth?: string | string[];
    assetName?: string | string[];
    assetSize?: string | string[];
    jobId?: string | string[];
  }>();
  const firstParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const requestedMode = firstParam(params.mode);
  const requestedSource = firstParam(params.source);
  const assetUri = firstParam(params.assetUri);
  const assetWidth = Number(firstParam(params.assetWidth)) || 1600;
  const assetName = firstParam(params.assetName);
  const assetSize = Number(firstParam(params.assetSize)) || 0;
  const jobId = firstParam(params.jobId);
  const mode: ImportMode = requestedMode === 'ai' ? 'ai' : 'file';
  const {
    addTransaction,
    clearError,
    error,
    financialAccounts,
    planTier,
    saving,
    session,
    transactions,
  } = useApp();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImportedTransaction[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [includedDuplicates, setIncludedDuplicates] = useState<Set<number>>(() => new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const autoLaunchRef = useRef(false);
  const jobLoadRef = useRef(false);
  const pickerBusyRef = useRef(false);
  const isPaid = planTier !== 'free';
  const duplicates = useMemo(
    () => duplicateIndexes(candidates, transactions),
    [candidates, transactions],
  );
  const selectedIndexes = candidates.flatMap(
    (_, index) => (
      (!duplicates.has(index) || includedDuplicates.has(index)) &&
      !excluded.has(index)
        ? [index]
        : []
    ),
  );
  const selected = selectedIndexes.map((index) => candidates[index]);

  const showOperationalError = useCallback(async (context: string, reason: unknown) => {
    setAnalysisError(GENERIC_OPERATION_ERROR);
    await reportClientError(session?.access_token, context, reason);
  }, [session]);

  const showCandidates = useCallback((items: ImportedTransaction[]) => {
    const prepared = items.map((item) => {
      const kind = item.kind ?? 'expense';
      const suggested = planTier === 'free'
        ? suggestTransactionCategory(item.description, kind)
        : suggestPersonalizedTransactionCategory(item.description, kind, transactions);
      return {
        ...item,
        category: !item.category || item.category === 'Altro' ? suggested : item.category,
      };
    });
    setCandidates(prepared);
    setExcluded(new Set());
    setIncludedDuplicates(new Set());
    setAnalysisError(null);
  }, [planTier, transactions]);

  const analyzeFileAsset = useCallback(async (asset: { uri: string; name: string; size?: number }) => {
    if (!session?.access_token) {
      return showOperationalError('transaction_file_missing_session', new Error('Missing session'));
    }
    clearError();
    setAnalysisError(null);
    try {
      if ((asset.size ?? 0) > 3 * 1024 * 1024) {
        throw new Error(`File too large: ${asset.size} bytes`);
      }
      setAnalyzing(true);
      const base64 = await new File(asset.uri).base64();
      const response = await analyzeTransactionFile(session.access_token, {
        name: asset.name,
        base64,
      });
      if (!response.id) throw new Error('Import job missing');
      router.dismissAll();
    } catch (reason) {
      await showOperationalError('transaction_file_import', reason);
    } finally {
      setAnalyzing(false);
    }
  }, [clearError, session, showOperationalError]);

  useEffect(() => {
    if (!jobId || !session?.access_token || jobLoadRef.current) return;
    jobLoadRef.current = true;
    setAnalyzing(true);
    void getTransactionImportJob(session.access_token, jobId)
      .then((job) => {
        if (job.status === 'completed') showCandidates(job.transactions);
        else if (job.status === 'failed') setAnalysisError(GENERIC_OPERATION_ERROR);
        else setAnalysisError('L’importazione è ancora in elaborazione. Riceverai una notifica quando sarà pronta.');
      })
      .catch((reason) => showOperationalError('transaction_import_job_load', reason))
      .finally(() => setAnalyzing(false));
  }, [jobId, session?.access_token, showCandidates, showOperationalError]);

  const chooseFile = useCallback(async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
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
      await analyzeFileAsset(result.assets[0]);
    } catch (reason) {
      await showOperationalError('transaction_file_picker', reason);
    } finally {
      pickerBusyRef.current = false;
    }
  }, [analyzeFileAsset, showOperationalError]);

  const analyzeImage = useCallback(async (asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width'>) => {
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
  }, [session, showCandidates, showOperationalError]);

  const chooseScreenshot = useCallback(async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) await analyzeImage(result.assets[0]);
    } catch (reason) {
      await showOperationalError('transaction_image_picker', reason);
    } finally {
      pickerBusyRef.current = false;
    }
  }, [analyzeImage, showOperationalError]);

  const takeReceiptPhoto = useCallback(async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
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
    } finally {
      pickerBusyRef.current = false;
    }
  }, [analyzeImage, showOperationalError]);

  useEffect(() => {
    if (autoLaunchRef.current || !requestedSource) return;
    if (
      ['camera', 'library', 'image-asset'].includes(requestedSource)
      && !isPaid
    ) return;
    const timer = setTimeout(() => {
      if (autoLaunchRef.current) return;
      autoLaunchRef.current = true;
      if (requestedSource === 'camera') void takeReceiptPhoto();
      if (requestedSource === 'library') void chooseScreenshot();
      if (requestedSource === 'file') void chooseFile();
      if (requestedSource === 'image-asset' && assetUri) {
        void analyzeImage({ uri: assetUri, width: assetWidth });
      }
      if (requestedSource === 'file-asset' && assetUri && assetName) {
        void analyzeFileAsset({ uri: assetUri, name: assetName, size: assetSize });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    analyzeFileAsset,
    analyzeImage,
    assetName,
    assetSize,
    assetUri,
    assetWidth,
    chooseFile,
    chooseScreenshot,
    isPaid,
    requestedSource,
    takeReceiptPhoto,
  ]);

  function importSelected() {
    const pending = selectedIndexes.map((index) => ({
      item: candidates[index],
      forceImportDuplicate:
        duplicates.has(index) && includedDuplicates.has(index),
    }));
    const accessToken = session?.access_token;
    router.dismissAll();
    void (async () => {
      for (const { item, forceImportDuplicate } of pending) {
        const saved = await addTransaction({
          ...item,
          forceImportDuplicate,
          category:
            item.category ??
            suggestTransactionCategory(item.description, item.kind ?? 'expense'),
          source: mode === 'ai' ? 'ai_scan' : 'file_import',
        });
        if (!saved) {
          await reportClientError(accessToken, 'transaction_import_save', new Error('addTransaction returned false'));
          return;
        }
      }
    })();
  }

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
            {selected.length} da importare · {duplicates.size} possibili duplicati
          </Text>
          <View style={styles.list}>
            {candidates.map((item, index) => {
              const duplicate = duplicates.has(index);
              const omitted = excluded.has(index);
              const duplicateIncluded = includedDuplicates.has(index);
              const active = (!duplicate || duplicateIncluded) && !omitted;
              const category = item.category ?? suggestTransactionCategory(item.description, item.kind ?? 'expense');
              return (
                <View
                  key={`${item.occurredAt}:${item.amount}:${index}`}
                  style={[
                    styles.transaction,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    !active && styles.inactive,
                  ]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    hitSlop={8}
                    onPress={() => {
                      if (duplicate) {
                        setIncludedDuplicates((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        });
                        return;
                      }
                      setExcluded((current) => {
                        const next = new Set(current);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      });
                    }}>
                    <Text style={[styles.check, { color: duplicate ? colors.warning : colors.accent }]}>
                      {active ? 'check_circle' : duplicate ? 'difference' : 'radio_button_unchecked'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Modifica ${item.description}`}
                    onPress={() => setEditingIndex(index)}
                    style={styles.transactionCopy}>
                    <Text numberOfLines={1} style={[styles.description, { color: colors.text }]}>{item.description}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {formatDateItalian(item.occurredAt ?? '')} · {category}
                      {duplicate ? duplicateIncluded ? ' · Duplicato incluso' : ' · Possibile duplicato' : ''}
                      {(item.importConfidence ?? 1) < 0.65 ? ' · Da verificare' : ''}
                    </Text>
                  </Pressable>
                  <View style={styles.transactionTrailing}>
                    <Text style={[styles.amount, { color: item.kind === 'income' ? colors.positive : colors.text }]}>
                      {item.kind === 'income' ? '+' : '−'}{formatEuro(item.amount)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Modifica ${item.description}`}
                      hitSlop={8}
                      onPress={() => setEditingIndex(index)}>
                      <Text style={[styles.editIcon, { color: colors.accent }]}>edit</Text>
                    </Pressable>
                  </View>
                </View>
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
      {editingIndex != null && candidates[editingIndex] ? (
        <CandidateEditor
          key={editingIndex}
          transaction={candidates[editingIndex]}
          financialAccounts={financialAccounts}
          history={transactions}
          planTier={planTier}
          onClose={() => setEditingIndex(null)}
          onSave={(updated) => {
            setCandidates((current) =>
              current.map((item, index) => index === editingIndex ? updated : item),
            );
            setExcluded((current) => {
              const next = new Set(current);
              next.delete(editingIndex);
              return next;
            });
            setEditingIndex(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function CandidateEditor({
  transaction,
  financialAccounts,
  history,
  planTier,
  onClose,
  onSave,
}: {
  transaction: ImportedTransaction;
  financialAccounts: FinancialAccount[];
  history: ExpenseDraft[];
  planTier: 'free' | 'pro' | 'max';
  onClose: () => void;
  onSave: (transaction: ImportedTransaction) => void;
}) {
  const { colors } = useFlowndTheme();
  const manualAccounts = financialAccounts.filter((account) => account.source === 'manual');
  const [kind, setKind] = useState<'expense' | 'income'>(transaction.kind ?? 'expense');
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(String(transaction.amount).replace('.', ','));
  const parsedDate = transaction.occurredAt ? new Date(transaction.occurredAt) : new Date();
  const [occurredAt, setOccurredAt] = useState(
    Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
  );
  const [category, setCategory] = useState(
    transaction.category ?? suggestTransactionCategory(transaction.description, kind),
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    transaction.financialAccountId ?? null,
  );
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const selectedAccount = manualAccounts.find((account) => account.id === selectedAccountId);
  const numericAmount = Number(amount.replace(',', '.')) || 0;
  const insufficientCash = Boolean(
    selectedAccount?.accountKind === 'cash_wallet'
      && kind === 'expense'
      && numericAmount > selectedAccount.balance,
  );

  function changeKind(nextKind: 'expense' | 'income') {
    setKind(nextKind);
    setCategory(
      planTier === 'free'
        ? suggestTransactionCategory(description, nextKind)
        : suggestPersonalizedTransactionCategory(description, nextKind, history),
    );
    setCategoriesOpen(false);
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.editorScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.editorHeader, { borderBottomColor: colors.border }]}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text style={[styles.editorHeaderAction, { color: colors.textSecondary }]}>Annulla</Text>
          </Pressable>
          <Text style={[styles.editorTitle, { color: colors.text }]}>Modifica transazione</Text>
          <Pressable
            accessibilityRole="button"
            disabled={!description.trim() || numericAmount <= 0 || insufficientCash}
            onPress={() => onSave({
              ...transaction,
              description: description.trim(),
              ...(description.trim() !== transaction.description
                ? { merchantName: null, counterpartyName: null }
                : {}),
              amount: numericAmount,
              category,
              kind,
              occurredAt: occurredAt.toISOString(),
              financialAccountId: selectedAccount?.id ?? null,
            })}
            hitSlop={10}>
            <Text style={[
              styles.editorHeaderAction,
              { color: colors.accent },
              (!description.trim() || numericAmount <= 0 || insufficientCash) && styles.inactive,
            ]}>Salva</Text>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.editorContent}>
          <View accessibilityRole="tablist" style={[styles.kindControl, { backgroundColor: colors.sunken }]}>
            {([
              { id: 'expense', label: 'Uscita' },
              { id: 'income', label: 'Entrata' },
            ] as const).map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: kind === option.id }}
                onPress={() => changeKind(option.id)}
                style={[styles.kindButton, kind === option.id && { backgroundColor: colors.surface }]}>
                <Text style={[styles.kindText, { color: kind === option.id ? colors.text : colors.textSecondary }]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field label="Descrizione" value={description} onChangeText={setDescription} />
          <Field
            label="Importo"
            suffix="€"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TransactionDateField value={occurredAt} onChange={setOccurredAt} />
          <EditorDropdown
            label="Conto"
            value={selectedAccount?.name ?? 'Automatico'}
            open={accountsOpen}
            onToggle={() => {
              setCategoriesOpen(false);
              setAccountsOpen((current) => !current);
            }}
            options={[
              { id: 'automatic', label: 'Automatico', selected: !selectedAccount },
              ...manualAccounts.map((account) => ({
                id: account.id,
                label: account.name,
                selected: selectedAccount?.id === account.id,
              })),
            ]}
            onSelect={(id) => {
              setSelectedAccountId(id === 'automatic' ? null : id);
              setAccountsOpen(false);
            }}
          />
          <EditorDropdown
            label="Categoria"
            value={category}
            open={categoriesOpen}
            onToggle={() => {
              setAccountsOpen(false);
              setCategoriesOpen((current) => !current);
            }}
            options={categoriesForTransactionKind(kind).map((option) => ({
              id: option,
              label: option,
              selected: category === option,
            }))}
            onSelect={(nextCategory) => {
              setCategory(nextCategory);
              setCategoriesOpen(false);
            }}
          />
          {insufficientCash ? (
            <Text style={[uiStyles.error, { color: colors.negative }]}>Il portafoglio non contiene abbastanza contanti.</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditorDropdown({
  label,
  value,
  open,
  options,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  open: boolean;
  options: { id: string; label: string; selected: boolean }[];
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.dropdownWrap}>
      <Text style={[styles.dropdownLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.dropdownTrigger}>
          <Text style={[styles.dropdownValue, { color: colors.text }]}>{value}</Text>
          <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>{open ? 'expand_less' : 'expand_more'}</Text>
        </Pressable>
        {open ? (
          <View style={[styles.dropdownMenu, { borderTopColor: colors.border }]}>
            {options.map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: option.selected }}
                onPress={() => onSelect(option.id)}
                style={[styles.dropdownOption, option.selected && { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.dropdownOptionText, { color: option.selected ? colors.accent : colors.text }]}>{option.label}</Text>
                {option.selected ? <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
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
  transactionTrailing: { alignItems: 'flex-end', gap: 5 },
  description: { fontFamily: font.bodyMedium, fontSize: 13, marginBottom: 3 },
  meta: { fontFamily: font.body, fontSize: 10 },
  amount: { fontFamily: font.dataMedium, fontSize: 12 },
  editIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18, lineHeight: 20 },
  editorScreen: { flex: 1 },
  editorHeader: {
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editorTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  editorHeaderAction: { fontFamily: font.bodySemiBold, fontSize: 13 },
  editorContent: { padding: 20, paddingBottom: 48 },
  kindControl: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 8 },
  kindButton: { flex: 1, minHeight: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  kindText: { fontFamily: font.bodySemiBold, fontSize: 13 },
  dropdownWrap: { marginTop: 18 },
  dropdownLabel: { fontFamily: font.bodySemiBold, fontSize: 13, marginBottom: 7 },
  dropdown: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dropdownTrigger: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  dropdownValue: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13 },
  dropdownIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  dropdownMenu: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 5 },
  dropdownOption: { minHeight: 42, marginHorizontal: 5, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  dropdownOptionText: { flex: 1, fontFamily: font.body, fontSize: 12 },
  optionCheck: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18, lineHeight: 21 },
});
