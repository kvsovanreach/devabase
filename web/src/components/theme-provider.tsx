'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/theme-store';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false);
  const { theme, resolvedTheme } = useThemeStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, [mounted, resolvedTheme]);

  // Prevent hydration mismatch by not rendering until mounted
  // But we still need to render children to avoid layout shift
  // We'll handle this with a script in the HTML head instead

  return <>{children}</>;
}

// Script to inject into HTML head to prevent flash
export const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('devabase-theme');
      var theme = 'system';
      if (stored) {
        var parsed = JSON.parse(stored);
        if (parsed && parsed.state && parsed.state.theme) {
          theme = parsed.state.theme;
        }
      }
      var resolved = theme;
      if (theme === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      if (resolved === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    } catch (e) {
      document.documentElement.classList.add('light');
    }
  })();
`;
