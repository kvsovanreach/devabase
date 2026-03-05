'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { CreateApiKeyRequest } from '@/types';
import { useProjectStore } from '@/stores/project-store';

export function useApiKeys(params?: { limit?: number; offset?: number }) {
  const { currentProject } = useProjectStore();

  return useQuery({
    queryKey: ['api-keys', currentProject?.id, params],
    queryFn: () => api.listApiKeys(params),
    enabled: !!currentProject,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  const { currentProject } = useProjectStore();

  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => api.createApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', currentProject?.id] });
    },
  });
}

export function useToggleApiKey() {
  const queryClient = useQueryClient();
  const { currentProject } = useProjectStore();

  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.toggleApiKey(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', currentProject?.id] });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  const { currentProject } = useProjectStore();

  return useMutation({
    mutationFn: (id: string) => api.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', currentProject?.id] });
    },
  });
}
