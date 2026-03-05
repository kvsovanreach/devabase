import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface EvaluationDataset {
  id: string;
  name: string;
  description?: string;
  collection_id: string;
  collection_name?: string;
  case_count: number;
  run_count: number;
  last_run?: string;
  created_at: string;
  updated_at: string;
}

export interface EvaluationCase {
  id: string;
  dataset_id: string;
  query: string;
  expected_chunk_ids: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface EvaluationRun {
  id: string;
  dataset_id: string;
  search_mode: string;
  top_k: number;
  vector_weight?: number;
  keyword_weight?: number;
  metrics: EvaluationMetrics;
  created_at: string;
}

export interface EvaluationMetrics {
  precision_at_k: number;
  recall_at_k: number;
  mrr: number;
  ndcg: number;
  cases_evaluated: number;
  k: number;
}

export class EvaluationResource {
  constructor(private http: HttpClient) {}

  // =========================================================================
  // Datasets
  // =========================================================================

  /**
   * List evaluation datasets
   * @example
   * const datasets = await client.evaluation.listDatasets();
   */
  async listDatasets(options?: RequestOptions): Promise<EvaluationDataset[]> {
    return this.http.get<EvaluationDataset[]>('/v1/evaluation/datasets', undefined, options);
  }

  /**
   * Create an evaluation dataset
   * @example
   * const dataset = await client.evaluation.createDataset({
   *   collection_name: 'my-docs',
   *   name: 'Quality Evaluation',
   *   description: 'Test queries for documentation'
   * });
   */
  async createDataset(
    data: {
      collection_name: string;
      name: string;
      description?: string;
    },
    options?: RequestOptions
  ): Promise<EvaluationDataset> {
    return this.http.post<EvaluationDataset>('/v1/evaluation/datasets', data, options);
  }

  /**
   * Get a dataset with all test cases
   * @example
   * const dataset = await client.evaluation.getDataset('dataset-id');
   */
  async getDataset(datasetId: string, options?: RequestOptions): Promise<EvaluationDataset & { cases: EvaluationCase[] }> {
    return this.http.get(`/v1/evaluation/datasets/${datasetId}`, undefined, options);
  }

  /**
   * Update a dataset
   * @example
   * const dataset = await client.evaluation.updateDataset('dataset-id', {
   *   name: 'Updated Name'
   * });
   */
  async updateDataset(
    datasetId: string,
    data: { name?: string; description?: string },
    options?: RequestOptions
  ): Promise<EvaluationDataset> {
    return this.http.patch<EvaluationDataset>(`/v1/evaluation/datasets/${datasetId}`, data, options);
  }

  /**
   * Delete a dataset and all its test cases
   * @example
   * await client.evaluation.deleteDataset('dataset-id');
   */
  async deleteDataset(datasetId: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/evaluation/datasets/${datasetId}`, options);
  }

  // =========================================================================
  // Test Cases
  // =========================================================================

  /**
   * Add a test case to a dataset
   * @example
   * const testCase = await client.evaluation.addCase('dataset-id', {
   *   query: 'How do I reset my password?',
   *   expected_chunk_ids: ['chunk-1', 'chunk-2']
   * });
   */
  async addCase(
    datasetId: string,
    data: {
      query: string;
      expected_chunk_ids: string[];
      metadata?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<EvaluationCase> {
    return this.http.post<EvaluationCase>(`/v1/evaluation/datasets/${datasetId}/cases`, data, options);
  }

  /**
   * Update a test case
   * @example
   * const testCase = await client.evaluation.updateCase('case-id', {
   *   query: 'Updated query?',
   *   expected_chunk_ids: ['chunk-1', 'chunk-2', 'chunk-3']
   * });
   */
  async updateCase(
    caseId: string,
    data: {
      query?: string;
      expected_chunk_ids?: string[];
      metadata?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<EvaluationCase> {
    return this.http.patch<EvaluationCase>(`/v1/evaluation/cases/${caseId}`, data, options);
  }

  /**
   * Delete a test case
   * @example
   * await client.evaluation.deleteCase('case-id');
   */
  async deleteCase(caseId: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/evaluation/cases/${caseId}`, options);
  }

  // =========================================================================
  // Runs
  // =========================================================================

  /**
   * Run evaluation on a dataset
   * @example
   * const result = await client.evaluation.run('dataset-id', {
   *   search_mode: 'hybrid',
   *   top_k: 5,
   *   vector_weight: 0.7,
   *   keyword_weight: 0.3
   * });
   */
  async run(
    datasetId: string,
    config: {
      search_mode?: 'vector' | 'keyword' | 'hybrid';
      top_k?: number;
      vector_weight?: number;
      keyword_weight?: number;
    },
    options?: RequestOptions
  ): Promise<{
    run: EvaluationRun;
    metrics: EvaluationMetrics;
  }> {
    return this.http.post(
      `/v1/evaluation/datasets/${datasetId}/run`,
      config,
      { ...options, timeout: 300000 } // 5 minute timeout
    );
  }

  /**
   * List runs for a dataset
   * @example
   * const runs = await client.evaluation.listRuns('dataset-id');
   */
  async listRuns(datasetId: string, options?: RequestOptions): Promise<EvaluationRun[]> {
    return this.http.get<EvaluationRun[]>(`/v1/evaluation/datasets/${datasetId}/runs`, undefined, options);
  }

  /**
   * Get detailed results for a run
   * @example
   * const run = await client.evaluation.getRun('run-id');
   */
  async getRun(runId: string, options?: RequestOptions): Promise<EvaluationRun> {
    return this.http.get<EvaluationRun>(`/v1/evaluation/runs/${runId}`, undefined, options);
  }
}
