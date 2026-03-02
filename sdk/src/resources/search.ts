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
   * Perform vector similarity search with optional strategy
   * @example
   * const results = await client.search.query({
   *   collection: 'my-collection',
   *   query: 'How to implement authentication?',
   *   top_k: 10
   * });
   *
   * // With advanced strategy
   * const results = await client.search.query({
   *   collection: 'my-collection',
   *   query: 'How to implement OAuth?',
   *   strategy: 'hyde',
   *   rerank: true
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
        strategy: options.strategy,
        strategy_options: options.strategy_options,
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

  // ============================================================================
  // Advanced Retrieval Strategy Convenience Methods
  // ============================================================================

  /**
   * HyDE (Hypothetical Document Embeddings) search
   *
   * Instead of embedding the query directly, this:
   * 1. Uses an LLM to generate a hypothetical answer
   * 2. Embeds that hypothetical answer
   * 3. Searches using that embedding
   *
   * Often retrieves more relevant results because the hypothetical answer
   * is semantically similar to actual documents.
   *
   * @example
   * const results = await client.search.hyde({
   *   collection: 'docs',
   *   query: 'What causes memory leaks in JavaScript?',
   *   strategy_options: { hyde_num_hypotheticals: 2 }
   * });
   */
  async hyde(
    options: Omit<SearchOptions, 'strategy'>,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    return this.query({ ...options, strategy: 'hyde' }, requestOptions);
  }

  /**
   * Multi-Query search
   *
   * Expands the query into multiple variations, then:
   * 1. Generates N alternative phrasings of the query
   * 2. Searches with each variation
   * 3. Merges and deduplicates results
   *
   * Improves recall by capturing different aspects and phrasings.
   *
   * @example
   * const results = await client.search.multiQuery({
   *   collection: 'docs',
   *   query: 'auth best practices',
   *   rerank: true,
   *   strategy_options: { num_query_variations: 4 }
   * });
   */
  async multiQuery(
    options: Omit<SearchOptions, 'strategy'>,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    return this.query({ ...options, strategy: 'multi_query' }, requestOptions);
  }

  /**
   * Self-Query search
   *
   * Extracts structured filters from natural language:
   * 1. Parses the query to extract metadata filters
   * 2. Separates semantic search query from filter criteria
   * 3. Applies extracted filters to the vector search
   *
   * @example
   * const results = await client.search.selfQuery({
   *   collection: 'docs',
   *   query: 'Python docs from 2023',
   *   strategy_options: {
   *     extractable_fields: [
   *       { name: 'language', description: 'Programming language', type: 'string' },
   *       { name: 'year', description: 'Publication year', type: 'number' }
   *     ]
   *   }
   * });
   */
  async selfQuery(
    options: Omit<SearchOptions, 'strategy'>,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    return this.query({ ...options, strategy: 'self_query' }, requestOptions);
  }

  /**
   * Parent-Child search
   *
   * Retrieves small chunks for precision, returns larger parent context:
   * 1. Searches against child chunks (precise embeddings)
   * 2. Fetches parent chunks for matches
   * 3. Returns parent chunks with larger context
   *
   * Requires hierarchical chunking to be enabled on the collection.
   *
   * @example
   * const results = await client.search.parentChild({
   *   collection: 'docs',
   *   query: 'error handling patterns',
   *   strategy_options: { parent_depth: 1 }
   * });
   */
  async parentChild(
    options: Omit<SearchOptions, 'strategy'>,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    return this.query({ ...options, strategy: 'parent_child' }, requestOptions);
  }

  /**
   * Compressed search
   *
   * Compresses retrieved chunks to only relevant portions:
   * 1. Performs standard retrieval
   * 2. Uses LLM to extract relevant parts for the query
   * 3. Filters out non-relevant chunks
   *
   * Useful for reducing context size while preserving relevance.
   *
   * @example
   * const results = await client.search.compressed({
   *   collection: 'docs',
   *   query: 'How to reset password?',
   *   strategy_options: { max_compressed_length: 300 }
   * });
   */
  async compressed(
    options: Omit<SearchOptions, 'strategy'>,
    requestOptions?: RequestOptions
  ): Promise<SearchResult[]> {
    return this.query({ ...options, strategy: 'compression' }, requestOptions);
  }
}
