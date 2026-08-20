import { Slider } from '@expo/ui/community/slider';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Redirect, router, Stack, type Href, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { GoalDateField } from '@/components/goal-date-field';
import {
  Card,
  Field,
  GradientButton,
  PrimaryButton,
  ProgressHeader,
  Screen,
  SecondaryButton,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import {
  BudgetAllocation,
  categorizeExpense,
  createBudgetCategories,
  formatEuro,
  incomeBands,
  monthsUntil,
} from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

type AllocationKey = keyof BudgetAllocation;

function formatGroupedInteger(value: string | number) {
  const digits = String(value).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function OnboardingScreen() {
  const { resume, transition } = useLocalSearchParams<{
    resume?: string;
    transition?: string;
  }>();
  const resumeSummary = resume === '1';
  return (
    <>
      <Stack.Screen
        options={
          transition === 'back'
            ? {
                animation: 'slide_from_left',
                animationTypeForReplace: 'pop',
              }
            : {
                animation: 'slide_from_right',
                animationTypeForReplace: 'push',
              }
        }
      />
      <OnboardingFlow
        key={resumeSummary ? 'summary' : 'onboarding'}
        resumeSummary={resumeSummary}
      />
    </>
  );
}

function OnboardingFlow({ resumeSummary }: { resumeSummary: boolean }) {
  const { colors, isDark } = useFlowndTheme();
  const {
    session,
    saving,
    onboardingComplete,
    draft,
    error,
    updateDraft,
    completeOnboarding,
    clearError,
  } = useApp();
  const [step, setStep] = useState(() => (resumeSummary ? 6 : 1));
  const [targetInput, setTargetInput] = useState(() =>
    formatGroupedInteger(draft.goal.targetAmount),
  );
  const lastEditedAllocation = useRef<AllocationKey | null>(null);
  const activeBalanceAllocation = useRef<AllocationKey>('wants');
  const previousBalanceAllocation = useRef<AllocationKey>('wants');

  const category = useMemo(
    () => categorizeExpense(draft.expense.description),
    [draft.expense.description],
  );
  const activeStep = step;
  const savingsCapacity = Math.round(
    (draft.monthlyReference * draft.allocation.savings) / 100,
  );
  const monthlyContribution =
    draft.goal.targetAmount / monthsUntil(draft.goal.deadline);
  const goalCompatible = monthlyContribution <= savingsCapacity;
  const expenseSkipped =
    !draft.expense.description.trim() || draft.expense.amount <= 0;

  function next() {
    clearError();
    setStep((current) => Math.min(6, current + 1));
  }

  function back() {
    clearError();
    setStep((current) => Math.max(1, current - 1));
  }

  function selectIncomeBand(id: (typeof incomeBands)[number]['id']) {
    const band = incomeBands.find((item) => item.id === id);
    if (!band) return;
    updateDraft({
      incomeBand: band.id,
      monthlyReference: band.monthlyReference,
      budgets: createBudgetCategories(band.monthlyReference, draft.allocation),
    });
  }

  function beginAllocationChange(key: AllocationKey) {
    const keys: AllocationKey[] = ['needs', 'wants', 'savings'];
    const previous = lastEditedAllocation.current;
    const balance =
      previous === key
        ? previousBalanceAllocation.current
        : keys.find((candidate) => candidate !== key && candidate !== previous) ??
          keys.find((candidate) => candidate !== key) ??
          'savings';
    activeBalanceAllocation.current = balance;
  }

  function changeAllocation(key: AllocationKey, rawValue: number) {
    const balanceKey = activeBalanceAllocation.current;
    const fixedKey = (['needs', 'wants', 'savings'] as AllocationKey[]).find(
      (candidate) => candidate !== key && candidate !== balanceKey,
    )!;
    const fixedValue = draft.allocation[fixedKey];
    const minimum = Math.max(5, 100 - fixedValue - 90);
    const maximum = Math.min(90, 100 - fixedValue - 5);
    const value = Math.round(Math.max(minimum, Math.min(maximum, rawValue)));
    const allocation = {
      ...draft.allocation,
      [key]: value,
      [balanceKey]: 100 - fixedValue - value,
    };
    updateDraft({
      allocation,
      budgets: createBudgetCategories(draft.monthlyReference, allocation),
    });
  }

  function endAllocationChange(key: AllocationKey) {
    lastEditedAllocation.current = key;
    previousBalanceAllocation.current = activeBalanceAllocation.current;
  }

  if (onboardingComplete) {
    return <Redirect href={'/dashboard' as Href} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {activeStep === 1 ? (
        <Welcome
          onNext={next}
          onLogin={() => router.push('/login' as Href)}
        />
      ) : (
        <Screen>
          <ProgressHeader
            step={activeStep}
            total={6}
            showCount={false}
            title="IL TUO PERCORSO"
            onBack={
              activeStep > 1 && activeStep <= 6 ? back : undefined
            }
          />

          {activeStep === 2 ? (
            <>
              <Text style={[uiStyles.title, { color: colors.text }]}>
                Disponibilità mensile
              </Text>
              <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
                Qual è la tua fascia di disponibilità mensile?
              </Text>
              <Text style={[styles.microcopy, { color: colors.textSecondary }]}>
                Serve solo per una prima stima. Quando inserirai i tuoi redditi,
                Flownd renderà i calcoli precisi.
              </Text>

              <View style={styles.bandGrid}>
                {incomeBands.map((band) => {
                  const selected = draft.incomeBand === band.id;
                  return (
                    <Pressable
                      key={band.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => selectIncomeBand(band.id)}
                      style={({ pressed }) => [
                        styles.band,
                        {
                          backgroundColor: selected
                            ? colors.accentSoft
                            : colors.surface,
                          borderColor: selected
                            ? colors.accent
                            : colors.border,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <Text
                        style={[
                          styles.bandText,
                          { color: selected ? colors.accent : colors.text },
                        ]}>
                        {band.shortLabel}
                      </Text>
                      {selected ? (
                        <Text style={[styles.bandCheck, { color: colors.accent }]}>
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <PrimaryButton onPress={next} disabled={!draft.incomeBand}>
                Continua
              </PrimaryButton>
            </>
          ) : null}

          {activeStep === 3 ? (
            <>
              <Text style={[uiStyles.title, { color: colors.text }]}>
                Il tuo budget
              </Text>
              <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
                Parti dal metodo 50/30/20 e personalizzalo. Il totale resta
                sempre al 100%.
              </Text>
              <Text style={[styles.microcopy, { color: colors.textSecondary }]}>
                Se modifichi una voce, Flownd riequilibra automaticamente
                l’ultima categoria non toccata.
              </Text>

              <View style={styles.glassStage}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.glassGlow,
                    styles.glassGlowTop,
                    { backgroundColor: colors.accentSoft },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.glassGlow,
                    styles.glassGlowBottom,
                    { backgroundColor: colors.positiveSoft },
                  ]}
                />
                <View style={styles.sliderList}>
                  <AllocationSlider
                    icon="home"
                    label="Necessità"
                    value={draft.allocation.needs}
                    amount={(draft.monthlyReference * draft.allocation.needs) / 100}
                    onChange={(value) => changeAllocation('needs', value)}
                    onStart={() => beginAllocationChange('needs')}
                    onEnd={() => endAllocationChange('needs')}
                  />
                  <AllocationSlider
                    icon="luggage"
                    label="Desideri"
                    value={draft.allocation.wants}
                    amount={(draft.monthlyReference * draft.allocation.wants) / 100}
                    onChange={(value) => changeAllocation('wants', value)}
                    onStart={() => beginAllocationChange('wants')}
                    onEnd={() => endAllocationChange('wants')}
                  />
                  <AllocationSlider
                    icon="savings"
                    label="Risparmi"
                    value={draft.allocation.savings}
                    amount={(draft.monthlyReference * draft.allocation.savings) / 100}
                    onChange={(value) => changeAllocation('savings', value)}
                    onStart={() => beginAllocationChange('savings')}
                    onEnd={() => endAllocationChange('savings')}
                  />
                </View>
              </View>

              <PrimaryButton onPress={next}>Continua</PrimaryButton>
            </>
          ) : null}

          {activeStep === 4 ? (
            <>
              <Text style={[uiStyles.title, { color: colors.text }]}>
                Crea il tuo obiettivo
              </Text>
              <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
                Dai forma a un traguardo concreto. Ti diciamo subito se è
                sostenibile per il budget appena impostato.
              </Text>
              <Field
                label="Nome dell’obiettivo"
                value={draft.goal.name}
                onChangeText={(name) =>
                  updateDraft({ goal: { ...draft.goal, name } })
                }
              />
              <Field
                label="Importo target"
                value={targetInput}
                suffix="€"
                keyboardType="number-pad"
                onChangeText={(value) => {
                  const formatted = formatGroupedInteger(value);
                  setTargetInput(formatted);
                  updateDraft({
                    goal: {
                      ...draft.goal,
                      targetAmount: Number(formatted.replace(/\D/g, '')) || 0,
                    },
                  });
                }}
              />
              <GoalDateField
                value={draft.goal.deadline}
                onChange={(deadline) =>
                  updateDraft({ goal: { ...draft.goal, deadline } })
                }
              />

              {draft.goal.targetAmount > 0 ? (
                <Card
                  style={[
                    styles.sustainabilityCard,
                    {
                      backgroundColor: goalCompatible
                        ? colors.positiveSoft
                        : colors.warningSoft,
                      borderColor: goalCompatible
                        ? colors.positive
                        : colors.warning,
                    },
                  ]}>
                  <View
                    style={[
                      styles.statusIcon,
                      {
                        backgroundColor: goalCompatible
                          ? colors.positive
                          : colors.warning,
                      },
                    ]}>
                    <Text style={styles.statusIconText}>
                      {goalCompatible ? '✓' : '!'}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.estimate,
                        {
                          color: goalCompatible
                            ? colors.positive
                            : colors.warning,
                        },
                      ]}>
                      {formatEuro(monthlyContribution)} al mese
                    </Text>
                    <Text style={[styles.statusCopy, { color: colors.text }]}>
                      {goalCompatible
                        ? 'Ottimo! Questo importo rientra comodamente nella tua quota “Risparmi” mensile stimata di '
                        : 'Questo piano supera la tua quota “Risparmi” mensile stimata di '}
                      <Text style={styles.strong}>
                        {formatEuro(savingsCapacity)}
                      </Text>
                      {goalCompatible
                        ? '. Il tuo piano è sostenibile.'
                        : '. Prova ad allungare la scadenza o ridurre il target.'}
                    </Text>
                  </View>
                </Card>
              ) : null}

              <PrimaryButton
                onPress={next}
                disabled={
                  !draft.goal.name.trim() || draft.goal.targetAmount <= 0
                }>
                Crea il mio obiettivo
              </PrimaryButton>
            </>
          ) : null}

          {activeStep === 5 ? (
            <>
              <Text style={[uiStyles.title, { color: colors.text }]}>
                Registra la prima spesa
              </Text>
              <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
                Prova subito Flownd: descrivi una spesa e la categoria verrà
                riconosciuta automaticamente.
              </Text>
              <Field
                label="Descrizione"
                placeholder="es. spesa alla Coop"
                value={draft.expense.description}
                onChangeText={(description) =>
                  updateDraft({
                    expense: {
                      ...draft.expense,
                      description,
                      category: categorizeExpense(description),
                    },
                  })
                }
              />
              <Field
                label="Importo"
                placeholder="0,00"
                suffix="€"
                keyboardType="decimal-pad"
                value={
                  draft.expense.amount
                    ? String(draft.expense.amount)
                    : ''
                }
                onChangeText={(value) =>
                  updateDraft({
                    expense: {
                      ...draft.expense,
                      amount: Number(value.replace(',', '.')) || 0,
                      category,
                    },
                  })
                }
              />
              {draft.expense.description ? (
                <Card
                  style={[
                    styles.categoryResult,
                    { backgroundColor: colors.accentSoft },
                  ]}>
                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.resultLabel,
                        { color: colors.textSecondary },
                      ]}>
                      Categoria riconosciuta
                    </Text>
                    <Text
                      style={[styles.resultValue, { color: colors.text }]}>
                      {category}
                    </Text>
                  </View>
                  <Text style={[styles.resultCheck, { color: colors.accent }]}>
                    ✓
                  </Text>
                </Card>
              ) : null}
              <PrimaryButton
                onPress={() => {
                  updateDraft({
                    expense: { ...draft.expense, category },
                  });
                  if (session) next();
                  else router.push('/login?from=onboarding' as Href);
                }}
                disabled={
                  !draft.expense.description.trim() ||
                  draft.expense.amount <= 0
                }>
                Registra la spesa
              </PrimaryButton>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  updateDraft({
                    expense: {
                      description: '',
                      amount: 0,
                      category: 'Altro',
                    },
                  });
                  if (session) next();
                  else router.push('/login?from=onboarding' as Href);
                }}
                style={styles.skipButton}>
                <Text style={[styles.skipText, { color: colors.accent }]}>
                  Salta per ora
                </Text>
              </Pressable>
            </>
          ) : null}

          {activeStep === 6 ? (
            <>
              <View
                style={[
                  styles.successIcon,
                  { backgroundColor: colors.positive },
                ]}>
                <Text style={styles.successText}>✓</Text>
              </View>
              <Text style={[uiStyles.title, { color: colors.text }]}>
                Tutto pronto.
              </Text>
              <Text style={[uiStyles.subtitle, { color: colors.textSecondary }]}>
                Hai già costruito le fondamenta del tuo percorso finanziario.
              </Text>
              <Card style={styles.summary}>
                <SummaryRow
                  icon="◎"
                  label="Budget mensile stimato"
                  value={`${draft.allocation.needs}/${draft.allocation.wants}/${draft.allocation.savings} · ${formatEuro(draft.monthlyReference)}`}
                />
                <SummaryRow
                  icon="◇"
                  label="Obiettivo"
                  value={`${draft.goal.name} · ${formatEuro(draft.goal.targetAmount)}`}
                />
                <SummaryRow
                  icon="↗"
                  label="Prima spesa"
                  value={
                    expenseSkipped
                      ? 'La aggiungerai dalla dashboard'
                      : `${draft.expense.description} · ${formatEuro(draft.expense.amount)}`
                  }
                  last
                />
              </Card>
              {error ? (
                <Text style={[uiStyles.error, { color: colors.negative }]}>
                  {error}
                </Text>
              ) : null}
              <PrimaryButton
                loading={saving}
                onPress={async () => {
                  const completed = await completeOnboarding();
                  if (completed) router.replace('/dashboard' as Href);
                }}>
                Entra nella dashboard
              </PrimaryButton>
            </>
          ) : null}

          {activeStep !== 6 && error ? (
            <Text style={[uiStyles.error, { color: colors.negative }]}>
              {error}
            </Text>
          ) : null}
        </Screen>
      )}
    </KeyboardAvoidingView>
  );
}

function Welcome({
  onNext,
  onLogin,
}: {
  onNext: () => void;
  onLogin: () => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Screen scroll={false} style={styles.welcome}>
      <View style={styles.brandLockup}>
        <BrandLogo size={54} />
        <BrandLogo variant="wordmark" size={138} />
      </View>
      <View style={styles.welcomeCopy}>
        <Text style={[styles.kicker, { color: colors.accent }]}>
          IL TUO MONEY COACH
        </Text>
        <Text style={[styles.hero, { color: colors.text }]}>
          Più chiarezza.{'\n'}Meno pensieri.
        </Text>
        <Text style={[styles.heroText, { color: colors.textSecondary }]}>
          Flownd trasforma le tue scelte quotidiane in piccoli passi verso ciò
          che conta davvero.
        </Text>
      </View>
      <View>
        <View style={styles.promiseRow}>
          <Text style={[styles.promiseIcon, { color: colors.positive }]}>✓</Text>
          <Text style={[styles.promise, { color: colors.textSecondary }]}>
            Pronto in meno di due minuti
          </Text>
        </View>
        <GradientButton onPress={onNext}>Inizia</GradientButton>
        <SecondaryButton onPress={onLogin}>Accedi</SecondaryButton>
      </View>
    </Screen>
  );
}

function AllocationSlider({
  icon,
  label,
  value,
  amount,
  onChange,
  onStart,
  onEnd,
}: {
  icon: 'home' | 'luggage' | 'savings';
  label: string;
  value: number;
  amount: number;
  onChange: (value: number) => void;
  onStart: () => void;
  onEnd: () => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <GlassBudgetCard>
      <View style={styles.sliderHeading}>
        <View
          style={[
            styles.allocationIcon,
            { backgroundColor: colors.accentSoft },
          ]}>
          <Text style={[styles.materialSymbol, { color: colors.accent }]}>
            {icon}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.sliderLabel, { color: colors.text }]}>
            {label}
          </Text>
          <Text
            style={[styles.sliderAmount, { color: colors.textSecondary }]}>
            circa {formatEuro(amount)} / mese
          </Text>
        </View>
        <Text style={[styles.sliderValue, { color: colors.accent }]}>
          {value}%
        </Text>
      </View>
      <View
        onTouchStart={onStart}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
        style={styles.nativeSliderTouchArea}>
        <Slider
          value={value}
          minimumValue={5}
          maximumValue={90}
          step={1}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.sunken}
          thumbTintColor={colors.accent}
          onValueChange={onChange}
          style={styles.nativeSlider}
        />
      </View>
    </GlassBudgetCard>
  );
}

function GlassBudgetCard({ children }: PropsWithChildren) {
  const { colors, isDark } = useFlowndTheme();
  const supportsNativeGlass =
    Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  const cardStyle = [
    styles.glassCard,
    {
      borderColor: isDark
        ? 'rgba(255,255,255,0.18)'
        : 'rgba(255,255,255,0.72)',
    },
  ];

  if (supportsNativeGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={isDark ? 'dark' : 'light'}
        tintColor={isDark ? 'rgba(23,33,28,0.38)' : 'rgba(255,255,255,0.40)'}
        style={cardStyle}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        cardStyle,
        {
          backgroundColor: isDark
            ? 'rgba(23,33,28,0.88)'
            : 'rgba(255,255,255,0.82)',
          shadowColor: colors.text,
        },
      ]}>
      {children}
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View
      style={[
        styles.summaryRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}>
      <View
        style={[styles.summaryIcon, { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.summaryIconText, { color: colors.accent }]}>
          {icon}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text
          style={[styles.summaryValue, { color: colors.text }]}
          numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.46 },
  welcome: {
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingBottom: 30,
  },
  brandLockup: { alignItems: 'center', alignSelf: 'stretch', gap: 8 },
  welcomeCopy: { marginTop: 48, marginBottom: 'auto', paddingTop: 4 },
  kicker: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.3,
    marginBottom: 22,
  },
  hero: {
    fontFamily: font.displayBold,
    fontSize: 43,
    lineHeight: 52,
    letterSpacing: -0.8,
    paddingTop: 3,
  },
  heroText: {
    fontFamily: font.body,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 15,
    maxWidth: 340,
  },
  promiseRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  promiseIcon: { fontFamily: font.bodySemiBold },
  promise: { fontFamily: font.bodyMedium, fontSize: 13 },
  microcopy: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  bandGrid: { gap: 8, marginTop: 20 },
  band: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bandText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14 },
  bandCheck: { fontFamily: font.bodySemiBold, fontSize: 16 },
  glassStage: {
    position: 'relative',
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  glassGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  glassGlowTop: { top: 8, right: -45 },
  glassGlowBottom: { bottom: -8, left: -55 },
  sliderList: { gap: 10, marginTop: 16 },
  glassCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  sliderHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  allocationIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialSymbol: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 22,
    lineHeight: 25,
  },
  sliderLabel: { fontFamily: font.bodySemiBold, fontSize: 14 },
  sliderAmount: { fontFamily: font.data, fontSize: 10, marginTop: 2 },
  sliderValue: { fontFamily: font.dataMedium, fontSize: 17 },
  nativeSliderTouchArea: { marginTop: 7, marginHorizontal: -3 },
  nativeSlider: { width: '100%', height: 34 },
  sustainabilityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    borderWidth: 1,
  },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconText: {
    color: '#FFFFFF',
    fontFamily: font.bodySemiBold,
    fontSize: 15,
  },
  estimate: { fontFamily: font.dataMedium, fontSize: 15, marginBottom: 5 },
  statusCopy: { fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  strong: { fontFamily: font.bodySemiBold },
  categoryResult: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  resultLabel: { fontFamily: font.body, fontSize: 11 },
  resultValue: { fontFamily: font.bodySemiBold, fontSize: 15, marginTop: 2 },
  resultCheck: { fontFamily: font.bodySemiBold, fontSize: 20 },
  skipButton: { alignItems: 'center', padding: 17 },
  skipText: { fontFamily: font.bodySemiBold, fontSize: 14 },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  successText: { color: '#FFFFFF', fontFamily: font.bodySemiBold, fontSize: 28 },
  summary: { marginTop: 22, paddingVertical: 3 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconText: { fontFamily: font.bodySemiBold, fontSize: 17 },
  summaryLabel: { fontFamily: font.body, fontSize: 11 },
  summaryValue: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
});
