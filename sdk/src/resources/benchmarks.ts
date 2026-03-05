import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface BenchmarkConfig {
  name: string;
  description?: string;
  search_method: 'vector' | 'keyword' | 'hybrid';
  top_k?: number;
  vector_weight?: number;
  keyword_weight?: number;
  rerank_enabled?: boolean;
  rerank_top_n?: number;
}

export interface DatasetSource {
  type: 'beir' | 'custom' | 'dataset' | 'synthetic';
  /** BEIR dataset name (for type: beir) */
  name?: string;
  /** Data directory (for type: beir) */
  data_dir?: string;
  /** Custom dataset path (for type: custom) */
  path?: string;
  /** Devabase dataset ID (for type: dataset) */
  dataset_id?: string;
  /** Number of queries (for type: synthetic) */
  num_queries?: number;
  /** Number of documents (for type: synthetic) */
  num_docs?: number;
}

export interface RunBenchmarkInput {
  collection: string;
  dataset_source: DatasetSource;
  configs?: 'standard' | 'chunk_size' | 'top_k' | { custom: { configs: BenchmarkConfig[] } };
  output_dir?: string;
}

export interface BenchmarkRunResponse {
  id: string;
  suite_name: string;
  dataset_name: string;
  best_config: string;
  results_summary: Array<{
    config_name: string;
    ndcg: number;
    mrr: number;
    precision: number;
    recall: number;
    latency_ms: number;
  }>;
  reports_path: string | null;
}

export interface BenchmarkListItem {
  id: string;
  suite_name: string;
  dataset_name: string;
  best_config: string;
  num_configs: number;
  created_at: string;
}

export interface BeirDatasetInfo {
  name: string;
  description: string;
  downloaded: boolean;
}

export interface PresetConfig {
  name: string;
  configs: BenchmarkConfig[];
}

export interface CompareRequest {
  benchmark_ids: string[];
}

export class BenchmarksResource {
  constructor(private http: HttpClient) {}

  /**
   * Run a benchmark evaluation
   * @example
   * const result = await client.benchmarks.run({
   *   collection: 'my-docs',
   *   dataset_source: { type: 'beir', name: 'scifact' },
   *   configs: 'standard'
   * });
   */
  async run(
    input: RunBenchmarkInput,
    options?: RequestOptions
  ): Promise<BenchmarkRunResponse> {
    return this.http.post<BenchmarkRunResponse>(
      '/v1/benchmarks/run',
      input,
      { ...options, timeout: 600000 } // 10 minute timeout
    );
  }

  /**
   * List all benchmark runs
   * @example
   * const benchmarks = await client.benchmarks.list();
   */
  async list(
    query?: { limit?: number; offset?: number },
    options?: RequestOptions
  ): Promise<BenchmarkListItem[]> {
    return this.http.get<BenchmarkListItem[]>('/v1/benchmarks', query, options);
  }

  /**
   * Get a benchmark run by ID
   * @example
   * const benchmark = await client.benchmarks.get('benchmark-id');
   */
  async get(benchmarkId: string, options?: RequestOptions): Promise<BenchmarkRunResponse> {
    return this.http.get<BenchmarkRunResponse>(`/v1/benchmarks/${benchmarkId}`, undefined, options);
  }

  /**
   * Delete a benchmark run
   * @example
   * await client.benchmarks.delete('benchmark-id');
   */
  async delete(benchmarkId: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/benchmarks/${benchmarkId}`, options);
  }

  /**
   * Export benchmark results
   * @example
   * const exported = await client.benchmarks.export('benchmark-id');
   */
  async export(benchmarkId: string, options?: RequestOptions): Promise<{ format: string; content: string }> {
    return this.http.get(`/v1/benchmarks/${benchmarkId}/export`, undefined, options);
  }

  /**
   * Compare multiple benchmark runs
   * @example
   * const comparison = await client.benchmarks.compare(['bench-1', 'bench-2']);
   */
  async compare(benchmarkIds: string[], options?: RequestOptions): Promise<unknown> {
    return this.http.post('/v1/benchmarks/compare', { benchmark_ids: benchmarkIds }, options);
  }

  /**
   * List available benchmark datasets
   * @example
   * const datasets = await client.benchmarks.listDatasets();
   */
  async listDatasets(options?: RequestOptions): Promise<{ beir_datasets: BeirDatasetInfo[] }> {
    return this.http.get('/v1/benchmarks/datasets', undefined, options);
  }

  /**
   * Download a benchmark dataset
   * @example
   * await client.benchmarks.downloadDataset({ dataset_type: 'beir', name: 'scifact' });
   */
  async downloadDataset(
    input: { dataset_type: string; name: string; data_dir?: string },
    options?: RequestOptions
  ): Promise<unknown> {
    return this.http.post('/v1/benchmarks/datasets/download', input, { ...options, timeout: 300000 });
  }

  /**
   * Get preset evaluation configurations
   * @example
   * const configs = await client.benchmarks.getPresetConfigs();
   */
  async getPresetConfigs(options?: RequestOptions): Promise<PresetConfig[]> {
    return this.http.get<PresetConfig[]>('/v1/benchmarks/configs', undefined, options);
  }
}
