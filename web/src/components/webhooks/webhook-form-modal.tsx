'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@headlessui/react';
import { Check } from 'lucide-react';
import {
  useCreateWebhook,
  useUpdateWebhook,
  Webhook,
  WEBHOOK_EVENTS,
  CreateWebhookInput,
} from '@/hooks/use-webhooks';
import { cn } from '@/lib/utils';

interface WebhookFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  webhook?: Webhook;
}

export function WebhookFormModal({ isOpen, onClose, webhook }: WebhookFormModalProps) {
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const isEditing = !!webhook;

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(3);
  const [timeoutMs, setTimeoutMs] = useState(30000);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (webhook) {
        setName(webhook.name);
        setUrl(webhook.url);
        setSelectedEvents(webhook.events);
        setRetryCount(webhook.retry_count);
        setTimeoutMs(webhook.timeout_ms);
      } else {
        setName('');
        setUrl('');
        setSelectedEvents([]);
        setRetryCount(3);
        setTimeoutMs(30000);
      }
    }
  }, [isOpen, webhook]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const selectAllEvents = () => {
    setSelectedEvents(WEBHOOK_EVENTS.map((e) => e.value));
  };

  const clearAllEvents = () => {
    setSelectedEvents([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateWebhookInput = {
      name: name.trim(),
      url: url.trim(),
      events: selectedEvents,
      retry_count: retryCount,
      timeout_ms: timeoutMs,
    };

    try {
      if (isEditing) {
        await updateWebhook.mutateAsync({ id: webhook.id, ...data });
      } else {
        await createWebhook.mutateAsync(data);
      }
      onClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isSubmitting = createWebhook.isPending || updateWebhook.isPending;
  const isValid = name.trim() && url.trim() && selectedEvents.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Webhook' : 'Create Webhook'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Webhook"
          required
        />

        {/* URL */}
        <Input
          label="Endpoint URL"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/webhook"
          helperText="The URL that will receive POST requests"
          required
        />

        {/* Events */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Events</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllEvents}
                className="text-xs text-primary hover:underline"
              >
                Select all
              </button>
              <span className="text-text-tertiary">|</span>
              <button
                type="button"
                onClick={clearAllEvents}
                className="text-xs text-primary hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto p-1">
            {WEBHOOK_EVENTS.map(({ value, label }) => (
              <label
                key={value}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-surface-hover',
                  selectedEvents.includes(value) && 'bg-surface-hover'
                )}
              >
                <Checkbox
                  checked={selectedEvents.includes(value)}
                  onChange={() => toggleEvent(value)}
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                    selectedEvents.includes(value)
                      ? 'bg-primary border-primary'
                      : 'bg-transparent border-border'
                  )}
                >
                  {selectedEvents.includes(value) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </Checkbox>
                <span className="text-sm text-foreground">{label}</span>
              </label>
            ))}
          </div>

          {selectedEvents.length === 0 && (
            <p className="text-xs text-error">Select at least one event</p>
          )}
        </div>

        {/* Advanced Settings */}
        <details className="group">
          <summary className="text-sm font-medium text-text-secondary cursor-pointer hover:text-foreground">
            Advanced Settings
          </summary>
          <div className="mt-4 space-y-4 pl-2 border-l-2 border-border">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Retry Count"
                type="number"
                min={0}
                max={10}
                value={retryCount}
                onChange={(e) => setRetryCount(parseInt(e.target.value) || 0)}
                helperText="Max delivery attempts"
              />
              <Input
                label="Timeout (ms)"
                type="number"
                min={1000}
                max={60000}
                step={1000}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(parseInt(e.target.value) || 30000)}
                helperText="Request timeout"
              />
            </div>
          </div>
        </details>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!isValid}>
            {isEditing ? 'Save Changes' : 'Create Webhook'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
