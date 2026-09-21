import { Slider } from '@expo/ui/community/slider';
import { Image } from 'expo-image';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  Card,
  Field,
  PageHeader,
  PrimaryButton,
  Screen,
  SecondaryButton,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import {
  createGroupInvite,
  deleteFamilyGroup,
  type FamilyGroup,
  type FamilyGroupDetail,
  fetchFamilyGroupDetail,
  fetchFamilyGroups,
  type GroupContributionMode,
  leaveFamilyGroup,
  peekFamilyGroupDetail,
  peekFamilyGroups,
  saveFamilyBudgetAllocation,
  setGoalSharedWithGroup,
  setMyGroupContributionV2,
  setMyGroupPrivacy,
} from '@/lib/family';
import { contributionAmounts } from '@/lib/group-finance';
import { type BudgetAllocation, updateAllocation } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

type SettingsSection = 'budget' | 'sharing' | 'members';

export default function GroupSettingsScreen() {
  const { colors } = useFlowndTheme();
  const { groupId, section } = useLocalSearchParams<{
    groupId?: string;
    section?: string;
  }>();
  const activeSection: SettingsSection | null = section === 'budget'
    || section === 'sharing'
    || section === 'members'
    ? section
    : null;
  const { session, grossBudgetMonthlyIncome, refreshData } = useApp();
  const cachedGroups = peekFamilyGroups(session?.user.id) ?? [];
  const cachedGroup = cachedGroups.find((item) => item.id === groupId) ?? null;
  const [allGroups, setAllGroups] = useState<FamilyGroup[]>(cachedGroups);
  const [group, setGroup] = useState<FamilyGroup | null>(cachedGroup);
  const [detail, setDetail] = useState<FamilyGroupDetail | null>(
    () => peekFamilyGroupDetail(groupId),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [savingInvite, setSavingInvite] = useState(false);
  const navigateBack = useCallback(() => router.back(), []);
  const openSettingsSection = useCallback((nextSection: SettingsSection) => {
    if (!groupId) return;
    router.push(
      `/group-settings?groupId=${encodeURIComponent(groupId)}&section=${nextSection}` as Href,
    );
  }, [groupId]);
  const swipeBackGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetX(-55)
      .failOffsetY([-16, 16])
      .runOnJS(true)
      .onEnd((event) => {
        if (event.translationX < -90 || event.velocityX < -900) navigateBack();
      }),
    [navigateBack],
  );

  async function reload(target = group) {
    if (!target || !session?.user.id) return;
    const next = await fetchFamilyGroupDetail(target, session.user.id);
    setDetail(next);
  }

  function confirmRemoveGroup() {
    if (!group) return;
    const deleting = group.role === 'owner';
    Alert.alert(
      deleting ? 'Eliminare il gruppo?' : 'Uscire dal gruppo?',
      deleting
        ? `“${group.name}” e i suoi dati condivisi verranno eliminati.`
        : `Non vedrai più i dati condivisi di “${group.name}”.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: deleting ? 'Elimina' : 'Esci',
          style: 'destructive',
          onPress: () => void (deleting
            ? deleteFamilyGroup(group.id)
            : leaveFamilyGroup(group.id)).then(() => {
              router.replace('/family' as Href);
            }),
        },
      ],
    );
  }

  useEffect(() => {
    let active = true;
    if (!session?.user.id || !groupId) return () => { active = false; };
    void fetchFamilyGroups(session.user.id)
      .then(async (groups) => {
        setAllGroups(groups);
        const target = groups.find((item) => item.id === groupId) ?? null;
        if (!active) return;
        setGroup(target);
        if (target) {
          const next = await fetchFamilyGroupDetail(target, session.user.id);
          if (active) setDetail(next);
        }
      })
      .catch((loadError) => {
        if (__DEV__) console.error('Flownd group settings load failed', loadError);
        if (active) setError('Non riesco a caricare le impostazioni del gruppo.');
      });
    return () => { active = false; };
  }, [groupId, session?.user.id]);

  return (
    <GestureDetector gesture={swipeBackGesture}>
    <Screen>
      <PageHeader
        title={activeSection === 'budget'
          ? 'Budget'
          : activeSection === 'sharing'
            ? 'Condivisione'
            : activeSection === 'members'
              ? 'Membri'
              : 'Impostazioni'}
        titleStyle={styles.pageTitle}
        leading={<GlassIconButton label="Indietro" icon="arrow_back" onPress={navigateBack} />}
        action={activeSection === 'members' && group?.role === 'owner' ? (
          <GlassIconButton
            label="Invita membro"
            icon="add"
            onPress={() => setInviteOpen((value) => !value)}
          />
        ) : undefined}
      />

      {!group || !detail ? (
        <SettingsSkeleton />
      ) : (
        <View style={styles.sections}>
          <Text style={[styles.groupName, { color: colors.textSecondary }]}>{group.name}</Text>

          {activeSection === null ? (
            <>
              <SettingsNavigationRow
                title="Budget"
                caption="Quota mensile e suddivisione del budget"
                icon="donut_large"
                onPress={() => openSettingsSection('budget')}
              />
              <SettingsNavigationRow
                title="Condivisione"
                caption="Transazioni personali, patrimonio e obiettivi"
                icon="share"
                onPress={() => openSettingsSection('sharing')}
              />
              <SettingsNavigationRow
                title="Membri"
                caption={`${detail.members.length} partecipant${detail.members.length === 1 ? 'e' : 'i'}`}
                icon="group"
                onPress={() => openSettingsSection('members')}
              />
              <GroupDestructiveAction group={group} onPress={confirmRemoveGroup} />
            </>
          ) : null}

          {activeSection === 'budget' ? (
            <View style={styles.detailPage}>
              <BudgetSettings
                group={group}
                detail={detail}
                monthlyIncome={grossBudgetMonthlyIncome}
                otherGroups={allGroups.filter((item) => item.id !== group.id)}
                onError={setError}
                onSaved={async (nextGroup) => {
                  setGroup(nextGroup);
                  await Promise.all([reload(nextGroup), refreshData()]);
                }}
                onAllocationChange={(allocation) => {
                  const total = detail.summary.budgetTotal;
                  const categories = [
                    { key: 'needs' as const, label: 'Necessità' },
                    { key: 'wants' as const, label: 'Desideri' },
                    { key: 'savings' as const, label: 'Risparmi' },
                  ];
                  setDetail((current) => current ? {
                    ...current,
                    budgets: categories.map(({ key, label }) => ({
                      id: current.budgets.find((item) => item.category === label)?.id ?? key,
                      category: label,
                      monthlyLimit: Math.round(total * allocation[key]) / 100,
                      percentage: allocation[key],
                      spent: current.budgets.find((item) => item.category === label)?.spent ?? 0,
                    })),
                  } : current);
                }}
              />
            </View>
          ) : null}

          {activeSection === 'sharing' ? (
            <View style={styles.detailPage}>
              <SharingSettings
                group={group}
                detail={detail}
                onDetail={setDetail}
                onError={setError}
              />
            </View>
          ) : null}

          {activeSection === 'members' ? (
            <View style={styles.detailPage}>
              {inviteOpen && group.role === 'owner' ? (
              <View style={[styles.inviteBox, { backgroundColor: colors.sunken }]}>
                <Field
                  label="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="nome@esempio.it"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                />
                <PrimaryButton
                  disabled={!inviteEmail.includes('@')}
                  loading={savingInvite}
                  onPress={() => {
                    if (!session || !inviteEmail.trim()) return;
                    setSavingInvite(true);
                    setError(null);
                    const recipient = inviteEmail.trim();
                    void createGroupInvite(
                      group.id,
                      recipient,
                      session.user.id,
                      {
                        role: 'member',
                        transactionsAccess: 'view',
                        budgetsAccess: 'view',
                        goalsAccess: 'edit',
                      },
                      session.access_token,
                    ).then(async (delivery) => {
                      setInviteEmail('');
                      setInviteOpen(false);
                      setNotice(delivery.emailSent
                        ? `Invito inviato a ${recipient}.`
                        : `Invito creato per ${recipient}; la mail non è stata consegnata.`);
                      await reload();
                    }).catch((inviteError) => {
                      if (__DEV__) console.error('Flownd group invite failed', inviteError);
                      setError('Non riesco a creare questo invito.');
                    }).finally(() => setSavingInvite(false));
                  }}>
                  Invita
                </PrimaryButton>
              </View>
              ) : null}
              <View style={styles.memberList}>
              {detail.members.map((member) => (
                <View key={member.userId} style={styles.memberRow}>
                  {member.avatarUrl ? (
                    <Image source={{ uri: member.avatarUrl }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.avatarInitial, { color: colors.accent }]}>
                        {member.displayName.trim().charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={[styles.memberName, { color: colors.text }]}>{member.displayName}</Text>
                    <Text style={[styles.memberMeta, { color: colors.textSecondary }]}>
                      {member.role === 'owner' ? 'Amministratore' : 'Membro'}
                    </Text>
                  </View>
                </View>
              ))}
              </View>

            </View>
          ) : null}
        </View>
      )}

      {activeSection === 'budget' ? (
        <Text style={[styles.virtualNote, { color: colors.textSecondary }]}>
          Le quote sono virtuali: nessun denaro viene spostato.
        </Text>
      ) : null}
      {notice ? <Text style={[styles.message, { color: colors.positive }]}>{notice}</Text> : null}
      {error ? <Text style={[styles.message, { color: colors.negative }]}>{error}</Text> : null}
    </Screen>
    </GestureDetector>
  );
}

function BudgetSettings({
  group,
  detail,
  monthlyIncome,
  onSaved,
  onAllocationChange,
  onError,
}: {
  group: FamilyGroup;
  detail: FamilyGroupDetail;
  monthlyIncome: number;
  onSaved: (group: FamilyGroup) => Promise<void>;
  onAllocationChange: (allocation: BudgetAllocation) => void;
  onError: (message: string | null) => void;
}) {
  const { colors } = useFlowndTheme();
  const [enabled, setEnabled] = useState(group.shareMonthlyBudget);
  const [mode, setMode] = useState<GroupContributionMode>(group.contributionMode);
  const initialValue = group.contributionMode === 'fixed'
    ? group.contributionFixedAmount ?? 0
    : group.contributionPercentage;
  const [value, setValue] = useState(initialValue);
  const [fieldValue, setFieldValue] = useState(String(initialValue));
  const lastPositiveValue = useRef(initialValue > 0 ? initialValue : (mode === 'fixed' ? 100 : 25));
  const saveVersion = useRef(0);
  const parsedValue = Number(fieldValue.replace(',', '.'));
  const previewAmount = mode === 'fixed'
    ? Math.max(0, value)
    : contributionAmounts(monthlyIncome, value).group;

  async function persist(nextEnabled: boolean, nextMode: GroupContributionMode, nextValue: number) {
    const mutation = ++saveVersion.current;
    onError(null);
    try {
      await setMyGroupContributionV2(group.id, nextMode, nextEnabled ? nextValue : 0);
      if (mutation !== saveVersion.current) return;
      const nextGroup: FamilyGroup = {
        ...group,
        shareMonthlyBudget: nextEnabled && nextValue > 0,
        contributionMode: nextMode,
        contributionFixedAmount: nextMode === 'fixed' ? nextValue : null,
        contributionPercentage: nextMode === 'percentage'
          ? nextValue
          : (monthlyIncome > 0 ? Math.min(100, nextValue * 100 / monthlyIncome) : 0),
      };
      await onSaved(nextGroup);
    } catch (saveError) {
      if (__DEV__) console.error('Flownd contribution save failed', saveError);
      onError('La quota supera il budget personale disponibile o non può essere salvata.');
    }
  }

  function applyValue(nextValue: number) {
    const bounded = mode === 'percentage'
      ? Math.max(0, Math.min(100, nextValue))
      : Math.max(0, nextValue);
    if (bounded > 0) lastPositiveValue.current = bounded;
    setValue(bounded);
    setFieldValue(String(Math.round(bounded * 100) / 100));
    if (!enabled && bounded > 0) setEnabled(true);
    void persist(bounded > 0, mode, bounded);
  }

  const allocation = allocationFromBudgets(detail);

  return (
    <View style={styles.sectionContent}>
      <SettingsToggle
        label="Condividi budget"
        caption="Destina una quota del tuo budget mensile al gruppo"
        value={enabled}
        onChange={(next) => {
          setEnabled(next);
          const nextValue = next ? lastPositiveValue.current : value;
          if (next) {
            setValue(nextValue);
            setFieldValue(String(nextValue));
          }
          void persist(next, mode, nextValue);
        }}
      />

      {enabled ? (
        <>
          <View style={styles.modeRow}>
            <ModeButton label="Percentuale" selected={mode === 'percentage'} onPress={() => {
              setMode('percentage');
              const next = Math.min(100, group.contributionPercentage || 25);
              setValue(next);
              setFieldValue(String(next));
              lastPositiveValue.current = next;
              void persist(true, 'percentage', next);
            }} />
            <ModeButton label="Importo fisso" selected={mode === 'fixed'} onPress={() => {
              setMode('fixed');
              const next = group.contributionFixedAmount || previewAmount || 100;
              setValue(next);
              setFieldValue(String(Math.round(next * 100) / 100));
              lastPositiveValue.current = next;
              void persist(true, 'fixed', next);
            }} />
          </View>

          {mode === 'percentage' ? (
            <View style={styles.sliderBlock} onTouchEnd={() => applyValue(value)}>
              <View style={styles.valueRow}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Quota personale</Text>
                <Text style={[styles.valueText, { color: colors.accent }]}>{Math.round(value)}%</Text>
              </View>
              <Slider
                value={value}
                minimumValue={0}
                maximumValue={100}
                step={1}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.sunken}
                thumbTintColor={colors.accent}
                onValueChange={setValue}
                style={styles.slider}
              />
            </View>
          ) : (
            <View style={styles.fixedRow}>
              <View style={styles.flex}>
                <Field
                  label="Importo mensile"
                  keyboardType="decimal-pad"
                  value={fieldValue}
                  onChangeText={setFieldValue}
                />
              </View>
              <SecondaryButton
                compact
                disabled={!Number.isFinite(parsedValue) || parsedValue <= 0}
                onPress={() => applyValue(parsedValue)}>
                Applica
              </SecondaryButton>
            </View>
          )}
          <Text style={[styles.preview, { color: colors.textSecondary }]}>
            {formatAmount(previewAmount, group.currency)} al gruppo · {formatAmount(Math.max(0, monthlyIncome - previewAmount), group.currency)} personali
          </Text>

          {group.budgetsAccess === 'edit' ? (
            <BudgetAllocationSliders
              allocation={allocation}
              onChange={onAllocationChange}
              onSave={(next) => saveFamilyBudgetAllocation(group.id, next).catch((saveError) => {
                if (__DEV__) console.error('Flownd group allocation save failed', saveError);
                onError('Non riesco a salvare la suddivisione del budget.');
              })}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function SharingSettings({
  group,
  detail,
  onDetail,
  onError,
}: {
  group: FamilyGroup;
  detail: FamilyGroupDetail;
  onDetail: (detail: FamilyGroupDetail) => void;
  onError: (message: string | null) => void;
}) {
  const [transactions, setTransactions] = useState(group.transactionVisibility !== 'none');
  const [netWorth, setNetWorth] = useState(group.netWorthVisibility !== 'none');
  const saveVersion = useRef(0);

  function savePrivacy(nextTransactions: boolean, nextNetWorth: boolean) {
    const version = ++saveVersion.current;
    onError(null);
    void setMyGroupPrivacy(
      group.id,
      nextTransactions ? 'full' : 'none',
      nextNetWorth ? 'all' : 'none',
      nextNetWorth ? detail.selectedAccountIds : [],
    ).catch((saveError) => {
      if (__DEV__) console.error('Flownd group privacy save failed', saveError);
      if (version === saveVersion.current) onError('Non riesco a salvare le preferenze di condivisione.');
    });
  }

  return (
    <View style={styles.sectionContent}>
      <SettingsToggle
        label="Transazioni personali"
        caption="Condividi anche i movimenti non imputati al gruppo"
        value={transactions}
        onChange={(next) => {
          setTransactions(next);
          savePrivacy(next, netWorth);
        }}
      />
      <Text style={styles.inlineNote}>
        Le transazioni imputate al budget del gruppo restano sempre visibili ai membri autorizzati.
      </Text>
      <SettingsToggle
        label="Patrimonio"
        caption="Condividi il totale dei tuoi conti e portafogli"
        value={netWorth}
        onChange={(next) => {
          setNetWorth(next);
          savePrivacy(transactions, next);
        }}
      />

      {detail.shareableGoals.length ? (
        <View style={styles.goalsBlock}>
          <Text style={styles.subsectionTitle}>OBIETTIVI CONDIVISI</Text>
          {detail.shareableGoals.map((goal) => (
            <SettingsToggle
              key={goal.id}
              label={goal.name}
              caption={`${formatAmount(goal.savedAmount, group.currency)} su ${formatAmount(goal.targetAmount, group.currency)}`}
              value={goal.shared}
              onChange={(shared) => {
                onDetail({
                  ...detail,
                  shareableGoals: detail.shareableGoals.map((item) => (
                    item.id === goal.id ? { ...item, shared } : item
                  )),
                });
                void setGoalSharedWithGroup(group.id, goal.id, shared).catch((saveError) => {
                  if (__DEV__) console.error('Flownd goal sharing save failed', saveError);
                  onError('Non riesco a modificare la condivisione dell’obiettivo.');
                });
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SettingsNavigationRow({
  title,
  caption,
  icon,
  onPress,
}: {
  title: string;
  caption: string;
  icon: string;
  onPress: () => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Card style={styles.navigationCard}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.sectionButton, pressed && styles.pressed]}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.materialIcon, { color: colors.accent }]}>{icon}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.sectionCaption, { color: colors.textSecondary }]}>{caption}</Text>
          </View>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>chevron_right</Text>
      </Pressable>
    </Card>
  );
}

function SettingsToggle({ label, caption, value, onChange }: {
  label: string;
  caption: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useFlowndTheme();
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, value]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.settingCaption, { color: colors.textSecondary }]}>{caption}</Text>
      </View>
      <View style={[styles.switchTrack, { backgroundColor: value ? colors.accent : colors.sunken }]}>
        <Animated.View style={[
          styles.switchThumb,
          {
            backgroundColor: colors.surface,
            transform: [{ translateX: progress.interpolate({
              inputRange: [0, 1], outputRange: [0, 18],
            }) }],
          },
        ]} />
      </View>
    </Pressable>
  );
}

function ModeButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeButton, { backgroundColor: selected ? colors.accent : colors.sunken }]}>
      <Text style={[styles.modeLabel, { color: selected ? colors.onAccent : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

function BudgetAllocationSliders({ allocation, onChange, onSave }: {
  allocation: BudgetAllocation;
  onChange: (allocation: BudgetAllocation) => void;
  onSave: (allocation: BudgetAllocation) => void;
}) {
  const { colors } = useFlowndTheme();
  const [draft, setDraft] = useState(allocation);
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  return (
    <View style={styles.allocationBlock}>
      <Text style={styles.subsectionTitle}>SUDDIVISIONE DEL BUDGET</Text>
      {([
        ['needs', 'Necessità'],
        ['wants', 'Desideri'],
        ['savings', 'Risparmi'],
      ] as const).map(([key, label]) => (
        <View key={key} style={styles.allocationRow}>
          <View style={styles.valueRow}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
            <Text style={[styles.valueText, { color: colors.accent }]}>{Math.round(draft[key])}%</Text>
          </View>
          <View onTouchEnd={() => onSave(latest.current)} onTouchCancel={() => onSave(latest.current)}>
            <Slider
              value={draft[key]}
              minimumValue={5}
              maximumValue={90}
              step={1}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.sunken}
              thumbTintColor={colors.accent}
              onValueChange={(value) => setDraft((current) => {
                const next = updateAllocation(current, key, value);
                latest.current = next;
                onChange(next);
                return next;
              })}
              style={styles.slider}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function GlassIconButton({ label, icon, onPress, small = false }: {
  label: string;
  icon: string;
  onPress: () => void;
  small?: boolean;
}) {
  const { colors, isDark } = useFlowndTheme();
  const style = small ? styles.glassSmall : styles.glassIcon;
  const iconStyle = small ? styles.materialIconSmall : styles.materialIcon;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress}>
      {Platform.OS === 'ios' && isGlassEffectAPIAvailable() ? (
        <GlassView colorScheme={isDark ? 'dark' : 'light'} glassEffectStyle="regular" isInteractive style={style}>
          <Text style={[iconStyle, { color: colors.text }]}>{icon}</Text>
        </GlassView>
      ) : (
        <View style={[style, styles.glassFallback, { backgroundColor: colors.sunken, borderColor: colors.border }]}>
          <Text style={[iconStyle, { color: colors.text }]}>{icon}</Text>
        </View>
      )}
    </Pressable>
  );
}

function SettingsSkeleton() {
  const { colors } = useFlowndTheme();
  const [opacity] = useState(() => new Animated.Value(0.42));
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.82, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.42, duration: 700, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return (
    <Animated.View style={[styles.skeletonList, { opacity }]}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={[styles.skeletonCard, { backgroundColor: colors.sunken }]} />
      ))}
    </Animated.View>
  );
}

function allocationFromBudgets(detail: FamilyGroupDetail): BudgetAllocation {
  const get = (category: string, fallback: number) =>
    detail.budgets.find((item) => item.category === category)?.percentage || fallback;
  return {
    needs: get('Necessità', 50),
    wants: get('Desideri', 30),
    savings: get('Risparmi', 20),
  };
}

function formatAmount(value: number, currency: string) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(value);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pageTitle: { fontSize: 19, lineHeight: 26, marginLeft: 14 },
  sections: { gap: 12 },
  groupName: { fontFamily: font.bodyMedium, fontSize: 12, marginBottom: 2 },
  navigationCard: { padding: 0, overflow: 'hidden' },
  detailPage: { paddingHorizontal: 2 },
  sectionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 16 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: font.bodySemiBold, fontSize: 15 },
  sectionCaption: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  chevron: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  sectionContent: { paddingBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  settingLabel: { fontFamily: font.bodySemiBold, fontSize: 13 },
  settingCaption: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  switchTrack: { width: 46, height: 28, borderRadius: 14, padding: 3 },
  switchThumb: { width: 22, height: 22, borderRadius: 11 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeButton: { flex: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeLabel: { fontFamily: font.bodySemiBold, fontSize: 11 },
  sliderBlock: { paddingTop: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  valueText: { fontFamily: font.dataMedium, fontSize: 14 },
  slider: { height: 34 },
  fixedRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  preview: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 5 },
  allocationBlock: { marginTop: 20, gap: 8 },
  allocationRow: { gap: 2 },
  subsectionTitle: { fontFamily: font.bodySemiBold, fontSize: 9, letterSpacing: 0.9, opacity: 0.58, marginBottom: 4 },
  inlineNote: { fontFamily: font.body, fontSize: 9, lineHeight: 14, opacity: 0.58, marginTop: -7, marginBottom: 3 },
  goalsBlock: { marginTop: 16 },
  inviteBox: { padding: 12, borderRadius: 14, gap: 10, marginBottom: 10 },
  memberList: { gap: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: font.bodySemiBold, fontSize: 15 },
  memberName: { fontFamily: font.bodySemiBold, fontSize: 13 },
  memberMeta: { fontFamily: font.body, fontSize: 10, marginTop: 2 },
  destructive: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, borderRadius: 13, marginTop: 16 },
  destructiveText: { fontFamily: font.bodySemiBold, fontSize: 12 },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21, lineHeight: 24 },
  materialIconSmall: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18, lineHeight: 21 },
  glassIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  glassSmall: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  glassFallback: { borderWidth: StyleSheet.hairlineWidth },
  virtualNote: { fontFamily: font.body, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  message: { fontFamily: font.bodyMedium, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  skeletonList: { gap: 12 },
  skeletonCard: { height: 74, borderRadius: 18 },
  pressed: { opacity: 0.65 },
});
