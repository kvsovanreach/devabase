'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export interface PaginationMeta {
  /** Total number of rows matching the filter */
  total: number;
  /** Number of rows returned in this response */
  count: number;
  /** Current limit (rows per page) */
  limit: number;
  /** Current offset */
  offset: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  total_pages: number;
  /** Whether there is a next page */
  has_next: boolean;
  /** Whether there is a previous page */
  has_previous: boolean;
  /** Cursor for next page (if available) */
  next_cursor?: string;
  /** Cursor for previous page (if available) */
  prev_cursor?: string;
}

export interface RowsResponse {
  rows: Record<string, unknown>[];
  pagination: PaginationMeta;
}

export interface RowsQuery {
  /** Number of rows to return (default: 50, max: 1000) */
  limit?: number;
  /** Offset for pagination (use with limit) */
  offset?: number;
  /** Page number (1-indexed, alternative to offset) */
  page?: number;
  /** Rows per page (alternative to limit) */
  per_page?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
  /** Sort order (e.g., "created_at:desc,name:asc") */
  order?: string;
  /** Filter conditions (e.g., "status.eq=active&age.gte=18") */
  filter?: string;
  /** Columns to return (e.g., "id,name,email") */
  select?: string;
}

export function useTableRows(tableName: string, query: RowsQuery = {}) {
  return useQuery({
    queryKey: ['table-rows', tableName, query],
    queryFn: async () => {
      const params = new URLSearchParams();

      // Pagination parameters
      if (query.limit) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
      if (query.page) params.set('page', String(query.page));
      if (query.per_page) params.set('per_page', String(query.per_page));
      if (query.cursor) params.set('cursor', query.cursor);

      // Query parameters
      if (query.order) params.set('order', query.order);
      if (query.filter) params.set('filter', query.filter);
      if (query.select) params.set('select', query.select);

      const queryString = params.toString();
      const url = `/tables/${tableName}/rows${queryString ? `?${queryString}` : ''}`;
      const response = await api.get<RowsResponse>(url);
      return response.data;
    },
    enabled: !!tableName,
  });
}

/**
 * Hook for paginated table rows with page-based navigation
 */
export function useTableRowsPaginated(
  tableName: string,
  page: number = 1,
  perPage: number = 50,
  options: Omit<RowsQuery, 'page' | 'per_page' | 'limit' | 'offset'> = {}
) {
  return useQuery({
    queryKey: ['table-rows', tableName, { page, perPage, ...options }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', String(perPage));

      if (options.order) params.set('order', options.order);
      if (options.filter) params.set('filter', options.filter);
      if (options.select) params.set('select', options.select);

      const queryString = params.toString();
      const url = `/tables/${tableName}/rows?${queryString}`;
      const response = await api.get<RowsResponse>(url);
      return response.data;
    },
    enabled: !!tableName,
  });
}

/**
 * Hook for cursor-based pagination (infinite scroll)
 */
export function useTableRowsCursor(
  tableName: string,
  cursor: string | null,
  limit: number = 50,
  options: Omit<RowsQuery, 'cursor' | 'limit' | 'offset' | 'page' | 'per_page'> = {}
) {
  return useQuery({
    queryKey: ['table-rows', tableName, { cursor, limit, ...options }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (cursor) params.set('cursor', cursor);

      if (options.order) params.set('order', options.order);
      if (options.filter) params.set('filter', options.filter);
      if (options.select) params.set('select', options.select);

      const queryString = params.toString();
      const url = `/tables/${tableName}/rows?${queryString}`;
      const response = await api.get<RowsResponse>(url);
      return response.data;
    },
    enabled: !!tableName,
  });
}

export function useTableRow(tableName: string, rowId: string) {
  return useQuery({
    queryKey: ['table-rows', tableName, rowId],
    queryFn: async () => {
      const response = await api.get<{ row: Record<string, unknown> }>(
        `/tables/${tableName}/rows/${rowId}`
      );
      return response.data.row;
    },
    enabled: !!tableName && !!rowId,
  });
}

export function useCreateRow(tableName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await api.post<{ row: Record<string, unknown> }>(
        `/tables/${tableName}/rows`,
        data
      );
      return response.data.row;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-rows', tableName] });
      queryClient.invalidateQueries({ queryKey: ['tables', tableName] });
      toast.success('Row created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create row');
    },
  });
}

export function useUpdateRow(tableName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rowId,
      data,
    }: {
      rowId: string;
      data: Record<string, unknown>;
    }) => {
      const response = await api.patch<{ row: Record<string, unknown> }>(
        `/tables/${tableName}/rows/${rowId}`,
        data
      );
      return response.data.row;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-rows', tableName] });
      toast.success('Row updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update row');
    },
  });
}

export function useDeleteRow(tableName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rowId: string) => {
      await api.delete(`/tables/${tableName}/rows/${rowId}`);
      return rowId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-rows', tableName] });
      queryClient.invalidateQueries({ queryKey: ['tables', tableName] });
      toast.success('Row deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete row');
    },
  });
}
