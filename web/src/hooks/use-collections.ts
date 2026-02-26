'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { CreateCollectionRequest } from '@/types';

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: () => api.listCollections(),
  });
}

export function useCollection(name: string) {
  return useQuery({
    queryKey: ['collections', name],
    queryFn: () => api.getCollection(name),
    enabled: !!name,
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCollectionRequest) => api.createCollection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.deleteCollection(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, data }: {
      name: string;
      data: {
        rag_enabled?: boolean;
        rag_config?: {
          llm_provider_id: string;
          model: string;
          system_prompt: string;
          top_k: number;
          temperature: number;
          max_tokens: number;
        } | null;
        metadata?: Record<string, unknown>;
      };
    }) => api.updateCollection(name, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['collections', variables.name] });
    },
  });
}
