import { Redirect, type Href } from 'expo-router';

import { LoadingScreen } from '@/components/flownd-ui';
import { useApp } from '@/providers/app-provider';

export default function IndexScreen() {
  const { loading, onboardingComplete } = useApp();

  if (loading) return <LoadingScreen label="Prepariamo il tuo spazio…" />;
  const destination = (onboardingComplete ? '/dashboard' : '/onboarding') as Href;
  return <Redirect href={destination} />;
}
