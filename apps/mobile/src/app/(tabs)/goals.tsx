import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { type ReactNode, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  type GestureResponderEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  '#256B7E',
  '#6D75C9',
  '#D06A61',
  '#E0A63D',
  '#45A98D',
  '#C27BAD',
  '#2F83C5',
];

function goalColorAt(index: number) {
  return goalColors[index] ?? `hsl(${(index * 137.5) % 360}, 48%, 50%)`;
}

export default function GoalsScreen() {
  const { colors } = useFlowndTheme();
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
      if (goalId) openTransfer(goalId);
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
    <Screen>
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
          <DraggableSavingsCard
            onDrop={findDropTarget}
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
          </DraggableSavingsCard>
          <Text style={[styles.dragHint, { color: colors.textSecondary }]}>
            Tieni premuto e trascina la card su un obiettivo per spostare denaro.
          </Text>
        </View>
      ) : null}

      <Modal
        visible={transferOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setTransferOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel="Chiudi trasferimento"
            style={StyleSheet.absoluteFill}
            onPress={() => setTransferOpen(false)}
          />
          <View
            style={[
              styles.transferModal,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <View style={styles.transferHeader}>
              <View style={styles.flex}>
                <Text style={[styles.transferTitle, { color: colors.text }]}>
                  Sposta denaro
                </Text>
                <Text style={[styles.transferCaption, { color: colors.textSecondary }]}>
                  Disponibili {amountsVisible && freeSavings
                    ? formatEuro(freeSavings.savedAmount)
                    : HIDDEN_AMOUNT}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Chiudi"
                onPress={() => setTransferOpen(false)}
                style={styles.modalClose}>
                <Text style={[styles.materialIcon, { color: colors.text }]}>close</Text>
              </Pressable>
            </View>

            <Text style={[styles.modalLabel, { color: colors.text }]}>Verso</Text>
            <View style={styles.goalChoices}>
              {transferTargets.map((goal, index) => {
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
              value={transferAmount}
              onChangeText={setTransferAmount}
            />
            {selectedTransferGoal ? (
              <Text style={[styles.transferLimit, { color: colors.textSecondary }]}>
                Massimo {amountsVisible ? formatEuro(maxTransferAmount) : HIDDEN_AMOUNT}
              </Text>
            ) : null}
            <PrimaryButton
              disabled={!transferValid}
              loading={saving}
              onPress={async () => {
                if (!selectedTransferGoal) return;
                const transferred = await transferFreeSavingsToGoal(
                  parsedTransferAmount,
                  selectedTransferGoal.id,
                );
                if (transferred) setTransferOpen(false);
              }}>
              Sposta denaro
            </PrimaryButton>
          </View>
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
          <GoalPie color={color} progress={progress} trackColor={colors.sunken} />
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

function GoalPie({
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
  const radius = center - 2;
  const safeProgress = Math.max(0, Math.min(progress, 1));
  const endAngle = safeProgress * Math.PI * 2 - Math.PI / 2;
  const endX = center + radius * Math.cos(endAngle);
  const endY = center + radius * Math.sin(endAngle);
  const sector = safeProgress >= 1
    ? `<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}"/>`
    : safeProgress > 0
      ? `<path d="M ${center} ${center} L ${center} 2 A ${radius} ${radius} 0 ${safeProgress > 0.5 ? 1 : 0} 1 ${endX} ${endY} Z" fill="${color}"/>`
      : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="${trackColor}"/>${sector}<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/></svg>`;
  return (
    <Image
      accessibilityLabel={`${Math.round(safeProgress * 100)} per cento completato`}
      source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }}
      contentFit="contain"
      cachePolicy="none"
      style={styles.goalPie}
    />
  );
}

function DraggableSavingsCard({
  children,
  onDrop,
  onPress,
}: {
  children: ReactNode;
  onDrop: (pageX: number, pageY: number) => void;
  onPress: () => void;
}) {
  const [translation] = useState(() => new Animated.ValueXY());
  const origin = useRef({ x: 0, y: 0 });
  const lastPoint = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const ignorePress = useRef(false);
  const [dragActive, setDragActive] = useState(false);

  function pointFromEvent(event: GestureResponderEvent) {
    return {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  }

  return (
    <Animated.View
      style={[
        dragActive && styles.draggingCard,
        {
          transform: [
            { translateX: translation.x },
            { translateY: translation.y },
            { scale: dragActive ? 1.025 : 1 },
          ],
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Risparmio libero. Tieni premuto per spostare denaro"
        cancelable={false}
        delayLongPress={380}
        pressRetentionOffset={{ top: 900, right: 320, bottom: 1400, left: 320 }}
        onPressIn={(event) => {
          const point = pointFromEvent(event);
          origin.current = point;
          lastPoint.current = point;
        }}
        onLongPress={() => {
          dragging.current = true;
          ignorePress.current = true;
          setDragActive(true);
        }}
        onPressMove={(event) => {
          if (!dragging.current) return;
          const point = pointFromEvent(event);
          lastPoint.current = point;
          translation.setValue({
            x: point.x - origin.current.x,
            y: point.y - origin.current.y,
          });
        }}
        onPressOut={() => {
          if (!dragging.current) return;
          const point = lastPoint.current;
          dragging.current = false;
          setDragActive(false);
          Animated.spring(translation, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
          onDrop(point.x, point.y);
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
    </Animated.View>
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
  goalPie: { width: 58, height: 58 },
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
  draggingCard: {
    zIndex: 50,
    elevation: 20,
    opacity: 0.94,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(5, 14, 10, 0.5)',
  },
  transferModal: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 13,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transferTitle: { fontFamily: font.displaySemiBold, fontSize: 21 },
  transferCaption: { fontFamily: font.body, fontSize: 11, marginTop: 2 },
  modalClose: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
