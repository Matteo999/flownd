import { Platform } from 'react-native';

import type { ExpenseDraft } from '@/lib/onboarding';

export type ImportedTransaction = Pick<
  ExpenseDraft,
  'description' | 'amount' | 'kind' | 'occurredAt'
> & { category?: string };

export const GENERIC_OPERATION_ERROR =
  'Si è verificato un errore. Abbiamo inviato il resoconto agli sviluppatori.';

function endpoint(path: string) {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return `${configured}${path}`;
  return Platform.OS === 'web' ? path : null;
}

async function post<T>(path: string, accessToken: string, body: object) {
  const url = endpoint(path);
  if (!url) throw new Error('API URL missing');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.text();
  let data: T & { error?: string; code?: string };
  try {
    data = JSON.parse(responseBody) as T & { error?: string; code?: string };
  } catch {
    throw new Error(
      `Invalid API response (${response.status}, ${response.headers.get('content-type') ?? 'no content type'}): ${responseBody.slice(0, 180)}`,
    );
  }
  if (!response.ok) {
    throw new Error(`API ${path} failed (${response.status}, ${data.code ?? 'no code'}): ${data.error ?? 'no message'}`);
  }
  return data;
}

export async function reportClientError(
  accessToken: string | undefined,
  context: string,
  reason: unknown,
) {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  if (__DEV__) console.error(`[Flownd:${context}]`, reason);
  const url = endpoint('/api/client-error');
  if (!url || !accessToken) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: context.slice(0, 80),
        message: message.slice(0, 1000),
        stack: stack?.slice(0, 4000),
        platform: Platform.OS,
      }),
    });
  } catch {
    // Il resoconto non deve mai generare un secondo errore visibile.
  }
}

export async function analyzeTransactionFile(
  accessToken: string,
  file: { name: string; base64: string },
) {
  return post<{ transactions: ImportedTransaction[] }>(
    '/api/transaction-import',
    accessToken,
    file,
  );
}

export async function scanTransactionImage(
  accessToken: string,
  dataUrl: string,
) {
  return post<{ transactions: ImportedTransaction[] }>(
    '/api/transaction-scan',
    accessToken,
    { dataUrl },
  );
}

export function transactionFingerprint(transaction: ImportedTransaction | ExpenseDraft) {
  const day = (transaction.occurredAt ?? '').slice(0, 10);
  const amount = Math.round(Number(transaction.amount) * 100);
  const description = transaction.description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return `${day}:${transaction.kind ?? 'expense'}:${amount}:${description}`;
}

export function duplicateIndexes(
  candidates: ImportedTransaction[],
  existing: ExpenseDraft[],
) {
  const seen = new Set(existing.map(transactionFingerprint));
  const duplicates = new Set<number>();
  candidates.forEach((candidate, index) => {
    const fingerprint = transactionFingerprint(candidate);
    if (seen.has(fingerprint)) duplicates.add(index);
    else seen.add(fingerprint);
  });
  return duplicates;
}
