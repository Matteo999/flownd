import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols/400Regular';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    MaterialSymbols_400Regular,
  });

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FlowndThemeProvider>
        <RootNavigation />
      </FlowndThemeProvider>
    </GestureHandlerRootView>
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
          <Stack.Screen
            name="add-transaction"
            options={{
              presentation: 'transparentModal',
              animation: 'none',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="transaction-import" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="timeline-filters" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-manual-account" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-goal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-goal-contribution" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-loan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="budget-cycle" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="budget-income" />
          <Stack.Screen name="budget-allocation" />
          <Stack.Screen name="budget-subcategory" />
          <Stack.Screen name="connect-bank" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="bank-connection" />
          <Stack.Screen name="manual-account" />
          <Stack.Screen name="goal-settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="goal-detail" />
          <Stack.Screen name="financing" />
          <Stack.Screen name="family" />
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
