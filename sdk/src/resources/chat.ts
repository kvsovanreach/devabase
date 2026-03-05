import { HttpClient } from '../utils/http';
import {
  ChatMessage,
  RagChatOptions,
  RagChatResponse,
  RagStreamCallbacks,
  StreamEvent,
  RequestOptions,
} from '../types';

export interface Conversation {
  id: string;
  collection_id: string;
  collection_name?: string;
  title: string | null;
  message_count: number;
  total_tokens: number;
  messages?: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export class ChatResource {
  constructor(private http: HttpClient) {}

  /**
   * Send a RAG chat message using the unified endpoint
   * Supports single or multiple collections
   *
   * @example
   * // Single collection
   * const response = await client.chat.send({
   *   collection: 'my-docs',
   *   message: 'What is the authentication flow?',
   *   include_sources: true
   * });
   *
   * // Multiple collections
   * const response = await client.chat.send({
   *   collection: ['docs', 'faq', 'tutorials'],
   *   message: 'How do I implement OAuth?',
   *   top_k: 10
   * });
   */
  async send(
    options: RagChatOptions,
    requestOptions?: RequestOptions
  ): Promise<RagChatResponse> {
    return this.http.post<RagChatResponse>(
      '/v1/rag',
      {
        collection: options.collection,
        message: options.message,
        conversation_id: options.conversation_id,
        include_sources: options.include_sources ?? true,
        top_k: options.top_k,
        stream: false,
      },
      requestOptions
    );
  }

  /**
   * Stream a RAG chat response using Server-Sent Events
   * Supports single or multiple collections
   *
   * @example
   * await client.chat.stream({
   *   collection: 'my-docs',
   *   message: 'Explain the architecture',
   * }, {
   *   onSources: (sources) => console.log('Sources:', sources),
   *   onThinking: (thinking) => console.log('Thinking:', thinking),
   *   onContent: (chunk) => process.stdout.write(chunk),
   *   onDone: (convId, tokens) => console.log('Done:', convId, tokens)
   * });
   */
  async stream(
    options: Omit<RagChatOptions, 'stream'>,
    callbacks: RagStreamCallbacks,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.http.stream(
      '/v1/rag',
      {
        collection: options.collection,
        message: options.message,
        conversation_id: options.conversation_id,
        include_sources: options.include_sources ?? true,
        top_k: options.top_k,
        stream: true,
      },
      (data) => {
        try {
          const event = JSON.parse(data) as StreamEvent;

          switch (event.type) {
            case 'sources':
              callbacks.onSources?.(event.sources);
              break;
            case 'thinking':
              callbacks.onThinking?.(event.content);
              break;
            case 'content':
              callbacks.onContent?.(event.content);
              break;
            case 'done':
              callbacks.onDone?.(event.conversation_id, event.tokens_used);
              break;
            case 'error':
              callbacks.onError?.(event.message);
              break;
          }
        } catch {
          // If not valid JSON, might be keep-alive or malformed
        }
      },
      requestOptions
    );
  }

  /**
   * Send a chat message scoped to a single collection
   * Uses the collection-specific endpoint for better error handling
   * (e.g., returns error if RAG is not configured for that collection)
   *
   * @example
   * const response = await client.chat.collection('my-docs', {
   *   message: 'What is authentication?',
   *   include_sources: true
   * });
   */
  async collection(
    collectionName: string,
    options: Omit<RagChatOptions, 'collection' | 'stream'>,
    requestOptions?: RequestOptions
  ): Promise<RagChatResponse> {
    return this.http.post<RagChatResponse>(
      `/v1/collections/${collectionName}/chat`,
      {
        message: options.message,
        conversation_id: options.conversation_id,
        include_sources: options.include_sources ?? true,
        top_k: options.top_k,
        stream: false,
      },
      requestOptions
    );
  }

  /**
   * Stream a chat response scoped to a single collection
   *
   * @example
   * await client.chat.streamCollection('my-docs', {
   *   message: 'Explain the architecture',
   * }, {
   *   onContent: (chunk) => process.stdout.write(chunk),
   *   onDone: (convId, tokens) => console.log('Done:', convId, tokens)
   * });
   */
  async streamCollection(
    collectionName: string,
    options: Omit<RagChatOptions, 'collection' | 'stream'>,
    callbacks: RagStreamCallbacks,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.http.stream(
      `/v1/collections/${collectionName}/chat/stream`,
      {
        message: options.message,
        conversation_id: options.conversation_id,
        include_sources: options.include_sources ?? true,
        top_k: options.top_k,
        stream: true,
      },
      (data) => {
        try {
          const event = JSON.parse(data) as StreamEvent;

          switch (event.type) {
            case 'sources':
              callbacks.onSources?.(event.sources);
              break;
            case 'thinking':
              callbacks.onThinking?.(event.content);
              break;
            case 'content':
              callbacks.onContent?.(event.content);
              break;
            case 'done':
              callbacks.onDone?.(event.conversation_id, event.tokens_used);
              break;
            case 'error':
              callbacks.onError?.(event.message);
              break;
          }
        } catch {
          // If not valid JSON, might be keep-alive or malformed
        }
      },
      requestOptions
    );
  }

  /**
   * Continue an existing conversation
   * @example
   * const response1 = await client.chat.send({
   *   collection: 'my-docs',
   *   message: 'What is authentication?'
   * });
   *
   * const response2 = await client.chat.continue(
   *   response1.conversation_id,
   *   'How do I implement it?'
   * );
   */
  async continue(
    conversationId: string,
    message: string,
    options?: { include_sources?: boolean; top_k?: number },
    requestOptions?: RequestOptions
  ): Promise<RagChatResponse> {
    const conversation = await this.getConversation(conversationId, requestOptions);

    return this.send(
      {
        collection: conversation.collection_name || '',
        message,
        conversation_id: conversationId,
        include_sources: options?.include_sources,
        top_k: options?.top_k,
      },
      requestOptions
    );
  }

  /**
   * Get a conversation by ID
   * @example
   * const conversation = await client.chat.getConversation('conversation-id');
   */
  async getConversation(
    conversationId: string,
    requestOptions?: RequestOptions
  ): Promise<Conversation> {
    return this.http.get<Conversation>(
      `/v1/conversations/${conversationId}`,
      undefined,
      requestOptions
    );
  }

  /**
   * List conversations
   * @example
   * const conversations = await client.chat.listConversations();
   * const filtered = await client.chat.listConversations({ collection: 'my-docs' });
   */
  async listConversations(
    options?: { collection?: string; limit?: number; offset?: number },
    requestOptions?: RequestOptions
  ): Promise<Conversation[]> {
    return this.http.get<Conversation[]>('/v1/conversations', options, requestOptions);
  }

  /**
   * Create a new conversation
   * @example
   * const conversation = await client.chat.createConversation({
   *   collection_id: 'collection-uuid',
   *   title: 'Support Chat'
   * });
   */
  async createConversation(
    data: { collection_id: string; title?: string },
    requestOptions?: RequestOptions
  ): Promise<Conversation> {
    return this.http.post<Conversation>('/v1/conversations', data, requestOptions);
  }

  /**
   * Update a conversation
   * @example
   * const conversation = await client.chat.updateConversation('conversation-id', {
   *   title: 'Updated Title'
   * });
   */
  async updateConversation(
    conversationId: string,
    data: { title?: string },
    requestOptions?: RequestOptions
  ): Promise<Conversation> {
    return this.http.patch<Conversation>(
      `/v1/conversations/${conversationId}`,
      data,
      requestOptions
    );
  }

  /**
   * Delete a conversation
   * @example
   * await client.chat.deleteConversation('conversation-id');
   */
  async deleteConversation(
    conversationId: string,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.http.delete<void>(`/v1/conversations/${conversationId}`, requestOptions);
  }
}
