'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens: number;
  sources: ChatSource[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ChatSource {
  document_id: string;
  document_name: string;
  chunk_content: string;
  relevance_score: number;
}

export interface Conversation {
  id: string;
  project_id: string;
  collection_id: string;
  collection_name: string;
  user_id: string | null;
  title: string | null;
  summary: string | null;
  message_count: number;
  total_tokens: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface ListConversationsParams {
  collection_id?: string;
  limit?: number;
  offset?: number;
}

export function useConversations(params?: ListConversationsParams) {
  return useQuery({
    queryKey: ['conversations', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.collection_id) searchParams.set('collection_id', params.collection_id);
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.offset) searchParams.set('offset', params.offset.toString());

      const queryString = searchParams.toString();
      const url = queryString ? `/conversations?${queryString}` : '/conversations';

      const response = await api.get<{ data: Conversation[]; pagination: unknown }>(url);
      // Backend returns paginated response, extract the data array
      return response.data.data;
    },
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const response = await api.get<ConversationWithMessages>(`/conversations/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { collection_id: string; title?: string }) => {
      const response = await api.post<Conversation>('/conversations', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; summary?: string }) => {
      const response = await api.patch<Conversation>(`/conversations/${id}`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', data.id] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conversations/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
