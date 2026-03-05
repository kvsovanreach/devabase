'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AdminUpdateAppUserRequest } from '@/types';
import { useProjectStore } from '@/stores/project-store';

export function useAppUsers(params?: { limit?: number; offset?: number }) {
  const { currentProject } = useProjectStore();

  return useQuery({
    queryKey: ['app-users', currentProject?.id, params],
    queryFn: () => api.listAppUsers(params),
    enabled: !!currentProject,
  });
}

export function useUpdateAppUser() {
  const queryClient = useQueryClient();
  const { currentProject } = useProjectStore();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdminUpdateAppUserRequest }) =>
      api.updateAppUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-users', currentProject?.id] });
    },
  });
}

export function useDeleteAppUser() {
  const queryClient = useQueryClient();
  const { currentProject } = useProjectStore();

  return useMutation({
    mutationFn: (id: string) => api.deleteAppUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-users', currentProject?.id] });
    },
  });
}
