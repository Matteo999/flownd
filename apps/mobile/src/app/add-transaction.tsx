import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Field,
  GradientButton,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { TransactionDateField } from '@/components/transaction-date-field';
import { GENERIC_OPERATION_ERROR, reportClientError } from '@/lib/transaction-import';
import {
  categoriesForTransactionKind,
  suggestPersonalizedTransactionCategory,
  suggestTransactionCategory,
} from '@/lib/transaction-categories';
import { useApp } from '@/providers/app-provider';

export default function AddTransactionScreen() {
  const { colors, isDark } = useFlowndTheme();
  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  const accountId = Array.isArray(params.accountId)
    ? params.accountId[0]
    : params.accountId;
  const {
    addTransaction,
    financialAccounts,
    planTier,
    session,
    transactions,
    saving,
    error,
    clearError,
  } = useApp();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    accountId ?? null,
  );
  const [accountsOpen, setAccountsOpen] = useState(false);
  const manualAccounts = financialAccounts.filter(
    (account) => account.source === 'manual',
  );
  const selectedAccount = manualAccounts.find(
    (account) => account.id === selectedAccountId,
  );
  const effectiveAccountId = selectedAccount?.id ?? null;
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [importSheetTranslateY] = useState(() => new Animated.Value(480));
  const [importBackdropOpacity] = useState(() => new Animated.Value(0));
  const pickerBusy = useRef(false);
  const suggestedCategory = useMemo(
    () =>
      planTier === 'free'
        ? suggestTransactionCategory(description, kind)
        : suggestPersonalizedTransactionCategory(
            description,
            kind,
            transactions,
          ),
    [description, kind, planTier, transactions],
  );
  const category = categoryOverride ?? suggestedCategory;
  const categoryOptions = categoriesForTransactionKind(kind);
  const numericAmount = Number(amount.replace(',', '.')) || 0;
  const insufficientCash = Boolean(
    selectedAccount?.accountKind === 'cash_wallet' &&
      kind === 'expense' &&
      numericAmount > selectedAccount.balance,
  );

  useEffect(() => {
    if (!importMenuOpen) return;
    importSheetTranslateY.setValue(480);
    importBackdropOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(importSheetTranslateY, {
        toValue: 0,
        damping: 24,
        stiffness: 240,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.timing(importBackdropOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [importBackdropOpacity, importMenuOpen, importSheetTranslateY]);

  function canUseImageAi() {
    if (planTier === 'free') {
      Alert.alert(
        'Flownd AI è incluso in Pro e Max',
        'Passa a un piano a pagamento per riconoscere transazioni da foto di scontrini e screenshot bancari.',
        [{ text: 'Non ora', style: 'cancel' }, { text: 'Ho capito' }],
      );
      return false;
    }
    return true;
  }

  async function showAiError(context: string, reason: unknown) {
    await reportClientError(session?.access_token, context, reason);
    Alert.alert('Operazione non riuscita', GENERIC_OPERATION_ERROR);
  }

  function openImageReview(asset: ImagePicker.ImagePickerAsset) {
    router.push({
      pathname: '/transaction-import',
      params: {
        mode: 'ai',
        source: 'image-asset',
        assetUri: asset.uri,
        assetWidth: String(asset.width),
      },
    } as Href);
  }

  async function openCamera() {
    if (!canUseImageAi()) return;
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    try {
      if (Platform.OS === 'ios' && !Device.isDevice) {
        throw new Error('Camera unavailable on iOS Simulator');
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Accesso alla fotocamera',
          'Consenti a Flownd di usare la fotocamera per fotografare lo scontrino.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.back,
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) openImageReview(result.assets[0]);
    } catch (reason) {
      await showAiError('transaction_camera_launch', reason);
    } finally {
      pickerBusy.current = false;
    }
  }

  async function openPhotoLibrary() {
    if (!canUseImageAi()) return;
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    closeImportMenu();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) openImageReview(result.assets[0]);
    } catch (reason) {
      await showAiError('transaction_library_launch', reason);
    } finally {
      pickerBusy.current = false;
    }
  }

  async function openFilePicker() {
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    closeImportMenu();
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
      router.push({
        pathname: '/transaction-import',
        params: {
          mode: 'file',
          source: 'file-asset',
          assetUri: asset.uri,
          assetName: asset.name,
          assetSize: String(asset.size ?? 0),
        },
      } as Href);
    } catch (reason) {
      await showAiError('transaction_file_picker', reason);
    } finally {
      pickerBusy.current = false;
    }
  }

  function closeImportMenu() {
    Animated.parallel([
      Animated.timing(importSheetTranslateY, {
        toValue: 480,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(importBackdropOpacity, {
        toValue: 0,
        duration: 130,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setImportMenuOpen(false);
    });
  }

  function openImportMenu() {
    if (pickerBusy.current) return;
    setImportMenuOpen(true);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Screen scroll={false} style={styles.addScreen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Nuova transazione</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.formScroll}
          contentContainerStyle={styles.formContent}>
        <View
          style={[styles.quickAdd, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.quickAddTitle, { color: colors.text }]}>Aggiungi più velocemente</Text>
          <Text style={[styles.quickAddCopy, { color: colors.textSecondary }]}>Scatta uno scontrino oppure importa una foto o un documento.</Text>
          <View style={styles.quickActions}>
            <View style={styles.quickAction}>
              <GradientButton compact icon="photo_camera" onPress={openCamera}>
                Fotocamera{planTier === 'free' ? ' · PRO' : ''}
              </GradientButton>
            </View>
            <View style={styles.quickAction}>
              <GradientButton compact icon="upload_file" onPress={openImportMenu}>
                Importa
              </GradientButton>
            </View>
          </View>
        </View>
        <View style={styles.manualDivider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OPPURE INSERISCI A MANO</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>
        <View
          accessibilityRole="tablist"
          style={[styles.kindControl, { backgroundColor: colors.sunken }]}>
          {([
            { id: 'expense', label: 'Uscita' },
            { id: 'income', label: 'Entrata' },
          ] as const).map((option) => {
            const selected = kind === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  clearError();
                  setKind(option.id);
                  setCategoryOverride(null);
                  setCategoriesOpen(false);
                }}
                style={[
                  styles.kindButton,
                  selected && { backgroundColor: colors.surface },
                ]}>
                <Text
                  style={[
                    styles.kindText,
                    { color: selected ? colors.text : colors.textSecondary },
                  ]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[uiStyles.title, { color: colors.text }]}>
          {kind === 'income' ? 'Cosa hai ricevuto?' : 'Cosa hai pagato?'}
        </Text>
        <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
          Inserisci descrizione e importo della transazione.
        </Text>
        <Field
          label="Descrizione"
          placeholder={
            kind === 'income' ? 'es. stipendio di luglio' : 'es. pranzo al bar'
          }
          value={description}
          onChangeText={(value) => {
            clearError();
            setDescription(value);
          }}
        />
        <Field
          label="Importo"
          placeholder="0,00"
          suffix="€"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(value) => {
            clearError();
            setAmount(value);
          }}
        />
        <TransactionDateField value={occurredAt} onChange={setOccurredAt} />
        <Text style={[styles.categoryTitle, { color: colors.text }]}>Conto</Text>
        <View
          style={[
            styles.categoryDropdown,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: accountsOpen }}
            onPress={() => {
              setCategoriesOpen(false);
              setAccountsOpen((current) => !current);
            }}
            style={({ pressed }) => [styles.categoryTrigger, pressed && styles.pressed]}>
            <Text style={[styles.categoryValue, { color: colors.text }]}>
              {selectedAccount?.name ?? 'Automatico'}
            </Text>
            <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>
              {accountsOpen ? 'expand_less' : 'expand_more'}
            </Text>
          </Pressable>
          {accountsOpen ? (
            <View style={[styles.categoryMenu, { borderTopColor: colors.border }]}>
              {[null, ...manualAccounts].map((option) => {
                const optionId = option?.id ?? null;
                const selected = effectiveAccountId === optionId;
                return (
                  <Pressable
                    key={optionId ?? 'none'}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      clearError();
                      setSelectedAccountId(optionId);
                      setAccountsOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.categoryOption,
                      selected && { backgroundColor: colors.accentSoft },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.categoryOptionText, { color: selected ? colors.accent : colors.text }]}>
                      {option?.name ?? 'Automatico'}
                    </Text>
                    {selected ? <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <Text style={[styles.categoryTitle, { color: colors.text }]}>Categoria</Text>
        <View
          style={[
            styles.categoryDropdown,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Categoria selezionata: ${category}`}
            accessibilityState={{ expanded: categoriesOpen }}
            onPress={() => {
              setAccountsOpen(false);
              setCategoriesOpen((current) => !current);
            }}
            style={({ pressed }) => [
              styles.categoryTrigger,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.categoryValue, { color: colors.text }]}>{category}</Text>
            <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>
              {categoriesOpen ? 'expand_less' : 'expand_more'}
            </Text>
          </Pressable>
          {categoriesOpen ? (
            <View style={[styles.categoryMenu, { borderTopColor: colors.border }]}>
              {categoryOptions.map((option) => {
                const selected = category === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      clearError();
                      setCategoryOverride(option);
                      setCategoriesOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.categoryOption,
                      selected && { backgroundColor: colors.accentSoft },
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.categoryOptionText,
                        { color: selected ? colors.accent : colors.text },
                      ]}>
                      {option}
                    </Text>
                    {selected ? (
                      <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        {kind === 'income' ? (
          <Text style={[styles.categoryHint, { color: colors.textSecondary }]}>
            Tredicesima, rimborsi e giroconti restano visibili ma non aumentano
            il budget mensile.
          </Text>
        ) : null}
        {insufficientCash ? (
          <Text style={[uiStyles.error, { color: colors.negative }]}>
            Il portafoglio non contiene abbastanza contanti.
          </Text>
        ) : null}
        {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
        <PrimaryButton
          disabled={!description.trim() || numericAmount <= 0 || insufficientCash}
          loading={saving}
          onPress={async () => {
            const saved = await addTransaction({
              description: description.trim(),
              amount: numericAmount,
              category,
              kind,
              occurredAt: occurredAt.toISOString(),
              financialAccountId: effectiveAccountId,
            });
            if (saved) router.back();
          }}>
          Aggiungi {kind === 'income' ? 'entrata' : 'uscita'}
        </PrimaryButton>
        </ScrollView>
      </Screen>
      {importMenuOpen ? (
        <View style={styles.importOverlay}>
          <Animated.View
            style={[styles.importBackdrop, { opacity: importBackdropOpacity }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi menu importazione"
              style={StyleSheet.absoluteFill}
              onPress={closeImportMenu}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.importSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                transform: [{ translateY: importSheetTranslateY }],
              },
            ]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Importa con Flownd AI</Text>
            <Text style={[styles.sheetCopy, { color: colors.textSecondary }]}>Scegli una foto oppure un documento CSV, PDF o XLSX.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void openPhotoLibrary()}
              style={({ pressed }) => [styles.sheetOption, { borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.sheetOptionIcon, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.sheetMaterialIcon, { color: colors.accent }]}>photo_library</Text>
              </View>
              <View style={styles.sheetOptionCopy}>
                <Text style={[styles.sheetOptionTitle, { color: colors.text }]}>Libreria foto</Text>
                <Text style={[styles.sheetOptionSubtitle, { color: colors.textSecondary }]}>Screenshot bancari e foto già scattate</Text>
              </View>
              {planTier === 'free' ? <Text style={[styles.proBadge, { color: colors.accent }]}>PRO</Text> : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void openFilePicker()}
              style={({ pressed }) => [styles.sheetOption, { borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.sheetOptionIcon, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.sheetMaterialIcon, { color: colors.accent }]}>description</Text>
              </View>
              <View style={styles.sheetOptionCopy}>
                <Text style={[styles.sheetOptionTitle, { color: colors.text }]}>File</Text>
                <Text style={[styles.sheetOptionSubtitle, { color: colors.textSecondary }]}>CSV, PDF oppure XLSX</Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  addScreen: { paddingBottom: 0 },
  formScroll: { flex: 1 },
  formContent: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  close: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font.body, fontSize: 25, lineHeight: 28 },
  headerTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  headerSpacer: { width: 40 },
  quickAdd: { borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 20 },
  quickAddTitle: { fontFamily: font.bodySemiBold, fontSize: 15, marginBottom: 4 },
  quickAddCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginBottom: 13 },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickAction: { flex: 1 },
  importOverlay: { ...StyleSheet.absoluteFill, zIndex: 100, justifyContent: 'flex-end' },
  importBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4, 12, 9, 0.42)' },
  importSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontFamily: font.displaySemiBold, fontSize: 21, marginBottom: 5 },
  sheetCopy: { fontFamily: font.body, fontSize: 12, lineHeight: 18, marginBottom: 18 },
  sheetOption: { minHeight: 70, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetOptionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetMaterialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  sheetOptionCopy: { flex: 1 },
  sheetOptionTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  sheetOptionSubtitle: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  proBadge: { fontFamily: font.dataMedium, fontSize: 9, letterSpacing: 0.8 },
  manualDivider: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontFamily: font.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  kindControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 22,
  },
  kindButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindText: { fontFamily: font.bodySemiBold, fontSize: 13 },
  categoryTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    marginTop: 18,
    marginBottom: 9,
  },
  categoryDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  categoryTrigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  categoryValue: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13 },
  dropdownIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  categoryMenu: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 5 },
  categoryOption: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  categoryOptionText: { flex: 1, fontFamily: font.body, fontSize: 12 },
  categoryHint: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  optionCheck: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  pressed: { opacity: 0.68 },
});
