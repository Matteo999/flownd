import Constants from 'expo-constants';

export * from './recurring-payments-core';

function apiUrl(path: string) {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return `${configured}${path}`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000${path}` : path;
}

export async function refreshRecurringDetection(accessToken: string) {
  const response = await fetch(apiUrl('/api/recurring-payments'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Recurring detection failed');
  return response.json() as Promise<{ detected: number }>;
}
