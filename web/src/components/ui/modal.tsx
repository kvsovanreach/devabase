'use client';

import { Fragment, ReactNode } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: ModalProps) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-full sm:translate-y-4 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-full sm:translate-y-4 sm:scale-95"
            >
              <DialogPanel
                className={cn(
                  'w-full transform bg-surface border-t sm:border border-border-light',
                  'shadow-lg',
                  'transition-all',
                  'rounded-t-2xl sm:rounded-2xl',
                  sizes[size]
                )}
              >
                {title && (
                  <div className="flex items-start justify-between px-5 sm:px-6 pt-5 sm:pt-6 pb-3 sm:pb-4">
                    <div className="flex-1 min-w-0 pr-4">
                      <DialogTitle className="text-[17px] sm:text-[19px] font-semibold text-foreground tracking-tight">
                        {title}
                      </DialogTitle>
                      {description && (
                        <p className="mt-1 sm:mt-1.5 text-[14px] sm:text-[15px] text-text-secondary">{description}</p>
                      )}
                    </div>
                    <button
                      onClick={onClose}
                      className="p-2 -mr-2 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-all duration-150 flex-shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
                <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                  {children}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-border-light',
      className
    )}>
      {children}
    </div>
  );
}
