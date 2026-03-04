'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { API_CONFIG } from '@/lib/config';
import toast from 'react-hot-toast';

export interface ImportResult {
  total: number;
  imported: number;
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  message: string;
}

export type ExportFormat = 'csv' | 'json';

export function useExportTable() {
  return useMutation({
    mutationFn: async ({ tableName, format, projectName }: { tableName: string; format: ExportFormat; projectName?: string }) => {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/tables/${encodeURIComponent(tableName)}/export?format=${format}`,
        {
          headers: {
            Authorization: `Bearer ${api.getStoredToken()}`,
            'X-Project-ID': api.getStoredProjectId() || '',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to export table');
      }

      const blob = await response.blob();

      // Generate filename: project_name.table_name_timestamp.format
      // Convert to lowercase and replace spaces/special chars with underscores
      const sanitize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const sanitizedTable = sanitize(tableName);
      const prefix = projectName ? `${sanitize(projectName)}.` : '';
      const filename = `${prefix}${sanitizedTable}_${timestamp}.${format}`;

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { filename };
    },
    onSuccess: ({ filename }) => {
      toast.success(`Exported ${filename}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export table');
    },
  });
}

export function useImportTable() {
  return useMutation({
    mutationFn: async ({ tableName, file }: { tableName: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${API_CONFIG.baseUrl}/v1/tables/${encodeURIComponent(tableName)}/import`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${api.getStoredToken()}`,
            'X-Project-ID': api.getStoredProjectId() || '',
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to import data');
      }

      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      if (data.errors.length > 0) {
        toast.error(`Imported ${data.imported}/${data.total} rows with ${data.errors.length} errors`);
      } else {
        toast.success(`Successfully imported ${data.imported} rows`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import data');
    },
  });
}
