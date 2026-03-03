'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '@/lib/api';
import {
  Entity,
  EntityWithRelationships,
  Relationship,
  GraphResponse,
  KnowledgeStats,
} from '@/types';

// ============================================================================
// ENTITY HOOKS
// ============================================================================

export interface ListEntitiesParams {
  entity_type?: string;
  collection_id?: string;
  limit?: number;
  offset?: number;
}

export function useEntities(params: ListEntitiesParams = {}) {
  return useQuery({
    queryKey: ['knowledge', 'entities', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.entity_type) searchParams.set('entity_type', params.entity_type);
      if (params.collection_id) searchParams.set('collection_id', params.collection_id);
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.offset) searchParams.set('offset', params.offset.toString());

      const response = await apiClient.get<{ data: Entity[]; pagination: unknown }>(
        `/knowledge/entities?${searchParams.toString()}`
      );
      // Backend returns paginated response, extract the data array
      return response.data.data;
    },
  });
}

export function useEntity(entityId: string | null) {
  return useQuery({
    queryKey: ['knowledge', 'entity', entityId],
    queryFn: async () => {
      if (!entityId) return null;
      const response = await apiClient.get<EntityWithRelationships>(
        `/knowledge/entities/${entityId}`
      );
      return response.data;
    },
    enabled: !!entityId,
  });
}

export function useEntityGraph(entityId: string | null, depth: number = 1) {
  return useQuery({
    queryKey: ['knowledge', 'graph', entityId, depth],
    queryFn: async () => {
      if (!entityId) return null;
      const response = await apiClient.get<GraphResponse>(
        `/knowledge/graph/${entityId}?depth=${depth}`
      );
      return response.data;
    },
    enabled: !!entityId,
  });
}

export function useSearchEntities() {
  return useMutation({
    mutationFn: async (params: { query: string; entity_type?: string; limit?: number }) => {
      const response = await apiClient.post<Entity[]>('/knowledge/entities/search', params);
      return response.data;
    },
  });
}

export function useCreateEntity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      entity_type: string;
      description?: string;
      aliases?: string[];
      collection_id?: string;
      document_id?: string;
    }) => {
      const response = await apiClient.post<Entity>('/knowledge/entities', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'entities'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'stats'] });
    },
  });
}

export function useUpdateEntity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityId,
      data,
    }: {
      entityId: string;
      data: {
        name?: string;
        description?: string;
        aliases?: string[];
      };
    }) => {
      const response = await apiClient.patch<Entity>(`/knowledge/entities/${entityId}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'entities'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'entity', variables.entityId] });
    },
  });
}

export function useDeleteEntity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entityId: string) => {
      await apiClient.delete(`/knowledge/entities/${entityId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'entities'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'stats'] });
    },
  });
}

export function useMergeEntities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { source_id: string; target_id: string }) => {
      const response = await apiClient.post<Entity>('/knowledge/entities/merge', params);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

// ============================================================================
// RELATIONSHIP HOOKS
// ============================================================================

export interface ListRelationshipsParams {
  entity_id?: string;
  relationship_type?: string;
  limit?: number;
  offset?: number;
}

export function useRelationships(params: ListRelationshipsParams = {}) {
  return useQuery({
    queryKey: ['knowledge', 'relationships', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.entity_id) searchParams.set('entity_id', params.entity_id);
      if (params.relationship_type) searchParams.set('relationship_type', params.relationship_type);
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.offset) searchParams.set('offset', params.offset.toString());

      const response = await apiClient.get<{ data: Relationship[]; pagination: unknown }>(
        `/knowledge/relationships?${searchParams.toString()}`
      );
      // Backend returns paginated response, extract the data array
      return response.data.data;
    },
  });
}

export function useCreateRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      source_entity_id: string;
      target_entity_id: string;
      relationship_type: string;
      description?: string;
    }) => {
      const response = await apiClient.post<Relationship>('/knowledge/relationships', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

export function useDeleteRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (relationshipId: string) => {
      await apiClient.delete(`/knowledge/relationships/${relationshipId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

// ============================================================================
// STATS HOOKS
// ============================================================================

export function useKnowledgeStats() {
  return useQuery({
    queryKey: ['knowledge', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<KnowledgeStats>('/knowledge/stats');
      return response.data;
    },
  });
}

// ============================================================================
// EXTRACTION HOOKS
// ============================================================================

export interface ExtractionResponse {
  document_id: string;
  entities_extracted: number;
  relationships_extracted: number;
  message: string;
}

export function useExtractKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      // Use long-running timeout - knowledge extraction can take several minutes
      // especially with reasoning models that do extensive thinking
      const response = await apiClient.postLongRunning<ExtractionResponse>(
        `/knowledge/extract/${documentId}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}
