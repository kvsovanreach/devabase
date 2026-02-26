'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className,
}: BadgeProps) {
  const variants = {
    default: 'bg-surface-secondary text-text-secondary border border-border-light',
    primary: 'bg-primary/10 text-primary border border-primary/20',
    success: 'bg-success/15 text-success border border-success/30',
    warning: 'bg-warning/15 text-warning border border-warning/30',
    error: 'bg-error/15 text-error border border-error/30',
    info: 'bg-info/15 text-info border border-info/30',
    outline: 'border border-border text-text-secondary bg-transparent',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 font-medium',
    md: 'text-[13px] px-2.5 py-1 font-medium',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full tracking-tight',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}
