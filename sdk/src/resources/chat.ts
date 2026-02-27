import { HttpClient } from '../utils/http';
import {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChatOptions,
  RequestOptions,
} from '../types';

export interface Conversation {
  id: string;
  collection: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export class ChatResource {
  constructor(private http: HttpClient) {}

  /**
   * Send a chat message and get a response (RAG)
   * @example
   * const response = await client.chat.send({
   *   collection: 'my-docs',
   *   message: 'What is the authentication flow?',
   *   include_sources: true
   * });
   * console.log(response.message);
   * console.log(response.sources);
   */
  async send(options: ChatOptions, requestOptions?: RequestOptions): Promise<ChatResponse> {
    return this.http.post<ChatResponse>(
      `/v1/collections/${options.collection}/chat`,
      {
        message: options.message,
        conversation_id: options.conversation_id,
        include_sources: options.include_sources ?? true,
        system_prompt: options.system_prompt,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
      },
      requestOptions
    );
  }

  /**
   * Stream a chat response
   * @example
   * await client.chat.stream({
   *   collection: 'my-docs',
   *   message: 'Explain the architecture',
   *   onChunk: (chunk) => process.stdout.write(chunk),
   *   onComplete: (response) => console.log('\nSources:', response.sources)
   * });
   */
  async stream(options: StreamChatOptions, requestOptions?: RequestOptions): Promise<void> {
    let fullMessage = '';

    await this.http.stream(
      `/v1/collections/${options.collection}/chat/stream`,
      {
        message: options.message,
        conversation_id: options.conversation_id,
        include_sources: options.include_sources ?? true,
        system_prompt: options.system_prompt,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
      },
      (data) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            fullMessage += parsed.content;
            options.onChunk?.(parsed.content);
          }
          if (parsed.done && options.onComplete) {
            options.onComplete({
              message: fullMessage,
              conversation_id: parsed.conversation_id,
              sources: parsed.sources,
              usage: parsed.usage,
            });
          }
        } catch {
          // If not JSON, treat as raw content
          fullMessage += data;
          options.onChunk?.(data);
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
    options?: Omit<ChatOptions, 'collection' | 'message' | 'conversation_id'>,
    requestOptions?: RequestOptions
  ): Promise<ChatResponse> {
    // Get conversation to find collection
    const conversation = await this.getConversation(conversationId, requestOptions);

    return this.send({
      collection: conversation.collection,
      message,
      conversation_id: conversationId,
      ...options,
    }, requestOptions);
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
      `/v1/chat/conversations/${conversationId}`,
      undefined,
      requestOptions
    );
  }

  /**
   * List conversations
   * @example
   * const conversations = await client.chat.listConversations();
   */
  async listConversations(
    options?: { collection?: string; limit?: number; offset?: number },
    requestOptions?: RequestOptions
  ): Promise<Conversation[]> {
    return this.http.get<Conversation[]>(
      '/v1/chat/conversations',
      options,
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
    await this.http.delete<void>(
      `/v1/chat/conversations/${conversationId}`,
      requestOptions
    );
  }

  /**
   * Chat with a specific prompt template
   * @example
   * const response = await client.chat.withPrompt({
   *   collection: 'my-docs',
   *   message: 'Summarize the main features',
   *   prompt_id: 'summarize-prompt'
   * });
   */
  async withPrompt(
    options: ChatOptions & { prompt_id: string },
    requestOptions?: RequestOptions
  ): Promise<ChatResponse> {
    return this.http.post<ChatResponse>(
      `/v1/collections/${options.collection}/chat`,
      {
        message: options.message,
        conversation_id: options.conversation_id,
        include_sources: options.include_sources ?? true,
        prompt_id: options.prompt_id,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
      },
      requestOptions
    );
  }
}
