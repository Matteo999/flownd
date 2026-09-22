import { type ComponentProps, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
  createCoachMessageId,
  deleteCoachConversation,
  listCoachConversations,
  loadCoachConversation,
  resolveCoachAction,
  type CoachConversation,
  type CoachMessage,
  type CoachPendingAction,
} from '@/lib/coach';
import { formatEuro } from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

const welcomeMessage: CoachMessage = {
  id: 'welcome',
  conversationId: null,
  role: 'assistant',
  content:
    'Ciao! Posso rispondere usando i tuoi dati, registrare una spesa o preparare un obiettivo. Ogni modifica resterà in attesa della tua conferma.',
  pendingAction: null,
  actionStatus: null,
  createdAt: '1970-01-01T00:00:00.000Z',
};

const starters = [
  'Quanto ho speso questo mese?',
  'Posso permettermi un weekend da 300 €?',
  'Ho speso 20 € al bar',
];

export default function CoachScreen() {
  const { colors, isDark } = useFlowndTheme();
  const { session, refreshData } = useApp();
  const [messages, setMessages] = useState<CoachMessage[]>([welcomeMessage]);
  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [resolvingMessageId, setResolvingMessageId] = useState<string | null>(null);
  const listRef = useRef<FlatList<CoachMessage>>(null);
  const selectionVersion = useRef(0);
  const pendingMessage = [...messages].reverse().find(
    (message) => message.pendingAction && message.actionStatus === 'pending',
  );

  useEffect(() => {
    if (!session) {
      setConversations([]);
      setConversationId(null);
      setMessages([welcomeMessage]);
      setLoadingHistory(false);
      return;
    }
    let active = true;
    const version = ++selectionVersion.current;
    setLoadingHistory(true);
    void listCoachConversations(session.access_token)
      .then(async (history) => {
        if (!active || version !== selectionVersion.current) return;
        setConversations(history);
        if (!history[0]) {
          setMessages([welcomeMessage]);
          setConversationId(null);
          return;
        }
        const loaded = await loadCoachConversation(
          history[0].id,
          session.access_token,
        );
        if (!active || version !== selectionVersion.current) return;
        setConversationId(loaded.conversation.id);
        setMessages([welcomeMessage, ...loaded.messages]);
      })
      .catch((error) => {
        if (!active || version !== selectionVersion.current) return;
        setMessages([welcomeMessage, localErrorMessage(error)]);
      })
      .finally(() => {
        if (active && version === selectionVersion.current) {
          setLoadingHistory(false);
        }
      });
    return () => {
      active = false;
    };
  }, [session]);

  async function refreshHistory() {
    if (!session) return;
    const history = await listCoachConversations(session.access_token);
    setConversations(history);
  }

  function startNewConversation() {
    selectionVersion.current += 1;
    setWaiting(false);
    setResolvingMessageId(null);
    setConversationId(null);
    setMessages([welcomeMessage]);
    setInput('');
    setHistoryVisible(false);
  }

  async function openConversation(selectedId: string) {
    if (!session || selectedId === conversationId) {
      setHistoryVisible(false);
      return;
    }
    const version = ++selectionVersion.current;
    setWaiting(false);
    setResolvingMessageId(null);
    setLoadingHistory(true);
    try {
      const loaded = await loadCoachConversation(selectedId, session.access_token);
      if (version !== selectionVersion.current) return;
      setConversationId(loaded.conversation.id);
      setMessages([welcomeMessage, ...loaded.messages]);
      setInput('');
      setHistoryVisible(false);
    } catch (error) {
      if (version === selectionVersion.current) {
        Alert.alert('Storico non disponibile', errorMessage(error));
      }
    } finally {
      if (version === selectionVersion.current) setLoadingHistory(false);
    }
  }

  function requestDeleteConversation(selected: CoachConversation) {
    Alert.alert(
      'Eliminare la conversazione?',
      `“${selected.title}” verrà rimossa definitivamente.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => void removeConversation(selected.id),
        },
      ],
    );
  }

  async function removeConversation(selectedId: string) {
    if (!session) return;
    try {
      await deleteCoachConversation(selectedId, session.access_token);
      const history = conversations.filter((item) => item.id !== selectedId);
      setConversations(history);
      if (conversationId === selectedId) {
        if (history[0]) await openConversation(history[0].id);
        else startNewConversation();
      }
    } catch (error) {
      Alert.alert('Eliminazione non riuscita', errorMessage(error));
    }
  }

  async function sendMessage(rawMessage = input) {
    const content = rawMessage.trim();
    if (!content || waiting || pendingMessage || !session) return;
    const selectedConversationId = conversationId;
    const version = ++selectionVersion.current;
    setLoadingHistory(false);
    const userMessage: CoachMessage = {
      id: createCoachMessageId(),
      conversationId: selectedConversationId,
      role: 'user',
      content,
      pendingAction: null,
      actionStatus: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setWaiting(true);
    try {
      const response = await askCoach(
        selectedConversationId,
        userMessage,
        session.access_token,
      );
      await refreshHistory();
      if (version !== selectionVersion.current) return;
      setConversationId(response.conversation.id);
      setMessages((current) => current.map((message) =>
        message.id === userMessage.id
          ? { ...message, conversationId: response.conversation.id }
          : message,
      ).concat(response.message));
    } catch (error) {
      if (version !== selectionVersion.current) return;
      void refreshHistory().catch(() => undefined);
      setMessages((current) => [
        ...current,
        localErrorMessage(error),
      ]);
    } finally {
      if (version === selectionVersion.current) setWaiting(false);
    }
  }

  function updatePendingAction(action: CoachPendingAction) {
    if (!pendingMessage) return;
    setMessages((current) => current.map((message) =>
      message.id === pendingMessage.id ? { ...message, pendingAction: action } : message,
    ));
  }

  async function resolvePendingAction(resolution: 'confirmed' | 'cancelled') {
    if (!pendingMessage?.pendingAction || !session) return;
    const version = selectionVersion.current;
    setResolvingMessageId(pendingMessage.id);
    try {
      const response = await resolveCoachAction(
        pendingMessage.id,
        resolution,
        pendingMessage.pendingAction,
        session.access_token,
      );
      if (version === selectionVersion.current) {
        setMessages((current) => [
          ...current.map((message) => message.id === pendingMessage.id
            ? { ...message, actionStatus: response.actionStatus }
            : message),
          ...(response.message ? [response.message] : []),
        ]);
      }
      if (resolution === 'confirmed') await refreshData();
      await refreshHistory();
    } catch (error) {
      Alert.alert('Operazione non riuscita', errorMessage(error));
    } finally {
      if (version === selectionVersion.current) setResolvingMessageId(null);
    }
  }

  return (
    <Screen animateFirstFocus scroll={false} style={styles.screen}>
      <PageHeader
        title="Coach"
        action={(
          <AppHeaderActions
            leading={(
              <View style={styles.headerCoachActions}>
                <HeaderIconButton
                  icon="history"
                  label="Apri storico conversazioni"
                  onPress={() => setHistoryVisible(true)}
                />
                <HeaderIconButton
                  icon="add_comment"
                  label="Nuova conversazione"
                  onPress={startNewConversation}
                />
              </View>
            )}
          />
        )}
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
              {pendingMessage?.pendingAction ? (
                <ActionConfirmationCard
                  action={pendingMessage.pendingAction}
                  loading={resolvingMessageId === pendingMessage.id}
                  onChange={updatePendingAction}
                  onCancel={() => void resolvePendingAction('cancelled')}
                  onConfirm={() => void resolvePendingAction('confirmed')}
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
            keyboardAppearance={isDark ? 'dark' : 'light'}
            value={input}
            onChangeText={setInput}
            placeholder="Chiedi o registra qualcosa…"
            placeholderTextColor={colors.textSecondary}
            selectionColor={colors.accent}
            multiline
            maxLength={1000}
            editable={!waiting && !pendingMessage}
            style={[styles.composerInput, { color: colors.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invia messaggio"
            disabled={!input.trim() || waiting || Boolean(pendingMessage)}
            onPress={() => void sendMessage()}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: colors.accent },
              (!input.trim() || waiting || pendingMessage) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.sendIcon}>arrow_upward</Text>
          </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </ScreenScrollBridge>
      <Modal
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
        presentationStyle="pageSheet"
        visible={historyVisible}>
        <View style={[styles.historyScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.historyHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.historyTitle, { color: colors.text }]}>Conversazioni</Text>
              <Text style={[styles.historySubtitle, { color: colors.textSecondary }]}>Ultime 10</Text>
            </View>
            <Pressable
              accessibilityLabel="Chiudi storico"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setHistoryVisible(false)}
              style={({ pressed }) => [styles.historyClose, pressed && styles.pressed]}>
              <Text style={[styles.materialIcon, { color: colors.text }]}>close</Text>
            </Pressable>
          </View>
          <PrimaryButton onPress={startNewConversation}>Nuova chat</PrimaryButton>
          {loadingHistory ? (
            <ActivityIndicator color={colors.accent} style={styles.historyLoading} />
          ) : (
            <FlatList
              contentContainerStyle={styles.historyList}
              data={conversations}
              keyExtractor={(conversation) => conversation.id}
              ListEmptyComponent={(
                <Text style={[styles.historyEmpty, { color: colors.textSecondary }]}>
                  Non ci sono ancora conversazioni salvate.
                </Text>
              )}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.historyRow,
                    {
                      backgroundColor: item.id === conversationId ? colors.accentSoft : colors.surface,
                      borderColor: item.id === conversationId ? colors.accent : colors.border,
                    },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void openConversation(item.id)}
                    style={({ pressed }) => [styles.historyRowMain, pressed && styles.pressed]}>
                    <Text numberOfLines={2} style={[styles.historyRowTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    <Text style={[styles.historyRowDate, { color: colors.textSecondary }]}>
                      {formatConversationDate(item.updatedAt)}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Elimina ${item.title}`}
                    accessibilityRole="button"
                    hitSlop={6}
                    onPress={() => requestDeleteConversation(item)}
                    style={({ pressed }) => [styles.historyDelete, pressed && styles.pressed]}>
                    <Text style={[styles.materialIcon, { color: colors.negative }]}>delete</Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </Screen>
  );
}

function HeaderIconButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
      <Text style={[styles.materialIcon, { color: colors.text }]}>{icon}</Text>
    </Pressable>
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
  const { colors, isDark } = useFlowndTheme();
  return (
    <View style={styles.compactFieldWrap}>
      <Text style={[styles.compactLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        keyboardAppearance={isDark ? 'dark' : 'light'}
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

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Il Coach non è disponibile. Riprova tra poco.';
}

function localErrorMessage(error: unknown): CoachMessage {
  return {
    id: `local-error-${Date.now()}-${Math.random()}`,
    conversationId: null,
    role: 'assistant',
    content: errorMessage(error),
    pendingAction: null,
    actionStatus: null,
    createdAt: new Date().toISOString(),
  };
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
  headerCoachActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: {
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
  historyScreen: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  historyHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  historyTitle: { fontFamily: font.displaySemiBold, fontSize: 24 },
  historySubtitle: { fontFamily: font.body, fontSize: 11, marginTop: 1 },
  historyClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  historyLoading: { marginTop: 32 },
  historyList: { paddingTop: 14, paddingBottom: 28, gap: 8, flexGrow: 1 },
  historyEmpty: { fontFamily: font.body, fontSize: 13, textAlign: 'center', marginTop: 32 },
  historyRow: {
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyRowMain: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', padding: 12 },
  historyRowTitle: { fontFamily: font.bodySemiBold, fontSize: 13, lineHeight: 18 },
  historyRowDate: { fontFamily: font.body, fontSize: 10, marginTop: 4 },
  historyDelete: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
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
