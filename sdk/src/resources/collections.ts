import { HttpClient } from '../utils/http';
import {
  Collection,
  CreateCollectionInput,
  CollectionStats,
  PaginatedResponse,
  QueryOptions,
  RequestOptions,
} from '../types';

export class CollectionsResource {
  constructor(private http: HttpClient) {}

  /**
   * List collections with pagination
   * @example
   * const result = await client.collections.list({ limit: 10, page: 1 });
   * console.log(result.data); // Array of collections
   * console.log(result.pagination.total); // Total count
   */
  async list(query?: QueryOptions, options?: RequestOptions): Promise<PaginatedResponse<Collection>> {
    return this.http.get<PaginatedResponse<Collection>>('/v1/collections', query, options);
  }

  /**
   * Get a collection by name
   * @example
   * const collection = await client.collections.get('my-collection');
   */
  async get(name: string, options?: RequestOptions): Promise<Collection> {
    return this.http.get<Collection>(`/v1/collections/${name}`, undefined, options);
  }

  /**
   * Create a new collection
   * @example
   * const collection = await client.collections.create({
   *   name: 'my-collection',
   *   description: 'My document collection',
   *   dimensions: 1536,
   *   metric: 'cosine'
   * });
   */
  async create(input: CreateCollectionInput, options?: RequestOptions): Promise<Collection> {
    return this.http.post<Collection>('/v1/collections', input, options);
  }

  /**
   * Update a collection
   * @example
   * const collection = await client.collections.update('my-collection', {
   *   description: 'Updated description'
   * });
   */
  async update(
    name: string,
    input: { description?: string },
    options?: RequestOptions
  ): Promise<Collection> {
    return this.http.patch<Collection>(`/v1/collections/${name}`, input, options);
  }

  /**
   * Delete a collection
   * @example
   * await client.collections.delete('my-collection');
   */
  async delete(name: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/collections/${name}`, options);
  }

  /**
   * Get collection statistics
   * @example
   * const stats = await client.collections.stats('my-collection');
   * console.log(`${stats.document_count} documents, ${stats.vector_count} vectors`);
   */
  async stats(name: string, options?: RequestOptions): Promise<CollectionStats> {
    return this.http.get<CollectionStats>(`/v1/collections/${name}/stats`, undefined, options);
  }

  /**
   * Update collection RAG configuration
   * @example
   * const collection = await client.collections.updateRagConfig('my-collection', {
   *   llm_provider_id: 'openai-1',
   *   model: 'gpt-4o-mini',
   *   system_prompt: 'You are a helpful assistant.',
   *   temperature: 0.7,
   *   max_tokens: 1000,
   *   top_k: 5
   * });
   */
  async updateRagConfig(
    name: string,
    config: {
      llm_provider_id: string;
      model: string;
      system_prompt: string;
      temperature?: number;
      max_tokens?: number;
      top_k?: number;
    },
    options?: RequestOptions
  ): Promise<Collection> {
    return this.http.patch<Collection>(`/v1/collections/${name}/config`, config, options);
  }
}
