import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Alert, Easing, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Field,
  PrimaryButton,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { TransactionDateField } from '@/components/transaction-date-field';
import { TransactionKindSelector } from '@/components/transaction-kind-selector';
import { GENERIC_OPERATION_ERROR, reportClientError } from '@/lib/transaction-import';
import {
  categoriesForTransactionKind,
  suggestPersonalizedTransactionCategory,
  suggestTransactionCategory,
} from '@/lib/transaction-categories';
import { useApp } from '@/providers/app-provider';

export default function AddTransactionScreen() {
  const { colors, isDark } = useFlowndTheme();
  const insets = useSafeAreaInsets();
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
  const [sheetTranslateY] = useState(() => new Animated.Value(720));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [keyboardLift] = useState(() => new Animated.Value(0));
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

  const closeSheet = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(sheetTranslateY, {
        toValue: 900,
        duration: 210,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => router.back());
  }, [backdropOpacity, sheetTranslateY]);

  useEffect(() => {
    sheetTranslateY.setValue(720);
    backdropOpacity.setValue(0);
    keyboardLift.setValue(0);
    Animated.parallel([
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 24,
        stiffness: 240,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, keyboardLift, sheetTranslateY]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      Animated.timing(keyboardLift, {
        toValue: -event.endCoordinates.height,
        duration: event.duration ?? 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: event.duration ?? 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardLift]);

  const sheetPanGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetY(4)
      .failOffsetX([-24, 24])
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onBegin(() => {
        sheetTranslateY.stopAnimation();
        Keyboard.dismiss();
      })
      .onUpdate((event) => {
        sheetTranslateY.setValue(Math.max(0, event.translationY));
      })
      .onEnd((event) => {
        if (event.translationY > 110 || event.velocityY > 1050) {
          closeSheet();
          return;
        }
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      }),
    [closeSheet, sheetTranslateY],
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
    <View style={styles.modalRoot}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Animated.View style={[styles.mainBackdrop, { opacity: backdropOpacity }]}> 
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi nuova transazione"
          onPress={closeSheet}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <GestureDetector gesture={sheetPanGesture}>
        <Animated.View
          style={[
            styles.mainSheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 18),
              transform: [
                { translateY: sheetTranslateY },
                { translateY: keyboardLift },
              ],
            },
          ]}>
          <View
            pointerEvents="none"
            style={[styles.keyboardBackgroundExtension, { backgroundColor: colors.background }]}
          />
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Nuova transazione</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              onPress={closeSheet}
              style={({ pressed }) => [
                styles.close,
                { backgroundColor: colors.sunken },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.closeIcon, { color: colors.text }]}>close</Text>
            </Pressable>
          </View>

          <View style={styles.formContent}>
            <TransactionKindSelector
              value={kind}
              onChange={(nextKind) => {
                clearError();
                setKind(nextKind);
                setCategoryOverride(null);
                setCategoriesOpen(false);
              }}
            />
            <Field
              label="Descrizione"
              placeholder={kind === 'income' ? 'es. stipendio di luglio' : 'es. pranzo al bar'}
              value={description}
              onChangeText={(value) => {
                clearError();
                setDescription(value);
              }}
            />
            <View style={styles.amountDateRow}>
              <View style={styles.amountField}>
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
              </View>
              <View style={styles.dateField}>
                <TransactionDateField value={occurredAt} onChange={setOccurredAt} />
              </View>
            </View>
            <View style={styles.selectorRow}>
              <View style={styles.selectorColumn}>
                <Text style={[styles.categoryTitle, { color: colors.text }]}>Conto</Text>
                <View style={[styles.categoryDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: accountsOpen }}
                    onPress={() => {
                      setCategoriesOpen(false);
                      setAccountsOpen((current) => !current);
                    }}
                    style={({ pressed }) => [styles.categoryTrigger, pressed && styles.pressed]}>
                    <Text numberOfLines={1} style={[styles.categoryValue, { color: colors.text }]}> 
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
                            <Text numberOfLines={1} style={[styles.categoryOptionText, { color: selected ? colors.accent : colors.text }]}> 
                              {option?.name ?? 'Automatico'}
                            </Text>
                            {selected ? <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.selectorColumn}>
                <Text style={[styles.categoryTitle, { color: colors.text }]}>Categoria</Text>
                <View style={[styles.categoryDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Categoria selezionata: ${category}`}
                    accessibilityState={{ expanded: categoriesOpen }}
                    onPress={() => {
                      setAccountsOpen(false);
                      setCategoriesOpen(true);
                    }}
                    style={({ pressed }) => [styles.categoryTrigger, pressed && styles.pressed]}>
                    <Text numberOfLines={1} style={[styles.categoryValue, { color: colors.text }]}>{category}</Text>
                    <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>expand_more</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            {kind === 'income' ? (
              <Text style={[styles.categoryHint, { color: colors.textSecondary }]}> 
                Tredicesima, rimborsi e giroconti restano visibili ma non aumentano il budget mensile.
              </Text>
            ) : null}
            {insufficientCash ? (
              <Text style={[uiStyles.error, { color: colors.negative }]}>Il portafoglio non contiene abbastanza contanti.</Text>
            ) : null}
            {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
            <View style={styles.aiActions}>
              <Pressable accessibilityRole="button" onPress={() => void openCamera()} style={styles.aiAction}>
                <LinearGradient colors={['#7C5CFC', '#18A8D8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.aiActionGradient}>
                  <Text style={styles.aiActionIcon}>photo_camera</Text>
                  <Text style={styles.aiActionText}>Foto AI{planTier === 'free' ? ' · PRO' : ''}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={openImportMenu} style={styles.aiAction}>
                <LinearGradient colors={['#E85AAD', '#7C5CFC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.aiActionGradient}>
                  <Text style={styles.aiActionIcon}>upload_file</Text>
                  <Text style={styles.aiActionText}>Importa AI</Text>
                </LinearGradient>
              </Pressable>
            </View>
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
                if (saved) closeSheet();
              }}>
              Aggiungi {kind === 'income' ? 'entrata' : 'uscita'}
            </PrimaryButton>
          </View>

          {categoriesOpen ? (
            <View style={styles.categoryPopoverLayer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Chiudi categorie"
                onPress={() => setCategoriesOpen(false)}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.categoryPopover, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                <View style={styles.categoryPopoverHeader}>
                  <Text style={[styles.categoryPopoverTitle, { color: colors.text }]}>Scegli categoria</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Chiudi categorie" onPress={() => setCategoriesOpen(false)} hitSlop={8}>
                    <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>close</Text>
                  </Pressable>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.categoryPopoverScroll}>
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
                        <Text style={[styles.categoryOptionText, { color: selected ? colors.accent : colors.text }]}>{option}</Text>
                        {selected ? <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
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
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  mainBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 12, 9, 0.5)',
  },
  mainSheet: {
    maxHeight: '92%',
    overflow: 'hidden',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingHorizontal: 20,
  },
  keyboardBackgroundExtension: {
    position: 'absolute',
    right: -1,
    bottom: -640,
    left: -1,
    height: 642,
  },
  formContent: { gap: 12 },
  header: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  headerTitle: { fontFamily: font.displaySemiBold, fontSize: 22, lineHeight: 28 },
  amountDateRow: { flexDirection: 'row', gap: 10 },
  amountField: { flex: 0.9 },
  dateField: { flex: 1.1 },
  selectorRow: { flexDirection: 'row', gap: 10 },
  selectorColumn: { flex: 1 },
  aiActions: { flexDirection: 'row', gap: 9 },
  aiAction: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  aiActionGradient: {
    minHeight: 40,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  aiActionIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  aiActionText: { color: '#FFFFFF', fontFamily: font.bodySemiBold, fontSize: 11 },
  importOverlay: { ...StyleSheet.absoluteFill, zIndex: 100, justifyContent: 'flex-end' },
  importBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4, 12, 9, 0.42)' },
  importSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetTitle: { fontFamily: font.displaySemiBold, fontSize: 21, marginBottom: 5 },
  sheetCopy: { fontFamily: font.body, fontSize: 12, lineHeight: 18, marginBottom: 18 },
  sheetOption: { minHeight: 70, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetOptionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetMaterialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  sheetOptionCopy: { flex: 1 },
  sheetOptionTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  sheetOptionSubtitle: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  proBadge: { fontFamily: font.dataMedium, fontSize: 9, letterSpacing: 0.8 },
  categoryTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    marginBottom: 7,
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
  },
  categoryPopoverLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(4, 12, 9, 0.16)',
  },
  categoryPopover: {
    maxHeight: '76%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  categoryPopoverHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
  },
  categoryPopoverTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  categoryPopoverScroll: { maxHeight: 340 },
  optionCheck: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  pressed: { opacity: 0.68 },
});
