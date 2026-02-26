'use client';

import { Modal, ModalFooter } from './modal';
import { Button } from './button';
import { AlertTriangle, Trash2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const icons = {
  danger: Trash2,
  warning: AlertTriangle,
  info: Info,
};

const iconStyles = {
  danger: 'text-error bg-error-muted',
  warning: 'text-warning bg-warning-muted',
  info: 'text-primary bg-primary-muted',
};

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  const Icon = icons[variant];

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center pt-2">
        <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mb-5', iconStyles[variant])}>
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="text-[19px] font-semibold text-foreground tracking-tight mb-2">{title}</h3>
        <p className="text-[15px] text-text-secondary leading-relaxed max-w-[280px]">{description}</p>
      </div>
      <ModalFooter className="justify-center gap-3">
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          {cancelText}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={handleConfirm}
          isLoading={isLoading}
        >
          {confirmText}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
