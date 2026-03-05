'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface UsageSummary {
  total_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  error_count: number;
  period_start: string;
  period_end: string;
}

export interface UsageByEndpoint {
  method: string;
  endpoint: string;
  request_count: number;
  total_tokens: number;
  avg_latency_ms: number;
}

export interface UsageResponse {
  summary: UsageSummary;
  by_endpoint: UsageByEndpoint[];
  total_endpoints: number;
  page: number;
  per_page: number;
}

export interface UsageQueryParams {
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export function useUsageAnalytics(params?: UsageQueryParams) {
  return useQuery({
    queryKey: ['usage', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.start_date) searchParams.set('start_date', params.start_date);
      if (params?.end_date) searchParams.set('end_date', params.end_date);
      if (params?.limit != null) searchParams.set('limit', params.limit.toString());
      if (params?.offset != null) searchParams.set('offset', params.offset.toString());

      const queryString = searchParams.toString();
      const url = queryString ? `/admin/usage?${queryString}` : '/admin/usage';

      const response = await api.get<UsageResponse>(url);
      return response.data;
    },
    staleTime: 30 * 1000, // Data is fresh for 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    refetchOnWindowFocus: true,
  });
}

export function useStorageStats() {
  return useQuery({
    queryKey: ['storage-stats'],
    queryFn: async () => {
      // Get collection stats for storage info
      const collections = await api.listCollections();
      const totalVectors = collections.reduce((sum, c) => sum + c.vector_count, 0);
      const totalDocuments = collections.reduce((sum, c) => sum + c.document_count, 0);

      return {
        collections: collections.length,
        vectors: totalVectors,
        documents: totalDocuments,
      };
    },
    staleTime: 30 * 1000, // Data is fresh for 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    refetchOnWindowFocus: true,
  });
}
