'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

// Extract error message from Axios error
function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError && error.response?.data) {
    // Server returned an error response
    const data = error.response.data;
    return data.error || data.message || 'Query failed';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Query failed';
}

export interface ColumnInfo {
  name: string;
  type_name: string;
}

export interface ExecuteResult {
  columns: ColumnInfo[];
  rows: (string | number | boolean | null)[][];
  row_count: number;
  execution_time_ms: number;
}

export interface QueryHistoryEntry {
  id: string;
  query: string;
  execution_time_ms: number | null;
  row_count: number | null;
  error_message: string | null;
  created_at: string;
}

export interface SchemaInfo {
  tables: TableInfo[];
}

export interface TableInfo {
  name: string;
  columns: SchemaColumnInfo[];
}

export interface SchemaColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
}

export function useExecuteSql() {
  return useMutation({
    mutationFn: async (query: string) => {
      try {
        const response = await api.post<ExecuteResult>('/sql/execute', { query });
        return response.data;
      } catch (error) {
        // Re-throw with proper error message for the component to catch
        const message = getErrorMessage(error);
        throw new Error(message);
      }
    },
  });
}

export function useSqlHistory() {
  return useQuery({
    queryKey: ['sql-history'],
    queryFn: async () => {
      const response = await api.get<QueryHistoryEntry[]>('/sql/history?limit=50');
      return response.data;
    },
  });
}

export function useSqlSchema() {
  return useQuery({
    queryKey: ['sql-schema'],
    queryFn: async () => {
      const response = await api.get<SchemaInfo>('/sql/schema');
      return response.data;
    },
  });
}
