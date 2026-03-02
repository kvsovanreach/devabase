'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { API_CONFIG } from '@/lib/config';
import { RagConfig, ChatResponse, StreamEvent, StreamingSource } from '@/types';
import toast from 'react-hot-toast';

// Unified RAG request type - supports single or multiple collections
export interface UnifiedRagRequest {
  collection: string | string[];
  message: string;
  conversation_id?: string;
  include_sources?: boolean;
  top_k?: number;
  stream?: boolean;
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
export interface UnifiedRagResponse {
  answer: string;
  thinking?: string;
  sources: RagSource[];
  collections_used: string[];
  conversation_id?: string;
  tokens_used: number;
}

// Legacy types for backward compatibility
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
      queryClient.invalidateQueries({ queryKey: ['collections', collectionName] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      toast.success('RAG API disabled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disable RAG');
    },
  });
}

// Streaming callbacks interface
export interface StreamingChatCallbacks {
  onSources?: (sources: StreamingSource[]) => void;
  onThinking?: (thinking: string) => void;
  onContent?: (content: string) => void;
  onDone?: (conversationId: string | null, tokensUsed: number) => void;
  onError?: (error: string) => void;
}

// Legacy alias
export type MultiStreamingChatCallbacks = StreamingChatCallbacks;

/**
 * Unified streaming RAG chat function
 * Uses /v1/rag endpoint with collection (string or array) and stream: true
 */
export async function streamRag(
  request: UnifiedRagRequest,
  callbacks: StreamingChatCallbacks
): Promise<void> {
  const response = await fetch(
    `${API_CONFIG.baseUrl}/v1/rag`,
    {
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
    }
  );

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

        // SSE format: "data: {...}"
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
 * Legacy function for single collection streaming RAG chat
 * @deprecated Use streamRag instead
 */
export async function streamRagChat(
  collectionName: string,
  request: { message: string; conversation_id?: string; include_sources?: boolean; top_k?: number },
  callbacks: StreamingChatCallbacks
): Promise<void> {
  return streamRag(
    {
      collection: collectionName,
      message: request.message,
      conversation_id: request.conversation_id,
      include_sources: request.include_sources,
      top_k: request.top_k,
    },
    callbacks
  );
}

/**
 * Legacy function for multi-collection streaming RAG chat
 * @deprecated Use streamRag instead
 */
export async function streamMultiRagChat(
  request: MultiCollectionChatRequest,
  callbacks: StreamingChatCallbacks
): Promise<void> {
  return streamRag(
    {
      collection: request.collections,
      message: request.message,
      conversation_id: request.conversation_id,
      include_sources: request.include_sources,
      top_k: request.top_k,
    },
    callbacks
  );
}

/**
 * Unified RAG chat hook (non-streaming)
 * Uses /v1/rag endpoint with stream: false
 */
export function useRag() {
  return useMutation({
    mutationFn: async (request: UnifiedRagRequest) => {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/rag`,
        {
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
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'RAG chat request failed');
      }

      return response.json() as Promise<UnifiedRagResponse>;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Chat failed');
    },
  });
}

/**
 * Legacy hook for single collection RAG chat
 * @deprecated Use useRag instead
 */
export function useRagChat() {
  return useMutation({
    mutationFn: async ({
      collectionName,
      request,
    }: {
      collectionName: string;
      request: { message: string; conversation_id?: string; include_sources?: boolean };
    }) => {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/rag`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${api.getStoredToken()}`,
            'X-Project-ID': api.getStoredProjectId() || '',
          },
          body: JSON.stringify({
            collection: collectionName,
            message: request.message,
            conversation_id: request.conversation_id,
            include_sources: request.include_sources,
            stream: false,
          }),
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

/**
 * Legacy hook for multi-collection RAG chat
 * @deprecated Use useRag instead
 */
export function useMultiCollectionRagChat() {
  return useMutation({
    mutationFn: async (request: MultiCollectionChatRequest) => {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/rag`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${api.getStoredToken()}`,
            'X-Project-ID': api.getStoredProjectId() || '',
          },
          body: JSON.stringify({
            collection: request.collections,
            message: request.message,
            conversation_id: request.conversation_id,
            include_sources: request.include_sources,
            top_k: request.top_k,
            stream: false,
          }),
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
