import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import { MenuView } from '@expo/ui/community/menu';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
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
  updateCoachConversation,
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
  const drawerProgress = useRef(new Animated.Value(1)).current;
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = Math.min(360, windowWidth * 0.84);
  const swipeToHistory = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      gesture.dx < -14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3
    ),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -54) setHistoryVisible(true);
    },
  })).current;
  const pendingMessage = [...messages].reverse().find(
    (message) => message.pendingAction && message.actionStatus === 'pending',
  );

  useEffect(() => {
    Animated.spring(drawerProgress, {
      toValue: historyVisible ? 0 : 1,
      damping: 24,
      stiffness: 230,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [drawerProgress, historyVisible]);

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
        const latestConversation = [...history].sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        )[0];
        const loaded = await loadCoachConversation(
          latestConversation.id,
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

  async function changeConversation(
    selected: CoachConversation,
    update: { operation: 'pin'; pinned: boolean } | { operation: 'rename'; title: string },
  ) {
    if (!session) return;
    try {
      await updateCoachConversation(selected.id, update, session.access_token);
      await refreshHistory();
    } catch (error) {
      Alert.alert('Modifica non riuscita', errorMessage(error));
    }
  }

  function requestRenameConversation(selected: CoachConversation) {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Rinomina chat',
        undefined,
        (title) => {
          const normalized = title.trim();
          if (normalized) void changeConversation(selected, { operation: 'rename', title: normalized });
        },
        'plain-text',
        selected.title,
      );
      return;
    }
    Alert.alert('Rinomina chat', 'La rinomina è disponibile dal menu nativo su iOS.');
  }

  function handleConversationAction(selected: CoachConversation, action: string) {
    if (action === 'pin') {
      void changeConversation(selected, { operation: 'pin', pinned: !selected.pinned });
    } else if (action === 'rename') {
      requestRenameConversation(selected);
    } else if (action === 'delete') {
      requestDeleteConversation(selected);
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
    <View style={styles.flex} {...swipeToHistory.panHandlers}>
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

            <ComposerGlassSurface>
          <TextInput
            accessibilityLabel="Scrivi al Coach"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            value={input}
            onChangeText={setInput}
            placeholder="Chiedi a FlowndAI"
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
            </ComposerGlassSurface>
          </KeyboardAvoidingView>
        )}
      </ScreenScrollBridge>
    </Screen>
      <Animated.View
        pointerEvents={historyVisible ? 'auto' : 'none'}
        style={[
          styles.drawerOverlay,
          {
            opacity: drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          },
        ]}>
        <Pressable
          accessibilityLabel="Chiudi storico"
          onPress={() => setHistoryVisible(false)}
          style={styles.drawerBackdrop}
        />
        <Animated.View
          style={[
            styles.historySidebar,
            {
              width: drawerWidth,
              backgroundColor: colors.background,
              borderLeftColor: colors.border,
              transform: [{
                translateX: drawerProgress.interpolate({
                  inputRange: [0, 1], outputRange: [0, drawerWidth],
                }),
              }],
            },
          ]}>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>Recenti</Text>
            <Pressable
              accessibilityLabel="Chiudi storico"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setHistoryVisible(false)}
              style={({ pressed }) => [styles.historyClose, pressed && styles.pressed]}>
              <Text style={[styles.materialIcon, { color: colors.text }]}>close</Text>
            </Pressable>
          </View>
          {loadingHistory ? (
            <ActivityIndicator color={colors.accent} style={styles.historyLoading} />
          ) : (
            <FlatList
              style={styles.historyListView}
              contentContainerStyle={styles.historyList}
              data={conversations}
              keyExtractor={(conversation) => conversation.id}
              ListEmptyComponent={(
                <Text style={[styles.historyEmpty, { color: colors.textSecondary }]}>
                  Non ci sono ancora conversazioni salvate.
                </Text>
              )}
              renderItem={({ item }) => (
                <MenuView
                  shouldOpenOnLongPress
                  style={styles.historyMenu}
                  actions={[
                    {
                      id: 'pin',
                      title: item.pinned ? 'Rimuovi dai fissati' : 'Fissa in alto',
                      image: item.pinned ? 'pin.slash' : 'pin',
                      state: item.pinned ? 'on' : 'off',
                    },
                    { id: 'rename', title: 'Rinomina', image: 'pencil' },
                    { id: 'delete', title: 'Elimina', image: 'trash', attributes: { destructive: true } },
                  ]}
                  onPressAction={(event) => handleConversationAction(item, event.nativeEvent.event)}>
                  <Pressable
                    accessibilityRole="button"
                    delayLongPress={350}
                    onLongPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)}
                    onPress={() => void openConversation(item.id)}
                    style={({ pressed }) => [
                      styles.historyRow,
                      {
                        backgroundColor: item.id === conversationId ? colors.accentSoft : colors.surface,
                        borderColor: item.id === conversationId ? colors.accent : colors.border,
                      },
                      pressed && styles.historyRowPressed,
                    ]}>
                    <View style={styles.historyRowMain}>
                      <View style={styles.historyRowTitleLine}>
                        {item.pinned ? (
                          <Text style={[styles.historyPinnedIcon, { color: colors.accent }]}>push_pin</Text>
                        ) : null}
                        <Text numberOfLines={2} style={[styles.historyRowTitle, { color: colors.text }]}>
                          {item.title}
                        </Text>
                      </View>
                      <Text style={[styles.historyRowDate, { color: colors.textSecondary }]}>
                        {formatConversationDate(item.updatedAt)}
                      </Text>
                    </View>
                  </Pressable>
                </MenuView>
              )}
            />
          )}
          <View style={styles.historyCtaWrap}>
            <GlassCta
              label="Nuova chat"
              onPress={startNewConversation}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
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

function ComposerGlassSurface({ children }: { children: ReactNode }) {
  const { colors, isDark } = useFlowndTheme();
  const style = [styles.composer, { borderColor: colors.border }];
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        colorScheme={isDark ? 'dark' : 'light'}
        glassEffectStyle="regular"
        isInteractive
        style={style}>
        {children}
      </GlassView>
    );
  }
  return <View style={[style, { backgroundColor: colors.surface }]}>{children}</View>;
}

function GlassCta({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, isDark } = useFlowndTheme();
  const content = (
    <>
      <Text style={[styles.glassCtaIcon, { color: colors.text }]}>add</Text>
      <Text style={[styles.glassCtaLabel, { color: colors.text }]}>{label}</Text>
    </>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.glassCtaPressed]}>
      {Platform.OS === 'ios' && isGlassEffectAPIAvailable() ? (
        <GlassView
          colorScheme={isDark ? 'dark' : 'light'}
          glassEffectStyle="regular"
          isInteractive
          style={styles.glassCta}>
          {content}
        </GlassView>
      ) : (
        <View style={[styles.glassCta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {content}
        </View>
      )}
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
          selectable
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
  const normalized = content.replace(/\\([*_])/g, '$1');
  return normalized.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((part, index) => {
    const double = part.startsWith('**') && part.endsWith('**');
    const single = !double && part.startsWith('*') && part.endsWith('*');
    if (!double && !single) return part;
    return (
      <Text key={`${part}-${index}`} style={styles.messageTextBold}>
        {double ? part.slice(2, -2) : part.slice(1, -1)}
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
    borderRadius: 27,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 20,
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
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  historySidebar: {
    height: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
    elevation: 18,
  },
  historyHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  historyTitle: { fontFamily: font.displaySemiBold, fontSize: 27 },
  historyClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  historyLoading: { marginTop: 32 },
  historyListView: { flex: 1 },
  historyList: { paddingTop: 4, paddingBottom: 18, gap: 8, flexGrow: 1 },
  historyEmpty: { fontFamily: font.body, fontSize: 13, textAlign: 'center', marginTop: 32 },
  historyMenu: { width: '100%' },
  historyRow: {
    minHeight: 66,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyRowPressed: { transform: [{ scale: 1.035 }] },
  historyRowMain: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', padding: 12 },
  historyRowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyRowTitle: { fontFamily: font.bodySemiBold, fontSize: 13, lineHeight: 18 },
  historyRowDate: { fontFamily: font.body, fontSize: 10, marginTop: 4 },
  historyPinnedIcon: {
    fontFamily: 'MaterialSymbols_400Regular',
    fontSize: 15,
    lineHeight: 18,
  },
  historyCtaWrap: { paddingTop: 10 },
  glassCta: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  glassCtaPressed: { transform: [{ scale: 0.97 }] },
  glassCtaIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  glassCtaLabel: { fontFamily: font.bodySemiBold, fontSize: 14 },
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
