import { useThemeStore, Theme } from '@/stores/theme-store';

export function useTheme() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useThemeStore();

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
  };
}

export type { Theme };
