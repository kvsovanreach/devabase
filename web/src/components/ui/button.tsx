'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'text';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium tracking-tight rounded-[10px] transition-all duration-200 ease-out focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

    const variants = {
      primary:
        'bg-primary text-white hover:bg-primary-hover active:bg-primary-active shadow-sm hover:shadow-md',
      secondary:
        'bg-surface-secondary text-foreground border border-border-light hover:bg-surface-hover active:bg-surface-active',
      ghost:
        'text-primary hover:bg-primary-muted active:bg-primary-muted/70',
      danger:
        'bg-error text-white hover:bg-red-600 active:bg-red-700 shadow-sm',
      outline:
        'border border-border text-foreground hover:bg-surface-hover active:bg-surface-active',
      text:
        'text-primary hover:text-primary-hover active:text-primary-active',
    };

    const sizes = {
      sm: 'text-[13px] px-3 py-1.5 gap-1.5 min-h-[32px]',
      md: 'text-[15px] px-4 py-2 gap-2 min-h-[40px]',
      lg: 'text-[17px] px-6 py-3 gap-2.5 min-h-[50px]',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
