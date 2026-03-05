import { HttpClient } from '../utils/http';
import {
  VectorMatch,
  HybridSearchResult,
  HybridSearchOptions,
  RequestOptions,
} from '../types';

export interface VectorUpsert {
  id?: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  chunk_id?: string;
}

export class VectorsResource {
  constructor(private http: HttpClient) {}

  /**
   * Upsert vectors into a collection
   * @example
   * await client.vectors.upsert('my-collection', [
   *   { embedding: [0.1, 0.2, ...], metadata: { source: 'doc1' } }
   * ]);
   */
  async upsert(
    collection: string,
    vectors: VectorUpsert[],
    options?: RequestOptions
  ): Promise<{ success: boolean; count: number }> {
    return this.http.post(
      `/v1/collections/${collection}/vectors`,
      { vectors },
      options
    );
  }

  /**
   * Search vectors by embedding
   * @example
   * const matches = await client.vectors.search('my-collection', {
   *   embedding: [0.1, 0.2, ...],
   *   top_k: 10
   * });
   */
  async search(
    collection: string,
    params: {
      embedding: number[];
      top_k?: number;
      include_metadata?: boolean;
      filter?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<VectorMatch[]> {
    return this.http.post<VectorMatch[]>(
      `/v1/collections/${collection}/vectors/search`,
      params,
      options
    );
  }

  /**
   * Hybrid search combining vector similarity and keyword (BM25) search
   * @example
   * const results = await client.vectors.hybridSearch('my-collection', {
   *   query: 'authentication tokens',
   *   vector_weight: 0.7,
   *   keyword_weight: 0.3
   * });
   */
  async hybridSearch(
    collection: string,
    params: Omit<HybridSearchOptions, 'collection'>,
    options?: RequestOptions
  ): Promise<HybridSearchResult[]> {
    return this.http.post<HybridSearchResult[]>(
      `/v1/collections/${collection}/vectors/hybrid-search`,
      params,
      options
    );
  }

  /**
   * Delete a vector from a collection
   * @example
   * await client.vectors.delete('my-collection', 'vector-id');
   */
  async delete(
    collection: string,
    vectorId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; count: number }> {
    return this.http.delete(`/v1/collections/${collection}/vectors/${vectorId}`, options);
  }
}
