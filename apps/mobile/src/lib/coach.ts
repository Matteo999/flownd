import { Platform } from 'react-native';

export type CoachActionType =
  | 'add_transaction'
  | 'create_goal'
  | 'update_goal'
  | 'update_budget';

export type CoachPendingAction = {
  type: CoachActionType;
  arguments: Record<string, string | number | null>;
};

export type CoachActionStatus = 'pending' | 'confirmed' | 'cancelled' | null;

export type CoachMessage = {
  id: string;
  conversationId: string | null;
  role: 'user' | 'assistant';
  content: string;
  pendingAction: CoachPendingAction | null;
  actionStatus: CoachActionStatus;
  createdAt: string;
};

export type CoachConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type CoachSendResponse = {
  conversation: CoachConversation;
  message: CoachMessage;
};

type CoachResolutionResponse = {
  actionStatus: Exclude<CoachActionStatus, null | 'pending'>;
  message: CoachMessage | null;
};

function coachEndpoint() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return `${configured}/api/coach`;
  return Platform.OS === 'web' ? '/api/coach' : null;
}

async function coachRequest<T>(
  accessToken: string,
  options: RequestInit = {},
  query?: Record<string, string>,
) {
  const endpoint = coachEndpoint();
  if (!endpoint) {
    throw new Error(
      'Configura EXPO_PUBLIC_API_URL per collegare il Coach al backend.',
    );
  }
  const suffix = query ? `?${new URLSearchParams(query).toString()}` : '';
  const response = await fetch(`${endpoint}${suffix}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(body) as T & { error?: string };
  } catch {
    throw new Error(
      'Il backend del Coach ha restituito una risposta non valida. Verifica che il server locale sia avviato.',
    );
  }
  if (!response.ok) throw new Error(data.error ?? 'Il Coach non è disponibile.');
  return data;
}

export function createCoachMessageId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function listCoachConversations(accessToken: string) {
  const data = await coachRequest<{ conversations: CoachConversation[] }>(accessToken);
  return data.conversations;
}

export async function loadCoachConversation(
  conversationId: string,
  accessToken: string,
) {
  return coachRequest<{
    conversation: CoachConversation;
    messages: CoachMessage[];
  }>(accessToken, {}, { conversationId });
}

export async function askCoach(
  conversationId: string | null,
  message: Pick<CoachMessage, 'id' | 'content'>,
  accessToken: string,
) {
  return coachRequest<CoachSendResponse>(accessToken, {
    method: 'POST',
    body: JSON.stringify({ conversationId, message }),
  });
}

export async function deleteCoachConversation(
  conversationId: string,
  accessToken: string,
) {
  await coachRequest<{ deleted: boolean }>(
    accessToken,
    { method: 'DELETE' },
    { conversationId },
  );
}

export async function resolveCoachAction(
  messageId: string,
  resolution: 'confirmed' | 'cancelled',
  action: CoachPendingAction,
  accessToken: string,
) {
  return coachRequest<CoachResolutionResponse>(accessToken, {
    method: 'PATCH',
    body: JSON.stringify({
      messageId,
      resolution,
      arguments: action.arguments,
    }),
  });
}
