import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { LoadingScreen, font, useFlowndTheme } from '@/components/flownd-ui';
import { useApp } from '@/providers/app-provider';

const tabItems = [
  {
    name: 'dashboard',
    label: 'Dashboard',
    sf: { default: 'house', selected: 'house.fill' },
    md: 'home',
  },
  {
    name: 'timeline',
    label: 'Timeline',
    sf: { default: 'clock', selected: 'clock.fill' },
    md: 'history',
  },
  {
    name: 'coach',
    label: 'Coach',
    sf: { default: 'sparkles', selected: 'sparkles' },
    md: 'auto_awesome',
  },
  {
    name: 'goals',
    label: 'Obiettivi',
    sf: { default: 'target', selected: 'target' },
    md: 'track_changes',
  },
  {
    name: 'profile',
    label: 'Profilo',
    sf: { default: 'person', selected: 'person.fill' },
    md: 'person',
  },
] as const;

export default function TabsLayout() {
  const { colors, isDark } = useFlowndTheme();
  const { loading, onboardingComplete } = useApp();

  if (loading) return <LoadingScreen label="Carichiamo i tuoi dati…" />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;

  return (
    <NativeTabs
      backBehavior="history"
      disableTransparentOnScrollEdge
      iconColor={{ default: colors.textSecondary, selected: colors.accent }}
      indicatorColor={colors.accentSoft}
      labelStyle={{
        default: {
          color: colors.textSecondary,
          fontFamily: font.bodyMedium,
          fontSize: 10,
        },
        selected: {
          color: colors.accent,
          fontFamily: font.bodySemiBold,
          fontSize: 10,
        },
      }}
      labelVisibilityMode="labeled"
      minimizeBehavior="never"
      rippleColor={colors.accentSoft}
      tintColor={colors.accent}
      unstable_nativeProps={{ colorScheme: isDark ? 'dark' : 'light' }}
      backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}>
      {tabItems.map((item) => (
        <NativeTabs.Trigger
          key={item.name}
          name={item.name}
          accessibilityLabel={item.label}
          contentStyle={{ backgroundColor: colors.background }}>
          <NativeTabs.Trigger.Icon sf={item.sf} md={item.md} />
          <NativeTabs.Trigger.Label>{item.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
