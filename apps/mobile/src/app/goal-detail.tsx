import {
  router,
  type Href,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PrimaryButton,
  ProgressBar,
  Screen,
  SecondaryButton,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import { formatDateItalian, formatEuro } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';

type Contribution = {
  id: string;
  amount: number;
  source: 'manual' | 'open_banking';
  createdAt: string;
};

export default function GoalDetailScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { goalId } = useLocalSearchParams<{ goalId?: string }>();
  const {
    session,
    goals,
    amountsVisible,
    completeGoal,
    continueGoalAsSavings,
  } = useApp();
  const goal = goals.find((item) => item.id === goalId);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(goalId && session));
  const [historyError, setHistoryError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!goalId || !session) return undefined;
      void supabase
        .from('goal_contributions')
        .select('id,amount,source,occurred_at')
        .eq('user_id', session.user.id)
        .eq('goal_id', goalId)
        .order('occurred_at', { ascending: false })
        .then(({ data, error }) => {
          if (!active) return;
          setHistoryError(Boolean(error));
          setContributions(
            (data ?? []).map((item) => ({
              id: item.id,
              amount: Number(item.amount),
              source: item.source as Contribution['source'],
              createdAt: item.occurred_at,
            })),
          );
          setLoadingHistory(false);
        });
      return () => {
        active = false;
      };
    }, [goalId, session]),
  );

  if (!goal) {
    return (
      <Screen>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <DetailHeader title="Obiettivo" />
        <Card>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Obiettivo non disponibile</Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Potrebbe essere già stato completato.
          </Text>
        </Card>
      </Screen>
    );
  }

  const progress = goal.targetAmount
    ? Math.min(goal.savedAmount / goal.targetAmount, 1)
    : 0;

  return (
    <Screen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <DetailHeader
        title={goal.name}
        onEdit={() =>
          router.push(`/add-goal?goalId=${encodeURIComponent(goal.id)}` as Href)
        }
      />

      <Card style={styles.hero}>
        <Text style={[styles.deadline, { color: colors.textSecondary }]}> 
          {goal.status === 'free_savings'
            ? 'Risparmio libero'
            : goal.deadline
              ? `Scadenza ${formatDateItalian(goal.deadline) || goal.deadline}`
              : 'Nessuna scadenza'}
        </Text>
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
        {goal.status !== 'free_savings' ? (
          <>
            <ProgressBar value={progress} />
            <Text style={[styles.progressLabel, { color: colors.accent }]}>
              {amountsVisible ? `${Math.round(progress * 100)}% completato` : 'Avanzamento nascosto'}
            </Text>
          </>
        ) : (
          <Text style={[styles.freeSavingsCopy, { color: colors.textSecondary }]}>
            Qui confluisce la parte della quota Risparmio non assegnata ad altri obiettivi.
          </Text>
        )}
      </Card>

      {goal.status !== 'reached' ? (
        <>
          <PrimaryButton
            onPress={() =>
              router.push(`/add-goal-contribution?goalId=${encodeURIComponent(goal.id)}` as Href)
            }>
            Registra versamento
          </PrimaryButton>
          <Text style={[styles.contributionHint, { color: colors.textSecondary }]}>
            Riduce la quota Risparmio disponibile del ciclo, senza essere conteggiato come spesa.
          </Text>
        </>
      ) : null}

      {goal.status === 'reached' ? (
        <Card style={[styles.reached, { backgroundColor: colors.accentSoft }]}> 
          <Text style={[styles.reachedTitle, { color: colors.text }]}>Obiettivo raggiunto</Text>
          <Text style={[styles.reachedCopy, { color: colors.textSecondary }]}> 
            Puoi completarlo oppure continuare a usarlo come risparmio libero.
          </Text>
          <View style={styles.reachedActions}>
            <SecondaryButton
              compact
              onPress={async () => {
                if (await completeGoal(goal.id)) router.back();
              }}>
              Segna completato
            </SecondaryButton>
            <SecondaryButton
              compact
              onPress={() => void continueGoalAsSavings(goal.id)}>
              Continua a risparmiare
            </SecondaryButton>
          </View>
        </Card>
      ) : null}

      <View style={styles.historyHeader}>
        <Text style={[styles.historyTitle, { color: colors.text }]}>Storico versamenti</Text>
        <Text style={[styles.historyCount, { color: colors.textSecondary }]}> 
          {contributions.length}
        </Text>
      </View>
      {loadingHistory ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : historyError ? (
        <Card>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            Non riesco a caricare lo storico in questo momento.
          </Text>
        </Card>
      ) : contributions.length ? (
        <View style={styles.historyList}>
          {contributions.map((contribution) => (
            <Card key={contribution.id} style={styles.historyRow}>
              <View
                style={[styles.historyIcon, { backgroundColor: colors.positiveSoft }]}> 
                <Text style={[styles.materialIcon, { color: colors.positive }]}>south_west</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.historySource, { color: colors.text }]}> 
                  {contribution.source === 'open_banking'
                    ? 'Accantonamento automatico'
                    : 'Versamento manuale'}
                </Text>
                <Text style={[styles.historyDate, { color: colors.textSecondary }]}> 
                  {formatContributionDate(contribution.createdAt)}
                </Text>
              </View>
              <Text style={[styles.historyAmount, { color: colors.positive }]}> 
                +{amountsVisible ? formatEuro(contribution.amount) : HIDDEN_AMOUNT}
              </Text>
            </Card>
          ))}
        </View>
      ) : (
        <Card>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}> 
            I versamenti registrati compariranno qui.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function DetailHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Indietro"
        onPress={() => router.back()}
        style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
      </Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}> 
        {title}
      </Text>
      {onEdit ? (
        <Pressable accessibilityLabel="Modifica obiettivo" onPress={onEdit} style={styles.editButton}>
          <Text style={[styles.editText, { color: colors.accent }]}>Modifica</Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

function formatContributionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 24,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.bodySemiBold,
    fontSize: 14,
  },
  headerSpacer: { width: 40 },
  editButton: { width: 58, alignItems: 'flex-end', paddingVertical: 8 },
  editText: { fontFamily: font.bodySemiBold, fontSize: 11 },
  materialIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  hero: { marginBottom: 12 },
  deadline: { fontFamily: font.body, fontSize: 11 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginVertical: 16 },
  amount: { fontFamily: font.dataMedium, fontSize: 25 },
  target: { fontFamily: font.data, fontSize: 11 },
  progressLabel: { fontFamily: font.bodySemiBold, fontSize: 10, marginTop: 8 },
  freeSavingsCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 15 },
  contributionHint: {
    fontFamily: font.body,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 6,
  },
  reached: { marginTop: 12 },
  reachedTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  reachedCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 4 },
  reachedActions: { gap: 8, marginTop: 12 },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 10,
  },
  historyTitle: { fontFamily: font.displaySemiBold, fontSize: 19 },
  historyCount: { fontFamily: font.dataMedium, fontSize: 11 },
  historyList: { gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySource: { fontFamily: font.bodyMedium, fontSize: 12 },
  historyDate: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  historyAmount: { fontFamily: font.dataMedium, fontSize: 12 },
  loader: { marginVertical: 22 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  emptyCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 3 },
});
