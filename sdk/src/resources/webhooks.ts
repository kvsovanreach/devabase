import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  status: 'success' | 'failed';
  status_code?: number;
  response_time_ms?: number;
  error?: string;
  created_at: string;
}

export class WebhooksResource {
  constructor(private http: HttpClient) {}

  /**
   * List all webhooks
   * @example
   * const webhooks = await client.webhooks.list();
   */
  async list(options?: RequestOptions): Promise<Webhook[]> {
    return this.http.get<Webhook[]>('/v1/webhooks', undefined, options);
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
   *   events: ['document.processed', 'document.failed'],
   *   secret: 'whsec_xxxxx'
   * });
   */
  async create(
    data: {
      name: string;
      url: string;
      events: string[];
      secret?: string;
    },
    options?: RequestOptions
  ): Promise<Webhook> {
    return this.http.post<Webhook>('/v1/webhooks', data, options);
  }

  /**
   * Update a webhook
   * @example
   * const webhook = await client.webhooks.update('webhook-id', {
   *   events: ['document.processed'],
   *   is_active: false
   * });
   */
  async update(
    webhookId: string,
    data: {
      name?: string;
      url?: string;
      events?: string[];
      is_active?: boolean;
    },
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
   * Test a webhook
   * @example
   * const result = await client.webhooks.test('webhook-id');
   */
  async test(webhookId: string, options?: RequestOptions): Promise<{
    success: boolean;
    status_code?: number;
    response_time_ms?: number;
    error?: string;
  }> {
    return this.http.post(`/v1/webhooks/${webhookId}/test`, undefined, options);
  }

  /**
   * Get webhook delivery logs
   * @example
   * const logs = await client.webhooks.getLogs('webhook-id', { limit: 50 });
   */
  async getLogs(
    webhookId: string,
    query?: { limit?: number; status?: 'success' | 'failed' },
    options?: RequestOptions
  ): Promise<WebhookLog[]> {
    return this.http.get<WebhookLog[]>(`/v1/webhooks/${webhookId}/logs`, query, options);
  }
}
