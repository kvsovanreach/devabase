'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Document, Chunk } from '@/types';

export function useDocuments(collection: string) {
  return useQuery({
    queryKey: ['documents', collection],
    queryFn: () => api.listDocuments(collection),
    enabled: !!collection,
  });
}

// Auto-polling hook for documents with processing status
export function useDocumentsWithPolling(collection: string) {
  const [shouldPoll, setShouldPoll] = useState(false);
  const [prevProcessingCount, setPrevProcessingCount] = useState(0);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['documents', collection],
    queryFn: () => api.listDocuments(collection),
    enabled: !!collection,
    // Poll every 2 seconds when shouldPoll is true
    refetchInterval: shouldPoll ? 2000 : false,
    // Always refetch on window focus
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale to ensure fresh fetches
  });

  // Update shouldPoll based on document statuses and refresh collections when processing completes
  useEffect(() => {
    const documents = query.data;
    if (!documents || !Array.isArray(documents)) {
      setShouldPoll(false);
      return;
    }

    const processingCount = documents.filter(
      (doc: Document) => doc.status === 'pending' || doc.status === 'processing'
    ).length;

    // If processing count decreased (documents finished), refresh collections to update vector counts
    if (prevProcessingCount > 0 && processingCount < prevProcessingCount) {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    }

    setPrevProcessingCount(processingCount);
    setShouldPoll(processingCount > 0);
  }, [query.data, prevProcessingCount, queryClient]);

  return query;
}

export function useDocument(collection: string, id: string) {
  return useQuery({
    queryKey: ['documents', collection, id],
    queryFn: () => api.getDocument(collection, id),
    enabled: !!collection && !!id,
  });
}

export function useUploadDocument(collection: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, name, onProgress, process }: { file: File; name?: string; onProgress?: (p: number) => void; process?: boolean }) =>
      api.uploadDocument(collection, file, name, onProgress, process),
    onSuccess: () => {
      // Invalidate the specific collection's documents
      queryClient.invalidateQueries({ queryKey: ['documents', collection] });
      // Also invalidate all documents queries to ensure any view is updated
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useReprocessDocument(collection: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.reprocessDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', collection] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDeleteDocument(collection: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteDocument(collection, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', collection] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useDocumentChunks(documentId: string | undefined) {
  return useQuery({
    queryKey: ['document-chunks', documentId],
    queryFn: async () => {
      const response = await api.getDocumentChunks(documentId!);
      return response;
    },
    enabled: !!documentId,
  });
}
