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
  rerank?: boolean;
}

export interface MultiCollectionSearchResult {
  id: string;
  document_id: string;
  collection_name: string;
  content: string;
  score: number;
  rerank_score?: number;
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
      const response = await apiClient.post<{ results: MultiCollectionSearchResult[]; total: number; query: string }>('/search', data);
      // Map backend response to expected frontend format
      return {
        results: response.data.results,
        collections_searched: data.collections, // Use input collections since backend doesn't return this
        total_results: response.data.total,
      };
    },
  });
}

// Hybrid search (vector + keyword/BM25 with RRF fusion)
export function useHybridSearch() {
  return useMutation({
    mutationFn: (data: HybridSearchRequest) => api.hybridSearch(data),
  });
}
