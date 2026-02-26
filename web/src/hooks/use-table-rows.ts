'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export interface RowsResponse {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export interface RowsQuery {
  limit?: number;
  offset?: number;
  order?: string;
  filter?: string;
  select?: string;
}

export function useTableRows(tableName: string, query: RowsQuery = {}) {
  return useQuery({
    queryKey: ['table-rows', tableName, query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.limit) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
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
