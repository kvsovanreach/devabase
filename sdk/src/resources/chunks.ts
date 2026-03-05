import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface Chunk {
  id: string;
  document_id: string;
  collection_id: string;
  content: string;
  chunk_index: number;
  token_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export class ChunksResource {
  constructor(private http: HttpClient) {}

  /**
   * Get a chunk by ID
   * @example
   * const chunk = await client.chunks.get('chunk-id');
   */
  async get(chunkId: string, options?: RequestOptions): Promise<Chunk> {
    return this.http.get<Chunk>(`/v1/chunks/${chunkId}`, undefined, options);
  }

  /**
   * Update a chunk's content or metadata
   * Embeddings are automatically regenerated.
   * @example
   * const chunk = await client.chunks.update('chunk-id', {
   *   content: 'Updated content...',
   *   metadata: { reviewed: true }
   * });
   */
  async update(
    chunkId: string,
    data: { content?: string; metadata?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<Chunk> {
    return this.http.patch<Chunk>(`/v1/chunks/${chunkId}`, data, options);
  }

  /**
   * Delete a chunk and its vector embedding
   * @example
   * await client.chunks.delete('chunk-id');
   */
  async delete(chunkId: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/chunks/${chunkId}`, options);
  }

  /**
   * Split a chunk into multiple smaller chunks
   * @example
   * const result = await client.chunks.split('chunk-id', [100, 250]);
   */
  async split(
    chunkId: string,
    splitPositions: number[],
    options?: RequestOptions
  ): Promise<{
    original_chunk_id: string;
    new_chunks: Chunk[];
  }> {
    return this.http.post(
      `/v1/chunks/${chunkId}/split`,
      { split_positions: splitPositions },
      options
    );
  }

  /**
   * Merge multiple consecutive chunks into one
   * @example
   * const result = await client.chunks.merge(['chunk-1', 'chunk-2', 'chunk-3']);
   */
  async merge(
    chunkIds: string[],
    options?: RequestOptions
  ): Promise<{
    merged_chunk: Chunk;
  }> {
    return this.http.post('/v1/chunks/merge', { chunk_ids: chunkIds }, options);
  }
}
