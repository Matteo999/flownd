import { router, type Href, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';

import { LoadingScreen } from '@/components/flownd-ui';
import { exchangeAuthCode } from '@/lib/auth';

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    from?: string;
    type?: string;
  }>();
  const handled = useRef(false);
  const [label, setLabel] = useState('Completiamo l’accesso…');

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    async function complete() {
      try {
        if (!params.code) throw new Error('Codice di autenticazione mancante');
        await exchangeAuthCode(params.code);
        if (params.type === 'recovery') {
          router.replace('/reset-password' as Href);
          return;
        }
        router.replace(
          (params.from === 'onboarding'
            ? '/onboarding?resume=1'
            : '/onboarding') as Href,
        );
      } catch {
        setLabel('Il link non è più valido. Torna indietro e richiedine uno nuovo.');
        fallbackTimer = setTimeout(() => router.replace('/onboarding' as Href), 2200);
      }
    }

    void complete();
    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [params]);

  return <LoadingScreen label={label} />;
}
