import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

type ColorScheme = 'light' | 'dark';
type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  /** The resolved color scheme (always 'light' or 'dark'). */
  colorScheme: ColorScheme;
  /** Whether dark mode is active. */
  isDark: boolean;
  /** The user's stored preference. */
  preference: ThemePreference;
  /** Toggle between light and dark (ignores system). */
  toggleTheme: () => void;
  /** Set a specific preference. */
  setTheme: (pref: ThemePreference) => void;
}

const STORAGE_KEY = 'wheelers.theme.preference';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'light' || value === 'dark' || value === 'system') {
          setPreference(value);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const resolvedScheme: ColorScheme =
    preference === 'system' ? (systemScheme ?? 'light') : preference;

  const toggleTheme = useCallback(() => {
    const next: ThemePreference = resolvedScheme === 'light' ? 'dark' : 'light';
    setPreference(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, [resolvedScheme]);

  const setThemePref = useCallback((pref: ThemePreference) => {
    setPreference(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorScheme: resolvedScheme,
      isDark: resolvedScheme === 'dark',
      preference,
      toggleTheme,
      setTheme: setThemePref,
    }),
    [resolvedScheme, preference, toggleTheme, setThemePref],
  );

  // Don't render until we know the preference to avoid flicker
  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return ctx;
}
