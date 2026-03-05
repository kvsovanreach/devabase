import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface CacheStats {
  total_entries: number;
  total_size_bytes: number;
  hit_rate: number;
}

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

export class AdminResource {
  constructor(private http: HttpClient) {}

  // =========================================================================
  // Cache Management
  // =========================================================================

  readonly cache = {
    /**
     * Get cache statistics
     * @example
     * const stats = await client.admin.cache.getStats();
     */
    getStats: async (options?: RequestOptions): Promise<CacheStats> => {
      return this.http.get<CacheStats>('/v1/admin/cache', undefined, options);
    },

    /**
     * Clear all cache entries
     * @example
     * const result = await client.admin.cache.clear();
     */
    clear: async (options?: RequestOptions): Promise<{ deleted: number }> => {
      return this.http.delete<{ deleted: number }>('/v1/admin/cache', options);
    },

    /**
     * Delete a specific cache entry by key
     * @example
     * await client.admin.cache.delete('cache-key');
     */
    delete: async (key: string, options?: RequestOptions): Promise<{ deleted: boolean }> => {
      return this.http.delete<{ deleted: boolean }>(`/v1/admin/cache/${key}`, options);
    },
  };

  // =========================================================================
  // Usage Analytics
  // =========================================================================

  readonly usage = {
    /**
     * Get usage analytics
     * @example
     * const usage = await client.admin.usage.get({
     *   start_date: '2024-01-01T00:00:00Z',
     *   end_date: '2024-01-31T23:59:59Z'
     * });
     */
    get: async (
      query?: {
        start_date?: string;
        end_date?: string;
        limit?: number;
        offset?: number;
      },
      options?: RequestOptions
    ): Promise<UsageResponse> => {
      return this.http.get<UsageResponse>('/v1/admin/usage', query, options);
    },

    /**
     * Export usage logs as JSON
     * @example
     * const logs = await client.admin.usage.export({
     *   start_date: '2024-01-01T00:00:00Z'
     * });
     */
    export: async (
      query?: {
        start_date?: string;
        end_date?: string;
        format?: string;
      },
      options?: RequestOptions
    ): Promise<Record<string, unknown>[]> => {
      return this.http.get<Record<string, unknown>[]>('/v1/admin/usage/export', query, options);
    },
  };
}
