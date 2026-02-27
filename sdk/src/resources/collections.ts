import { HttpClient } from '../utils/http';
import {
  Collection,
  CreateCollectionInput,
  CollectionStats,
  RequestOptions,
} from '../types';

export class CollectionsResource {
  constructor(private http: HttpClient) {}

  /**
   * List all collections
   * @example
   * const collections = await client.collections.list();
   */
  async list(options?: RequestOptions): Promise<Collection[]> {
    return this.http.get<Collection[]>('/v1/collections', undefined, options);
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
   * console.log(`${stats.document_count} documents, ${stats.chunk_count} chunks`);
   */
  async stats(name: string, options?: RequestOptions): Promise<CollectionStats> {
    return this.http.get<CollectionStats>(`/v1/collections/${name}/stats`, undefined, options);
  }

  /**
   * Clear all documents from a collection
   * @example
   * await client.collections.clear('my-collection');
   */
  async clear(name: string, options?: RequestOptions): Promise<void> {
    await this.http.post<void>(`/v1/collections/${name}/clear`, undefined, options);
  }
}
