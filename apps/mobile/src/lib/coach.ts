import { apiRequest } from '@/lib/api';

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
  pinned: boolean;
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

const COACH_TIMEOUT_MS = 60_000;

async function coachRequest<T>(
  accessToken: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
  query?: Record<string, string>,
) {
  return apiRequest<T>('/api/coach', accessToken, {
    ...options,
    query,
    timeoutMs: COACH_TIMEOUT_MS,
    fallbackError: 'Il Coach non è disponibile.',
    missingConfigError: 'Configura EXPO_PUBLIC_API_URL per collegare il Coach al backend.',
  });
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
    body: { conversationId, message },
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

export async function updateCoachConversation(
  conversationId: string,
  update: { operation: 'pin'; pinned: boolean } | { operation: 'rename'; title: string },
  accessToken: string,
) {
  const data = await coachRequest<{ conversation: CoachConversation }>(accessToken, {
    method: 'PATCH',
    body: { conversationId, ...update },
  });
  return data.conversation;
}

export async function resolveCoachAction(
  messageId: string,
  resolution: 'confirmed' | 'cancelled',
  action: CoachPendingAction,
  accessToken: string,
) {
  return coachRequest<CoachResolutionResponse>(accessToken, {
    method: 'PATCH',
    body: {
      messageId,
      resolution,
      arguments: action.arguments,
    },
  });
}
