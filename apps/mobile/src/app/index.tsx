import { Redirect, type Href } from 'expo-router';

import { LoadingScreen } from '@/components/flownd-ui';
import { ProfileUnavailableScreen } from '@/components/profile-unavailable-screen';
import { useAppState } from '@/providers/app-provider';

export default function IndexScreen() {
  const { loading, onboardingComplete, profileUnavailable, session } = useAppState(
    'loading',
    'onboardingComplete',
    'profileUnavailable',
    'session',
  );

  if (loading) return <LoadingScreen label="Prepariamo il tuo spazio…" />;
  if (session && profileUnavailable) return <ProfileUnavailableScreen />;
  const destination = (onboardingComplete ? '/dashboard' : '/onboarding') as Href;
  return <Redirect href={destination} />;
}
