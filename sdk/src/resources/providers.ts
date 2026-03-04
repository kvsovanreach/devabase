import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

// ============================================================================
// Provider Types
// ============================================================================

export type LLMProviderType = 'openai' | 'anthropic' | 'google' | 'custom';
export type EmbeddingProviderType = 'openai' | 'cohere' | 'voyage' | 'custom';
export type RerankProviderType = 'cohere' | 'jina' | 'custom';

export interface LLMProvider {
  id: string;
  type: LLMProviderType;
  name?: string;
  api_key: string;
  base_url?: string;
  model: string;
}

export interface EmbeddingProvider {
  id: string;
  type: EmbeddingProviderType;
  name?: string;
  api_key: string;
  base_url?: string;
  model: string;
  dimensions?: number;
}

export interface RerankProvider {
  id: string;
  type: RerankProviderType;
  name?: string;
  api_key: string;
  base_url?: string;
  model: string;
}

export interface CreateLLMProviderInput {
  id: string;
  type: LLMProviderType;
  name?: string;
  api_key: string;
  base_url?: string;
  model: string;
}

export interface CreateEmbeddingProviderInput {
  id: string;
  type: EmbeddingProviderType;
  name?: string;
  api_key: string;
  base_url?: string;
  model: string;
  dimensions?: number;
}

export interface CreateRerankProviderInput {
  id: string;
  type: RerankProviderType;
  name?: string;
  api_key: string;
  base_url?: string;
  model: string;
}

export interface TestProviderResponse {
  success: boolean;
  message: string;
  response?: string;
}

export interface ProjectSettings {
  llm_providers?: LLMProvider[];
  embedding_providers?: EmbeddingProvider[];
  rerank_providers?: RerankProvider[];
  [key: string]: unknown;
}

// ============================================================================
// Providers Resource
// ============================================================================

/**
 * Manage LLM, embedding, and rerank providers for a project.
 * Providers are stored in project settings and used for RAG operations.
 */
export class ProvidersResource {
  constructor(private http: HttpClient) {}

  // =========================================================================
  // LLM Providers
  // =========================================================================

  readonly llm = {
    /**
     * List all LLM providers configured for the current project
     */
    list: async (options?: RequestOptions): Promise<LLMProvider[]> => {
      const settings = await this.getProjectSettings(options);
      return settings.llm_providers || [];
    },

    /**
     * Get an LLM provider by ID
     */
    get: async (providerId: string, options?: RequestOptions): Promise<LLMProvider | undefined> => {
      const providers = await this.llm.list(options);
      return providers.find(p => p.id === providerId);
    },

    /**
     * Add or update an LLM provider
     * @example
     * await client.providers.llm.upsert({
     *   id: 'my-openai',
     *   type: 'openai',
     *   api_key: 'sk-...',
     *   model: 'gpt-4o-mini'
     * });
     */
    upsert: async (provider: CreateLLMProviderInput, options?: RequestOptions): Promise<LLMProvider[]> => {
      const settings = await this.getProjectSettings(options);
      const providers = settings.llm_providers || [];

      const existingIndex = providers.findIndex(p => p.id === provider.id);
      if (existingIndex >= 0) {
        providers[existingIndex] = provider;
      } else {
        providers.push(provider);
      }

      await this.updateProjectSettings({ ...settings, llm_providers: providers }, options);
      return providers;
    },

    /**
     * Remove an LLM provider
     */
    delete: async (providerId: string, options?: RequestOptions): Promise<void> => {
      const settings = await this.getProjectSettings(options);
      const providers = (settings.llm_providers || []).filter(p => p.id !== providerId);
      await this.updateProjectSettings({ ...settings, llm_providers: providers }, options);
    },

    /**
     * Test an LLM provider connection
     */
    test: async (
      input: { type: LLMProviderType; api_key: string; base_url?: string; model: string },
      options?: RequestOptions
    ): Promise<TestProviderResponse> => {
      return this.http.post<TestProviderResponse>(
        '/v1/providers/test-llm',
        { provider_type: input.type, ...input },
        options
      );
    },
  };

  // =========================================================================
  // Embedding Providers
  // =========================================================================

  readonly embedding = {
    /**
     * List all embedding providers configured for the current project
     */
    list: async (options?: RequestOptions): Promise<EmbeddingProvider[]> => {
      const settings = await this.getProjectSettings(options);
      return settings.embedding_providers || [];
    },

    /**
     * Get an embedding provider by ID
     */
    get: async (providerId: string, options?: RequestOptions): Promise<EmbeddingProvider | undefined> => {
      const providers = await this.embedding.list(options);
      return providers.find(p => p.id === providerId);
    },

    /**
     * Add or update an embedding provider
     * @example
     * await client.providers.embedding.upsert({
     *   id: 'my-openai-embed',
     *   type: 'openai',
     *   api_key: 'sk-...',
     *   model: 'text-embedding-3-small',
     *   dimensions: 1536
     * });
     */
    upsert: async (provider: CreateEmbeddingProviderInput, options?: RequestOptions): Promise<EmbeddingProvider[]> => {
      const settings = await this.getProjectSettings(options);
      const providers = settings.embedding_providers || [];

      const existingIndex = providers.findIndex(p => p.id === provider.id);
      if (existingIndex >= 0) {
        providers[existingIndex] = provider;
      } else {
        providers.push(provider);
      }

      await this.updateProjectSettings({ ...settings, embedding_providers: providers }, options);
      return providers;
    },

    /**
     * Remove an embedding provider
     */
    delete: async (providerId: string, options?: RequestOptions): Promise<void> => {
      const settings = await this.getProjectSettings(options);
      const providers = (settings.embedding_providers || []).filter(p => p.id !== providerId);
      await this.updateProjectSettings({ ...settings, embedding_providers: providers }, options);
    },

    /**
     * Test an embedding provider connection
     */
    test: async (
      input: { type: EmbeddingProviderType; api_key: string; base_url?: string; model: string },
      options?: RequestOptions
    ): Promise<TestProviderResponse> => {
      return this.http.post<TestProviderResponse>(
        '/v1/providers/test-embedding',
        { provider_type: input.type, ...input },
        options
      );
    },
  };

  // =========================================================================
  // Rerank Providers
  // =========================================================================

  readonly rerank = {
    /**
     * List all rerank providers configured for the current project
     */
    list: async (options?: RequestOptions): Promise<RerankProvider[]> => {
      const settings = await this.getProjectSettings(options);
      return settings.rerank_providers || [];
    },

    /**
     * Get a rerank provider by ID
     */
    get: async (providerId: string, options?: RequestOptions): Promise<RerankProvider | undefined> => {
      const providers = await this.rerank.list(options);
      return providers.find(p => p.id === providerId);
    },

    /**
     * Add or update a rerank provider
     */
    upsert: async (provider: CreateRerankProviderInput, options?: RequestOptions): Promise<RerankProvider[]> => {
      const settings = await this.getProjectSettings(options);
      const providers = settings.rerank_providers || [];

      const existingIndex = providers.findIndex(p => p.id === provider.id);
      if (existingIndex >= 0) {
        providers[existingIndex] = provider;
      } else {
        providers.push(provider);
      }

      await this.updateProjectSettings({ ...settings, rerank_providers: providers }, options);
      return providers;
    },

    /**
     * Remove a rerank provider
     */
    delete: async (providerId: string, options?: RequestOptions): Promise<void> => {
      const settings = await this.getProjectSettings(options);
      const providers = (settings.rerank_providers || []).filter(p => p.id !== providerId);
      await this.updateProjectSettings({ ...settings, rerank_providers: providers }, options);
    },

    /**
     * Test a rerank provider connection
     */
    test: async (
      input: { type: RerankProviderType; api_key: string; base_url?: string; model: string },
      options?: RequestOptions
    ): Promise<TestProviderResponse> => {
      return this.http.post<TestProviderResponse>(
        '/v1/providers/test-rerank',
        { provider_type: input.type, ...input },
        options
      );
    },
  };

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private async getProjectSettings(options?: RequestOptions): Promise<ProjectSettings> {
    const projectId = this.http.getProjectId();
    if (!projectId) {
      throw new Error('No project selected. Use client.useProject(id) first.');
    }
    const project = await this.http.get<{ settings: ProjectSettings }>(`/v1/projects/${projectId}`, undefined, options);
    return project.settings || {};
  }

  private async updateProjectSettings(settings: ProjectSettings, options?: RequestOptions): Promise<void> {
    const projectId = this.http.getProjectId();
    if (!projectId) {
      throw new Error('No project selected. Use client.useProject(id) first.');
    }
    await this.http.patch(`/v1/projects/${projectId}`, { settings }, options);
  }
}
