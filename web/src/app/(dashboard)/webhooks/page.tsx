'use client';

import { useState } from 'react';
import { Plus, Webhook as WebhookIcon, Play, Trash2, Pause, PlayCircle, Edit2, FileText, Copy, ExternalLink, Zap, Bell, CheckCircle2, PauseCircle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function WebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();
  const updateWebhook = useUpdateWebhook();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null);
  const [logsWebhook, setLogsWebhook] = useState<Webhook | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getEventLabel = (event: string) => {
    return WEBHOOK_EVENTS.find((e) => e.value === event)?.label || event;
  };

  const handleToggleStatus = async (webhook: Webhook) => {
    const newStatus = webhook.status === 'active' ? 'paused' : 'active';
    await updateWebhook.mutateAsync({ id: webhook.id, status: newStatus });
    toast.success(`Webhook ${newStatus === 'active' ? 'activated' : 'paused'}`);
  };

  const handleTest = async (webhook: Webhook) => {
    try {
      await testWebhook.mutateAsync(webhook.id);
      toast.success('Test event sent');
    } catch {
      toast.error('Failed to send test event');
    }
  };

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied');
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Stats
  const totalWebhooks = webhooks?.length || 0;
  const activeCount = webhooks?.filter((w) => w.status === 'active').length || 0;
  const pausedCount = webhooks?.filter((w) => w.status === 'paused').length || 0;
  const totalEvents = webhooks?.reduce((sum, w) => sum + w.events.length, 0) || 0;

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              Webhooks
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Receive HTTP callbacks when events occur in your project.
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="w-full lg:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New Webhook
          </Button>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : webhooks && webhooks.length > 0 ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <WebhookIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Total
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{totalWebhooks}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Active
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{activeCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <PauseCircle className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Paused
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{pausedCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Events
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{totalEvents}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Webhooks Table */}
            <div className="bg-surface border border-border-light rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="hidden lg:grid lg:grid-cols-[2fr_2fr_1.5fr_100px_auto] gap-4 px-5 py-3 bg-surface-secondary border-b border-border-light">
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Webhook
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Endpoint URL
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Events
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Status
                </div>
                <div className="w-32"></div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-border-light">
                {webhooks.map((webhook: Webhook) => (
                  <div
                    key={webhook.id}
                    className="grid grid-cols-1 lg:grid-cols-[2fr_2fr_1.5fr_100px_auto] gap-3 lg:gap-4 px-5 py-4 hover:bg-surface-hover/50 transition-colors"
                  >
                    {/* Name */}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                        webhook.status === 'active' ? "bg-success/10" : "bg-surface-secondary"
                      )}>
                        <WebhookIcon className={cn(
                          "w-4 h-4",
                          webhook.status === 'active' ? "text-success" : "text-text-tertiary"
                        )} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {webhook.name}
                        </p>
                        <p className="text-[12px] text-text-tertiary lg:hidden truncate font-mono">
                          {webhook.url}
                        </p>
                      </div>
                    </div>

                    {/* URL */}
                    <div className="hidden lg:flex items-center">
                      <button
                        onClick={() => copyUrl(webhook.url, webhook.id)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-mono transition-all max-w-full",
                          copiedId === webhook.id
                            ? "bg-success/10 text-success"
                            : "bg-surface-secondary hover:bg-surface-hover text-text-secondary"
                        )}
                      >
                        <span className="truncate">{webhook.url}</span>
                        <Copy className="w-3.5 h-3.5 flex-shrink-0" />
                      </button>
                    </div>

                    {/* Events */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {webhook.events.slice(0, 2).map((event: string) => (
                        <span
                          key={event}
                          className="px-2 py-0.5 bg-surface-secondary rounded text-[11px] text-text-secondary"
                        >
                          {getEventLabel(event)}
                        </span>
                      ))}
                      {webhook.events.length > 2 && (
                        <span className="px-2 py-0.5 bg-surface-secondary rounded text-[11px] text-text-tertiary">
                          +{webhook.events.length - 2}
                        </span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="flex items-center">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium",
                        webhook.status === 'active'
                          ? "bg-success/10 text-success"
                          : webhook.status === 'paused'
                          ? "bg-warning/10 text-warning"
                          : "bg-surface-secondary text-text-tertiary"
                      )}>
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          webhook.status === 'active' ? "bg-success" :
                          webhook.status === 'paused' ? "bg-warning" : "bg-text-tertiary"
                        )} />
                        {webhook.status === 'active' ? 'Active' :
                         webhook.status === 'paused' ? 'Paused' : 'Disabled'}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleTest(webhook)}
                        disabled={testWebhook.isPending}
                        className="p-2 rounded-lg text-text-secondary hover:text-foreground hover:bg-surface-hover transition-colors"
                        title="Send test event"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setLogsWebhook(webhook)}
                        className="p-2 rounded-lg text-text-secondary hover:text-foreground hover:bg-surface-hover transition-colors"
                        title="View logs"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(webhook)}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          webhook.status === 'active'
                            ? "text-warning hover:text-warning hover:bg-warning/10"
                            : "text-success hover:text-success hover:bg-success/10"
                        )}
                        title={webhook.status === 'active' ? 'Pause webhook' : 'Activate webhook'}
                      >
                        {webhook.status === 'active' ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <PlayCircle className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingWebhook(webhook)}
                        className="p-2 rounded-lg text-text-secondary hover:text-foreground hover:bg-surface-hover transition-colors"
                        title="Edit webhook"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingWebhook(webhook)}
                        className="p-2 rounded-lg text-text-secondary hover:text-error hover:bg-error/5 transition-colors"
                        title="Delete webhook"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mobile: URL with copy */}
                    <div className="lg:hidden flex items-center gap-2">
                      <button
                        onClick={() => copyUrl(webhook.url, webhook.id)}
                        className="flex items-center gap-2 text-[12px] text-text-tertiary hover:text-text-secondary"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy URL
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Info Section */}
            <div className="mt-6 p-4 bg-surface-secondary/50 border border-border-light rounded-xl">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-text-tertiary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-medium text-foreground">Available Events</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {WEBHOOK_EVENTS.slice(0, 6).map((event) => (
                      <code
                        key={event.value}
                        className="px-2 py-1 bg-surface rounded text-[11px] text-text-secondary"
                      >
                        {event.value}
                      </code>
                    ))}
                    {WEBHOOK_EVENTS.length > 6 && (
                      <span className="px-2 py-1 text-[11px] text-text-tertiary">
                        +{WEBHOOK_EVENTS.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
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
