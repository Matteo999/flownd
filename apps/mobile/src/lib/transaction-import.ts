import { Platform } from 'react-native';

import type { ExpenseDraft } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

export type ImportedTransaction = Pick<
  ExpenseDraft,
  | 'description'
  | 'amount'
  | 'kind'
  | 'occurredAt'
  | 'rawDescription'
  | 'merchantName'
  | 'counterpartyName'
  | 'memo'
  | 'bankReference'
  | 'importConfidence'
> & { category?: string; financialAccountId?: string | null };

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
  const url = endpoint('/api/transaction-tools?action=error');
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
  return post<{ id: string; status: 'queued' }>(
    '/api/transaction-tools?action=import',
    accessToken,
    file,
  );
}

export async function getTransactionImportJob(userId: string, jobId: string) {
  const { data, error } = await supabase
    .from('transaction_import_jobs')
    .select('id,status,result,file_name')
    .eq('user_id', userId)
    .eq('id', jobId)
    .single();
  if (error || !data) throw error ?? new Error('Import job unavailable');
  const result = data.result as { transactions?: ImportedTransaction[] } | null;
  return {
    id: data.id,
    status: data.status as 'queued' | 'processing' | 'completed' | 'failed',
    fileName: data.file_name,
    transactions: data.status === 'completed' ? result?.transactions ?? [] : [],
  };
}

export async function deleteTransactionImportJob(userId: string, jobId: string) {
  const actionRoute = `/transaction-import?mode=file&jobId=${encodeURIComponent(jobId)}`;
  const { error } = await supabase
    .from('transaction_import_jobs')
    .delete()
    .eq('user_id', userId)
    .eq('id', jobId);
  if (error) throw error;
  const { error: notificationError } = await supabase
    .from('goal_notifications')
    .delete()
    .eq('user_id', userId)
    .eq('action_route', actionRoute);
  if (notificationError) throw notificationError;
}

export async function scanTransactionImage(
  accessToken: string,
  dataUrl: string,
) {
  return post<{ transactions: ImportedTransaction[] }>(
    '/api/transaction-tools?action=scan',
    accessToken,
    { dataUrl },
  );
}

function normalizedIdentity(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLocaleLowerCase();
}

function transactionBase(transaction: ImportedTransaction | ExpenseDraft) {
  const minute = (transaction.occurredAt ?? '').slice(0, 16);
  const amount = Math.round(Number(transaction.amount) * 100);
  return `${minute}:${transaction.kind ?? 'expense'}:${amount}`;
}

function transactionReferenceBase(transaction: ImportedTransaction | ExpenseDraft) {
  const day = (transaction.occurredAt ?? '').slice(0, 10);
  const amount = Math.round(Number(transaction.amount) * 100);
  return `${day}:${transaction.kind ?? 'expense'}:${amount}`;
}

function transactionIdentity(transaction: ImportedTransaction | ExpenseDraft) {
  return normalizedIdentity(
    transaction.merchantName ||
      transaction.counterpartyName ||
      transaction.description,
  );
}

function narrativeIdentity(transaction: ImportedTransaction | ExpenseDraft) {
  return normalizedIdentity(transaction.rawDescription);
}

function narrativeContainsTime(transaction: ImportedTransaction | ExpenseDraft) {
  return /\b(?:[01]?\d|2[0-3])[:.]([0-5]\d)\b/.test(
    transaction.rawDescription ?? '',
  );
}

export function transactionFingerprint(transaction: ImportedTransaction | ExpenseDraft) {
  const reference = normalizedIdentity(transaction.bankReference);
  if (reference) return `${transactionReferenceBase(transaction)}:reference:${reference}`;
  return `${transactionBase(transaction)}:${transactionIdentity(transaction)}`;
}

function compatibleIdentity(
  first: ImportedTransaction | ExpenseDraft,
  second: ImportedTransaction | ExpenseDraft,
) {
  const left = transactionIdentity(first);
  const right = transactionIdentity(second);
  if (!left || !right) return true;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= 4 && longer.includes(shorter);
}

export function duplicateIndexes(
  candidates: ImportedTransaction[],
  existing: ExpenseDraft[],
) {
  const references = new Set(
    existing
      .map((item) => {
        const reference = normalizedIdentity(item.bankReference);
        return reference ? `${transactionReferenceBase(item)}:${reference}` : '';
      })
      .filter(Boolean),
  );
  const timedNarratives = new Set(
    existing
      .filter(narrativeContainsTime)
      .map((item) => (
        `${transactionReferenceBase(item)}:${narrativeIdentity(item)}`
      ))
      .filter((key) => !key.endsWith(':')),
  );
  const byBase = new Map<string, (ImportedTransaction | ExpenseDraft)[]>();
  existing.forEach((item) => {
    const base = transactionBase(item);
    byBase.set(base, [...(byBase.get(base) ?? []), item]);
  });
  const duplicates = new Set<number>();
  candidates.forEach((candidate, index) => {
    const reference = normalizedIdentity(candidate.bankReference);
    const base = transactionBase(candidate);
    const referenceKey = reference
      ? `${transactionReferenceBase(candidate)}:${reference}`
      : '';
    const narrativeKey = narrativeContainsTime(candidate)
      ? `${transactionReferenceBase(candidate)}:${narrativeIdentity(candidate)}`
      : '';
    const matchesReference = Boolean(referenceKey && references.has(referenceKey));
    const matchesLegacyNarrative = Boolean(
      narrativeKey && timedNarratives.has(narrativeKey),
    );
    const matchesContent = (byBase.get(base) ?? []).some((item) =>
      compatibleIdentity(candidate, item),
    );
    if (matchesReference || matchesLegacyNarrative || matchesContent) duplicates.add(index);
    else {
      if (referenceKey) references.add(referenceKey);
      if (narrativeKey) timedNarratives.add(narrativeKey);
      byBase.set(base, [...(byBase.get(base) ?? []), candidate]);
    }
  });
  return duplicates;
}
