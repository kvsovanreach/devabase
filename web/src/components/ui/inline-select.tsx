'use client';

import { Fragment } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from '@headlessui/react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export interface InlineSelectOption {
  value: string;
  label: string;
}

export interface InlineSelectProps {
  options: InlineSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function InlineSelect({
  options,
  value,
  onChange,
  disabled,
  className,
  placeholder = 'Select...',
}: InlineSelectProps) {
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Listbox value={value || ''} onChange={onChange} disabled={disabled}>
      <div className="relative">
        <ListboxButton
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 bg-surface border border-border-light rounded-xl text-[13px] text-left',
            'transition-all duration-150',
            'hover:border-border',
            'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
        >
          <span className={cn(
            'block truncate',
            selectedOption ? 'text-foreground' : 'text-text-tertiary'
          )}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0 ml-2" />
        </ListboxButton>

        {options.length > 0 && (
          <Transition
            as={Fragment}
            enter="transition ease-out duration-150"
            enterFrom="opacity-0 scale-95 -translate-y-1"
            enterTo="opacity-100 scale-100 translate-y-0"
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100 scale-100 translate-y-0"
            leaveTo="opacity-0 scale-95 -translate-y-1"
          >
            <ListboxOptions className="absolute z-50 w-full mt-1.5 bg-surface border border-border-light rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] overflow-hidden focus:outline-none">
              <div className="py-1 max-h-48 overflow-y-auto">
                {options.map((option) => (
                  <ListboxOption
                    key={option.value}
                    value={option.value}
                    as={Fragment}
                  >
                    {({ focus, selected }) => (
                      <div
                        className={cn(
                          'flex items-center justify-between px-3 py-2 text-[13px] cursor-pointer transition-colors',
                          focus ? 'bg-surface-hover' : '',
                          selected ? 'text-primary font-medium' : 'text-foreground'
                        )}
                      >
                        <span className="block truncate">{option.label}</span>
                        {selected && (
                          <Check className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                        )}
                      </div>
                    )}
                  </ListboxOption>
                ))}
              </div>
            </ListboxOptions>
          </Transition>
        )}
      </div>
    </Listbox>
  );
}
