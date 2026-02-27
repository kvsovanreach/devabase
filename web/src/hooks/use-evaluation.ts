'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  EvaluationDatasetWithStats,
  EvaluationDatasetDetail,
  EvaluationRun,
  CreateDatasetRequest,
  CreateCaseRequest,
  RunEvaluationRequest,
  RunResult,
  EvaluationCase,
} from '@/types';

// List all datasets
export function useEvaluationDatasets() {
  return useQuery({
    queryKey: ['evaluation-datasets'],
    queryFn: async () => {
      const response = await api.get<EvaluationDatasetWithStats[]>('/evaluation/datasets');
      return response.data;
    },
  });
}

// Get dataset with cases
export function useEvaluationDataset(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['evaluation-dataset', datasetId],
    queryFn: async () => {
      if (!datasetId) throw new Error('Dataset ID required');
      const response = await api.get<EvaluationDatasetDetail>(`/evaluation/datasets/${datasetId}`);
      return response.data;
    },
    enabled: !!datasetId,
  });
}

// Create dataset
export function useCreateDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDatasetRequest) => {
      const response = await api.post<EvaluationDatasetWithStats>('/evaluation/datasets', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-datasets'] });
    },
  });
}

// Update dataset
export function useUpdateDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; description?: string } }) => {
      const response = await api.patch<EvaluationDatasetWithStats>(`/evaluation/datasets/${id}`, data);
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-datasets'] });
      queryClient.invalidateQueries({ queryKey: ['evaluation-dataset', id] });
    },
  });
}

// Delete dataset
export function useDeleteDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (datasetId: string) => {
      await api.delete(`/evaluation/datasets/${datasetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-datasets'] });
    },
  });
}

// Create test case
export function useCreateCase(datasetId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCaseRequest) => {
      const response = await api.post<EvaluationCase>(`/evaluation/datasets/${datasetId}/cases`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-dataset', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['evaluation-datasets'] });
    },
  });
}

// Update test case
export function useUpdateCase(datasetId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ caseId, data }: { caseId: string; data: Partial<CreateCaseRequest> }) => {
      const response = await api.patch<EvaluationCase>(`/evaluation/cases/${caseId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-dataset', datasetId] });
    },
  });
}

// Delete test case
export function useDeleteCase(datasetId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (caseId: string) => {
      await api.delete(`/evaluation/cases/${caseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-dataset', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['evaluation-datasets'] });
    },
  });
}

// Run evaluation
export function useRunEvaluation(datasetId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RunEvaluationRequest) => {
      const response = await api.post<RunResult>(`/evaluation/datasets/${datasetId}/run`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-runs', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['evaluation-datasets'] });
    },
  });
}

// List runs for a dataset
export function useEvaluationRuns(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['evaluation-runs', datasetId],
    queryFn: async () => {
      if (!datasetId) throw new Error('Dataset ID required');
      const response = await api.get<EvaluationRun[]>(`/evaluation/datasets/${datasetId}/runs`);
      return response.data;
    },
    enabled: !!datasetId,
  });
}

// Get run details
export function useEvaluationRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['evaluation-run', runId],
    queryFn: async () => {
      if (!runId) throw new Error('Run ID required');
      const response = await api.get<EvaluationRun>(`/evaluation/runs/${runId}`);
      return response.data;
    },
    enabled: !!runId,
  });
}
