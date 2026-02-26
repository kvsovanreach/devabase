'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { API_CONFIG } from '@/lib/config';
import { RagConfig, ChatRequest, ChatResponse } from '@/types';
import toast from 'react-hot-toast';

// Multi-collection RAG types
export interface MultiCollectionChatRequest {
  collections: string[];
  message: string;
  conversation_id?: string;
  include_sources?: boolean;
  top_k?: number;
}

export interface MultiCollectionChatSource {
  collection_name: string;
  document_id: string;
  document_name: string;
  chunk_content: string;
  relevance_score: number;
}

export interface MultiCollectionChatResponse {
  answer: string;
  sources: MultiCollectionChatSource[];
  collections_used: string[];
  conversation_id?: string;
  tokens_used: number;
}

export function useEnableRag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collectionName,
      config,
    }: {
      collectionName: string;
      config: Partial<RagConfig>;
    }) => {
      const response = await api.patch<{ success: boolean }>(
        `/collections/${encodeURIComponent(collectionName)}/rag`,
        config
      );
      return response.data;
    },
    onSuccess: (_, { collectionName }) => {
      // Invalidate both the specific collection and the list
      queryClient.invalidateQueries({ queryKey: ['collections', collectionName] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      toast.success('RAG API enabled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to enable RAG');
    },
  });
}

export function useDisableRag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collectionName: string) => {
      const response = await api.patch<{ success: boolean }>(
        `/collections/${encodeURIComponent(collectionName)}/rag`,
        { enabled: false }
      );
      return response.data;
    },
    onSuccess: (_, collectionName) => {
      // Invalidate both the specific collection and the list
      queryClient.invalidateQueries({ queryKey: ['collections', collectionName] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      toast.success('RAG API disabled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disable RAG');
    },
  });
}

export function useRagChat() {
  return useMutation({
    mutationFn: async ({
      collectionName,
      request,
    }: {
      collectionName: string;
      request: ChatRequest;
    }) => {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/rag/${encodeURIComponent(collectionName)}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${api.getStoredToken()}`,
            'X-Project-ID': api.getStoredProjectId() || '',
          },
          body: JSON.stringify(request),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Chat request failed');
      }

      return response.json() as Promise<ChatResponse>;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Chat failed');
    },
  });
}

export function useMultiCollectionRagChat() {
  return useMutation({
    mutationFn: async (request: MultiCollectionChatRequest) => {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/rag/multi/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${api.getStoredToken()}`,
            'X-Project-ID': api.getStoredProjectId() || '',
          },
          body: JSON.stringify(request),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Multi-collection chat request failed');
      }

      return response.json() as Promise<MultiCollectionChatResponse>;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Chat failed');
    },
  });
}

export const defaultRagConfig: RagConfig = {
  enabled: false,
  llm_provider_id: '',
  model: '',
  system_prompt:
    'You are a helpful assistant answering questions based on the provided context. If the answer is not in the context, say so.',
  temperature: 0.7,
  max_tokens: 1000,
  top_k: 5,
};
