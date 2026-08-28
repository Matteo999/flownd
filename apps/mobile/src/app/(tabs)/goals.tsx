import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Easing,
  type GestureResponderEvent,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  Card,
  Field,
  PageHeader,
  PrimaryButton,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { AppHeaderActions } from '@/components/app-header-actions';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { financialCycleForDate } from '@/lib/financial-cycle';
import type { Goal } from '@/lib/goals';
import { formatDateItalian, formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

const goalColors = [
  '#18A8D8',
  '#7C5CFC',
  '#FF6685',
  '#FFB020',
  '#20C58A',
  '#E85AAD',
  '#3D8BFF',
];
const DRAG_BUBBLE_RADIUS = 26;
const DRAG_BUBBLE_LIFT = 48;

function goalColorAt(index: number) {
  return goalColors[index] ?? `hsl(${(index * 137.5) % 360}, 72%, 55%)`;
}

function triggerDragStartHaptic() {
  return Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Drag_Start)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
}

function triggerDropHaptic() {
  return Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
    : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export default function GoalsScreen() {
  const { colors } = useFlowndTheme();
  const insets = useSafeAreaInsets();
  const {
    goals,
    completedGoals,
    loans,
    amountsVisible,
    saving,
    deleteGoal,
    goalContributions,
    budgetCycleStartDay,
    transactions,
    transferFreeSavingsToGoal,
  } = useApp();
  const [completedOpen, setCompletedOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferGoalId, setTransferGoalId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [dragPosition] = useState(() => new Animated.ValueXY());
  const [dragScale] = useState(() => new Animated.Value(0.72));
  const [sheetTranslateY] = useState(() => new Animated.Value(720));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [keyboardLift] = useState(() => new Animated.Value(0));
  const goalCardRefs = useRef(new Map<string, View | null>());
  const freeSavings = goals.find((goal) => goal.status === 'free_savings');
  const orderedGoals = goals
    .filter((goal) => goal.status !== 'free_savings')
    .sort((first, second) => first.priority - second.priority);
  const targetGoalCount = orderedGoals.length;
  const monthlyLoanTotal = loans.reduce(
    (sum, loan) => sum + loan.monthlyPayment,
    0,
  );
  const currentCycle = financialCycleForDate(
    new Date(),
    budgetCycleStartDay,
    transactions,
  );
  const currentCycleContributions = goalContributions.reduce(
    (totals, contribution) => {
      const occurredAt = new Date(contribution.createdAt);
      if (
        contribution.goalId &&
        occurredAt >= currentCycle.start &&
        occurredAt < currentCycle.end
      ) {
        totals.set(
          contribution.goalId,
          (totals.get(contribution.goalId) ?? 0) + contribution.amount,
        );
      }
      return totals;
    },
    new Map<string, number>(),
  );
  const transferTargets = orderedGoals.filter(
    (goal) => goal.savedAmount < goal.targetAmount,
  );
  const selectedTransferGoal = transferTargets.find(
    (goal) => goal.id === transferGoalId,
  );
  const parsedTransferAmount = Number(transferAmount.replace(',', '.')) || 0;
  const maxTransferAmount = Math.min(
    freeSavings?.savedAmount ?? 0,
    selectedTransferGoal
      ? Math.max(
          0,
          selectedTransferGoal.targetAmount - selectedTransferGoal.savedAmount,
        )
      : 0,
  );
  const transferValid =
    Boolean(selectedTransferGoal) &&
    parsedTransferAmount > 0 &&
    parsedTransferAmount <= maxTransferAmount;

  const closeTransfer = useCallback(() => {
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
    ]).start(() => setTransferOpen(false));
  }, [backdropOpacity, sheetTranslateY]);

  useEffect(() => {
    if (!transferOpen) return;
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
  }, [backdropOpacity, keyboardLift, sheetTranslateY, transferOpen]);

  useEffect(() => {
    if (!transferOpen) return;
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
  }, [keyboardLift, transferOpen]);

  const transferSheetGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetY(8)
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
          closeTransfer();
          return;
        }
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      })
      .onFinalize((_event, succeeded) => {
        if (succeeded) return;
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }),
    [closeTransfer, sheetTranslateY],
  );

  function openTransfer(goalId = '') {
    if (!freeSavings || freeSavings.savedAmount <= 0) {
      Alert.alert(
        'Risparmio libero vuoto',
        'Quando ci sarà denaro disponibile potrai spostarlo in un obiettivo.',
      );
      return;
    }
    if (!transferTargets.length) {
      Alert.alert(
        'Nessun obiettivo disponibile',
        'Crea un nuovo obiettivo o modifica il target di uno esistente.',
      );
      return;
    }
    setTransferGoalId(goalId);
    setTransferAmount('');
    setTransferOpen(true);
  }

  function findDropTarget(pageX: number, pageY: number) {
    void Promise.all(
      transferTargets.map(
        (goal) =>
          new Promise<string | null>((resolve) => {
            const node = goalCardRefs.current.get(goal.id);
            if (!node) return resolve(null);
            node.measureInWindow((x, y, width, height) => {
              resolve(
                pageX >= x &&
                  pageX <= x + width &&
                  pageY >= y &&
                  pageY <= y + height
                  ? goal.id
                  : null,
              );
            });
          }),
      ),
    ).then((matches) => {
      const goalId = matches.find(Boolean);
      if (goalId) {
        void triggerDropHaptic();
        openTransfer(goalId);
      }
    });
  }

  function confirmCompletedGoalDeletion(goal: Goal) {
    const amountToRestore = currentCycleContributions.get(goal.id) ?? 0;
    const restorationCopy = amountToRestore > 0 && amountsVisible
      ? `${formatEuro(amountToRestore)} torneranno disponibili nella quota risparmi del ciclo corrente.`
      : 'Gli accantonamenti del ciclo corrente torneranno disponibili.';
    Alert.alert(
      'Eliminare l’obiettivo completato?',
      `“${goal.name}” verrà rimosso dall’archivio. ${restorationCopy} Quelli dei cicli precedenti resteranno nello storico.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            void deleteGoal(goal.id);
          },
        },
      ],
    );
  }

  return (
    <Screen
      scrollEnabled={!dragActive}
      floatingActionPosition="free"
      floatingAction={dragActive ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragBubble,
            {
              backgroundColor: colors.accent,
              transform: [
                { translateX: dragPosition.x },
                { translateY: dragPosition.y },
                { scale: dragScale },
              ],
            },
          ]}>
          <Text style={styles.dragBubbleIcon}>savings</Text>
        </Animated.View>
      ) : null}>
      <PageHeader
        title="Obiettivi"
        action={
          <AppHeaderActions
            leading={
              <Pressable
                accessibilityLabel="Gestisci allocazione"
                accessibilityRole="button"
                onPress={() => router.push('/goal-settings' as Href)}
                style={({ pressed }) => [
                  styles.headerAction,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.materialIcon, { color: colors.text }]}>tune</Text>
              </Pressable>
            }
          />
        }
      />

      {freeSavings ? (
        <View style={styles.freeSavingsSection}>
          <SavingsDragSource
            onDragStart={(pageX, pageY) => {
              dragPosition.setValue({
                x: pageX - DRAG_BUBBLE_RADIUS,
                y: pageY - DRAG_BUBBLE_RADIUS - DRAG_BUBBLE_LIFT,
              });
              dragScale.setValue(0.72);
              setDragActive(true);
              Animated.spring(dragScale, {
                toValue: 1,
                speed: 28,
                bounciness: 7,
                useNativeDriver: true,
              }).start();
            }}
            onDragMove={(pageX, pageY) => {
              dragPosition.setValue({
                x: pageX - DRAG_BUBBLE_RADIUS,
                y: pageY - DRAG_BUBBLE_RADIUS - DRAG_BUBBLE_LIFT,
              });
            }}
            onDrop={findDropTarget}
            onDragEnd={() => setDragActive(false)}
            onPress={() =>
              router.push(
                `/goal-detail?goalId=${encodeURIComponent(freeSavings.id)}` as Href,
              )
            }>
            <GoalCard
              goal={freeSavings}
              amountsVisible={amountsVisible}
              color={colors.accent}
              interactive={false}
              onPress={() =>
                router.push(
                  `/goal-detail?goalId=${encodeURIComponent(freeSavings.id)}` as Href,
                )
              }
              onTransfer={() => openTransfer()}
            />
          </SavingsDragSource>
          <Text style={[styles.dragHint, { color: colors.textSecondary }]}>
            Tieni premuto e trascina la card su un obiettivo per spostare denaro.
          </Text>
        </View>
      ) : null}

      <Modal
        visible={transferOpen}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={closeTransfer}>
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
            <Pressable
              accessibilityLabel="Chiudi trasferimento"
              style={StyleSheet.absoluteFill}
              onPress={closeTransfer}
            />
          </Animated.View>
          <GestureDetector gesture={transferSheetGesture}>
            <Animated.View
              style={[
                styles.transferModal,
                {
                  backgroundColor: colors.surface,
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
                style={[
                  styles.keyboardBackgroundExtension,
                  { backgroundColor: colors.surface },
                ]}
              />
              <View style={styles.sheetHandle} />
              <View style={styles.transferContent}>
                <View style={styles.transferHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Chiudi"
                    onPress={closeTransfer}
                    style={[
                      styles.modalClose,
                      { backgroundColor: colors.sunken },
                    ]}>
                    <Text style={[styles.materialIcon, { color: colors.text }]}>close</Text>
                  </Pressable>
                  <Text style={[styles.transferTitle, { color: colors.text }]}>
                    Sposta denaro
                  </Text>
                  <View style={styles.modalHeaderSpacer} />
                </View>

                <Text style={[styles.modalLabel, { color: colors.text }]}>Verso</Text>
                <View style={styles.goalChoices}>
                  {transferTargets.map((goal) => {
                    const selected = goal.id === transferGoalId;
                    return (
                      <Pressable
                        key={goal.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setTransferGoalId(goal.id);
                          setTransferAmount('');
                        }}
                        style={({ pressed }) => [
                          styles.goalChoice,
                          {
                            backgroundColor: selected
                              ? colors.accentSoft
                              : colors.sunken,
                            borderColor: selected ? colors.accent : colors.border,
                          },
                          pressed && styles.pressed,
                        ]}>
                        <View
                          style={[
                            styles.goalChoiceDot,
                            {
                              backgroundColor: goalColorAt(
                                orderedGoals.findIndex((item) => item.id === goal.id),
                              ),
                            },
                          ]}
                        />
                        <Text style={[styles.goalChoiceText, { color: colors.text }]}>
                          {goal.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Field
                  label="Importo"
                  placeholder="0,00"
                  suffix="€"
                  keyboardType="decimal-pad"
                  enterKeyHint="done"
                  inputAccessoryViewButtonLabel="Fine"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  value={transferAmount}
                  onChangeText={setTransferAmount}
                />
                {selectedTransferGoal ? (
                  <Text style={[styles.transferLimit, { color: colors.textSecondary }]}>
                    Massimo {amountsVisible ? formatEuro(maxTransferAmount) : HIDDEN_AMOUNT}
                  </Text>
                ) : null}
              </View>
              <View style={styles.transferFooter}>
                <PrimaryButton
                  disabled={!transferValid}
                  loading={saving}
                  onPress={async () => {
                    if (!selectedTransferGoal) return;
                    const transferred = await transferFreeSavingsToGoal(
                      parsedTransferAmount,
                      selectedTransferGoal.id,
                    );
                    if (transferred) closeTransfer();
                  }}>
                  Sposta denaro
                </PrimaryButton>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </Modal>

      <View style={styles.listHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>I tuoi obiettivi</Text>
          <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}> 
            {targetGoalCount === 1
              ? '1 obiettivo attivo'
              : `${targetGoalCount} obiettivi attivi`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Aggiungi obiettivo"
          accessibilityRole="button"
          onPress={() => router.push('/add-goal' as Href)}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.accent },
            pressed && styles.pressed,
          ]}>
          <Text style={styles.addIcon}>add</Text>
        </Pressable>
      </View>

      {orderedGoals.length ? (
        <View style={styles.list}>
          {orderedGoals.map((goal, index) => (
            <View
              key={goal.id}
              ref={(node) => {
                goalCardRefs.current.set(goal.id, node);
              }}>
              <GoalCard
                goal={goal}
                amountsVisible={amountsVisible}
                color={goalColorAt(index)}
                onPress={() =>
                  router.push(
                    `/goal-detail?goalId=${encodeURIComponent(goal.id)}` as Href,
                  )
                }
              />
            </View>
          ))}
        </View>
      ) : (
        <Card style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}> 
            Il prossimo traguardo parte da qui.
          </Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Crea un obiettivo e assegna la tua quota mensile di risparmio.
          </Text>
          <View style={styles.emptyAction}>
            <PrimaryButton onPress={() => router.push('/add-goal' as Href)}>
              Crea il primo obiettivo
            </PrimaryButton>
          </View>
        </Card>
      )}

      {completedGoals.length ? (
        <View style={styles.completedSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: completedOpen }}
            accessibilityLabel={
              completedOpen
                ? 'Nascondi obiettivi completati'
                : 'Mostra obiettivi completati'
            }
            onPress={() => setCompletedOpen((current) => !current)}
            style={({ pressed }) => [
              styles.completedToggle,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}>
            <View
              style={[
                styles.completedToggleIcon,
                { backgroundColor: colors.accentSoft },
              ]}>
              <Text style={[styles.materialIcon, { color: colors.accent }]}>done</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.completedTitle, { color: colors.text }]}>
                Obiettivi completati
              </Text>
              <Text
                style={[styles.completedCaption, { color: colors.textSecondary }]}>
                {completedGoals.length === 1
                  ? '1 obiettivo archiviato'
                  : `${completedGoals.length} obiettivi archiviati`}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textSecondary }]}>
              {completedOpen ? 'expand_less' : 'expand_more'}
            </Text>
          </Pressable>

          {completedOpen ? (
            <View style={styles.completedList}>
              {completedGoals.map((goal) => (
                <Card key={goal.id} style={styles.completedCard}>
                  <View style={styles.completedGoalIcon}>
                    <Text style={[styles.materialIcon, { color: colors.positive }]}>
                      check_circle
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.completedGoalName, { color: colors.text }]}>
                      {goal.name}
                    </Text>
                    <Text
                      style={[
                        styles.completedGoalAmount,
                        { color: colors.textSecondary },
                      ]}>
                      {(currentCycleContributions.get(goal.id) ?? 0) > 0
                        ? amountsVisible
                          ? `${formatEuro(currentCycleContributions.get(goal.id) ?? 0)} da ripristinare nel ciclo corrente`
                          : `${HIDDEN_AMOUNT} da ripristinare nel ciclo corrente`
                        : amountsVisible
                          ? `${formatEuro(goal.savedAmount)} accantonati nello storico`
                          : `${HIDDEN_AMOUNT} accantonati nello storico`}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina ${goal.name}`}
                    disabled={saving}
                    hitSlop={8}
                    onPress={() => confirmCompletedGoalDeletion(goal)}
                    style={({ pressed }) => [
                      styles.deleteCompletedButton,
                      saving && styles.disabled,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.materialIcon, { color: colors.negative }]}>
                      delete
                    </Text>
                  </Pressable>
                </Card>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {loans.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-loan' as Href)}
          style={({ pressed }) => pressed && styles.pressed}>
          <Card style={styles.financingCard}>
            <View
              style={[styles.financingIcon, { backgroundColor: colors.sunken }]}> 
              <Text style={[styles.materialIcon, { color: colors.text }]}> 
                account_balance
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.financingTitle, { color: colors.text }]}> 
                Finanziamenti
              </Text>
              <Text style={[styles.financingCopy, { color: colors.textSecondary }]}> 
                {loans.length === 1 ? '1 finanziamento attivo' : `${loans.length} finanziamenti attivi`}
                {' · '}
                {amountsVisible ? `${formatEuro(monthlyLoanTotal)}/mese` : HIDDEN_AMOUNT}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
          </Card>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function GoalCard({
  goal,
  amountsVisible,
  color,
  onPress,
  onTransfer,
  interactive = true,
}: {
  goal: Goal;
  amountsVisible: boolean;
  color: string;
  onPress: () => void;
  onTransfer?: () => void;
  interactive?: boolean;
}) {
  const { colors } = useFlowndTheme();
  const progress = goal.targetAmount
    ? Math.min(goal.savedAmount / goal.targetAmount, 1)
    : 0;

  const content = (
    <Card style={goal.status === 'reached' ? { borderColor: color } : undefined}>
      <View style={styles.goalCardRow}>
        {goal.status === 'free_savings' ? (
          <View style={[styles.savingsIcon, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.materialIcon, { color: colors.accent }]}>savings</Text>
          </View>
        ) : (
          <GoalDonut color={color} progress={progress} trackColor={colors.sunken} />
        )}
        <View style={styles.flex}>
          <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
          {goal.status !== 'free_savings' ? (
            <Text style={[styles.goalMeta, { color: colors.textSecondary }]}>
              {goal.deadline
                ? `Scadenza ${formatDateItalian(goal.deadline) || goal.deadline}`
                : 'Nessuna scadenza'}
            </Text>
          ) : null}
          <View style={styles.amountRow}>
            <Text style={[styles.amount, { color: colors.text }]}>
              {amountsVisible ? formatEuro(goal.savedAmount) : HIDDEN_AMOUNT}
            </Text>
            {goal.status !== 'free_savings' ? (
              <Text style={[styles.target, { color: colors.textSecondary }]}>
                {amountsVisible ? `su ${formatEuro(goal.targetAmount)}` : `su ${HIDDEN_AMOUNT}`}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
      </View>
      {onTransfer ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sposta denaro dal Risparmio libero"
          onPress={(event) => {
            event.stopPropagation();
            onTransfer();
          }}
          style={({ pressed }) => [
            styles.transferButton,
            { backgroundColor: colors.accentSoft },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.materialIcon, { color: colors.accent }]}>swap_horiz</Text>
          <Text style={[styles.transferButtonText, { color: colors.accent }]}>
            Sposta denaro
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );

  if (!interactive) return content;
  return (
    <Pressable
      accessibilityLabel={`Apri ${goal.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

function GoalDonut({
  color,
  progress,
  trackColor,
}: {
  color: string;
  progress: number;
  trackColor: string;
}) {
  const size = 58;
  const center = size / 2;
  const radius = 21;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const safeProgress = Math.max(0, Math.min(progress, 1));
  const progressLength = safeProgress * circumference;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}"/><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${progressLength} ${circumference}" stroke-linecap="round" transform="rotate(-90 ${center} ${center})"/></svg>`;
  return (
    <Image
      accessibilityLabel={`${Math.round(safeProgress * 100)} per cento completato`}
      source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }}
      contentFit="contain"
      cachePolicy="none"
      style={styles.goalDonut}
    />
  );
}

function SavingsDragSource({
  children,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDrop,
  onPress,
}: {
  children: ReactNode;
  onDragStart: (pageX: number, pageY: number) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: () => void;
  onDrop: (pageX: number, pageY: number) => void;
  onPress: () => void;
}) {
  const lastPoint = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const ignorePress = useRef(false);

  function pointFromEvent(event: GestureResponderEvent) {
    return {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Risparmio libero. Tieni premuto per spostare denaro"
        cancelable={false}
        delayLongPress={380}
        pressRetentionOffset={{ top: 900, right: 320, bottom: 1400, left: 320 }}
        onPressIn={(event) => {
          const point = pointFromEvent(event);
          lastPoint.current = point;
        }}
        onLongPress={() => {
          dragging.current = true;
          ignorePress.current = true;
          const point = lastPoint.current;
          onDragStart(point.x, point.y);
          void triggerDragStartHaptic();
        }}
        onPressMove={(event) => {
          if (!dragging.current) return;
          const point = pointFromEvent(event);
          lastPoint.current = point;
          onDragMove(point.x, point.y);
        }}
        onPressOut={() => {
          if (!dragging.current) return;
          const point = lastPoint.current;
          dragging.current = false;
          onDragEnd();
          onDrop(point.x, point.y - DRAG_BUBBLE_LIFT);
        }}
        onPress={() => {
          if (ignorePress.current) {
            ignorePress.current = false;
            return;
          }
          onPress();
        }}>
        {children}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerAction: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  freeSavingsSection: { gap: 7, marginBottom: 26 },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  sectionCaption: { fontFamily: font.body, fontSize: 11, marginTop: -1 },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 23,
  },
  list: { gap: 10 },
  goalCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalDonut: { width: 58, height: 58 },
  savingsIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalName: { fontFamily: font.bodySemiBold, fontSize: 15 },
  goalMeta: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 9,
  },
  amount: { fontFamily: font.dataMedium, fontSize: 21 },
  target: { fontFamily: font.data, fontSize: 10 },
  transferButton: {
    minHeight: 39,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 13,
  },
  transferButtonText: { fontFamily: font.bodySemiBold, fontSize: 12 },
  dragHint: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: 4,
  },
  dragBubble: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    elevation: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  dragBubbleIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 24,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 14, 10, 0.5)',
  },
  transferModal: {
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
  },
  keyboardBackgroundExtension: {
    position: 'absolute',
    right: -1,
    bottom: -640,
    left: -1,
    height: 642,
  },
  transferContent: {
    gap: 13,
    paddingHorizontal: 20,
    paddingTop: 7,
    paddingBottom: 4,
  },
  transferFooter: { paddingHorizontal: 20 },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(125, 135, 130, 0.48)',
    marginBottom: 2,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  transferTitle: {
    flex: 1,
    fontFamily: font.displaySemiBold,
    fontSize: 21,
    textAlign: 'center',
  },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderSpacer: { width: 38, height: 38 },
  modalLabel: { fontFamily: font.bodyMedium, fontSize: 13 },
  goalChoices: { gap: 7 },
  goalChoice: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
  },
  goalChoiceDot: { width: 10, height: 10, borderRadius: 5 },
  goalChoiceText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 12 },
  transferLimit: { fontFamily: font.data, fontSize: 10, marginTop: -8 },
  chevron: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  empty: { alignItems: 'center', paddingVertical: 24 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  emptyCopy: { fontFamily: font.body, fontSize: 11, marginTop: 4 },
  emptyAction: { width: '100%', marginTop: 16 },
  completedSection: { marginTop: 22 },
  completedToggle: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  completedToggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  completedCaption: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  completedList: { gap: 8, marginTop: 8 },
  completedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  completedGoalIcon: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedGoalName: { fontFamily: font.bodySemiBold, fontSize: 13 },
  completedGoalAmount: { fontFamily: font.data, fontSize: 10, marginTop: 3 },
  deleteCompletedButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  financingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 22,
  },
  financingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  financingTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  financingCopy: { fontFamily: font.body, fontSize: 10, marginTop: 3 },
  pressed: { opacity: 0.7 },
});
