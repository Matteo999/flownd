import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Alert, Dimensions, Easing, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, font, uiStyles, useFlowndTheme } from '@/components/flownd-ui';
import { TransactionKindSelector } from '@/components/transaction-kind-selector';
import { GENERIC_OPERATION_ERROR, reportClientError } from '@/lib/transaction-import';
import {
  categoriesForTransactionKind,
  suggestPersonalizedTransactionCategory,
  suggestTransactionCategory,
} from '@/lib/transaction-categories';
import { useApp } from '@/providers/app-provider';

type TransactionStep = 'amount' | 'description' | 'category';
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function categoryIcon(category: string) {
  const icons: Record<string, string> = {
    'ATM (prelievo contante)': 'local_atm',
    'Bar e ristoranti': 'restaurant',
    'Spese aziendali': 'business_center',
    Educazione: 'school',
    'Famiglia e Amici': 'group',
    'Cibo e Spesa': 'shopping_cart',
    'Cure sanitarie e Farmacia': 'medical_services',
    'Casa e utenze': 'home',
    'Assicurazioni e Finanza': 'account_balance',
    'Tempo libero e intrattenimento': 'sports_esports',
    'Multimedia e Elettronica': 'devices',
    Altro: 'more_horiz',
    Shopping: 'shopping_bag',
    'Sottoscrizioni e donazioni': 'subscriptions',
    'Tasse e Multe': 'receipt_long',
    'Trasporti e Auto': 'directions_car',
    'Viaggi e Vacanze': 'flight',
    Giroconto: 'swap_horiz',
    Stipendio: 'payments',
    Tredicesima: 'redeem',
    'Altra entrata': 'add_card',
    'Rimborso spese': 'currency_exchange',
  };
  return icons[category] ?? 'category';
}

function compactDateLabel(date: Date) {
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return 'Oggi';
  }
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function preserveTransactionTime(date: Date, current: Date) {
  const next = new Date(date);
  next.setHours(
    current.getHours(),
    current.getMinutes(),
    current.getSeconds(),
    current.getMilliseconds(),
  );
  return next;
}

function normalizeAmountInput(value: string) {
  const normalizedSeparator = value.replace(/\./g, ',');
  const separatorIndex = normalizedSeparator.indexOf(',');
  const hasSeparator = separatorIndex >= 0;
  const integerSource = hasSeparator
    ? normalizedSeparator.slice(0, separatorIndex)
    : normalizedSeparator;
  const decimalSource = hasSeparator
    ? normalizedSeparator.slice(separatorIndex + 1)
    : '';
  const integerDigits = integerSource.replace(/\D/g, '').slice(0, 9);
  const decimals = decimalSource.replace(/\D/g, '').slice(0, 2);
  const integer = integerDigits.replace(/^0+(?=\d)/, '') || '0';
  return hasSeparator ? `${integer},${decimals}` : integer;
}

function formatAmountDisplay(value: string) {
  const [integerSource = '0', decimalSource = ''] = value.split(',');
  const groupedInteger = integerSource.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${groupedInteger},${decimalSource.padEnd(2, '0')}`;
}

function parseAmountInput(value: string) {
  return Number(value.replace(',', '.')) || 0;
}

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
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const manualAccounts = financialAccounts.filter(
    (account) => account.source === 'manual',
  );
  const selectedAccount = manualAccounts.find(
    (account) => account.id === selectedAccountId,
  );
  const effectiveAccountId = selectedAccount?.id ?? null;
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [step, setStep] = useState<TransactionStep>('amount');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('0');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(300);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [importSheetTranslateY] = useState(() => new Animated.Value(480));
  const [importBackdropOpacity] = useState(() => new Animated.Value(0));
  const [sheetTranslateY] = useState(() => new Animated.Value(720));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [contentProgress] = useState(() => new Animated.Value(0));
  const [keyboardInset] = useState(() => new Animated.Value(0));
  const amountInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const modalRootRef = useRef<View>(null);
  const keyboardVisibleRef = useRef(false);
  const switchingInputRef = useRef(false);
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
  const numericAmount = parseAmountInput(amount);
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
  }, [backdropOpacity, sheetTranslateY]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const moveFooterAboveKeyboard = (height: number, duration?: number) => {
      Animated.timing(keyboardInset, {
        toValue: -height,
        duration: duration ?? 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    const moveFooterForFrame = (
      screenY: number,
      duration?: number,
      preserveCurrentInset = false,
    ) => {
      const fallbackOverlap = Math.max(0, Dimensions.get('screen').height - screenY);
      if (fallbackOverlap > 0) setKeyboardHeight(fallbackOverlap);
      if (!modalRootRef.current) {
        if (preserveCurrentInset && fallbackOverlap <= 0) return;
        moveFooterAboveKeyboard(fallbackOverlap, duration);
        return;
      }
      modalRootRef.current.measureInWindow((_x, rootY, _width, rootHeight) => {
        const overlap = Math.max(0, rootY + rootHeight - screenY);
        if (preserveCurrentInset && overlap <= 0) return;
        moveFooterAboveKeyboard(overlap, duration);
      });
    };
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardVisibleRef.current = true;
      moveFooterForFrame(
        event.endCoordinates.screenY,
        event.duration,
        switchingInputRef.current,
      );
      switchingInputRef.current = false;
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      if (switchingInputRef.current) return;
      keyboardVisibleRef.current = false;
      moveFooterAboveKeyboard(0, event.duration ?? 220);
    });
    const frameSubscription = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillChangeFrame', (event) => {
          const preservesInputSwitch = switchingInputRef.current;
          moveFooterForFrame(
            event.endCoordinates.screenY,
            event.duration,
            preservesInputSwitch,
          );
          if (
            preservesInputSwitch &&
            Dimensions.get('screen').height - event.endCoordinates.screenY > 0
          ) {
            switchingInputRef.current = false;
          }
        })
      : null;
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      frameSubscription?.remove();
    };
  }, [keyboardInset]);

  function restoreActiveKeyboard(delay = 120) {
    setTimeout(() => {
      if (step === 'amount') amountInputRef.current?.focus();
      if (step === 'description') descriptionInputRef.current?.focus();
    }, delay);
  }

  useEffect(() => {
    if (step === 'description') {
      requestAnimationFrame(() => descriptionInputRef.current?.focus());
    } else if (step === 'amount') {
      requestAnimationFrame(() => amountInputRef.current?.focus());
    }
  }, [step]);

  useFocusEffect(
    useCallback(() => {
      if (
        step === 'category' ||
        importMenuOpen ||
        accountPickerOpen ||
        datePickerOpen
      ) {
        return undefined;
      }
      const timer = setTimeout(() => {
        if (step === 'amount') amountInputRef.current?.focus();
        if (step === 'description') descriptionInputRef.current?.focus();
      }, 180);
      return () => clearTimeout(timer);
    }, [accountPickerOpen, datePickerOpen, importMenuOpen, step]),
  );

  const sheetPanGesture = useMemo(
    () => Gesture.Pan()
      .enabled(step !== 'category' && !accountPickerOpen && !datePickerOpen)
      .activeOffsetY(4)
      .failOffsetX([-24, 24])
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onBegin(() => {
        sheetTranslateY.stopAnimation();
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
    [accountPickerOpen, closeSheet, datePickerOpen, sheetTranslateY, step],
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

  const importSheetPanGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetY(6)
      .failOffsetX([-24, 24])
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onBegin(() => {
        importSheetTranslateY.stopAnimation();
      })
      .onUpdate((event) => {
        importSheetTranslateY.setValue(Math.max(0, event.translationY));
      })
      .onEnd((event) => {
        if (event.translationY > 90 || event.velocityY > 950) {
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
            setTimeout(() => {
              if (step === 'amount') amountInputRef.current?.focus();
              if (step === 'description') descriptionInputRef.current?.focus();
            }, 120);
          });
          return;
        }
        Animated.spring(importSheetTranslateY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      }),
    [importBackdropOpacity, importSheetTranslateY, step],
  );

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
    router.replace({
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
    if (!canUseImageAi()) {
      restoreActiveKeyboard(300);
      return;
    }
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    let shouldRestoreKeyboard = true;
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
      if (!result.canceled) {
        shouldRestoreKeyboard = false;
        openImageReview(result.assets[0]);
      }
    } catch (reason) {
      await showAiError('transaction_camera_launch', reason);
    } finally {
      pickerBusy.current = false;
      if (shouldRestoreKeyboard) restoreActiveKeyboard();
    }
  }

  async function openPhotoLibrary() {
    if (!canUseImageAi()) return;
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    closeImportMenu(false);
    let shouldRestoreKeyboard = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) {
        shouldRestoreKeyboard = false;
        openImageReview(result.assets[0]);
      }
    } catch (reason) {
      await showAiError('transaction_library_launch', reason);
    } finally {
      pickerBusy.current = false;
      if (shouldRestoreKeyboard) restoreActiveKeyboard();
    }
  }

  async function openFilePicker() {
    if (pickerBusy.current) return;
    pickerBusy.current = true;
    closeImportMenu(false);
    let shouldRestoreKeyboard = true;
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
      shouldRestoreKeyboard = false;
      router.replace({
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
      if (shouldRestoreKeyboard) restoreActiveKeyboard();
    }
  }

  function closeImportMenu(restoreKeyboard = true) {
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
      if (restoreKeyboard) restoreActiveKeyboard();
    });
  }

  function openImportMenu() {
    if (pickerBusy.current) return;
    setImportMenuOpen(true);
  }

  function showDetailsStep() {
    if (numericAmount <= 0) return;
    clearError();
    switchingInputRef.current = keyboardVisibleRef.current;
    descriptionInputRef.current?.focus();
    setStep('description');
    Animated.timing(contentProgress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function showAmountStep() {
    setAccountPickerOpen(false);
    switchingInputRef.current = keyboardVisibleRef.current;
    amountInputRef.current?.focus();
    setStep('amount');
    Animated.timing(contentProgress, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function showDescriptionStep() {
    setAccountPickerOpen(false);
    switchingInputRef.current = keyboardVisibleRef.current;
    descriptionInputRef.current?.focus();
    setStep('description');
    Animated.timing(contentProgress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function showCategoryStep() {
    if (!description.trim()) return;
    setStep('category');
    Keyboard.dismiss();
  }

  async function saveTransaction() {
    const saved = await addTransaction({
      description: description.trim(),
      amount: numericAmount,
      category,
      kind,
      occurredAt: occurredAt.toISOString(),
      financialAccountId: effectiveAccountId,
    });
    if (saved) closeSheet();
  }

  return (
    <View ref={modalRootRef} style={styles.modalRoot}>
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
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>Nuova transazione</Text>
            </View>
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

          <View style={styles.keyboardBody}>
            <View style={styles.transactionContent}>
              <TransactionKindSelector
                compact
                showLabel={false}
                value={kind}
                onChange={(nextKind) => {
                  clearError();
                  setKind(nextKind);
                  setCategoryOverride(null);
                }}
              />

              <View style={styles.inputWorkspace}>
                <Animated.View
                  style={[
                    styles.animatedAmount,
                    {
                      transform: [
                        {
                          translateY: contentProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [68, 24],
                          }),
                        },
                      ],
                    },
                  ]}>
                  <AnimatedTextInput
                    ref={amountInputRef}
                    accessibilityLabel="Importo della transazione"
                    autoFocus
                    caretHidden
                    editable={step !== 'category'}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => {
                      clearError();
                      setAmount(normalizeAmountInput(value));
                    }}
                    selection={{ start: amount.length, end: amount.length }}
                    style={styles.amountCaptureInput}
                    value={amount}
                  />
                  <Animated.Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    numberOfLines={1}
                    pointerEvents="none"
                    style={[
                      styles.amountDisplay,
                      {
                        color: colors.text,
                        fontSize: contentProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [52, 27],
                        }),
                        lineHeight: contentProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [62, 34],
                        }),
                      },
                    ]}>
                    {formatAmountDisplay(amount)}
                  </Animated.Text>
                  <Animated.Text
                    pointerEvents="none"
                    style={[
                      styles.amountCurrency,
                      {
                        color: colors.text,
                        fontSize: contentProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [30, 20],
                        }),
                        lineHeight: contentProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [40, 28],
                        }),
                      },
                    ]}>€</Animated.Text>
                  {step !== 'amount' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Modifica importo"
                      onPress={showAmountStep}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                </Animated.View>

                <Animated.View
                  pointerEvents={step === 'amount' ? 'none' : 'auto'}
                  style={[
                    styles.messageComposer,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: contentProgress,
                      transform: [
                        {
                          translateX: contentProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [260, 0],
                          }),
                        },
                      ],
                    },
                  ]}>
                    <TextInput
                      ref={descriptionInputRef}
                      accessibilityLabel="Descrizione della transazione"
                      blurOnSubmit={false}
                      editable={step !== 'category'}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      multiline
                      onChangeText={(value) => {
                        clearError();
                        setDescription(value);
                      }}
                      onSubmitEditing={showCategoryStep}
                      placeholder={kind === 'income' ? 'Descrivi questa entrata…' : 'Cosa hai pagato?'}
                      placeholderTextColor={colors.textSecondary}
                      returnKeyType="next"
                      selectionColor={colors.accent}
                      submitBehavior="submit"
                      style={[styles.descriptionInput, { color: colors.text }]}
                      value={description}
                    />
                    {step === 'category' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Modifica descrizione"
                        onPress={showDescriptionStep}
                        style={styles.descriptionReturnOverlay}
                      />
                    ) : null}
                    <View style={[styles.composerMeta, { borderTopColor: colors.border }]}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setDatePickerOpen(true)}
                        style={({ pressed }) => [styles.metaButton, pressed && styles.pressed]}>
                        <Text style={[styles.metaIcon, { color: colors.accent }]}>calendar_today</Text>
                        <Text style={[styles.metaText, { color: colors.text }]}>{compactDateLabel(occurredAt)}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setAccountPickerOpen(true)}
                        style={({ pressed }) => [styles.metaButton, pressed && styles.pressed]}>
                        <Text style={[styles.metaIcon, { color: colors.accent }]}>account_balance_wallet</Text>
                        <Text numberOfLines={1} style={[styles.metaText, styles.walletText, { color: colors.text }]}>
                          {selectedAccount?.name ?? 'Automatico'}
                        </Text>
                      </Pressable>
                    </View>
                  </Animated.View>

                {insufficientCash ? (
                  <Text style={[uiStyles.error, styles.inlineError, { color: colors.negative }]}>Il portafoglio non contiene abbastanza contanti.</Text>
                ) : null}
                {error ? <Text style={[uiStyles.error, styles.inlineError, { color: colors.negative }]}>{error}</Text> : null}
              </View>
            </View>

            {step === 'category' ? (
              <View
                style={[
                  styles.categoryKeyboard,
                  {
                    height: Math.max(280, keyboardHeight),
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                  },
                ]}>
                <Text style={[styles.categoryKeyboardTitle, { color: colors.text }]}>Scegli una categoria</Text>
                <ScrollView
                  contentContainerStyle={styles.categoryGrid}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.categoryScroll}>
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
                        }}
                        style={({ pressed }) => [styles.categoryTile, pressed && styles.pressed]}>
                        <View
                          style={[
                            styles.categoryIconCircle,
                            { backgroundColor: selected ? colors.accent : colors.accentSoft },
                          ]}>
                          <Text style={[styles.categoryGridIcon, { color: selected ? '#FFFFFF' : colors.accent }]}>
                            {categoryIcon(option)}
                          </Text>
                        </View>
                        <Text
                          numberOfLines={2}
                          style={[styles.categoryTileLabel, { color: selected ? colors.accent : colors.text }]}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={[styles.categoryFooter, { paddingBottom: Math.max(10, insets.bottom) }]}>
                  <PrimaryButton
                    disabled={!description.trim() || insufficientCash}
                    loading={saving}
                    onPress={() => void saveTransaction()}>
                    Aggiungi {kind === 'income' ? 'entrata' : 'uscita'}
                  </PrimaryButton>
                </View>
              </View>
            ) : (
              <Animated.View
                style={[
                  styles.formFooter,
                  {
                    backgroundColor: colors.background,
                    transform: [{ translateY: keyboardInset }],
                  },
                ]}>
                {step === 'amount' ? (
                  <PrimaryButton disabled={numericAmount <= 0} onPress={showDetailsStep}>Continua</PrimaryButton>
                ) : null}
                <View style={styles.aiOptions}>
                  {([
                    {
                      id: 'scan',
                      label: 'Scan',
                      icon: 'document_scanner',
                      action: () => void openCamera(),
                    },
                    {
                      id: 'import',
                      label: 'Importa',
                      icon: 'upload_file',
                      action: openImportMenu,
                    },
                  ] as const).map((option) => (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      onPress={option.action}
                      style={({ pressed }) => [styles.aiOption, pressed && styles.pressed]}>
                      <LinearGradient
                        colors={isDark ? ['#9A82FF', '#42C8D7', '#D778B7'] : ['#8068E8', '#22AFC1', '#CF6AAE']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.aiOptionOutline}>
                        <View style={[styles.aiOptionInner, { backgroundColor: colors.background }]}>
                          <Text style={[styles.aiOptionIcon, { color: colors.accent }]}>{option.icon}</Text>
                          <Text style={[styles.aiOptionText, { color: colors.text }]}>{option.label}</Text>
                          {option.id === 'scan' && planTier === 'free' ? (
                            <Text style={[styles.aiProLabel, { color: colors.accent }]}>PRO</Text>
                          ) : null}
                        </View>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}
          </View>

          {accountPickerOpen ? (
            <View style={styles.categoryPopoverLayer}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setAccountPickerOpen(false)} />
              <View style={[styles.accountPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.categoryPopoverTitle, { color: colors.text }]}>Scegli il conto</Text>
                {[null, ...manualAccounts].map((option) => {
                  const optionId = option?.id ?? null;
                  const selected = effectiveAccountId === optionId;
                  return (
                    <Pressable
                      key={optionId ?? 'automatic'}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setSelectedAccountId(optionId);
                        setAccountPickerOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.accountOption,
                        selected && { backgroundColor: colors.accentSoft },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.metaIcon, { color: colors.accent }]}>account_balance_wallet</Text>
                      <Text style={[styles.accountOptionText, { color: colors.text }]}>{option?.name ?? 'Automatico'}</Text>
                      {selected ? <Text style={[styles.optionCheck, { color: colors.accent }]}>check</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>

      {datePickerOpen && Platform.OS === 'android' ? (
        <DateTimePicker
          value={occurredAt}
          mode="date"
          display="default"
          presentation="dialog"
          maximumDate={new Date()}
          accentColor={colors.accent}
          positiveButton={{ label: 'Conferma' }}
          negativeButton={{ label: 'Annulla' }}
          onValueChange={(_event, date) => {
            setOccurredAt(preserveTransactionTime(date, occurredAt));
            setDatePickerOpen(false);
          }}
          onDismiss={() => setDatePickerOpen(false)}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={datePickerOpen}
          transparent
          animationType="fade"
          presentationStyle="overFullScreen"
          onRequestClose={() => setDatePickerOpen(false)}>
          <View style={styles.dateOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDatePickerOpen(false)} />
            <View style={[styles.dateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.dateHeader}>
                <Text style={[styles.dateTitle, { color: colors.text }]}>Scegli la data</Text>
                <Pressable onPress={() => setDatePickerOpen(false)}>
                  <Text style={[styles.dateDone, { color: colors.accent }]}>Fatto</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={occurredAt}
                mode="date"
                display="inline"
                locale="it_IT"
                maximumDate={new Date()}
                accentColor={colors.accent}
                themeVariant={isDark ? 'dark' : 'light'}
                onValueChange={(_event, date) => setOccurredAt(preserveTransactionTime(date, occurredAt))}
                style={styles.datePicker}
              />
            </View>
          </View>
        </Modal>
      ) : null}
      {importMenuOpen ? (
        <View style={styles.importOverlay}>
          <Animated.View
            style={[styles.importBackdrop, { opacity: importBackdropOpacity }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi menu importazione"
              style={StyleSheet.absoluteFill}
              onPress={() => closeImportMenu()}
            />
          </Animated.View>
          <GestureDetector gesture={importSheetPanGesture}>
            <Animated.View
              style={[
                styles.importSheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  transform: [
                    { translateY: keyboardInset },
                    { translateY: importSheetTranslateY },
                  ],
                },
              ]}>
            <View
              pointerEvents="none"
              style={[
                styles.importKeyboardExtension,
                {
                  height: keyboardHeight + 4,
                  bottom: -(keyboardHeight + 2),
                  backgroundColor: colors.surface,
                },
              ]}
            />
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
          </GestureDetector>
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
    height: '90%',
    overflow: 'hidden',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingHorizontal: 20,
  },
  keyboardBody: { flex: 1 },
  transactionContent: {
    flex: 1,
    minHeight: 0,
  },
  inputWorkspace: {
    flex: 1,
    minHeight: 126,
    position: 'relative',
  },
  animatedAmount: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  amountCaptureInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    color: 'transparent',
    opacity: 0.01,
  },
  amountDisplay: {
    maxWidth: '82%',
    fontFamily: font.dataMedium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  amountCurrency: {
    fontFamily: font.dataMedium,
    marginLeft: 6,
  },
  messageComposer: {
    position: 'absolute',
    top: 84,
    right: 0,
    left: 0,
    minHeight: 126,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  descriptionReturnOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 78,
    zIndex: 2,
  },
  descriptionInput: {
    minHeight: 78,
    maxHeight: 104,
    paddingTop: 15,
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  composerMeta: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaButton: {
    minWidth: 0,
    maxWidth: '56%',
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  metaText: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  walletText: { flexShrink: 1 },
  inlineError: { position: 'absolute', top: 198, right: 0, left: 0 },
  formFooter: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  categoryKeyboard: {
    marginHorizontal: -20,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  categoryKeyboardTitle: {
    fontFamily: font.displaySemiBold,
    fontSize: 17,
    lineHeight: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  categoryScroll: { flex: 1 },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  categoryTile: {
    width: '31.5%',
    minHeight: 92,
    alignItems: 'center',
    paddingHorizontal: 3,
    paddingVertical: 5,
  },
  categoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  categoryGridIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  categoryTileLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  categoryFooter: {
    paddingTop: 6,
  },
  header: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitleGroup: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  backButton: {
    width: 34,
    height: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 22,
    lineHeight: 25,
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
  headerTitle: { flexShrink: 1, fontFamily: font.displaySemiBold, fontSize: 22, lineHeight: 28 },
  aiOptions: { marginTop: 8, flexDirection: 'row', gap: 9 },
  aiOption: {
    flex: 1,
    borderRadius: 12,
  },
  aiOptionOutline: { borderRadius: 12, padding: 1.25 },
  aiOptionInner: {
    minHeight: 43,
    borderRadius: 10.75,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  aiOptionIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  aiOptionText: { fontFamily: font.bodySemiBold, fontSize: 11 },
  aiProLabel: { fontFamily: font.dataMedium, fontSize: 8, letterSpacing: 0.5 },
  importOverlay: { ...StyleSheet.absoluteFill, zIndex: 100, justifyContent: 'flex-end' },
  importBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4, 12, 9, 0.42)' },
  importSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  importKeyboardExtension: {
    position: 'absolute',
    right: -1,
    left: -1,
  },
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
  accountPicker: {
    width: '100%',
    maxHeight: '70%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  accountOption: {
    minHeight: 48,
    borderRadius: 11,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountOptionText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13 },
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
  dateOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(4, 12, 9, 0.4)',
  },
  dateCard: { borderRadius: 22, borderWidth: 1, padding: 16 },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dateTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  dateDone: { fontFamily: font.bodySemiBold, fontSize: 14, padding: 6 },
  datePicker: { minHeight: 330 },
  pressed: { opacity: 0.68 },
});
