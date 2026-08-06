import { Platform } from 'react-native';

export type CoachMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type CoachActionType =
  | 'add_transaction'
  | 'create_goal'
  | 'update_goal'
  | 'update_budget';

export type CoachPendingAction = {
  type: CoachActionType;
  arguments: Record<string, string | number | null>;
};

export type CoachResponse = {
  message: string;
  pendingAction: CoachPendingAction | null;
};

function coachEndpoint() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return `${configured}/api/coach`;
  return Platform.OS === 'web' ? '/api/coach' : null;
}

export async function askCoach(
  messages: CoachMessage[],
  accessToken: string,
) {
  const endpoint = coachEndpoint();
  if (!endpoint) {
    throw new Error(
      'Configura EXPO_PUBLIC_API_URL per collegare il Coach al backend.',
    );
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
  });
  const body = await response.text();
  let data: CoachResponse & { error?: string };
  try {
    data = JSON.parse(body) as CoachResponse & { error?: string };
  } catch {
    throw new Error(
      'Il backend del Coach ha restituito una risposta non valida. Verifica che il server locale sia avviato.',
    );
  }
  if (!response.ok) {
    throw new Error(data.error ?? 'Il Coach non è disponibile.');
  }
  return data;
}
