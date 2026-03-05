import { HttpClient } from '../utils/http';
import {
  Webhook,
  WebhookLog,
  CreateWebhookInput,
  UpdateWebhookInput,
  TestWebhookResponse,
  PaginatedResponse,
  QueryOptions,
  RequestOptions,
} from '../types';

export class WebhooksResource {
  constructor(private http: HttpClient) {}

  /**
   * List all webhooks with pagination
   * @example
   * const result = await client.webhooks.list();
   * console.log(result.data); // Array of webhooks
   */
  async list(query?: QueryOptions, options?: RequestOptions): Promise<PaginatedResponse<Webhook>> {
    return this.http.get<PaginatedResponse<Webhook>>('/v1/webhooks', query, options);
  }

  /**
   * Get a webhook by ID
   * @example
   * const webhook = await client.webhooks.get('webhook-id');
   */
  async get(webhookId: string, options?: RequestOptions): Promise<Webhook> {
    return this.http.get<Webhook>(`/v1/webhooks/${webhookId}`, undefined, options);
  }

  /**
   * Create a new webhook
   * @example
   * const webhook = await client.webhooks.create({
   *   name: 'Document Events',
   *   url: 'https://api.example.com/webhooks/devabase',
   *   events: ['document.processed', 'document.failed']
   * });
   */
  async create(
    data: CreateWebhookInput,
    options?: RequestOptions
  ): Promise<Webhook> {
    return this.http.post<Webhook>('/v1/webhooks', data, options);
  }

  /**
   * Update a webhook
   * @example
   * const webhook = await client.webhooks.update('webhook-id', {
   *   events: ['document.processed'],
   *   status: 'paused'
   * });
   */
  async update(
    webhookId: string,
    data: UpdateWebhookInput,
    options?: RequestOptions
  ): Promise<Webhook> {
    return this.http.patch<Webhook>(`/v1/webhooks/${webhookId}`, data, options);
  }

  /**
   * Delete a webhook
   * @example
   * await client.webhooks.delete('webhook-id');
   */
  async delete(webhookId: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/webhooks/${webhookId}`, options);
  }

  /**
   * Test a webhook by sending a test event
   * @example
   * const result = await client.webhooks.test('webhook-id');
   * console.log(result.success, result.latency_ms);
   */
  async test(webhookId: string, options?: RequestOptions): Promise<TestWebhookResponse> {
    return this.http.post<TestWebhookResponse>(`/v1/webhooks/${webhookId}/test`, undefined, options);
  }

  /**
   * Get webhook delivery logs
   * @example
   * const logs = await client.webhooks.getLogs('webhook-id', { limit: 50 });
   */
  async getLogs(
    webhookId: string,
    query?: { limit?: number; offset?: number },
    options?: RequestOptions
  ): Promise<WebhookLog[]> {
    return this.http.get<WebhookLog[]>(`/v1/webhooks/${webhookId}/logs`, query, options);
  }
}
