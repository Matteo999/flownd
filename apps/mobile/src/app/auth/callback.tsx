import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';

import { LoadingScreen } from '@/components/flownd-ui';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    from?: string;
  }>();
  const handled = useRef(false);
  const [label, setLabel] = useState('Completiamo l’accesso…');

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    async function complete() {
      try {
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
        } else if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;
        } else {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl?.includes('#')) {
            const hash = new URLSearchParams(initialUrl.split('#')[1]);
            const accessToken = hash.get('access_token');
            const refreshToken = hash.get('refresh_token');
            if (accessToken && refreshToken) {
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (error) throw error;
            }
          }
        }
        router.replace(
          params.from === 'onboarding'
            ? '/onboarding?resume=1'
            : '/onboarding',
        );
      } catch {
        setLabel('Il link non è più valido. Torna indietro e richiedine uno nuovo.');
        setTimeout(() => router.replace('/onboarding'), 2200);
      }
    }

    void complete();
  }, [params]);

  return <LoadingScreen label={label} />;
}
