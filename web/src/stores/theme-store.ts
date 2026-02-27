import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: getSystemTheme(),
      setTheme: (theme: Theme) => {
        const resolvedTheme = resolveTheme(theme);
        set({ theme, resolvedTheme });
        applyTheme(resolvedTheme);
      },
      toggleTheme: () => {
        const currentResolved = get().resolvedTheme;
        const newTheme = currentResolved === 'dark' ? 'light' : 'dark';
        set({ theme: newTheme, resolvedTheme: newTheme });
        applyTheme(newTheme);
      },
    }),
    {
      name: 'devabase-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolvedTheme = resolveTheme(state.theme);
          state.resolvedTheme = resolvedTheme;
          applyTheme(resolvedTheme);
        }
      },
    }
  )
);

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
  }
}

// Initialize theme on load
if (typeof window !== 'undefined') {
  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    const state = useThemeStore.getState();
    if (state.theme === 'system') {
      const newResolved = e.matches ? 'dark' : 'light';
      useThemeStore.setState({ resolvedTheme: newResolved });
      applyTheme(newResolved);
    }
  });
}
