import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Baloo2_600SemiBold } from '@expo-google-fonts/baloo-2/600SemiBold';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols/400Regular';

import { AppProvider } from '@/providers/app-provider';
import {
  FlowndThemeProvider,
  useFlowndTheme,
} from '@/constants/flownd-theme';
import { AnimatedLaunchOverlay } from '@/components/animated-launch-overlay';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 450, fade: true });

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    MaterialSymbols_400Regular,
  });

  if (!loaded && !error) return null;

  return (
    <FlowndThemeProvider>
      <RootNavigation />
    </FlowndThemeProvider>
  );
}

function RootNavigation() {
  const { colors, isDark } = useFlowndTheme();

  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.negative,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="add-transaction" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-goal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-goal-contribution" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-loan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="budget-cycle" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="connect-bank" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="bank-connection" />
          <Stack.Screen name="goal-settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="goal-detail" />
          <Stack.Screen name="financing" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="budget" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <AnimatedLaunchOverlay />
      </AppProvider>
    </ThemeProvider>
  );
}
