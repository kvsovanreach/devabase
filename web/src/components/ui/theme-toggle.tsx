'use client';

import { useTheme, Theme } from '@/hooks/use-theme';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ThemeToggleProps {
  showLabel?: boolean;
  variant?: 'icon' | 'dropdown';
}

export function ThemeToggle({ showLabel = false, variant = 'icon' }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (variant === 'icon') {
    return (
      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover transition-colors text-text-secondary hover:text-foreground"
        title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-5 h-5" />
        ) : (
          <Moon className="w-5 h-5" />
        )}
        {showLabel && (
          <span className="text-sm">
            {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
        )}
      </button>
    );
  }

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover transition-colors text-text-secondary hover:text-foreground"
        title="Theme"
      >
        {resolvedTheme === 'dark' ? (
          <Moon className="w-5 h-5" />
        ) : (
          <Sun className="w-5 h-5" />
        )}
        {showLabel && <span className="text-sm">{theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-36 bg-surface border border-border rounded-lg shadow-lg py-1 z-50">
          {options.map((option) => {
            const Icon = option.icon;
            const isActive = theme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {option.label}
                {option.value === 'system' && (
                  <span className="ml-auto text-xs text-text-tertiary">
                    ({resolvedTheme === 'dark' ? 'Dark' : 'Light'})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
