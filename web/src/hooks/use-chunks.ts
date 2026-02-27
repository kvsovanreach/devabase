'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Chunk } from '@/types';

// Response types
export interface SplitChunkResponse {
  chunks: Chunk[];
}

export interface MergeChunkResponse {
  chunk: Chunk;
  merged_count: number;
}

// Request types
export interface UpdateChunkRequest {
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface SplitChunkRequest {
  split_at: number;
}

export interface MergeChunksRequest {
  chunk_ids: string[];
  separator?: string;
}

// Alias for consistent naming
export type MergeChunksParams = MergeChunksRequest;

// Get a single chunk
export function useGetChunk() {
  return useMutation({
    mutationFn: async (chunkId: string) => {
      const response = await api.get<Chunk>(`/chunks/${chunkId}`);
      return response.data;
    },
  });
}

// Update chunk content and/or metadata
export function useUpdateChunk(documentId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chunkId, data }: { chunkId: string; data: UpdateChunkRequest }) => {
      const response = await api.patch<Chunk>(`/chunks/${chunkId}`, data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate document chunks to refresh the list
      if (documentId) {
        queryClient.invalidateQueries({ queryKey: ['document-chunks', documentId] });
      }
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

// Delete a chunk
export function useDeleteChunk(documentId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chunkId: string) => {
      await api.delete(`/chunks/${chunkId}`);
    },
    onSuccess: () => {
      if (documentId) {
        queryClient.invalidateQueries({ queryKey: ['document-chunks', documentId] });
      }
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

// Split a chunk into two at a given position
export function useSplitChunk(documentId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chunkId, splitAt }: { chunkId: string; splitAt: number }) => {
      const response = await api.post<SplitChunkResponse>(`/chunks/${chunkId}/split`, {
        split_at: splitAt,
      });
      return response.data;
    },
    onSuccess: () => {
      if (documentId) {
        queryClient.invalidateQueries({ queryKey: ['document-chunks', documentId] });
      }
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

// Merge multiple chunks into one
export function useMergeChunks(documentId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chunk_ids, separator }: MergeChunksRequest) => {
      const response = await api.post<MergeChunkResponse>('/chunks/merge', {
        chunk_ids,
        separator: separator || '\n\n',
      });
      return response.data;
    },
    onSuccess: () => {
      if (documentId) {
        queryClient.invalidateQueries({ queryKey: ['document-chunks', documentId] });
      }
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}
