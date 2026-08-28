import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F6F8F7',
  surface: '#FFFFFF',
  sunken: '#EDF1EF',
  text: '#16211D',
  textSecondary: '#5C6B64',
  accent: '#256B7E',
  accentSoft: '#DCEAEC',
  positive: '#2E8B6F',
  positiveSoft: '#E3F2EC',
  warning: '#B98A2E',
  warningSoft: '#F8EFD8',
  negative: '#C3573F',
  negativeSoft: '#F8E5E0',
  border: '#DCE3DF',
  tabBar: '#FFFFFF',
  onAccent: '#FFFFFF',
};

export const darkColors: FlowndColors = {
  background: '#0F1712',
  surface: '#17211C',
  sunken: '#0B120E',
  text: '#EAF1ED',
  textSecondary: '#9AAAA2',
  accent: '#47B3D1',
  accentSoft: '#173842',
  positive: '#4FB89A',
  positiveSoft: '#17382E',
  warning: '#D9A94F',
  warningSoft: '#3B3018',
  negative: '#E08469',
  negativeSoft: '#40251F',
  border: '#26332C',
  tabBar: '#17211C',
  onAccent: '#FFFFFF',
};

export type FlowndColors = typeof lightColors;

export const brandGradient = ['#457FEF', '#45D5B6'] as const;

export const font = {
  displaySemiBold: 'Manrope_600SemiBold',
  displayBold: 'Manrope_700Bold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  data: 'Manrope_400Regular',
  dataMedium: 'Manrope_500Medium',
};

export const radius = {
  control: 10,
  card: 12,
  sheet: 24,
};

export type ThemePreference = 'light' | 'dark' | 'system';

type FlowndThemeContextValue = {
  colors: FlowndColors;
  isDark: boolean;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
};

const THEME_STORAGE_KEY = 'flownd:theme-preference';
const FlowndThemeContext = createContext<FlowndThemeContextValue | null>(null);

export function FlowndThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [themePreference, setPreference] =
    useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (
          active &&
          (stored === 'light' || stored === 'dark' || stored === 'system')
        ) {
          setPreference(stored);
        }
      })
      .catch(() => {
        // Il tema di sistema resta il fallback se lo storage non è disponibile.
      });
    return () => {
      active = false;
    };
  }, []);

  const isDark =
    themePreference === 'system'
      ? systemScheme === 'dark'
      : themePreference === 'dark';

  async function setThemePreference(preference: ThemePreference) {
    const previous = themePreference;
    setPreference(preference);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      setPreference(previous);
    }
  }

  return (
    <FlowndThemeContext.Provider
      value={{
        colors: isDark ? darkColors : lightColors,
        isDark,
        themePreference,
        setThemePreference,
      }}>
      {children}
    </FlowndThemeContext.Provider>
  );
}

export function useFlowndTheme() {
  const value = useContext(FlowndThemeContext);
  if (!value) {
    throw new Error('useFlowndTheme deve essere usato dentro FlowndThemeProvider');
  }
  return value;
}
