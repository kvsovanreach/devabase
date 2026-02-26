'use client';

import { Fragment } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function Select({
  className,
  label,
  error,
  helperText,
  options,
  placeholder,
  value,
  onChange,
  disabled,
  id,
}: SelectProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const selectedOption = options.find((opt) => opt.value === value);

  const handleChange = (newValue: string) => {
    if (onChange) {
      onChange({ target: { value: newValue } });
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-foreground tracking-tight"
        >
          {label}
        </label>
      )}
      <Listbox value={value || ''} onChange={handleChange} disabled={disabled}>
        <div className="relative">
          <ListboxButton
            id={inputId}
            className={cn(
              'w-full flex items-center justify-between px-4 py-2.5 bg-surface-secondary border rounded-xl text-[15px] text-left',
              'transition-all duration-150',
              'hover:bg-surface-hover hover:border-border',
              'focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-secondary',
              error
                ? 'border-error focus:border-error focus:ring-error/20'
                : 'border-border-light',
              className
            )}
          >
            <span className={cn(
              'block truncate',
              selectedOption ? 'text-foreground' : 'text-text-tertiary'
            )}>
              {selectedOption?.label || placeholder || 'Select...'}
            </span>
            <ChevronDown className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          </ListboxButton>

          {options.length > 0 && (
            <ListboxOptions
              anchor="bottom start"
              className="z-[100] w-[var(--button-width)] mt-2 bg-surface border border-border-light rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden focus:outline-none transition ease-out duration-150 data-[closed]:opacity-0 data-[closed]:scale-95"
            >
              <div className="py-1.5 max-h-64 overflow-y-auto">
                {options.map((option) => (
                  <ListboxOption
                    key={option.value}
                    value={option.value}
                    as={Fragment}
                  >
                    {({ focus, selected }) => (
                      <div
                        className={cn(
                          'flex items-center justify-between px-4 py-2.5 text-[15px] cursor-pointer transition-colors',
                          focus ? 'bg-surface-hover' : '',
                          selected ? 'text-primary font-medium' : 'text-foreground'
                        )}
                      >
                        <span className="block truncate">{option.label}</span>
                        {selected && (
                          <Check className="w-4 h-4 flex-shrink-0 text-primary" />
                        )}
                      </div>
                    )}
                  </ListboxOption>
                ))}
              </div>
            </ListboxOptions>
          )}
        </div>
      </Listbox>
      {error && (
        <p className="text-[13px] text-error flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="text-[13px] text-text-secondary">{helperText}</p>
      )}
    </div>
  );
}

Select.displayName = 'Select';

export { Select };
