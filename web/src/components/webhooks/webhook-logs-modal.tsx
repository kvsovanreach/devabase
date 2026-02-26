'use client';

import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useWebhookLogs, Webhook, WebhookLog, WEBHOOK_EVENTS } from '@/hooks/use-webhooks';
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebhookLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  webhook: Webhook;
}

export function WebhookLogsModal({ isOpen, onClose, webhook }: WebhookLogsModalProps) {
  const { data: logs, isLoading } = useWebhookLogs(webhook.id);

  const getEventLabel = (event: string) => {
    return WEBHOOK_EVENTS.find((e) => e.value === event)?.label || event;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Logs: ${webhook.name}`} size="xl">
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : !logs?.length ? (
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title="No delivery logs"
            description="Logs will appear here after webhook deliveries"
          />
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {logs.map((log: WebhookLog) => (
              <LogEntry key={log.id} log={log} getEventLabel={getEventLabel} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function LogEntry({
  log,
  getEventLabel,
}: {
  log: WebhookLog;
  getEventLabel: (e: string) => string;
}) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getStatusColor = (status: number | null) => {
    if (!status) return 'text-text-tertiary';
    if (status >= 200 && status < 300) return 'text-success';
    if (status >= 400 && status < 500) return 'text-warning';
    return 'text-error';
  };

  return (
    <details className="group border border-border rounded-lg overflow-hidden">
      <summary className="flex items-center gap-3 p-3 cursor-pointer hover:bg-surface-hover transition-colors">
        {/* Status icon */}
        {log.success ? (
          <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-error flex-shrink-0" />
        )}

        {/* Event type */}
        <span className="text-sm font-medium text-foreground">
          {getEventLabel(log.event_type)}
        </span>

        {/* Status code */}
        {log.response_status && (
          <Badge
            variant={log.success ? 'success' : 'error'}
            className="text-xs"
          >
            {log.response_status}
          </Badge>
        )}

        {/* Attempt number */}
        {log.attempt > 1 && (
          <Badge variant="warning" className="text-xs">
            Attempt {log.attempt}
          </Badge>
        )}

        {/* Latency */}
        {log.latency_ms && (
          <span className="text-xs text-text-tertiary flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {log.latency_ms}ms
          </span>
        )}

        {/* Timestamp */}
        <span className="text-xs text-text-tertiary ml-auto">
          {formatTime(log.created_at)}
        </span>
      </summary>

      {/* Expanded details */}
      <div className="border-t border-border p-3 bg-surface-secondary space-y-3">
        {/* Error message */}
        {log.error_message && (
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase">
              Error
            </label>
            <p className="text-sm text-error mt-1 font-mono">{log.error_message}</p>
          </div>
        )}

        {/* Payload */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase">
            Payload
          </label>
          <pre className="text-xs text-text-secondary mt-1 bg-background rounded p-2 overflow-x-auto">
            {JSON.stringify(log.payload, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  );
}
