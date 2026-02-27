'use client';

import { useMutation } from '@tanstack/react-query';
import api, { api as apiClient } from '@/lib/api';
import { SearchRequest, HybridSearchRequest, HybridSearchResult } from '@/types';

export function useSearch() {
  return useMutation({
    mutationFn: (data: SearchRequest) => api.search(data),
  });
}

export interface MultiCollectionSearchRequest {
  collections: string[];
  query: string;
  top_k?: number;
  filter?: Record<string, unknown>;
}

export interface MultiCollectionSearchResult {
  id: string;
  document_id: string;
  collection_name: string;
  content: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export interface MultiCollectionSearchResponse {
  results: MultiCollectionSearchResult[];
  collections_searched: string[];
  total_results: number;
}

export function useMultiCollectionSearch() {
  return useMutation({
    mutationFn: async (data: MultiCollectionSearchRequest) => {
      const response = await apiClient.post<MultiCollectionSearchResponse>('/retrieve/multi', data);
      return response.data;
    },
  });
}

// Hybrid search (vector + keyword/BM25 with RRF fusion)
export function useHybridSearch() {
  return useMutation({
    mutationFn: (data: HybridSearchRequest) => api.hybridSearch(data),
  });
}
