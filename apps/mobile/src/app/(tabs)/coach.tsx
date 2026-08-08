import { type ComponentProps, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  Card,
  PageHeader,
  PrimaryButton,
  Screen,
  ScreenScrollBridge,
  SecondaryButton,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { AppHeaderActions } from '@/components/app-header-actions';
import {
  askCoach,
  type CoachMessage,
  type CoachPendingAction,
} from '@/lib/coach';
import { formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

const welcomeMessage: CoachMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Ciao! Posso rispondere usando i tuoi dati, registrare una spesa o preparare un obiettivo. Ogni modifica resterà in attesa della tua conferma.',
};

const starters = [
  'Quanto ho speso questo mese?',
  'Posso permettermi un weekend da 300 €?',
  'Ho speso 20 € al bar',
];

export default function CoachScreen() {
  const { colors } = useFlowndTheme();
  const {
    session,
    saving,
    draft,
    addTransaction,
    createGoal,
    updateGoal,
    updateBudgetAmount,
  } = useApp();
  const [messages, setMessages] = useState<CoachMessage[]>([welcomeMessage]);
  const [input, setInput] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<CoachPendingAction | null>(null);
  const listRef = useRef<FlatList<CoachMessage>>(null);

  async function sendMessage(rawMessage = input) {
    const content = rawMessage.trim();
    if (!content || waiting || pendingAction || !session) return;
    const userMessage: CoachMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setWaiting(true);
    try {
      const response = await askCoach(nextMessages, session.access_token);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.message,
        },
      ]);
      setPendingAction(response.pendingAction);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            error instanceof Error
              ? error.message
              : 'Il Coach non è disponibile. Riprova tra poco.',
        },
      ]);
    } finally {
      setWaiting(false);
    }
  }

  async function confirmAction(action: CoachPendingAction) {
    const args = action.arguments;
    let success = false;
    if (action.type === 'add_transaction') {
      success = await addTransaction({
        description: String(args.description ?? '').trim(),
        amount: Number(args.amount),
        category: String(args.category ?? 'Altro'),
        occurredAt:
          typeof args.occurred_at === 'string'
            ? args.occurred_at
            : new Date().toISOString(),
        kind: 'expense',
      });
    }
    if (action.type === 'create_goal') {
      success = await createGoal({
        name: String(args.name ?? '').trim(),
        targetAmount: Number(args.target_amount),
        deadline: typeof args.deadline === 'string' ? args.deadline : '',
        savedAmount: 0,
      });
    }
    if (action.type === 'update_goal') {
      success = await updateGoal(
        typeof args.goal_id === 'string' ? args.goal_id : draft.goal.id ?? null,
        {
          ...(typeof args.name === 'string' ? { name: args.name } : {}),
          ...(typeof args.target_amount === 'number'
            ? { targetAmount: args.target_amount }
            : {}),
          ...(args.deadline !== null && typeof args.deadline === 'string'
            ? { deadline: args.deadline }
            : {}),
        },
      );
    }
    if (action.type === 'update_budget') {
      success = await updateBudgetAmount(
        String(args.category_key),
        Number(args.monthly_limit),
      );
    }

    if (success) {
      setPendingAction(null);
      setMessages((current) => [
        ...current,
        {
          id: `confirmed-${Date.now()}`,
          role: 'assistant',
          content: confirmationMessage(action),
        },
      ]);
    }
  }

  return (
    <Screen scroll={false} style={styles.screen}>
      <PageHeader
        title="Coach"
        action={<AppHeaderActions />}
        collapseInPlace
      />
      <ScreenScrollBridge>
        {(onScroll) => (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={88}
            style={styles.keyboardView}>
            <Animated.FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.messages}
          ListFooterComponent={
            <>
              {messages.length === 1 ? (
                <View style={styles.starters}>
                  {starters.map((starter) => (
                    <Pressable
                      key={starter}
                      accessibilityRole="button"
                      onPress={() => void sendMessage(starter)}
                      style={({ pressed }) => [
                        styles.starter,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.starterText, { color: colors.text }]}>
                        {starter}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {waiting ? (
                <View style={styles.waiting}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={[styles.waitingText, { color: colors.textSecondary }]}>
                    Sto leggendo i dati utili…
                  </Text>
                </View>
              ) : null}
              {pendingAction ? (
                <ActionConfirmationCard
                  action={pendingAction}
                  loading={saving}
                  onChange={setPendingAction}
                  onCancel={() => {
                    setPendingAction(null);
                    setMessages((current) => [
                      ...current,
                      {
                        id: `cancelled-${Date.now()}`,
                        role: 'assistant',
                        content: 'Va bene, non ho salvato nulla.',
                      },
                    ]);
                  }}
                  onConfirm={(action) => void confirmAction(action)}
                />
              ) : null}
            </>
          }
            />

            <View
              style={[
                styles.composer,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
          <TextInput
            accessibilityLabel="Scrivi al Coach"
            value={input}
            onChangeText={setInput}
            placeholder="Chiedi o registra qualcosa…"
            placeholderTextColor={colors.textSecondary}
            selectionColor={colors.accent}
            multiline
            maxLength={1000}
            editable={!waiting && !pendingAction}
            style={[styles.composerInput, { color: colors.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invia messaggio"
            disabled={!input.trim() || waiting || Boolean(pendingAction)}
            onPress={() => void sendMessage()}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: colors.accent },
              (!input.trim() || waiting || pendingAction) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.sendIcon}>arrow_upward</Text>
          </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </ScreenScrollBridge>
    </Screen>
  );
}

function MessageBubble({ message }: { message: CoachMessage }) {
  const { colors } = useFlowndTheme();
  const user = message.role === 'user';
  return (
    <View
      style={[
        styles.messageRow,
        user ? styles.userRow : styles.assistantRow,
      ]}>
      {!user ? (
        <View style={[styles.coachIcon, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.coachIconText, { color: colors.accent }]}>✦</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: user ? colors.accent : colors.surface,
            borderColor: user ? colors.accent : colors.border,
          },
        ]}>
        <Text
          style={[
            styles.messageText,
            { color: user ? colors.onAccent : colors.text },
          ]}>
          <FormattedMessageText content={message.content} />
        </Text>
      </View>
    </View>
  );
}

function FormattedMessageText({ content }: { content: string }) {
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    const isBold = part.startsWith('**') && part.endsWith('**');
    if (!isBold) return part;
    return (
      <Text key={`${part}-${index}`} style={styles.messageTextBold}>
        {part.slice(2, -2)}
      </Text>
    );
  });
}

function ActionConfirmationCard({
  action,
  loading,
  onChange,
  onCancel,
  onConfirm,
}: {
  action: CoachPendingAction;
  loading: boolean;
  onChange: (action: CoachPendingAction) => void;
  onCancel: () => void;
  onConfirm: (action: CoachPendingAction) => void;
}) {
  const { colors } = useFlowndTheme();
  const [editing, setEditing] = useState(false);
  const args = action.arguments;
  const valid = actionIsValid(action);

  function updateArgument(key: string, value: string | number | null) {
    onChange({ ...action, arguments: { ...args, [key]: value } });
  }

  return (
    <Card style={[styles.confirmationCard, { backgroundColor: colors.accentSoft }]}>
      <View style={styles.confirmationHeader}>
        <View style={[styles.confirmationIcon, { backgroundColor: colors.accent }]}>
          <Text style={styles.confirmationIconText}>rule</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.confirmationEyebrow, { color: colors.accent }]}>
            CONFERMA RICHIESTA
          </Text>
          <Text style={[styles.confirmationTitle, { color: colors.text }]}>
            {actionTitle(action.type)}
          </Text>
        </View>
      </View>

      {editing ? (
        <ActionEditor action={action} onChange={updateArgument} />
      ) : (
        <View style={styles.actionSummary}>
          {actionRows(action).map((row) => (
            <View key={row.label} style={styles.actionRow}>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {row.label}
              </Text>
              <Text style={[styles.actionValue, { color: colors.text }]}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.safetyCopy, { color: colors.textSecondary }]}>
        Nessuna modifica verrà salvata finché non confermi.
      </Text>
      <View style={styles.actionButtons}>
        <SecondaryButton compact onPress={() => setEditing((current) => !current)}>
          {editing ? 'Riepilogo' : 'Modifica'}
        </SecondaryButton>
        <PrimaryButton
          compact
          disabled={!valid || loading}
          loading={loading}
          onPress={() => onConfirm(action)}>
          Conferma
        </PrimaryButton>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={({ pressed }) => [
          styles.cancelAction,
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
          Annulla proposta
        </Text>
      </Pressable>
    </Card>
  );
}

function ActionEditor({
  action,
  onChange,
}: {
  action: CoachPendingAction;
  onChange: (key: string, value: string | number | null) => void;
}) {
  if (action.type === 'add_transaction') {
    return (
      <View>
        <CompactField
          label="Descrizione"
          value={String(action.arguments.description ?? '')}
          onChangeText={(value) => onChange('description', value)}
        />
        <CompactField
          label="Importo"
          value={String(action.arguments.amount ?? '')}
          keyboardType="decimal-pad"
          onChangeText={(value) =>
            onChange('amount', Number(value.replace(',', '.')) || 0)
          }
        />
        <CompactField
          label="Categoria"
          value={String(action.arguments.category ?? '')}
          onChangeText={(value) => onChange('category', value)}
        />
      </View>
    );
  }
  if (action.type === 'create_goal' || action.type === 'update_goal') {
    return (
      <View>
        <CompactField
          label="Nome"
          value={String(action.arguments.name ?? '')}
          onChangeText={(value) => onChange('name', value)}
        />
        <CompactField
          label="Importo target"
          value={String(action.arguments.target_amount ?? '')}
          keyboardType="decimal-pad"
          onChangeText={(value) =>
            onChange('target_amount', Number(value.replace(',', '.')) || 0)
          }
        />
        <CompactField
          label="Scadenza"
          value={String(action.arguments.deadline ?? '')}
          placeholder="AAAA-MM-GG"
          onChangeText={(value) => onChange('deadline', value || null)}
        />
      </View>
    );
  }
  return (
    <View>
      <CompactField
        label="Quota"
        value={String(action.arguments.category_key ?? '')}
        onChangeText={(value) => onChange('category_key', value)}
      />
      <CompactField
        label="Budget mensile"
        value={String(action.arguments.monthly_limit ?? '')}
        keyboardType="decimal-pad"
        onChangeText={(value) =>
          onChange('monthly_limit', Number(value.replace(',', '.')) || 0)
        }
      />
    </View>
  );
}

function CompactField({
  label,
  ...props
}: ComponentProps<typeof TextInput> & { label: string }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.compactFieldWrap}>
      <Text style={[styles.compactLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.accent}
        style={[
          styles.compactField,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        {...props}
      />
    </View>
  );
}

function actionTitle(type: CoachPendingAction['type']) {
  if (type === 'add_transaction') return 'Nuova spesa';
  if (type === 'create_goal') return 'Nuovo obiettivo';
  if (type === 'update_goal') return 'Modifica obiettivo';
  return 'Modifica budget';
}

function actionRows(action: CoachPendingAction) {
  const args = action.arguments;
  if (action.type === 'add_transaction') {
    return [
      { label: 'Descrizione', value: String(args.description ?? '') },
      { label: 'Categoria', value: String(args.category ?? 'Altro') },
      { label: 'Importo', value: formatEuro(Number(args.amount) || 0) },
      {
        label: 'Data',
        value:
          typeof args.occurred_at === 'string' ? args.occurred_at : 'Oggi',
      },
    ];
  }
  if (action.type === 'create_goal' || action.type === 'update_goal') {
    return [
      { label: 'Obiettivo', value: String(args.name ?? 'Obiettivo attivo') },
      {
        label: 'Target',
        value:
          typeof args.target_amount === 'number'
            ? formatEuro(args.target_amount)
            : 'Invariato',
      },
      { label: 'Scadenza', value: String(args.deadline ?? 'Nessuna') },
    ];
  }
  const budgetNames: Record<string, string> = {
    needs: 'Necessità',
    wants: 'Desideri',
    savings: 'Risparmio',
  };
  return [
    {
      label: 'Quota',
      value:
        budgetNames[String(args.category_key)] ??
        String(args.category_key ?? ''),
    },
    {
      label: 'Nuovo limite',
      value: formatEuro(Number(args.monthly_limit) || 0),
    },
  ];
}

function actionIsValid(action: CoachPendingAction) {
  const args = action.arguments;
  if (action.type === 'add_transaction') {
    return Boolean(String(args.description ?? '').trim()) && Number(args.amount) > 0;
  }
  if (action.type === 'create_goal') {
    return Boolean(String(args.name ?? '').trim()) && Number(args.target_amount) > 0;
  }
  if (action.type === 'update_goal') {
    return Boolean(
      String(args.name ?? '').trim() ||
        Number(args.target_amount) > 0 ||
        args.deadline,
    );
  }
  return (
    ['needs', 'wants', 'savings'].includes(String(args.category_key)) &&
    Number(args.monthly_limit) > 0
  );
}

function confirmationMessage(action: CoachPendingAction) {
  if (action.type === 'add_transaction') return 'Spesa salvata nella Timeline.';
  if (action.type === 'create_goal') return 'Obiettivo creato.';
  if (action.type === 'update_goal') return 'Obiettivo aggiornato.';
  return 'Budget aggiornato.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { paddingBottom: 92 },
  keyboardView: { flex: 1 },
  messages: { flexGrow: 1, paddingBottom: 14 },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  userRow: { justifyContent: 'flex-end', paddingLeft: 46 },
  assistantRow: { justifyContent: 'flex-start', paddingRight: 28, gap: 8 },
  coachIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachIconText: { fontFamily: font.bodySemiBold, fontSize: 14 },
  bubble: {
    maxWidth: '88%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  messageText: { fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  messageTextBold: { fontFamily: font.bodySemiBold },
  starters: { gap: 8, marginTop: 4, marginBottom: 12, paddingLeft: 36 },
  starter: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  starterText: { fontFamily: font.bodyMedium, fontSize: 12 },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 36,
    paddingVertical: 10,
  },
  waitingText: { fontFamily: font.body, fontSize: 12 },
  composer: {
    minHeight: 54,
    maxHeight: 126,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 13,
    paddingRight: 6,
    paddingVertical: 6,
  },
  composerInput: {
    flex: 1,
    maxHeight: 108,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 9,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 21,
    lineHeight: 24,
  },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.68 },
  confirmationCard: { marginTop: 6, marginBottom: 14 },
  confirmationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmationIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationIconText: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 20,
  },
  confirmationEyebrow: {
    fontFamily: font.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.9,
  },
  confirmationTitle: {
    fontFamily: font.displaySemiBold,
    fontSize: 19,
    marginTop: 1,
  },
  actionSummary: { marginTop: 14, gap: 8 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  actionLabel: { fontFamily: font.body, fontSize: 11 },
  actionValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: font.bodyMedium,
    fontSize: 12,
  },
  safetyCopy: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 14 },
  actionButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cancelAction: { alignSelf: 'center', padding: 10, marginTop: 3 },
  cancelText: { fontFamily: font.bodyMedium, fontSize: 11 },
  compactFieldWrap: { marginTop: 10 },
  compactLabel: { fontFamily: font.bodyMedium, fontSize: 10, marginBottom: 5 },
  compactField: {
    minHeight: 42,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontFamily: font.body,
    fontSize: 13,
  },
});
