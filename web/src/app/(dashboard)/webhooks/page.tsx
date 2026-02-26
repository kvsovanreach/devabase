'use client';

import { useState } from 'react';
import { Plus, Webhook as WebhookIcon, MoreVertical, Play, Trash2, Pause, PlayCircle } from 'lucide-react';
import { Fragment } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { WebhookFormModal } from '@/components/webhooks/webhook-form-modal';
import { WebhookLogsModal } from '@/components/webhooks/webhook-logs-modal';
import {
  useWebhooks,
  useDeleteWebhook,
  useTestWebhook,
  useUpdateWebhook,
  Webhook,
  WEBHOOK_EVENTS,
} from '@/hooks/use-webhooks';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { cn } from '@/lib/utils';

export default function WebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();
  const updateWebhook = useUpdateWebhook();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null);
  const [logsWebhook, setLogsWebhook] = useState<Webhook | null>(null);

  const getStatusBadge = (status: Webhook['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'paused':
        return <Badge variant="warning">Paused</Badge>;
      case 'disabled':
        return <Badge variant="default">Disabled</Badge>;
    }
  };

  const getEventLabel = (event: string) => {
    return WEBHOOK_EVENTS.find((e) => e.value === event)?.label || event;
  };

  const handleToggleStatus = async (webhook: Webhook) => {
    const newStatus = webhook.status === 'active' ? 'paused' : 'active';
    await updateWebhook.mutateAsync({ id: webhook.id, status: newStatus });
  };

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">Webhooks</h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Receive HTTP callbacks when events occur in your project.
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New Webhook
          </Button>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : webhooks && webhooks.length > 0 ? (
          <div className="space-y-3">
            {webhooks.map((webhook: Webhook) => (
              <Card key={webhook.id} className="p-4 md:p-5">
                <div className="flex items-start sm:items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-surface-secondary flex items-center justify-center flex-shrink-0">
                    <WebhookIcon className="w-5 h-5 text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[14px] md:text-[15px] font-medium text-foreground truncate">
                        {webhook.name}
                      </h3>
                      {getStatusBadge(webhook.status)}
                    </div>
                    <p className="text-[12px] md:text-[13px] text-text-secondary truncate font-mono mt-1">
                      {webhook.url}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {webhook.events.slice(0, 2).map((event: string) => (
                        <Badge key={event} variant="outline" className="text-[10px] md:text-xs">
                          {getEventLabel(event)}
                        </Badge>
                      ))}
                      {webhook.events.length > 2 && (
                        <Badge variant="outline" className="text-[10px] md:text-xs">
                          +{webhook.events.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Menu as="div" className="relative flex-shrink-0">
                    <MenuButton className="p-2 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-all duration-150">
                      <MoreVertical className="w-4 h-4" />
                    </MenuButton>
                    <Transition
                      as={Fragment}
                      enter="transition ease-out duration-150"
                      enterFrom="opacity-0 scale-95"
                      enterTo="opacity-100 scale-100"
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100 scale-100"
                      leaveTo="opacity-0 scale-95"
                    >
                      <MenuItems className="absolute right-0 mt-1 w-40 bg-surface border border-border-light rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] overflow-hidden z-10">
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => testWebhook.mutate(webhook.id)}
                              disabled={testWebhook.isPending}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              <Play className="w-4 h-4" />
                              Test
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => setLogsWebhook(webhook)}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              <WebhookIcon className="w-4 h-4" />
                              Logs
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => handleToggleStatus(webhook)}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              {webhook.status === 'active' ? (
                                <>
                                  <Pause className="w-4 h-4" />
                                  Pause
                                </>
                              ) : (
                                <>
                                  <PlayCircle className="w-4 h-4" />
                                  Activate
                                </>
                              )}
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => setEditingWebhook(webhook)}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              Edit
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => setDeletingWebhook(webhook)}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] text-error transition-colors',
                                focus ? 'bg-error/5' : ''
                              )}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )}
                        </MenuItem>
                      </MenuItems>
                    </Transition>
                  </Menu>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<WebhookIcon className="w-8 h-8" />}
            title="No webhooks yet"
            description="Create a webhook to receive event notifications via HTTP callbacks."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Webhook
              </Button>
            }
          />
        )}
      </div>

      {/* Create Modal */}
      <WebhookFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      {/* Edit Modal */}
      {editingWebhook && (
        <WebhookFormModal
          isOpen={true}
          onClose={() => setEditingWebhook(null)}
          webhook={editingWebhook}
        />
      )}

      {/* Logs Modal */}
      {logsWebhook && (
        <WebhookLogsModal
          isOpen={true}
          onClose={() => setLogsWebhook(null)}
          webhook={logsWebhook}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deletingWebhook}
        onClose={() => setDeletingWebhook(null)}
        onConfirm={() => {
          if (deletingWebhook) {
            deleteWebhook.mutate(deletingWebhook.id);
            setDeletingWebhook(null);
          }
        }}
        title="Delete Webhook"
        description={`Are you sure you want to delete "${deletingWebhook?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteWebhook.isPending}
      />
    </div>
  );
}
