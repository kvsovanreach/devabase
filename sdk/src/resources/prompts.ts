import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface Prompt {
  id: string;
  name: string;
  content: string;
  description?: string;
  variables: string[];
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class PromptsResource {
  constructor(private http: HttpClient) {}

  /**
   * List all prompt templates
   * @example
   * const prompts = await client.prompts.list();
   */
  async list(options?: RequestOptions): Promise<Prompt[]> {
    return this.http.get<Prompt[]>('/v1/prompts', undefined, options);
  }

  /**
   * Get a prompt template by name
   * @example
   * const prompt = await client.prompts.get('rag_system_prompt');
   */
  async get(name: string, options?: RequestOptions): Promise<Prompt> {
    return this.http.get<Prompt>(`/v1/prompts/${name}`, undefined, options);
  }

  /**
   * Create a new prompt template
   * @example
   * const prompt = await client.prompts.create({
   *   name: 'customer_support',
   *   content: 'You are a customer support agent for {{company}}. Answer based on:\n\n{{context}}\n\nQuestion: {{question}}',
   *   description: 'Customer support RAG prompt'
   * });
   */
  async create(
    data: {
      name: string;
      content: string;
      description?: string;
    },
    options?: RequestOptions
  ): Promise<Prompt> {
    return this.http.post<Prompt>('/v1/prompts', data, options);
  }

  /**
   * Update a prompt template (creates a new version)
   * @example
   * const prompt = await client.prompts.update('customer_support', {
   *   content: 'Updated prompt content with {{variables}}...'
   * });
   */
  async update(
    name: string,
    data: { content?: string; description?: string },
    options?: RequestOptions
  ): Promise<Prompt> {
    return this.http.patch<Prompt>(`/v1/prompts/${name}`, data, options);
  }

  /**
   * Delete a prompt template and all versions
   * @example
   * await client.prompts.delete('customer_support');
   */
  async delete(name: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/prompts/${name}`, options);
  }

  /**
   * Render a prompt template with variables
   * @example
   * const result = await client.prompts.render('customer_support', {
   *   company: 'Acme Corp',
   *   context: 'Product documentation...',
   *   question: 'What is the return policy?'
   * });
   */
  async render(
    name: string,
    variables: Record<string, string>,
    options?: RequestOptions
  ): Promise<{
    rendered: string;
    variables_used: string[];
  }> {
    return this.http.post(`/v1/prompts/${name}/render`, { variables }, options);
  }
}
