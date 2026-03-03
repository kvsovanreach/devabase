'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { API_CONFIG } from '@/lib/config';
import { RagConfig, StreamEvent, StreamingSource } from '@/types';
import toast from 'react-hot-toast';

// Unified RAG request type - supports single or multiple collections
export interface RagRequest {
  collection: string | string[];
  message: string;
  conversation_id?: string;
  include_sources?: boolean;
  top_k?: number;
}

// Source type in RAG responses
export interface RagSource {
  collection_name: string;
  document_id: string;
  document_name: string;
  chunk_content: string;
  relevance_score: number;
}

// Unified RAG response type
export interface RagResponse {
  answer: string;
  thinking?: string;
  sources: RagSource[];
  collections_used: string[];
  conversation_id?: string;
  tokens_used: number;
}

// Streaming callbacks interface
export interface StreamingCallbacks {
  onSources?: (sources: StreamingSource[]) => void;
  onThinking?: (thinking: string) => void;
  onContent?: (content: string) => void;
  onDone?: (conversationId: string | null, tokensUsed: number) => void;
  onError?: (error: string) => void;
}

/**
 * Enable RAG on a collection
 */
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
        `/collections/${encodeURIComponent(collectionName)}/config`,
        config
      );
      return response.data;
    },
    onSuccess: (_, { collectionName }) => {
      queryClient.invalidateQueries({ queryKey: ['collections', collectionName] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      toast.success('RAG API enabled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to enable RAG');
    },
  });
}

/**
 * Disable RAG on a collection
 */
export function useDisableRag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collectionName: string) => {
      const response = await api.patch<{ success: boolean }>(
        `/collections/${encodeURIComponent(collectionName)}/config`,
        { enabled: false }
      );
      return response.data;
    },
    onSuccess: (_, collectionName) => {
      queryClient.invalidateQueries({ queryKey: ['collections', collectionName] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      toast.success('RAG API disabled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disable RAG');
    },
  });
}

/**
 * Streaming RAG chat
 * Uses /v1/rag endpoint with collection (string or array)
 */
export async function streamRag(
  request: RagRequest,
  callbacks: StreamingCallbacks
): Promise<void> {
  const response = await fetch(`${API_CONFIG.baseUrl}/v1/rag`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${api.getStoredToken()}`,
      'X-Project-ID': api.getStoredProjectId() || '',
    },
    body: JSON.stringify({
      ...request,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Streaming RAG chat request failed');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'keep-alive') continue;

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const event = JSON.parse(jsonStr) as StreamEvent;

            switch (event.type) {
              case 'sources':
                callbacks.onSources?.(event.sources);
                break;
              case 'thinking':
                callbacks.onThinking?.(event.content);
                break;
              case 'content':
                callbacks.onContent?.(event.content);
                break;
              case 'done':
                callbacks.onDone?.(event.conversation_id, event.tokens_used);
                break;
              case 'error':
                callbacks.onError?.(event.message);
                break;
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming RAG chat hook
 * Uses /v1/rag endpoint
 */
export function useRag() {
  return useMutation({
    mutationFn: async (request: RagRequest) => {
      const response = await fetch(`${API_CONFIG.baseUrl}/v1/rag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api.getStoredToken()}`,
          'X-Project-ID': api.getStoredProjectId() || '',
        },
        body: JSON.stringify({
          ...request,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'RAG chat request failed');
      }

      return response.json() as Promise<RagResponse>;
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
