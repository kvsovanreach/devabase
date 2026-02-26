'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export interface TableColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary: boolean;
  column_default: string | null;
}

export interface TableInfo {
  name: string;
  columns: TableColumnInfo[];
  row_count: number;
  created_at: string;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  primary?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
}

export interface CreateTableRequest {
  name: string;
  columns: ColumnDefinition[];
}

export function useTables() {
  return useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      const response = await api.get<TableInfo[]>('/tables');
      return response.data;
    },
  });
}

export function useTable(tableName: string) {
  return useQuery({
    queryKey: ['tables', tableName],
    queryFn: async () => {
      const response = await api.get<TableInfo>(`/tables/${tableName}`);
      return response.data;
    },
    enabled: !!tableName,
  });
}

export function useCreateTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTableRequest) => {
      const response = await api.post<TableInfo>('/tables', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success(`Table "${data.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create table');
    },
  });
}

export function useDeleteTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tableName: string) => {
      await api.delete(`/tables/${tableName}`);
      return tableName;
    },
    onSuccess: (tableName) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success(`Table "${tableName}" deleted`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete table');
    },
  });
}
