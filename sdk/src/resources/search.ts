import { HttpClient } from '../utils/http';
import {
  SearchResult,
  SearchOptions,
  HybridSearchOptions,
  RequestOptions,
} from '../types';

export class SearchResource {
  constructor(private http: HttpClient) {}

  /**
   * Perform vector similarity search
   * @example
   * const results = await client.search.query({
   *   collection: 'my-collection',
   *   query: 'How to implement authentication?',
   *   top_k: 10
   * });
   */
  async query(
    options: SearchOptions,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    const response = await this.http.post<{ results: SearchResult[] }>(
      `/v1/collections/${options.collection}/search`,
      {
        query: options.query,
        top_k: options.top_k ?? 10,
        filter: options.filter,
        rerank: options.rerank,
        include_content: options.include_content ?? true,
      },
      requestOptions
    );
    return response.results;
  }

  /**
   * Perform hybrid search (vector + keyword)
   * @example
   * const results = await client.search.hybrid({
   *   collection: 'my-collection',
   *   query: 'authentication JWT tokens',
   *   vector_weight: 0.7,
   *   keyword_weight: 0.3
   * });
   */
  async hybrid(
    options: HybridSearchOptions,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    const response = await this.http.post<{ results: SearchResult[] }>(
      `/v1/collections/${options.collection}/search`,
      {
        query: options.query,
        top_k: options.top_k ?? 10,
        filter: options.filter,
        rerank: options.rerank,
        include_content: options.include_content ?? true,
        search_type: 'hybrid',
        vector_weight: options.vector_weight ?? 0.7,
        keyword_weight: options.keyword_weight ?? 0.3,
      },
      requestOptions
    );
    return response.results;
  }

  /**
   * Perform keyword-only search (BM25)
   * @example
   * const results = await client.search.keyword({
   *   collection: 'my-collection',
   *   query: 'authentication',
   *   top_k: 10
   * });
   */
  async keyword(
    options: SearchOptions,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    const response = await this.http.post<{ results: SearchResult[] }>(
      `/v1/collections/${options.collection}/search`,
      {
        query: options.query,
        top_k: options.top_k ?? 10,
        filter: options.filter,
        include_content: options.include_content ?? true,
        search_type: 'keyword',
      },
      requestOptions
    );
    return response.results;
  }

  /**
   * Search across all collections
   * @example
   * const results = await client.search.global('authentication', { top_k: 20 });
   */
  async global(
    query: string,
    options?: Omit<SearchOptions, 'collection' | 'query'>,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    const response = await this.http.post<{ results: SearchResult[] }>(
      '/v1/search',
      {
        query,
        top_k: options?.top_k ?? 10,
        filter: options?.filter,
        rerank: options?.rerank,
        include_content: options?.include_content ?? true,
      },
      requestOptions
    );
    return response.results;
  }

  /**
   * Get similar chunks to a given chunk
   * @example
   * const similar = await client.search.similar('chunk-id', 'my-collection', 5);
   */
  async similar(
    chunkId: string,
    collection: string,
    topK: number = 5,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    const response = await this.http.get<{ results: SearchResult[] }>(
      `/v1/collections/${collection}/chunks/${chunkId}/similar`,
      { top_k: topK },
      requestOptions
    );
    return response.results;
  }

  /**
   * Create embeddings for text
   * @example
   * const embeddings = await client.search.embed(['Hello, World!', 'How are you?']);
   */
  async embed(texts: string[], requestOptions?: RequestOptions): Promise<number[][]> {
    const response = await this.http.post<{ embeddings: number[][] }>(
      '/v1/embeddings',
      { texts },
      requestOptions
    );
    return response.embeddings;
  }

  /**
   * Search by vector directly
   * @example
   * const embedding = await client.search.embed(['my query']);
   * const results = await client.search.byVector('my-collection', embedding[0]);
   */
  async byVector(
    collection: string,
    vector: number[],
    options?: { top_k?: number; filter?: Record<string, unknown> },
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    const response = await this.http.post<{ results: SearchResult[] }>(
      `/v1/collections/${collection}/search`,
      {
        vector,
        top_k: options?.top_k ?? 10,
        filter: options?.filter,
      },
      requestOptions
    );
    return response.results;
  }
}
