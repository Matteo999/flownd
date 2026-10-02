import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  GlassSurface,
  PrimaryButton,
  SecondaryButton,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { HIDDEN_AMOUNT } from '@/lib/dashboard';
import {
  type FamilyGroup,
  type FamilyGroupDetail,
  type GroupMember,
  familyGroupDetailQuery,
} from '@/lib/family';

type ModuleId = 'budget' | 'expenses' | 'wealth' | 'goals';

const MODULE_LABELS: Record<ModuleId, string> = {
  budget: 'Budget',
  expenses: 'Spese',
  wealth: 'Patrimonio',
  goals: 'Obiettivi',
};

const MEMBER_COLORS = ['#3F6F82', '#D17A3E', '#7C5CE6', '#4A90C8', '#C9A33B', '#C2527A'];

const GROUP_TEMPLATES = [
  { name: 'Casa', icon: 'home', copy: 'Budget e spese comuni', color: '#3F6F82' },
  { name: 'Coppia', icon: 'favorite', copy: 'Patrimonio e obiettivi', color: '#C2527A' },
  { name: 'Viaggio', icon: 'flight', copy: 'Spese divise e saldi', color: '#4A90C8' },
  { name: 'Amici', icon: 'groups', copy: 'Conti in sospeso', color: '#D17A3E' },
];

function groupIcon(name: string) {
  const normalized = name.toLocaleLowerCase('it-IT');
  if (/(casa|home|famiglia|coinquilin)/.test(normalized)) return 'home';
  if (/(coppia|noi due|amore|love)/.test(normalized)) return 'favorite';
  if (/(viaggio|vacanz|trip|lisbona|roma|parigi)/.test(normalized)) return 'flight';
  return 'groups';
}

function formatMoney(amount: number, currency: string, fractionDigits = 0) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
}

function roleLabel(role: FamilyGroup['role']) {
  if (role === 'owner') return 'sei amministratore';
  if (role === 'readonly') return 'sola lettura';
  return 'membro';
}

function naturalList(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

// Cosa condividono i membri decide quali moduli compaiono e in che ordine.
function sharedModules(detail: FamilyGroupDetail) {
  const { members, summary } = detail;
  const open = (id: ModuleId): boolean => {
    switch (id) {
      case 'budget':
        return summary.budgetTotal > 0 || members.some((member) => member.shareMonthlyBudget);
      case 'expenses':
        return (
          members.some((member) => member.transactionVisibility !== 'none') ||
          detail.recentTransactions.length > 0 ||
          detail.balances.some((balance) => Math.abs(balance.balance) >= 0.01)
        );
      case 'wealth':
        return members.some((member) => member.netWorthVisibility !== 'none');
      case 'goals':
        return detail.goals.length > 0;
    }
  };
  const active = (['budget', 'expenses', 'wealth', 'goals'] as const).filter(open);
  const priority: ModuleId[] = active.includes('budget')
    ? ['budget', 'expenses', 'goals', 'wealth']
    : active.includes('wealth')
      ? ['wealth', 'goals', 'expenses', 'budget']
      : ['expenses', 'goals', 'wealth', 'budget'];
  return {
    ordered: priority.filter((id) => active.includes(id)),
    hidden: (['budget', 'expenses', 'wealth', 'goals'] as const).filter((id) => !active.includes(id)),
  };
}

export function GroupsPage({
  groups,
  loading,
  activeIndex,
  userId,
  amountsVisible,
  onSelectGroup,
}: {
  groups: FamilyGroup[] | undefined;
  loading: boolean;
  activeIndex: number;
  userId: string | undefined;
  amountsVisible: boolean;
  onSelectGroup: (index: number) => void;
}) {
  if (!groups?.length) {
    return loading ? null : <GroupsEmptyState />;
  }
  const group = groups[activeIndex] ?? groups[0];
  return (
    <View style={styles.page}>
      {groups.length > 1 ? (
        <GroupChips
          activeId={group.id}
          groups={groups}
          onSelect={(id) => onSelectGroup(groups.findIndex((item) => item.id === id))}
        />
      ) : null}
      <GroupContent
        key={group.id}
        amountsVisible={amountsVisible}
        group={group}
        userId={userId}
      />
    </View>
  );
}

function GroupChips({
  groups,
  activeId,
  onSelect,
}: {
  groups: FamilyGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.chips}
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}>
      {groups.map((item) => {
        const selected = item.id === activeId;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => pressed && styles.pressed}>
            <GlassSurface
              interactive
              tintColor={selected ? colors.accent : undefined}
              style={styles.chip}>
              <View
                style={[
                  styles.chipIcon,
                  { backgroundColor: selected ? 'rgba(255,255,255,0.28)' : colors.accentSoft },
                ]}>
                <Text
                  style={[
                    styles.chipIconGlyph,
                    { color: selected ? colors.onAccent : colors.accent },
                  ]}>
                  {groupIcon(item.name)}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={[styles.chipLabel, { color: selected ? colors.onAccent : colors.text }]}>
                {item.name}
              </Text>
            </GlassSurface>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityLabel="Crea un nuovo gruppo"
        accessibilityRole="button"
        onPress={() => router.push('/family?create=1' as Href)}
        style={({ pressed }) => pressed && styles.pressed}>
        <GlassSurface interactive style={styles.chipAdd}>
          <Text style={[styles.chipIconGlyph, { color: colors.text }]}>add</Text>
        </GlassSurface>
      </Pressable>
    </ScrollView>
  );
}

function GroupContent({
  group,
  userId,
  amountsVisible,
}: {
  group: FamilyGroup;
  userId: string | undefined;
  amountsVisible: boolean;
}) {
  const { colors } = useFlowndTheme();
  const detailResult = useQuery({
    ...familyGroupDetailQuery(group, userId ?? ''),
    enabled: Boolean(userId),
  });
  const detail = detailResult.data;
  const settingsHref = `/group-settings?groupId=${group.id}` as Href;
  const members = detail?.members ?? [];
  const memberCount = detail?.summary.memberCount ?? members.length;

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={`Apri il gruppo ${group.name}`}
          accessibilityRole="button"
          onPress={() => router.push('/family' as Href)}
          style={({ pressed }) => [styles.headerMain, pressed && styles.pressed]}>
          <MemberAvatars members={members} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.groupName, { color: colors.text }]}>
              {group.name}
            </Text>
            <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>
              {memberCount} {memberCount === 1 ? 'membro' : 'membri'} · {roleLabel(group.role)}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Impostazioni del gruppo"
          accessibilityRole="button"
          onPress={() => router.push(settingsHref)}
          style={({ pressed }) => pressed && styles.pressed}>
          <GlassSurface interactive style={styles.gear}>
            <Text style={[styles.gearGlyph, { color: colors.text }]}>settings</Text>
          </GlassSurface>
        </Pressable>
      </View>

      {!detail ? (
        <Card>
          <Text style={[styles.mutedCopy, { color: colors.textSecondary }]}>
            {detailResult.isError ? 'Non riusciamo a caricare il gruppo. Riprova tra poco.' : 'Carico il gruppo…'}
          </Text>
        </Card>
      ) : (
        <GroupModules
          amountsVisible={amountsVisible}
          detail={detail}
          group={group}
          settingsHref={settingsHref}
          userId={userId}
        />
      )}
    </View>
  );
}

function GroupModules({
  detail,
  group,
  userId,
  amountsVisible,
  settingsHref,
}: {
  detail: FamilyGroupDetail;
  group: FamilyGroup;
  userId: string | undefined;
  amountsVisible: boolean;
  settingsHref: Href;
}) {
  const { colors } = useFlowndTheme();
  const { ordered, hidden } = sharedModules(detail);
  const money = (amount: number, digits = 0) =>
    amountsVisible ? formatMoney(amount, group.currency, digits) : HIDDEN_AMOUNT;
  const colorOf = (memberId: string) => {
    const index = detail.members.findIndex((member) => member.userId === memberId);
    return MEMBER_COLORS[Math.max(0, index) % MEMBER_COLORS.length];
  };
  const nameOf = (memberId: string) =>
    memberId === userId
      ? 'Tu'
      : detail.members.find((member) => member.userId === memberId)?.displayName ?? 'Membro';

  const modules: Record<ModuleId, React.ReactNode> = {
    budget: (
      <BudgetModule
        colorOf={colorOf}
        detail={detail}
        money={money}
        nameOf={nameOf}
      />
    ),
    expenses: (
      <ExpensesModule
        colorOf={colorOf}
        detail={detail}
        group={group}
        money={money}
        nameOf={nameOf}
        userId={userId}
      />
    ),
    wealth: <WealthModule detail={detail} money={money} userId={userId} />,
    goals: <GoalsModule detail={detail} money={money} />,
  };

  const unsharedHint = (id: ModuleId): string | null => {
    const silent = (predicate: (member: GroupMember) => boolean) =>
      detail.members.filter(predicate).map((member) => (member.userId === userId ? 'Tu' : member.displayName));
    if (id === 'wealth') {
      const names = silent((member) => member.netWorthVisibility === 'none');
      return names.length ? `${naturalList(names)} non ${names.length > 1 ? 'condividono' : 'condivide'} il patrimonio` : null;
    }
    if (id === 'expenses') {
      const names = silent((member) => member.transactionVisibility === 'none');
      return names.length ? `${naturalList(names)} non ${names.length > 1 ? 'condividono' : 'condivide'} le spese` : null;
    }
    return null;
  };

  return (
    <>
      {ordered.map((id) => (
        <View key={id} style={styles.module}>
          {modules[id]}
          {unsharedHint(id) ? (
            <View style={styles.hint}>
              <Text style={[styles.hintIcon, { color: colors.textSecondary }]}>lock</Text>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>{unsharedHint(id)}</Text>
            </View>
          ) : null}
        </View>
      ))}
      {hidden.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gestisci cosa condividere nel gruppo"
          onPress={() => router.push(settingsHref)}
          style={({ pressed }) => [
            styles.unshared,
            { borderColor: colors.border },
            pressed && styles.pressed,
          ]}>
          <View style={styles.flex}>
            <Text style={[styles.unsharedTitle, { color: colors.text }]}>
              {ordered.length ? 'Non condiviso da nessuno' : 'Nessuno condivide ancora qualcosa'}
            </Text>
            <Text style={[styles.unsharedCopy, { color: colors.textSecondary }]}>
              {hidden.map((id) => MODULE_LABELS[id]).join(' · ')}
            </Text>
          </View>
          <Text style={[styles.unsharedAction, { color: colors.accent }]}>Gestisci</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function ModuleTitle({ title, trailing }: { title: string; trailing?: string }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.moduleHeader}>
      <Text style={[styles.moduleTitle, { color: colors.text }]}>{title}</Text>
      {trailing ? (
        <Text style={[styles.moduleTrailing, { color: colors.textSecondary }]}>{trailing}</Text>
      ) : null}
    </View>
  );
}

type ModuleProps = {
  detail: FamilyGroupDetail;
  money: (amount: number, digits?: number) => string;
};

function BudgetModule({
  detail,
  money,
  nameOf,
  colorOf,
}: ModuleProps & { nameOf: (id: string) => string; colorOf: (id: string) => string }) {
  const { colors } = useFlowndTheme();
  const { summary } = detail;
  const progress = summary.budgetTotal > 0 ? summary.budgetSpent / summary.budgetTotal : 0;
  const barColor = progress > 1 ? colors.negative : progress > 0.8 ? colors.warning : colors.accent;
  const month = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date());
  return (
    <Card>
      <ModuleTitle title="Budget condiviso" trailing={month} />
      <View style={styles.bigRow}>
        <Text style={[styles.bigAmount, { color: colors.text }]}>{money(summary.budgetRemaining)}</Text>
        <Text style={[styles.bigCaption, { color: colors.textSecondary }]}>
          disponibili su {money(summary.budgetTotal)}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.sunken }]}>
        <View
          style={[
            styles.trackFill,
            { backgroundColor: barColor, width: `${Math.min(100, Math.max(0, progress * 100))}%` },
          ]}
        />
      </View>
      <View style={styles.splitRow}>
        <Text style={[styles.smallText, { color: colors.textSecondary }]}>
          {money(summary.budgetSpent)} spesi
        </Text>
        <Text style={[styles.smallText, { color: colors.textSecondary }]}>
          {amountsHidden(money) ? '••%' : `${Math.round(progress * 100)}% usato`}
        </Text>
      </View>
      {summary.contributions.some((item) => item.planned > 0) ? (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>CONTRIBUTI DEL MESE</Text>
          {summary.contributions
            .filter((item) => item.planned > 0)
            .map((item) => {
              const color = colorOf(item.userId);
              const covered = item.planned > 0 ? Math.min(1, item.covered / item.planned) : 0;
              const missing = Math.max(0, item.planned - item.covered);
              return (
                <View key={item.userId} style={styles.contribution}>
                  <MemberDot color={color} name={nameOf(item.userId)} />
                  <View style={styles.flex}>
                    <View style={styles.splitRow}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{nameOf(item.userId)}</Text>
                      <Text
                        style={[
                          styles.smallText,
                          { color: missing > 0 ? colors.negative : colors.textSecondary },
                        ]}>
                        {missing > 0
                          ? `${money(item.covered)} di ${money(item.planned)} · mancano ${money(missing)}`
                          : `${money(item.covered)} di ${money(item.planned)}`}
                      </Text>
                    </View>
                    <View style={[styles.trackThin, { backgroundColor: colors.sunken }]}>
                      <View
                        style={[styles.trackFill, { backgroundColor: color, width: `${covered * 100}%` }]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
        </>
      ) : null}
    </Card>
  );
}

// Con gli importi nascosti `money` restituisce solo il segnaposto.
function amountsHidden(money: ModuleProps['money']) {
  return money(0) === HIDDEN_AMOUNT;
}

function ExpensesModule({
  detail,
  group,
  money,
  nameOf,
  colorOf,
  userId,
}: ModuleProps & {
  group: FamilyGroup;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
  userId: string | undefined;
}) {
  const { colors } = useFlowndTheme();
  const balances = detail.balances.filter((balance) => Math.abs(balance.balance) >= 0.01);
  const recent = detail.recentTransactions.slice(0, 5);
  const myBalance = balances.find((balance) => balance.userId === userId);
  const creditor = [...balances].sort((a, b) => b.balance - a.balance)[0];
  const payTarget =
    myBalance && myBalance.balance < 0 && creditor && creditor.balance > 0 && creditor.userId !== userId
      ? creditor
      : null;
  return (
    <>
      {balances.length ? (
        <Card style={styles.stackGap}>
          <ModuleTitle title="Saldi" trailing="spese divise" />
          {balances.map((balance) => (
            <View key={balance.userId} style={styles.balanceRow}>
              <MemberDot color={colorOf(balance.userId)} name={nameOf(balance.userId)} />
              <Text style={[styles.rowTitle, styles.flex, { color: colors.text }]}>
                {nameOf(balance.userId)}
              </Text>
              <Text
                style={[
                  styles.balanceAmount,
                  { color: balance.balance >= 0 ? colors.positive : colors.negative },
                ]}>
                {balance.balance >= 0 ? 'Riceve ' : 'Deve '}
                {money(Math.abs(balance.balance), 2)}
              </Text>
            </View>
          ))}
          {payTarget && myBalance ? (
            <Text style={[styles.smallText, { color: colors.textSecondary }]}>
              Per pareggiare, dai {money(Math.min(Math.abs(myBalance.balance), payTarget.balance), 2)} a{' '}
              {nameOf(payTarget.userId)}.
            </Text>
          ) : null}
        </Card>
      ) : null}
      {recent.length ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Attività recente</Text>
          <Card>
            {recent.map((transaction, index) => (
              <View
                key={transaction.id}
                style={[
                  styles.activityRow,
                  index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                ]}>
                <MemberDot color={colorOf(transaction.memberId)} name={nameOf(transaction.memberId)} />
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
                    {transaction.description}
                  </Text>
                  <Text numberOfLines={1} style={[styles.smallText, { color: colors.textSecondary }]}>
                    {nameOf(transaction.memberId)} · {transaction.category ?? 'Categoria privata'} ·{' '}
                    {formatShortDate(transaction.occurredAt)}
                  </Text>
                </View>
                <Text style={[styles.activityAmount, { color: colors.text }]}>
                  {amountsHidden(money) ? HIDDEN_AMOUNT : `− ${formatMoney(Math.abs(transaction.amount), group.currency, 2)}`}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : balances.length ? null : (
        <Card>
          <Text style={[styles.mutedCopy, { color: colors.textSecondary }]}>
            Nessuna spesa condivisa per ora.
          </Text>
        </Card>
      )}
    </>
  );
}

function WealthModule({
  detail,
  money,
  userId,
}: ModuleProps & { userId: string | undefined }) {
  const { colors } = useFlowndTheme();
  const sharing = detail.members.filter((member) => member.netWorthVisibility !== 'none');
  const sharingNames = sharing.map((member) => (member.userId === userId ? 'Tu' : member.displayName));
  return (
    <Card>
      <ModuleTitle
        title="Patrimonio condiviso"
        trailing={sharing.length ? `Condiviso da ${naturalList(sharingNames)}` : undefined}
      />
      <Text style={[styles.bigAmount, { color: colors.text }]}>
        {money(detail.summary.netWorthTotal, 2)}
      </Text>
    </Card>
  );
}

function GoalsModule({ detail, money }: ModuleProps) {
  const { colors } = useFlowndTheme();
  return (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Obiettivi condivisi</Text>
      <View style={styles.goalList}>
        {detail.goals.map((goal) => {
          const progress = goal.targetAmount > 0 ? goal.savedAmount / goal.targetAmount : 0;
          return (
            <Pressable
              key={goal.id}
              accessibilityRole="button"
              accessibilityLabel={`Apri l’obiettivo ${goal.name}`}
              onPress={() => router.push(`/goal-detail?goalId=${goal.id}` as Href)}
              style={({ pressed }) => pressed && styles.pressed}>
              <Card>
                <View style={styles.goalTop}>
                  <View style={[styles.goalIcon, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.goalGlyph, { color: colors.accent }]}>flag</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
                      {goal.name}
                    </Text>
                    <Text style={[styles.smallText, { color: colors.textSecondary }]}>
                      {money(goal.savedAmount)} di {money(goal.targetAmount)}
                    </Text>
                  </View>
                  <Text style={[styles.goalPercent, { color: colors.accent }]}>
                    {amountsHidden(money) ? '••%' : `${Math.round(progress * 100)}%`}
                  </Text>
                </View>
                <View style={[styles.track, { backgroundColor: colors.sunken }]}>
                  <View
                    style={[
                      styles.trackFill,
                      { backgroundColor: colors.accent, width: `${Math.min(100, progress * 100)}%` },
                    ]}
                  />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function MemberAvatars({ members }: { members: GroupMember[] }) {
  const visible = members.slice(0, 3);
  const overflow = members.length - visible.length;
  return (
    <View style={styles.avatars}>
      {visible.map((member, index) => (
        <MemberDot
          key={member.userId}
          color={MEMBER_COLORS[index % MEMBER_COLORS.length]}
          imageUrl={member.avatarUrl}
          name={member.displayName}
          overlap={index > 0}
          size={34}
        />
      ))}
      {overflow > 0 ? (
        <MemberDot color="#8A9A92" name={`+${overflow}`} overlap size={34} literal />
      ) : null}
    </View>
  );
}

function MemberDot({
  name,
  color,
  imageUrl,
  size = 32,
  overlap = false,
  literal = false,
}: {
  name: string;
  color: string;
  imageUrl?: string | null;
  size?: number;
  overlap?: boolean;
  literal?: boolean;
}) {
  const { colors } = useFlowndTheme();
  const [failed, setFailed] = useState(false);
  const initials = literal ? name : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
    marginLeft: overlap ? -10 : 0,
    borderWidth: overlap || size > 32 ? 2 : 0,
    borderColor: colors.background,
  };
  if (imageUrl && !failed) {
    return (
      <Image
        accessibilityLabel={`Avatar di ${name}`}
        contentFit="cover"
        onError={() => setFailed(true)}
        source={{ uri: imageUrl }}
        style={frame}
      />
    );
  }
  return (
    <View style={[frame, styles.dot, { backgroundColor: `${color}26` }]}>
      <Text style={[styles.dotText, { color, fontSize: size > 32 ? 12 : 11 }]}>{initials}</Text>
    </View>
  );
}

// Nessun gruppo: crea, entra con un invito oppure parti da un modello.
function GroupsEmptyState() {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.empty}>
      <GlassSurface style={styles.emptyIconRing}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.emptyIconGlyph, { color: colors.accent }]}>group_add</Text>
        </View>
      </GlassSurface>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessun gruppo</Text>
      <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
        Crea un gruppo per condividere budget, spese, patrimonio o obiettivi. Ogni membro sceglie cosa mostrare.
      </Text>
      <View style={styles.emptyActions}>
        <PrimaryButton onPress={() => router.push('/family?create=1' as Href)}>
          Crea un gruppo
        </PrimaryButton>
        <SecondaryButton onPress={() => router.push('/family' as Href)}>
          Ho un invito
        </SecondaryButton>
      </View>
      <Text style={[styles.eyebrow, styles.templatesLabel, { color: colors.textSecondary }]}>
        INIZIA DA UN MODELLO
      </Text>
      <View style={styles.templates}>
        {GROUP_TEMPLATES.map((template) => (
          <Pressable
            key={template.name}
            accessibilityRole="button"
            accessibilityLabel={`Crea un gruppo ${template.name}`}
            onPress={() =>
              router.push(`/family?create=1&name=${encodeURIComponent(template.name)}` as Href)
            }
            style={({ pressed }) => [styles.template, pressed && styles.pressed]}>
            <Card style={styles.templateCard}>
              <View style={[styles.templateIcon, { backgroundColor: `${template.color}22` }]}>
                <Text style={[styles.templateGlyph, { color: template.color }]}>{template.icon}</Text>
              </View>
              <Text style={[styles.templateName, { color: colors.text }]}>{template.name}</Text>
              <Text style={[styles.templateCopy, { color: colors.textSecondary }]}>{template.copy}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const glyph = { fontFamily: 'MaterialSymbols_400Regular' } as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },
  page: { gap: 14 },
  content: { gap: 14 },
  chipsScroll: { marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  chip: { height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 16 },
  chipIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chipIconGlyph: { ...glyph, fontSize: 18 },
  chipLabel: { fontFamily: font.bodySemiBold, fontSize: 14, maxWidth: 120 },
  chipAdd: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupName: { fontFamily: font.displayBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  groupMeta: { fontFamily: font.body, fontSize: 12, marginTop: 1 },
  gear: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  gearGlyph: { ...glyph, fontSize: 20 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotText: { fontFamily: font.displayBold },
  module: { gap: 8 },
  moduleHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  moduleTitle: { fontFamily: font.displaySemiBold, fontSize: 18 },
  moduleTrailing: { fontFamily: font.bodyMedium, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 18, marginTop: 4 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  bigAmount: { fontFamily: font.displayBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 },
  bigCaption: { fontFamily: font.bodyMedium, fontSize: 13 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  trackThin: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  trackFill: { height: '100%', borderRadius: 4 },
  splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 },
  smallText: { fontFamily: font.body, fontSize: 12, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  eyebrow: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1.1 },
  contribution: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  rowTitle: { fontFamily: font.bodyMedium, fontSize: 14 },
  stackGap: { gap: 10 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balanceAmount: { fontFamily: font.dataMedium, fontSize: 13 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  activityAmount: { fontFamily: font.dataMedium, fontSize: 13 },
  goalList: { gap: 10 },
  goalTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  goalIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  goalGlyph: { ...glyph, fontSize: 20 },
  goalPercent: { fontFamily: font.displayBold, fontSize: 15 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  hintIcon: { ...glyph, fontSize: 16 },
  hintText: { fontFamily: font.body, fontSize: 12, flexShrink: 1 },
  mutedCopy: { fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  unshared: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  unsharedTitle: { fontFamily: font.bodySemiBold, fontSize: 13 },
  unsharedCopy: { fontFamily: font.body, fontSize: 12, marginTop: 2 },
  unsharedAction: { fontFamily: font.bodySemiBold, fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 28 },
  emptyIconRing: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  emptyIconGlyph: { ...glyph, fontSize: 36 },
  emptyTitle: { fontFamily: font.displayBold, fontSize: 24, marginTop: 18 },
  emptyCopy: { fontFamily: font.body, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
  emptyActions: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
  templatesLabel: { alignSelf: 'flex-start', marginTop: 28, marginBottom: 10 },
  templates: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  template: { width: '48%', flexGrow: 1 },
  templateCard: { gap: 4 },
  templateIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  templateGlyph: { ...glyph, fontSize: 19 },
  templateName: { fontFamily: font.bodySemiBold, fontSize: 14 },
  templateCopy: { fontFamily: font.body, fontSize: 12 },
});
