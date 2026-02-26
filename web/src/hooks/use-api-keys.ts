'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { CreateApiKeyRequest } from '@/types';
import { useProjectStore } from '@/stores/project-store';

export function useApiKeys() {
  const { currentProject } = useProjectStore();

  return useQuery({
    queryKey: ['api-keys', currentProject?.id],
    queryFn: () => api.listApiKeys(),
    enabled: !!currentProject, // Only fetch when project is selected
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
