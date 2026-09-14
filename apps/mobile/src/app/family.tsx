import { router } from 'expo-router';
import { Image } from 'expo-image';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  acceptGroupInvite,
  createFamilyGroup,
  createGroupInvite,
  deleteFamilyGroup,
  type FamilyGroup,
  type FamilyGroupDetail,
  fetchFamilyGroupDetail,
  fetchFamilyGroups,
  fetchReceivedInvites,
  getActiveFamilyGroupId,
  type GroupInvite,
  type GroupMember,
  type NetWorthVisibility,
  type SharingAccess,
  type TransactionVisibility,
  leaveFamilyGroup,
  setActiveFamilyGroupId,
  setGoalSharedWithGroup,
  setMyGroupContribution,
  setMyGroupCycleDisposition,
  setMyGroupPrivacy,
  updateGroupMemberAccess,
} from '@/lib/family';
import { useApp } from '@/providers/app-provider';
import { contributionAmounts } from '@/lib/group-finance';

const accessLabels: Record<SharingAccess, string> = {
  none: 'Nessuno',
  view: 'Lettura',
  edit: 'Modifica',
};

const accessOrder: SharingAccess[] = ['none', 'view', 'edit'];

type InviteAccess = {
  transactionsAccess: SharingAccess;
  budgetsAccess: SharingAccess;
  goalsAccess: SharingAccess;
};

const initialInviteAccess: InviteAccess = {
  transactionsAccess: 'view',
  budgetsAccess: 'view',
  goalsAccess: 'edit',
};

export default function FamilyScreen() {
  const { colors } = useFlowndTheme();
  const { session, financialAccounts, grossBudgetMonthlyIncome, refreshData } = useApp();
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<GroupInvite[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [scope, setScope] = useState<'personal' | 'group'>('personal');
  const [detail, setDetail] = useState<FamilyGroupDetail | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAccess, setInviteAccess] = useState(initialInviteAccess);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharingDraft, setSharingDraft] = useState<{
    shareMonthlyBudget: boolean;
    shareNetWorth: boolean;
    shareTransactions: boolean;
    shareTransactionCategories: boolean;
    contributionPercentage: number;
    scheduledContributionPercentage: number | null;
    scheduledContributionDate: string | null;
    transactionVisibility: TransactionVisibility;
    netWorthVisibility: NetWorthVisibility;
  } | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const sharingMutationVersion = useRef(0);
  const sharingSaveQueue = useRef<Promise<void>>(Promise.resolve());

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const currentMember = detail?.members.find(
    (member) => member.userId === session?.user.id,
  );

  const loadGroups = useCallback(async (preferredGroupId?: string) => {
    const userId = session?.user.id;
    const email = session?.user.email;
    if (!userId || !email) return;
    const [nextGroups, nextInvites, storedGroupId] = await Promise.all([
      fetchFamilyGroups(userId),
      fetchReceivedInvites(email),
      getActiveFamilyGroupId(userId),
    ]);
    setGroups(nextGroups);
    setReceivedInvites(nextInvites);
    setSelectedGroupId((current) => {
      const preferred = preferredGroupId ?? storedGroupId ?? current;
      return nextGroups.some((group) => group.id === preferred)
        ? preferred!
        : nextGroups[0]?.id ?? null;
    });
  }, [session?.user.email, session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    void setActiveFamilyGroupId(session.user.id, selectedGroupId);
  }, [selectedGroupId, session?.user.id]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void loadGroups()
        .catch((loadError) => {
          if (__DEV__) console.error('Flownd family hub load failed', loadError);
          if (active) setError('La sezione Gruppi richiede la nuova migrazione Supabase.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [loadGroups]);

  useEffect(() => {
    let active = true;
    if (!selectedGroup || scope !== 'group') {
      return () => {
        active = false;
      };
    }
    if (!session?.user.id) return () => { active = false; };
    fetchFamilyGroupDetail(selectedGroup, session.user.id)
      .then((nextDetail) => {
        if (!active) return;
        setDetail(nextDetail);
        const member = nextDetail.members.find((item) => item.userId === session.user.id);
        setSharingDraft(member ? {
          shareMonthlyBudget: member.shareMonthlyBudget,
          shareNetWorth: member.shareNetWorth,
          shareTransactions: member.shareTransactions,
          shareTransactionCategories: member.shareTransactions,
          contributionPercentage: member.contributionPercentage,
          scheduledContributionPercentage: member.scheduledContributionPercentage,
          scheduledContributionDate: member.scheduledContributionDate,
          transactionVisibility: member.transactionVisibility,
          netWorthVisibility: member.netWorthVisibility,
        } : null);
        setSelectedAccountIds(nextDetail.selectedAccountIds);
      })
      .catch((loadError) => {
        if (__DEV__) console.error('Flownd group detail load failed', loadError);
        if (active) setError('Non riesco a caricare i dati condivisi del gruppo.');
      });
    return () => {
      active = false;
    };
  }, [scope, selectedGroup, session?.user.id]);

  async function runAction(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      if (__DEV__) console.error('Flownd family action failed', actionError);
      setError('Operazione non riuscita. Controlla i dati e riprova.');
    } finally {
      setSaving(false);
    }
  }

  async function refreshDetail(group = selectedGroup) {
    if (!group || !session?.user.id) return;
    const nextDetail = await fetchFamilyGroupDetail(group, session.user.id);
    setDetail(nextDetail);
    const member = nextDetail.members.find((item) => item.userId === session.user.id);
    setSharingDraft(member ? {
      shareMonthlyBudget: member.shareMonthlyBudget,
      shareNetWorth: member.shareNetWorth,
      shareTransactions: member.shareTransactions,
      shareTransactionCategories: member.shareTransactions,
      contributionPercentage: member.contributionPercentage,
      scheduledContributionPercentage: member.scheduledContributionPercentage,
      scheduledContributionDate: member.scheduledContributionDate,
      transactionVisibility: member.transactionVisibility,
      netWorthVisibility: member.netWorthVisibility,
    } : null);
    setSelectedAccountIds(nextDetail.selectedAccountIds);
  }

  function savePrivacyPreference(
    patch: Partial<Pick<NonNullable<typeof sharingDraft>,
      'transactionVisibility' | 'netWorthVisibility'>>,
    accountIds = selectedAccountIds,
  ) {
    if (!selectedGroup || !sharingDraft) return;
    const previous = sharingDraft;
    const next = { ...sharingDraft, ...patch };
    next.shareTransactions = next.transactionVisibility !== 'none';
    next.shareTransactionCategories = next.shareTransactions;
    next.shareNetWorth = next.netWorthVisibility !== 'none';
    const mutationVersion = sharingMutationVersion.current + 1;
    sharingMutationVersion.current = mutationVersion;
    setSharingDraft(next);
    setDetail((current) => current ? {
      ...current,
      members: current.members.map((member) => member.userId === session?.user.id
        ? { ...member, ...next }
        : member),
    } : current);
    setError(null);
    const request = sharingSaveQueue.current
      .catch(() => undefined)
      .then(() => setMyGroupPrivacy(
        selectedGroup.id,
        next.transactionVisibility,
        next.netWorthVisibility,
        accountIds,
      ));
    sharingSaveQueue.current = request;
    void request
      .catch((actionError) => {
        if (__DEV__) console.error('Flownd sharing preference update failed', actionError);
        if (sharingMutationVersion.current === mutationVersion) {
          setSharingDraft(previous);
          setDetail((current) => current ? {
            ...current,
            members: current.members.map((member) => member.userId === session?.user.id
              ? { ...member, ...previous }
              : member),
          } : current);
          setError('Non riesco a salvare la preferenza di condivisione. Riprova.');
        }
      });
  }

  function saveContribution(percentage: number) {
    if (!selectedGroup || !sharingDraft) return;
    const previous = sharingDraft;
    const next = {
      ...sharingDraft,
      contributionPercentage: percentage,
      scheduledContributionPercentage: null,
      scheduledContributionDate: null,
    };
    setSharingDraft(next);
    void setMyGroupContribution(selectedGroup.id, percentage)
      .then(async (effectiveDate) => {
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const appliesNow = effectiveDate.startsWith(currentMonth);
        const nextGroup: FamilyGroup = {
          ...selectedGroup,
          contributionPercentage: appliesNow
            ? percentage
            : selectedGroup.contributionPercentage,
          scheduledContributionPercentage: appliesNow ? null : percentage,
          scheduledContributionDate: effectiveDate,
          shareMonthlyBudget: appliesNow
            ? percentage > 0
            : selectedGroup.shareMonthlyBudget,
        };
        setGroups((current) => current.map((group) => (
          group.id === nextGroup.id ? nextGroup : group
        )));
        setSharingDraft((current) => current ? {
          ...current,
          contributionPercentage: appliesNow
            ? percentage
            : current.contributionPercentage,
          scheduledContributionPercentage: appliesNow ? null : percentage,
          scheduledContributionDate: effectiveDate,
        } : current);
        await Promise.all([refreshDetail(nextGroup), refreshData()]);
      })
      .catch((actionError) => {
        if (__DEV__) console.error('Flownd group contribution update failed', actionError);
        setSharingDraft(previous);
        setError('La somma delle quote ai gruppi non può superare il 100%.');
      });
  }

  const navigateBack = useCallback(() => {
    if (scope === 'group') {
      setDetail(null);
      setScope('personal');
      return;
    }
    router.back();
  }, [scope]);
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

  return (
    <GestureDetector gesture={swipeBackGesture}>
    <Screen>
      <PageHeader
        title={scope === 'group' && selectedGroup ? selectedGroup.name : 'Gruppi'}
        titleStyle={styles.pageTitle}
        leading={
          <GroupBackButton onPress={navigateBack} />
        }
        action={scope === 'group' && selectedGroup ? (
          <Pressable
            accessibilityLabel="Impostazioni gruppo"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              setInviteModalOpen(false);
              setSettingsModalOpen(true);
            }}
            style={styles.backButton}>
            <Text style={[styles.materialIcon, { color: colors.text }]}>settings</Text>
          </Pressable>
        ) : null}
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : scope === 'personal' ? (
        <PersonalView
          groups={groups}
          receivedInvites={receivedInvites}
          saving={saving}
          onOpenCreate={() => setCreateModalOpen(true)}
          onSelectGroup={(groupId) => {
            setDetail(null);
            setSelectedGroupId(groupId);
            setScope('group');
          }}
          onAcceptInvite={(inviteId) => void runAction(async () => {
            const groupId = await acceptGroupInvite(inviteId);
            setDetail(null);
            await loadGroups(groupId);
            setScope('group');
          })}
        />
      ) : selectedGroup ? (
        <GroupView
          group={selectedGroup}
          detail={detail}
          onChooseDisposition={(action, goalId) => void runAction(async () => {
            const previous = detail?.summary.myPreviousCycle;
            if (!previous) return;
            await setMyGroupCycleDisposition(
              selectedGroup.id,
              previous.cycleStart,
              action,
              goalId,
            );
            await refreshDetail();
          })}
        />
      ) : null}

      {notice ? <Text style={[styles.notice, { color: colors.positive }]}>{notice}</Text> : null}
      {error ? <Text style={[styles.error, { color: colors.negative }]}>{error}</Text> : null}

      <Popup visible={createModalOpen} title="Nuovo gruppo" onClose={() => setCreateModalOpen(false)}>
        <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
          Crea uno spazio condiviso per coppie, coinquilini, amici o altri membri.
        </Text>
        <Field
          label="Nome del gruppo"
          placeholder="es. Casa Rossi"
          value={newGroupName}
          onChangeText={setNewGroupName}
        />
        <PrimaryButton disabled={!newGroupName.trim()} loading={saving} onPress={() => {
          if (!session || !newGroupName.trim()) return;
          void runAction(async () => {
            const groupId = await createFamilyGroup(newGroupName);
            setNewGroupName('');
            setCreateModalOpen(false);
            setDetail(null);
            await loadGroups(groupId);
            setScope('group');
          });
        }}>
          Crea gruppo
        </PrimaryButton>
      </Popup>

      <Popup
        sheet
        visible={settingsModalOpen}
        title={inviteModalOpen ? 'Invita un membro' : 'Impostazioni gruppo'}
        onClose={() => {
          setInviteModalOpen(false);
          setSettingsModalOpen(false);
        }}>
        {inviteModalOpen ? (
          <View style={styles.invitePanel}>
            <Field
              label="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="nome@esempio.it"
              value={inviteEmail}
              onChangeText={setInviteEmail}
            />
            <PermissionRow label="Movimenti" value={inviteAccess.transactionsAccess} editable onChange={(transactionsAccess) => setInviteAccess({ ...inviteAccess, transactionsAccess })} />
            <PermissionRow label="Budget" value={inviteAccess.budgetsAccess} editable onChange={(budgetsAccess) => setInviteAccess({ ...inviteAccess, budgetsAccess })} />
            <PermissionRow label="Obiettivi" value={inviteAccess.goalsAccess} editable onChange={(goalsAccess) => setInviteAccess({ ...inviteAccess, goalsAccess })} />
            <PrimaryButton disabled={!inviteEmail.includes('@')} loading={saving} onPress={() => {
              if (!session || !selectedGroup || !inviteEmail.trim()) return;
              void runAction(async () => {
                const recipient = inviteEmail.trim();
                const delivery = await createGroupInvite(
                  selectedGroup.id,
                  recipient,
                  session.user.id,
                  { role: 'member', ...inviteAccess },
                  session.access_token,
                );
                setInviteEmail('');
                setInviteModalOpen(false);
                setSettingsModalOpen(false);
                setNotice(delivery.emailSent
                  ? `Invito inviato a ${recipient}.`
                  : `Invito creato per ${recipient}, ma la consegna email non è riuscita.`);
                await refreshDetail();
              });
            }}>
              Invia invito
            </PrimaryButton>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.settingsScroll}>
          {selectedGroup?.role === 'owner' ? (
            <SecondaryButton compact onPress={() => {
              setInviteModalOpen(true);
            }}>
              Invita un membro
            </SecondaryButton>
          ) : null}

          {detail?.pendingInvites.map((invite) => (
            <Text key={invite.id} style={[styles.pending, { color: colors.textSecondary }]}>
              In attesa: {invite.email}
            </Text>
          ))}

          {currentMember && selectedGroup && sharingDraft ? (
            <View style={styles.settingsBlock}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>COSA CONDIVIDI</Text>
              <ContributionPicker
                currency={selectedGroup.currency}
                monthlyIncome={grossBudgetMonthlyIncome}
                scheduledPercentage={sharingDraft.scheduledContributionPercentage}
                value={sharingDraft.contributionPercentage}
                onChange={saveContribution}
              />
              <PrivacyChoice
                label="Patrimonio"
                caption="Il patrimonio non finanzia il budget del gruppo"
                options={[
                  { value: 'none', label: 'Nessuno' },
                  { value: 'selected', label: 'Alcuni conti' },
                  { value: 'all', label: 'Tutto' },
                ]}
                value={sharingDraft.netWorthVisibility}
                onChange={(netWorthVisibility) => savePrivacyPreference({ netWorthVisibility })}
              />
              {sharingDraft.netWorthVisibility === 'selected' ? (
                <View style={styles.accountChoices}>
                  {financialAccounts.map((account) => {
                    const selected = selectedAccountIds.includes(account.id);
                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => {
                          const nextIds = selected
                            ? selectedAccountIds.filter((id) => id !== account.id)
                            : [...selectedAccountIds, account.id];
                          setSelectedAccountIds(nextIds);
                          savePrivacyPreference({}, nextIds);
                        }}
                        style={[styles.accountChoice, { backgroundColor: colors.sunken }]}>
                        <Text style={[styles.materialIcon, { color: selected ? colors.accent : colors.textSecondary }]}>
                          {selected ? 'check_circle' : 'circle'}
                        </Text>
                        <Text style={[styles.permissionLabel, { color: colors.text }]}>{account.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <PrivacyChoice
                label="Transazioni"
                caption="Solo i movimenti associati esplicitamente al gruppo"
                options={[
                  { value: 'none', label: 'Nessuna' },
                  { value: 'summary', label: 'Solo importi' },
                  { value: 'full', label: 'Dettagli' },
                ]}
                value={sharingDraft.transactionVisibility}
                onChange={(transactionVisibility) => savePrivacyPreference({ transactionVisibility })}
              />
              <Text style={[styles.virtualNote, { color: colors.textSecondary }]}>
                Le quote sono virtuali: nessun denaro viene spostato.
              </Text>
            </View>
          ) : null}

          {selectedGroup && detail?.shareableGoals.length ? (
            <View style={styles.settingsBlock}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>OBIETTIVI CONDIVISI</Text>
              {detail.shareableGoals.map((goal) => (
                <SharingRow
                  key={goal.id}
                  label={goal.name}
                  caption={`${formatAmount(goal.savedAmount, selectedGroup.currency)} su ${formatAmount(goal.targetAmount, selectedGroup.currency)}`}
                  value={goal.shared}
                  onChange={(shared) => void runAction(async () => {
                    await setGoalSharedWithGroup(selectedGroup.id, goal.id, shared);
                    await refreshDetail();
                  })}
                />
              ))}
            </View>
          ) : null}

          {selectedGroup?.role === 'owner' && detail ? (
            <View style={styles.settingsBlock}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PERMESSI MEMBRI</Text>
              {detail.members.filter((member) => member.role !== 'owner').map((member) => (
                <View key={member.userId} style={styles.permissionMember}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{member.displayName}</Text>
                  <PermissionRow label="Movimenti" value={member.transactionsAccess} editable onChange={(transactionsAccess) => void runAction(async () => {
                    await updateGroupMemberAccess(selectedGroup.id, member.userId, { role: member.role === 'readonly' ? 'readonly' : 'member', transactionsAccess, budgetsAccess: member.budgetsAccess, goalsAccess: member.goalsAccess });
                    await refreshDetail();
                  })} />
                  <PermissionRow label="Budget" value={member.budgetsAccess} editable onChange={(budgetsAccess) => void runAction(async () => {
                    await updateGroupMemberAccess(selectedGroup.id, member.userId, { role: member.role === 'readonly' ? 'readonly' : 'member', transactionsAccess: member.transactionsAccess, budgetsAccess, goalsAccess: member.goalsAccess });
                    await refreshDetail();
                  })} />
                  <PermissionRow label="Obiettivi" value={member.goalsAccess} editable onChange={(goalsAccess) => void runAction(async () => {
                    await updateGroupMemberAccess(selectedGroup.id, member.userId, { role: member.role === 'readonly' ? 'readonly' : 'member', transactionsAccess: member.transactionsAccess, budgetsAccess: member.budgetsAccess, goalsAccess });
                    await refreshDetail();
                  })} />
                </View>
              ))}
            </View>
          ) : null}

          {selectedGroup ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const deleting = selectedGroup.role === 'owner';
                Alert.alert(
                  deleting ? 'Eliminare il gruppo?' : 'Uscire dal gruppo?',
                  deleting
                    ? `“${selectedGroup.name}” e tutti i dati condivisi verranno eliminati definitivamente.`
                    : `Non vedrai più i dati condivisi di “${selectedGroup.name}”.`,
                  [
                    { text: 'Annulla', style: 'cancel' },
                    {
                      text: deleting ? 'Elimina' : 'Esci',
                      style: 'destructive',
                      onPress: () => void runAction(async () => {
                        if (deleting) await deleteFamilyGroup(selectedGroup.id);
                        else await leaveFamilyGroup(selectedGroup.id);
                        setSettingsModalOpen(false);
                        setDetail(null);
                        setScope('personal');
                        await setActiveFamilyGroupId(session?.user.id ?? '', null);
                        await loadGroups();
                      }),
                    },
                  ],
                );
              }}
              style={[styles.destructiveAction, { backgroundColor: colors.negativeSoft }]}>
              <Text style={[styles.materialIcon, { color: colors.negative }]}>
                {selectedGroup.role === 'owner' ? 'delete' : 'logout'}
              </Text>
              <Text style={[styles.destructiveLabel, { color: colors.negative }]}>
                {selectedGroup.role === 'owner' ? 'Elimina gruppo' : 'Esci dal gruppo'}
              </Text>
            </Pressable>
          ) : null}
          </ScrollView>
        )}
      </Popup>
    </Screen>
    </GestureDetector>
  );
}

function GroupBackButton({ onPress }: { onPress: () => void }) {
  const { colors, isDark } = useFlowndTheme();
  const content = (
    <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
  );
  return (
    <Pressable
      accessibilityLabel="Indietro"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.backButtonPressed}>
      {Platform.OS === 'ios' && isGlassEffectAPIAvailable() ? (
        <GlassView
          colorScheme={isDark ? 'dark' : 'light'}
          glassEffectStyle="regular"
          isInteractive
          style={styles.backButton}>
          {content}
        </GlassView>
      ) : (
        <View
          style={[
            styles.backButton,
            styles.backButtonFallback,
            { backgroundColor: colors.sunken, borderColor: colors.border },
          ]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}

function PersonalView({
  groups,
  receivedInvites,
  saving,
  onOpenCreate,
  onSelectGroup,
  onAcceptInvite,
}: {
  groups: FamilyGroup[];
  receivedInvites: GroupInvite[];
  saving: boolean;
  onOpenCreate: () => void;
  onSelectGroup: (groupId: string) => void;
  onAcceptInvite: (inviteId: string) => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        La vista personale resta privata. Passa a un gruppo per vedere soltanto i dati che i membri hanno scelto di condividere.
      </Text>

      {receivedInvites.length ? (
        <Section title="INVITI RICEVUTI">
          {receivedInvites.map((invite) => (
            <Card key={invite.id} style={styles.listCard}>
              <View style={styles.flex}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{invite.groupName}</Text>
                <Text style={[styles.itemCaption, { color: colors.textSecondary }]}>
                  Scade il {new Date(invite.expiresAt).toLocaleDateString('it-IT')}
                </Text>
              </View>
              <SecondaryButton compact onPress={() => onAcceptInvite(invite.id)} disabled={saving}>
                Accetta
              </SecondaryButton>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="I TUOI GRUPPI">
        {groups.map((group) => (
          <Pressable key={group.id} onPress={() => onSelectGroup(group.id)}>
            <Card style={styles.listCard}>
              <View style={[styles.groupIcon, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.materialIcon, { color: colors.accent }]}>group</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{group.name}</Text>
                <Text style={[styles.itemCaption, { color: colors.textSecondary }]}>
                  {group.role === 'owner' ? 'Amministratore' : 'Membro'}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
            </Card>
          </Pressable>
        ))}
        {!groups.length ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun gruppo attivo.</Text>
        ) : null}
      </Section>

      <Pressable
        accessibilityLabel="Crea un nuovo gruppo"
        accessibilityRole="button"
        onPress={onOpenCreate}
        style={({ pressed }) => [
          styles.addAction,
          { backgroundColor: colors.accentSoft },
          pressed && styles.disabled,
        ]}>
        <Text style={[styles.addActionIcon, { color: colors.accent }]}>add</Text>
        <Text style={[styles.addActionLabel, { color: colors.accent }]}>Nuovo gruppo</Text>
      </Pressable>
    </>
  );
}

function GroupView({
  group,
  detail,
  onChooseDisposition,
}: {
  group: FamilyGroup;
  detail: FamilyGroupDetail | null;
  onChooseDisposition: (
    action: 'carry_group' | 'shared_goal' | 'personal_next_cycle',
    goalId?: string,
  ) => void;
}) {
  const { colors } = useFlowndTheme();
  if (!detail) return <ActivityIndicator color={colors.accent} style={styles.loader} />;
  const memberNames = new Map(detail.members.map((member) => [member.userId, member.displayName]));
  const openBalances = detail.balances.filter((balance) => Math.abs(balance.balance) >= 0.01);
  const familyBudgetRemaining = detail.summary.budgetRemaining;

  return (
    <>
      <MemberAvatars members={detail.members} />

      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Vista condivisa di {group.name}. I dati personali non compaiono qui finché non vengono associati al gruppo.
      </Text>

      {detail.summary.budgetTotal === 0 && !detail.goals.length && !openBalances.length && !detail.recentTransactions.length ? (
        <Card style={[styles.groupEmptyCard, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.itemTitle, { color: colors.text }]}>Iniziate da una scelta utile</Text>
          <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
            Dall’ingranaggio ogni partecipante può condividere il proprio budget mensile o un obiettivo specifico. Le spese divise compariranno qui con i saldi da regolare.
          </Text>
        </Card>
      ) : null}

      {detail.summary.budgetTotal > 0 ? (
        <Section title="BUDGET FAMILIARE">
          <Card>
            <Text style={[styles.groupImpactAmount, { color: colors.text }]}>
              {formatAmount(familyBudgetRemaining, group.currency)}
            </Text>
            <Text style={[styles.itemCaption, { color: colors.textSecondary }]}>
              residui su {formatAmount(detail.summary.budgetTotal, group.currency)} pianificati
            </Text>
            <View style={styles.budgetMetricRow}>
              <BudgetMetric label="Coperto" value={detail.summary.budgetCovered} currency={group.currency} />
              <BudgetMetric label="Speso" value={detail.summary.budgetSpent} currency={group.currency} />
            </View>
            <View style={[styles.progressTrack, styles.groupBudgetProgress, { backgroundColor: colors.sunken }]}>
              <View style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.min(100, detail.summary.budgetTotal ? detail.summary.budgetSpent / detail.summary.budgetTotal * 100 : 0)}%`,
                },
              ]} />
            </View>
            {detail.budgets.map((budget) => (
              <View key={budget.id} style={styles.dataRow}>
                <Text style={[styles.dataLabel, { color: colors.text }]}>{budget.category}</Text>
                <Text style={[styles.amount, { color: colors.text }]}>{formatAmount(budget.monthlyLimit, group.currency)}</Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {detail.summary.contributions.length ? (
        <Section title="CONTRIBUTI">
          <Card>
            {detail.members.filter((member) => member.plannedContribution > 0).map((member) => (
              <View key={member.userId} style={styles.contributionBlock}>
                <View style={styles.dataRow}>
                  <Text style={[styles.dataLabel, { color: colors.text }]}>
                    {member.displayName} · {member.contributionPercentage}%
                  </Text>
                  <Text style={[styles.amount, { color: colors.text }]}>
                    {formatAmount(member.remainingContribution, group.currency)} residui
                  </Text>
                </View>
                <Text style={[styles.itemCaption, { color: colors.textSecondary }]}>
                  {formatAmount(member.plannedContribution, group.currency)} pianificati · {formatAmount(member.coveredContribution, group.currency)} coperti · {formatAmount(member.consumedContribution, group.currency)} consumati
                </Text>
              </View>
            ))}
            <Text style={[styles.virtualNote, { color: colors.textSecondary }]}>
              Le quote sono virtuali: nessun denaro viene spostato.
            </Text>
          </Card>
        </Section>
      ) : null}

      {detail.summary.myPreviousCycle
        && detail.summary.myPreviousCycle.amount > 0
        && !detail.summary.myPreviousCycle.action ? (
        <Section title="CHIUSURA DEL MESE">
          <Card>
            <Text style={[styles.itemTitle, { color: colors.text }]}>Il tuo avanzo attribuito</Text>
            <Text style={[styles.groupImpactAmount, { color: colors.text }]}>
              {formatAmount(detail.summary.myPreviousCycle.amount, group.currency)}
            </Text>
            <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
              Scegli come allocarlo nel nuovo ciclo. Nessun saldo bancario verrà modificato.
            </Text>
            <View style={styles.dispositionActions}>
              <SecondaryButton compact onPress={() => onChooseDisposition('carry_group')}>
                Riporta nel gruppo
              </SecondaryButton>
              {detail.goals.map((goal) => (
                <SecondaryButton
                  key={goal.id}
                  compact
                  onPress={() => onChooseDisposition('shared_goal', goal.id)}>
                  {goal.name}
                </SecondaryButton>
              ))}
              <SecondaryButton compact onPress={() => onChooseDisposition('personal_next_cycle')}>
                Budget personale
              </SecondaryButton>
            </View>
          </Card>
        </Section>
      ) : null}

      {detail.recentTransactions.length ? (
        <Section title="ULTIME SPESE CONDIVISE">
          <Card>
            {detail.recentTransactions.slice(0, 4).map((transaction) => (
              <View key={transaction.id} style={styles.sharedTransactionRow}>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={[styles.dataLabel, { color: colors.text }]}>
                    {transaction.description}
                  </Text>
                  <Text style={[styles.itemCaption, { color: colors.textSecondary }]}>
                    {memberNames.get(transaction.memberId) ?? 'Membro'} · {transaction.category ?? 'Categoria privata'}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: colors.text }]}>
                  {formatAmount(transaction.amount, group.currency)}
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="SALDI TRA MEMBRI">
        <Card>
          {openBalances.length ? openBalances.map((balance) => (
            <View key={balance.userId} style={styles.dataRow}>
              <Text style={[styles.dataLabel, { color: colors.text }]}>
                {memberNames.get(balance.userId) ?? 'Membro'}
              </Text>
              <Text style={[
                styles.amount,
                { color: balance.balance >= 0 ? colors.positive : colors.negative },
              ]}>
                {formatAmount(balance.balance, group.currency)}
              </Text>
            </View>
          )) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessuna spesa divisa.</Text>
          )}
        </Card>
      </Section>

      <Section title="OBIETTIVI CONDIVISI">
        <Card>
          {detail.goals.length ? detail.goals.map((goal) => (
            <View key={goal.id} style={styles.goalBlock}>
              <View style={styles.dataRow}>
                <Text style={[styles.dataLabel, { color: colors.text }]}>{goal.name}</Text>
                <Text style={[styles.smallAmount, { color: colors.text }]}>
                  {formatAmount(goal.savedAmount, group.currency)} / {formatAmount(goal.targetAmount, group.currency)}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.sunken }]}>
                <View style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.min(100, goal.targetAmount ? goal.savedAmount / goal.targetAmount * 100 : 0)}%`,
                  },
                ]} />
              </View>
            </View>
          )) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun obiettivo condiviso.</Text>
          )}
        </Card>
      </Section>

    </>
  );
}

function MemberAvatars({ members }: { members: GroupMember[] }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.memberAvatars}>
      {members.map((member) => (
        <View key={member.userId} style={styles.memberAvatarItem}>
          <MemberAvatar member={member} />
          <Text
            numberOfLines={1}
            style={[styles.memberAvatarName, { color: colors.textSecondary }]}>
            {member.displayName.split(/\s+/)[0]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MemberAvatar({ member }: { member: GroupMember }) {
  const { colors } = useFlowndTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const initials = member.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'F';
  if (member.avatarUrl && !imageFailed) {
    return (
      <Image
        accessibilityLabel={`Immagine profilo di ${member.displayName}`}
        contentFit="cover"
        onError={() => setImageFailed(true)}
        source={{ uri: member.avatarUrl }}
        style={styles.memberAvatar}
        transition={120}
      />
    );
  }
  return (
    <View style={[
      styles.memberAvatar,
      styles.memberAvatarFallback,
      { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    ]}>
      <Text style={[styles.memberAvatarInitials, { color: colors.accent }]}>{initials}</Text>
    </View>
  );
}

function BudgetMetric({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.budgetMetric}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.amount, { color: colors.text }]}>{formatAmount(value, currency)}</Text>
    </View>
  );
}

function ContributionPicker({
  value,
  scheduledPercentage,
  monthlyIncome,
  currency,
  onChange,
}: {
  value: number;
  scheduledPercentage: number | null;
  monthlyIncome: number;
  currency: string;
  onChange: (value: number) => void;
}) {
  const { colors } = useFlowndTheme();
  const displayedValue = scheduledPercentage ?? value;
  const preview = contributionAmounts(monthlyIncome, displayedValue);
  const [customValue, setCustomValue] = useState(String(displayedValue));
  const parsedCustomValue = Number(customValue.replace(',', '.'));
  return (
    <View style={styles.privacyBlock}>
      <View style={styles.dataRow}>
        <View style={styles.flex}>
          <Text style={[styles.permissionLabel, { color: colors.text }]}>Budget mensile</Text>
          <Text style={[styles.sharingCaption, { color: colors.textSecondary }]}>
            {formatAmount(preview.group, currency)} al gruppo · {formatAmount(preview.personal, currency)} personali
          </Text>
        </View>
        <Text style={[styles.contributionValue, { color: colors.accent }]}>{displayedValue}%</Text>
      </View>
      <View style={styles.choiceRow}>
        {[0, 25, 40, 50, 75, 100].map((percentage) => (
          <Pressable
            key={percentage}
            onPress={() => {
              setCustomValue(String(percentage));
              onChange(percentage);
            }}
            style={[
              styles.percentageChoice,
              { backgroundColor: displayedValue === percentage ? colors.accent : colors.sunken },
            ]}>
            <Text style={[
              styles.choiceLabel,
              { color: displayedValue === percentage ? colors.onAccent : colors.textSecondary },
            ]}>{percentage}%</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.customPercentageRow}>
        <View style={styles.flex}>
          <Field
            label="Percentuale personalizzata"
            keyboardType="decimal-pad"
            value={customValue}
            onChangeText={setCustomValue}
          />
        </View>
        <SecondaryButton
          compact
          disabled={!Number.isFinite(parsedCustomValue) || parsedCustomValue < 0 || parsedCustomValue > 100}
          onPress={() => onChange(parsedCustomValue)}>
          Applica
        </SecondaryButton>
      </View>
      {scheduledPercentage != null ? (
        <Text style={[styles.sharingCaption, { color: colors.textSecondary }]}>
          La nuova quota sarà applicata dal ciclo successivo.
        </Text>
      ) : null}
    </View>
  );
}

function PrivacyChoice<T extends string>({
  label,
  caption,
  value,
  options,
  onChange,
}: {
  label: string;
  caption: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.privacyBlock}>
      <Text style={[styles.permissionLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.sharingCaption, { color: colors.textSecondary }]}>{caption}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                styles.privacyChoice,
                { backgroundColor: selected ? colors.accent : colors.sunken },
              ]}>
              <Text style={[
                styles.choiceLabel,
                { color: selected ? colors.onAccent : colors.textSecondary },
              ]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SharingRow({
  label,
  caption,
  value,
  disabled,
  onChange,
}: {
  label: string;
  caption: string;
  value: boolean;
  disabled?: boolean;
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
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.sharingRow, disabled && styles.disabled]}>
      <View style={styles.flex}>
        <Text style={[styles.permissionLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.sharingCaption, { color: colors.textSecondary }]}>{caption}</Text>
      </View>
      <View style={[
        styles.switchTrack,
        { backgroundColor: value ? colors.accent : colors.sunken },
      ]}>
        <Animated.View style={[
          styles.switchThumb,
          {
            backgroundColor: colors.surface,
            transform: [{
              translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }),
            }],
          },
        ]} />
      </View>
    </Pressable>
  );
}

function Popup({
  visible,
  title,
  onClose,
  children,
  sheet = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  sheet?: boolean;
}) {
  const { colors } = useFlowndTheme();
  const [translateY] = useState(() => new Animated.Value(680));

  function openSheet() {
    if (!sheet) return;
    translateY.setValue(680);
    Animated.spring(translateY, {
      toValue: 0,
      damping: 22,
      stiffness: 230,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }

  function dismiss() {
    if (!sheet) {
      onClose();
      return;
    }
    Animated.timing(translateY, {
      toValue: 680,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }

  const dismissGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .runOnJS(true)
    .onUpdate((event) => {
      translateY.setValue(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY > 90 || event.velocityY > 650) dismiss();
      else Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 240,
        useNativeDriver: true,
      }).start();
    });

  const card = (
    <Card style={[styles.modalCard, sheet && styles.modalSheetCard]}>
      {sheet ? (
        <GestureDetector gesture={dismissGesture}>
          <View accessibilityLabel="Trascina verso il basso per chiudere" style={styles.sheetHandleArea}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          </View>
        </GestureDetector>
      ) : null}
      <View style={styles.modalHeader}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
        <Pressable accessibilityLabel="Chiudi" onPress={dismiss} hitSlop={8}>
          <Text style={[styles.materialIcon, { color: colors.textSecondary }]}>close</Text>
        </Pressable>
      </View>
      {children}
    </Card>
  );
  return (
    <Modal
      animationType={sheet ? 'none' : 'slide'}
      onRequestClose={dismiss}
      onShow={openSheet}
      transparent
      visible={visible}>
      <View style={[styles.modalRoot, sheet && styles.modalSheetRoot]}>
        <Pressable
          accessibilityLabel="Chiudi popup"
          onPress={dismiss}
          style={styles.modalBackdrop}
        />
        {sheet ? (
          <Animated.View style={[styles.modalSheetContainer, { transform: [{ translateY }] }]}>
            {card}
          </Animated.View>
        ) : card}
      </View>
    </Modal>
  );
}

function PermissionRow({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: SharingAccess;
  editable: boolean;
  onChange: (value: SharingAccess) => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.permissionRow}>
      <Text style={[styles.permissionLabel, { color: colors.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={!editable}
        onPress={() => onChange(accessOrder[(accessOrder.indexOf(value) + 1) % accessOrder.length])}
        style={[
          styles.accessChip,
          { backgroundColor: value === 'none' ? colors.sunken : colors.accentSoft },
        ]}>
        <Text style={[styles.accessText, { color: value === 'none' ? colors.textSecondary : colors.accent }]}>
          {accessLabels[value]}
        </Text>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency,
    signDisplay: 'exceptZero',
  }).format(amount);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pageTitle: { fontSize: 20, lineHeight: 27 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  backButtonFallback: { borderWidth: StyleSheet.hairlineWidth },
  backButtonPressed: { opacity: 0.68 },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  scopeControl: { flexDirection: 'row', borderRadius: 13, padding: 3, marginBottom: 15 },
  scopeButton: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  scopeIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18 },
  scopeLabel: { fontFamily: font.bodySemiBold, fontSize: 12, maxWidth: 110 },
  intro: { fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  groupEmptyCard: { marginTop: 18 },
  loader: { marginVertical: 42 },
  section: { marginTop: 23 },
  sectionLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1.05, marginBottom: 8 },
  sectionContent: { gap: 8 },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 70 },
  addAction: { minHeight: 52, borderRadius: 13, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addActionIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22 },
  addActionLabel: { fontFamily: font.bodySemiBold, fontSize: 13 },
  groupIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  itemCaption: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  cardCopy: { fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  chevron: { fontFamily: font.body, fontSize: 24 },
  empty: { fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  summaryGrid: { flexDirection: 'row', gap: 8, marginTop: 18 },
  memberAvatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  memberAvatarItem: { width: 56, alignItems: 'center' },
  memberAvatar: { width: 48, height: 48, borderRadius: 24 },
  memberAvatarFallback: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  memberAvatarInitials: { fontFamily: font.displayBold, fontSize: 15 },
  memberAvatarName: { fontFamily: font.bodyMedium, fontSize: 9, marginTop: 4, maxWidth: 56 },
  summaryCard: { flex: 1, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 13 },
  summaryValue: { fontFamily: font.dataMedium, fontSize: 19, marginTop: 3 },
  summaryLabel: { fontFamily: font.bodyMedium, fontSize: 9, marginTop: 1 },
  dataRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sharedTransactionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dataLabel: { flex: 1, fontFamily: font.bodyMedium, fontSize: 12 },
  amount: { fontFamily: font.dataMedium, fontSize: 12 },
  groupImpactAmount: { fontFamily: font.displayBold, fontSize: 28, lineHeight: 36 },
  groupBudgetProgress: { marginTop: 14, marginBottom: 10 },
  budgetMetricRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  budgetMetric: { flex: 1 },
  contributionBlock: { paddingVertical: 7 },
  dispositionActions: { gap: 8, marginTop: 14 },
  smallAmount: { fontFamily: font.dataMedium, fontSize: 10 },
  goalBlock: { marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 6, overflow: 'hidden', marginTop: 5 },
  progressFill: { height: '100%', borderRadius: 6 },
  memberCard: { paddingVertical: 14 },
  permissionRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sharingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sharingCaption: { fontFamily: font.body, fontSize: 10, lineHeight: 14, marginTop: 2 },
  privacyBlock: { marginTop: 17 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  privacyChoice: { minHeight: 34, borderRadius: 10, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  percentageChoice: { minWidth: 46, minHeight: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  customPercentageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  choiceLabel: { fontFamily: font.bodySemiBold, fontSize: 10 },
  contributionValue: { fontFamily: font.dataMedium, fontSize: 19 },
  accountChoices: { gap: 6, marginTop: 8 },
  accountChoice: { minHeight: 42, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  virtualNote: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 13 },
  switchTrack: { width: 42, height: 24, borderRadius: 12, padding: 3 },
  switchThumb: { width: 18, height: 18, borderRadius: 9 },
  permissionLabel: { fontFamily: font.bodyMedium, fontSize: 12 },
  accessChip: { minWidth: 76, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  accessText: { fontFamily: font.bodySemiBold, fontSize: 10 },
  pending: { fontFamily: font.body, fontSize: 10, marginTop: 8 },
  destructiveAction: { minHeight: 52, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 28 },
  destructiveLabel: { fontFamily: font.bodySemiBold, fontSize: 13 },
  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  modalSheetRoot: { justifyContent: 'flex-end', paddingHorizontal: 0 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 14, 11, 0.55)' },
  modalCard: { maxWidth: 520, width: '100%', alignSelf: 'center', padding: 20 },
  modalSheetContainer: { maxWidth: 520, width: '100%', alignSelf: 'center' },
  modalSheetCard: { maxWidth: undefined, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingTop: 4 },
  sheetHandleArea: { height: 30, alignItems: 'center', justifyContent: 'center', marginHorizontal: -20 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontFamily: font.displaySemiBold, fontSize: 20 },
  settingsScroll: { maxHeight: 620 },
  invitePanel: { paddingTop: 4 },
  settingsBlock: { marginTop: 22 },
  permissionMember: { marginTop: 12, paddingTop: 10 },
  notice: { fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 18 },
  error: { fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 18 },
  disabled: { opacity: 0.45 },
});
