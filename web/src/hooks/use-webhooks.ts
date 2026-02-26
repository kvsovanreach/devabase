'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export interface Webhook {
  id: string;
  project_id: string;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'paused' | 'disabled';
  headers: Record<string, string> | null;
  retry_count: number;
  timeout_ms: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  latency_ms: number | null;
  attempt: number;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  retry_count?: number;
  timeout_ms?: number;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: string[];
  status?: 'active' | 'paused' | 'disabled';
  headers?: Record<string, string>;
  retry_count?: number;
  timeout_ms?: number;
}

export interface TestWebhookResult {
  success: boolean;
  status_code: number | null;
  latency_ms: number;
  response_body: string | null;
  error: string | null;
}

// Available webhook events
export const WEBHOOK_EVENTS = [
  { value: 'document.uploaded', label: 'Document Uploaded' },
  { value: 'document.processing', label: 'Document Processing' },
  { value: 'document.processed', label: 'Document Processed' },
  { value: 'document.failed', label: 'Document Failed' },
  { value: 'document.deleted', label: 'Document Deleted' },
  { value: 'collection.created', label: 'Collection Created' },
  { value: 'collection.deleted', label: 'Collection Deleted' },
  { value: 'vector.upserted', label: 'Vector Upserted' },
  { value: 'vector.deleted', label: 'Vector Deleted' },
  { value: 'table.created', label: 'Table Created' },
  { value: 'table.deleted', label: 'Table Deleted' },
  { value: 'table.row.created', label: 'Table Row Created' },
  { value: 'table.row.updated', label: 'Table Row Updated' },
  { value: 'table.row.deleted', label: 'Table Row Deleted' },
] as const;

export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const response = await api.get<Webhook[]>('/webhooks');
      return response.data;
    },
  });
}

export function useWebhook(id: string) {
  return useQuery({
    queryKey: ['webhooks', id],
    queryFn: async () => {
      const response = await api.get<Webhook>(`/webhooks/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const response = await api.post<Webhook>('/webhooks', input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create webhook');
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateWebhookInput & { id: string }) => {
      const response = await api.patch<Webhook>(`/webhooks/${id}`, input);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['webhooks', variables.id] });
      toast.success('Webhook updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update webhook');
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete webhook');
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<TestWebhookResult>(`/webhooks/${id}/test`);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Test successful (${data.status_code}, ${data.latency_ms}ms)`);
      } else {
        toast.error(`Test failed: ${data.error || `Status ${data.status_code}`}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to test webhook');
    },
  });
}

export function useWebhookLogs(id: string, limit = 50) {
  return useQuery({
    queryKey: ['webhooks', id, 'logs', limit],
    queryFn: async () => {
      const response = await api.get<WebhookLog[]>(`/webhooks/${id}/logs?limit=${limit}`);
      return response.data;
    },
    enabled: !!id,
  });
}
