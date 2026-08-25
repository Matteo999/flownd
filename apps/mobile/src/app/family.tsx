import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
  type FamilyGroup,
  type FamilyGroupDetail,
  fetchFamilyGroupDetail,
  fetchFamilyGroups,
  fetchReceivedInvites,
  type GroupInvite,
  type GroupMember,
  type SharingAccess,
  updateGroupMemberAccess,
} from '@/lib/family';
import { useApp } from '@/providers/app-provider';

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
  const { session } = useApp();
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<GroupInvite[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [scope, setScope] = useState<'personal' | 'group'>('personal');
  const [detail, setDetail] = useState<FamilyGroupDetail | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAccess, setInviteAccess] = useState(initialInviteAccess);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const loadGroups = useCallback(async (preferredGroupId?: string) => {
    const userId = session?.user.id;
    const email = session?.user.email;
    if (!userId || !email) return;
    const [nextGroups, nextInvites] = await Promise.all([
      fetchFamilyGroups(userId),
      fetchReceivedInvites(email),
    ]);
    setGroups(nextGroups);
    setReceivedInvites(nextInvites);
    setSelectedGroupId((current) => {
      const preferred = preferredGroupId ?? current;
      return nextGroups.some((group) => group.id === preferred)
        ? preferred!
        : nextGroups[0]?.id ?? null;
    });
  }, [session?.user.email, session?.user.id]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void loadGroups()
        .catch((loadError) => {
          if (__DEV__) console.error('Flownd family hub load failed', loadError);
          if (active) setError('La sezione Famiglia richiede la nuova migrazione Supabase.');
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
    fetchFamilyGroupDetail(selectedGroup)
      .then((nextDetail) => {
        if (active) setDetail(nextDetail);
      })
      .catch((loadError) => {
        if (__DEV__) console.error('Flownd group detail load failed', loadError);
        if (active) setError('Non riesco a caricare i dati condivisi del gruppo.');
      });
    return () => {
      active = false;
    };
  }, [scope, selectedGroup]);

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
    if (!group) return;
    setDetail(await fetchFamilyGroupDetail(group));
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="FASE F"
        title="Famiglia e condivisione"
        leading={
          <Pressable
            accessibilityLabel="Indietro"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.backButton}>
            <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
          </Pressable>
        }
      />

      <View style={[styles.scopeControl, { backgroundColor: colors.sunken }]}>
        <ScopeButton
          label="Personale"
          icon="person"
          selected={scope === 'personal'}
          onPress={() => {
            setDetail(null);
            setScope('personal');
          }}
        />
        <ScopeButton
          label={selectedGroup?.name ?? 'Gruppo'}
          icon="group"
          selected={scope === 'group'}
          disabled={!selectedGroup}
          onPress={() => setScope('group')}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : scope === 'personal' ? (
        <PersonalView
          groups={groups}
          receivedInvites={receivedInvites}
          newGroupName={newGroupName}
          setNewGroupName={setNewGroupName}
          saving={saving}
          onSelectGroup={(groupId) => {
            setDetail(null);
            setSelectedGroupId(groupId);
            setScope('group');
          }}
          onCreateGroup={() => void runAction(async () => {
            if (!session || !newGroupName.trim()) return;
            const groupId = await createFamilyGroup(session.user.id, newGroupName);
            setNewGroupName('');
            setDetail(null);
            await loadGroups(groupId);
            setScope('group');
          })}
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
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteAccess={inviteAccess}
          setInviteAccess={setInviteAccess}
          saving={saving}
          onInvite={() => void runAction(async () => {
            if (!session || !inviteEmail.trim()) return;
            await createGroupInvite(selectedGroup.id, inviteEmail, session.user.id, {
              role: 'member',
              ...inviteAccess,
            });
            setInviteEmail('');
            await refreshDetail();
          })}
          onUpdateMember={(member, area, access) => void runAction(async () => {
            await updateGroupMemberAccess(selectedGroup.id, member.userId, {
              role: member.role === 'owner' ? 'member' : member.role,
              transactionsAccess:
                area === 'transactions' ? access : member.transactionsAccess,
              budgetsAccess: area === 'budgets' ? access : member.budgetsAccess,
              goalsAccess: area === 'goals' ? access : member.goalsAccess,
            });
            await refreshDetail();
          })}
        />
      ) : null}

      {error ? <Text style={[styles.error, { color: colors.negative }]}>{error}</Text> : null}
    </Screen>
  );
}

function ScopeButton({
  label,
  icon,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.scopeButton,
        selected && { backgroundColor: colors.surface, borderColor: colors.border },
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.scopeIcon, { color: selected ? colors.accent : colors.textSecondary }]}>
        {icon}
      </Text>
      <Text style={[styles.scopeLabel, { color: selected ? colors.text : colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function PersonalView({
  groups,
  receivedInvites,
  newGroupName,
  setNewGroupName,
  saving,
  onSelectGroup,
  onCreateGroup,
  onAcceptInvite,
}: {
  groups: FamilyGroup[];
  receivedInvites: GroupInvite[];
  newGroupName: string;
  setNewGroupName: (value: string) => void;
  saving: boolean;
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
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

      <Section title="NUOVO GRUPPO">
        <Card>
          <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
            Crea uno spazio per famiglia, coppia o coinquilini. I permessi si impostano per ogni invito.
          </Text>
          <Field
            label="Nome del gruppo"
            placeholder="es. Casa Rossi"
            value={newGroupName}
            onChangeText={setNewGroupName}
          />
          <PrimaryButton disabled={!newGroupName.trim()} loading={saving} onPress={onCreateGroup}>
            Crea gruppo
          </PrimaryButton>
        </Card>
      </Section>
    </>
  );
}

function GroupView({
  group,
  detail,
  inviteEmail,
  setInviteEmail,
  inviteAccess,
  setInviteAccess,
  saving,
  onInvite,
  onUpdateMember,
}: {
  group: FamilyGroup;
  detail: FamilyGroupDetail | null;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteAccess: InviteAccess;
  setInviteAccess: (value: InviteAccess) => void;
  saving: boolean;
  onInvite: () => void;
  onUpdateMember: (
    member: GroupMember,
    area: 'transactions' | 'budgets' | 'goals',
    access: SharingAccess,
  ) => void;
}) {
  const { colors } = useFlowndTheme();
  if (!detail) return <ActivityIndicator color={colors.accent} style={styles.loader} />;
  const memberNames = new Map(detail.members.map((member) => [member.userId, member.displayName]));

  return (
    <>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Vista condivisa di {group.name}. I dati personali non compaiono qui finché non vengono associati al gruppo.
      </Text>

      <View style={styles.summaryGrid}>
        <SummaryCard icon="flag" label="Obiettivi" value={String(detail.goals.length)} />
        <SummaryCard icon="pie_chart" label="Budget" value={String(detail.budgets.length)} />
        <SummaryCard icon="group" label="Membri" value={String(detail.members.length)} />
      </View>

      <Section title="SALDI TRA MEMBRI">
        <Card>
          {detail.balances.length ? detail.balances.map((balance) => (
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

      <Section title="BUDGET FAMILIARI">
        <Card>
          {detail.budgets.length ? detail.budgets.map((budget) => (
            <View key={budget.id} style={styles.dataRow}>
              <Text style={[styles.dataLabel, { color: colors.text }]}>{budget.category}</Text>
              <Text style={[styles.amount, { color: colors.text }]}>
                {formatAmount(budget.monthlyLimit, group.currency)}
              </Text>
            </View>
          )) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun budget familiare impostato.</Text>
          )}
        </Card>
      </Section>

      <Section title="MEMBRI E PERMESSI">
        {detail.members.map((member) => (
          <Card key={member.userId} style={styles.memberCard}>
            <Text style={[styles.itemTitle, { color: colors.text }]}>{member.displayName}</Text>
            <Text style={[styles.itemCaption, { color: colors.textSecondary }]}>
              {member.role === 'owner' ? 'Amministratore' : member.email}
            </Text>
            <PermissionRow
              label="Movimenti"
              value={member.transactionsAccess}
              editable={group.role === 'owner' && member.role !== 'owner'}
              onChange={(access) => onUpdateMember(member, 'transactions', access)}
            />
            <PermissionRow
              label="Budget"
              value={member.budgetsAccess}
              editable={group.role === 'owner' && member.role !== 'owner'}
              onChange={(access) => onUpdateMember(member, 'budgets', access)}
            />
            <PermissionRow
              label="Obiettivi"
              value={member.goalsAccess}
              editable={group.role === 'owner' && member.role !== 'owner'}
              onChange={(access) => onUpdateMember(member, 'goals', access)}
            />
          </Card>
        ))}
      </Section>

      {group.role === 'owner' ? (
        <Section title="INVITA UN MEMBRO">
          <Card>
            <Field
              label="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="nome@esempio.it"
              value={inviteEmail}
              onChangeText={setInviteEmail}
            />
            <PermissionRow
              label="Movimenti"
              value={inviteAccess.transactionsAccess}
              editable
              onChange={(transactionsAccess) => setInviteAccess({ ...inviteAccess, transactionsAccess })}
            />
            <PermissionRow
              label="Budget"
              value={inviteAccess.budgetsAccess}
              editable
              onChange={(budgetsAccess) => setInviteAccess({ ...inviteAccess, budgetsAccess })}
            />
            <PermissionRow
              label="Obiettivi"
              value={inviteAccess.goalsAccess}
              editable
              onChange={(goalsAccess) => setInviteAccess({ ...inviteAccess, goalsAccess })}
            />
            <PrimaryButton disabled={!inviteEmail.includes('@')} loading={saving} onPress={onInvite}>
              Crea invito
            </PrimaryButton>
            {detail.pendingInvites.map((invite) => (
              <Text key={invite.id} style={[styles.pending, { color: colors.textSecondary }]}>
                In attesa: {invite.email}
              </Text>
            ))}
          </Card>
        </Section>
      ) : null}
    </>
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

function SummaryCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { colors } = useFlowndTheme();
  return (
    <Card style={styles.summaryCard}>
      <Text style={[styles.materialIcon, { color: colors.accent }]}>{icon}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
    </Card>
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  scopeControl: { flexDirection: 'row', borderRadius: 13, padding: 3, marginBottom: 15 },
  scopeButton: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  scopeIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 18 },
  scopeLabel: { fontFamily: font.bodySemiBold, fontSize: 12, maxWidth: 110 },
  intro: { fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  loader: { marginVertical: 42 },
  section: { marginTop: 23 },
  sectionLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1.05, marginBottom: 8 },
  sectionContent: { gap: 8 },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 70 },
  groupIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontFamily: font.bodySemiBold, fontSize: 14 },
  itemCaption: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  cardCopy: { fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  chevron: { fontFamily: font.body, fontSize: 24 },
  empty: { fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  summaryGrid: { flexDirection: 'row', gap: 8, marginTop: 18 },
  summaryCard: { flex: 1, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 13 },
  summaryValue: { fontFamily: font.dataMedium, fontSize: 19, marginTop: 3 },
  summaryLabel: { fontFamily: font.bodyMedium, fontSize: 9, marginTop: 1 },
  dataRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dataLabel: { flex: 1, fontFamily: font.bodyMedium, fontSize: 12 },
  amount: { fontFamily: font.dataMedium, fontSize: 12 },
  smallAmount: { fontFamily: font.dataMedium, fontSize: 10 },
  goalBlock: { marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 6, overflow: 'hidden', marginTop: 5 },
  progressFill: { height: '100%', borderRadius: 6 },
  memberCard: { paddingVertical: 14 },
  permissionRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  permissionLabel: { fontFamily: font.bodyMedium, fontSize: 12 },
  accessChip: { minWidth: 76, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  accessText: { fontFamily: font.bodySemiBold, fontSize: 10 },
  pending: { fontFamily: font.body, fontSize: 10, marginTop: 8 },
  error: { fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 18 },
  disabled: { opacity: 0.45 },
});
