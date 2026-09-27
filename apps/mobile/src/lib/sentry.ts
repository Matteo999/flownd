import * as Sentry from '@sentry/react-native';

// DSN del progetto Sentry "react-native" (org flownd, regione DE). Il DSN non è
// un segreto: identifica solo dove inviare gli eventi. Sovrascrivibile da env.
const DEFAULT_DSN =
  'https://f6f7abd644f4a7d4ee49a27577bb9db5@o4512153406668800.ingest.de.sentry.io/4512153408962640';

// Campi che possono contenere dati finanziari o personali e non devono uscire
// dal dispositivo (importi, descrizioni, IBAN, email, token).
const SENSITIVE_KEY =
  /amount|balance|description|iban|email|token|password|content|message|merchant|counterparty|memo/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[filtrato]' : scrub(item, depth + 1),
    ]),
  );
}

export function initSentry() {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || DEFAULT_DSN,
    // In sviluppo gli errori restano in console: niente rumore su Sentry.
    enabled: !__DEV__,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeBreadcrumb(breadcrumb) {
      // I log in console possono contenere righe del database.
      if (breadcrumb.category === 'console') return null;
      if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data) as typeof breadcrumb.data;
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      return event;
    },
  });
}

// Solo l'id Supabase (pseudonimo): mai email o nome.
export function setSentryUser(userId: string | null) {
  Sentry.setUser(userId ? { id: userId } : null);
}

export function captureError(error: unknown, context: string) {
  Sentry.captureException(error, { tags: { context } });
}

export { Sentry };
