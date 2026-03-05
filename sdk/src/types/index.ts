// ============================================================================
// Core Types
// ============================================================================

export interface DevabaseConfig {
  /** Base URL of the Devabase server */
  baseUrl: string;
  /** API key for authentication (use this OR email/password) */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  /** Override timeout for this request */
  timeout?: number;
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  name: string;
  avatar_url: string | null;
  status: 'pending' | 'active' | 'suspended';
  created_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refresh_token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

// ============================================================================
// Application User Authentication Types
// ============================================================================

/**
 * Application user - end-user of apps built with Devabase
 */
export interface AppUser {
  id: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AppAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AppAuthResponse {
  user: AppUser;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Response from token refresh (no user object, only tokens)
 */
export interface AppRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Token introspection result (OAuth2-style)
 *
 * When `active: true`, all fields are present.
 * When `active: false`, only `active` is guaranteed.
 */
export interface TokenIntrospectionResult {
  /** Whether the token is valid and active */
  active: boolean;
  /** User ID (present when token is decodable) */
  user_id?: string;
  /** User email (present when token is decodable) */
  email?: string;
  /** User name */
  name?: string | null;
  /** Token expiration timestamp (Unix) */
  exp?: number;
  /** Token issued at timestamp (Unix) */
  iat?: number;
  /** Full user object (only when active: true) */
  user?: AppUser;
}

/**
 * Enhanced auth session with helper methods
 */
export class AppAuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: AppUser;
  readonly expiresIn: number;
  readonly expiresAt: Date;

  constructor(response: AppAuthResponse) {
    this.accessToken = response.access_token;
    this.refreshToken = response.refresh_token;
    this.user = response.user;
    this.expiresIn = response.expires_in;
    this.expiresAt = new Date(Date.now() + response.expires_in * 1000);
  }

  /**
   * Check if the access token is expired
   */
  isExpired(): boolean {
    return Date.now() >= this.expiresAt.getTime();
  }

  /**
   * Check if the access token will expire within the given seconds
   */
  expiresWithin(seconds: number): boolean {
    return Date.now() >= this.expiresAt.getTime() - seconds * 1000;
  }

  /**
   * Get the decoded JWT payload (without verification)
   * Useful for reading claims client-side
   */
  getPayload(): Record<string, unknown> | null {
    try {
      const parts = this.accessToken.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Convert back to raw response format
   */
  toResponse(): AppAuthResponse {
    return {
      user: this.user,
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      token_type: 'Bearer',
      expires_in: this.expiresIn,
    };
  }
}

export interface AppUserRegisterInput {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}

export interface AppUserLoginInput {
  email: string;
  password: string;
}

export interface AppUserUpdateInput {
  name?: string;
  avatar_url?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}

export interface AppUserChangePasswordInput {
  current_password: string;
  new_password: string;
}

export interface AppUserAdminUpdateInput {
  name?: string;
  avatar_url?: string;
  phone?: string;
  status?: 'pending' | 'active' | 'suspended';
  email_verified?: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Project Types
// ============================================================================

export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner_id: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  role?: ProjectRole;
  member_count?: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

// ============================================================================
// Collection Types
// ============================================================================

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  dimensions: number;
  metric: 'cosine' | 'l2' | 'ip';
  document_count: number;
  chunk_count: number;
  created_at: string;
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  dimensions?: number;
  metric?: 'cosine' | 'l2' | 'ip';
}

export interface CollectionStats {
  name: string;
  document_count: number;
  chunk_count: number;
  total_size_bytes: number;
}

// ============================================================================
// Document Types
// ============================================================================

export type DocumentStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface Document {
  id: string;
  collection_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: DocumentStatus;
  chunk_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
}

export interface UploadDocumentInput {
  /** File content as Buffer, Blob, or ReadableStream */
  file: Buffer | Blob | ReadableStream;
  /** Original filename */
  filename: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Extract knowledge graph entities */
  extract_knowledge?: boolean;
}

// ============================================================================
// Table Types
// ============================================================================

export interface TableColumn {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary: boolean;
  column_default: string | null;
}

export interface Table {
  name: string;
  columns: TableColumn[];
  row_count: number;
  created_at: string;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  primary?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
  references_table?: string;
  references_column?: string;
  on_delete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export interface CreateTableInput {
  name: string;
  columns: ColumnDefinition[];
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationMeta {
  total: number;
  count: number;
  limit: number;
  offset: number;
  page: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  next_cursor?: string;
  prev_cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** For table rows responses specifically */
export interface PaginatedRowsResponse<T> {
  rows: T[];
  pagination: PaginationMeta;
}

export interface QueryOptions {
  /** Number of rows to return (default: 50, max: 1000) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Page number (1-indexed) */
  page?: number;
  /** Rows per page */
  per_page?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
  /** Sort order (e.g., "created_at:desc,name:asc") */
  order?: string;
  /** Filter conditions (e.g., "status.eq=active&age.gte=18") */
  filter?: string;
  /** Columns to select (e.g., "id,name,email") */
  select?: string;
  /** Index signature for http client compatibility */
  [key: string]: string | number | boolean | undefined;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  document_id: string;
  document_name: string;
  metadata: Record<string, unknown>;
  rerank_score?: number;
}

/**
 * Available retrieval strategies for advanced RAG
 */
export type RetrievalStrategy =
  | 'standard'      // Basic vector similarity search (default)
  | 'parent_child'  // Retrieve small chunks, return larger parent context
  | 'hyde'          // Generate hypothetical answer, embed that, then search
  | 'multi_query'   // Expand query into variations, search all, merge results
  | 'self_query'    // Extract structured filters from natural language
  | 'compression';  // Compress retrieved chunks to relevant parts only

/**
 * Schema for extractable filter fields in self-query strategy
 */
export interface FilterFieldSchema {
  /** Field name in metadata */
  name: string;
  /** Description of what this field contains */
  description: string;
  /** Field type: string, number, boolean, date */
  type: 'string' | 'number' | 'boolean' | 'date';
  /** Example values (optional) */
  examples?: string[];
}

/**
 * Strategy-specific options for retrieval
 */
export interface StrategyOptions {
  // Parent-child options
  /** How many levels up to fetch parent chunks (default: 1) */
  parent_depth?: number;

  // HyDE options
  /** Temperature for hypothetical generation (default: 0.7) */
  hyde_temperature?: number;
  /** Number of hypothetical documents to generate (default: 1) */
  hyde_num_hypotheticals?: number;

  // Multi-query options
  /** Number of query variations to generate (default: 3) */
  num_query_variations?: number;

  // Self-query options
  /** Fields that can be extracted as filters */
  extractable_fields?: FilterFieldSchema[];

  // Compression options
  /** Maximum length of compressed content (default: 500) */
  max_compressed_length?: number;
}

export interface SearchOptions {
  /** Collection to search in */
  collection: string;
  /** Search query */
  query: string;
  /** Number of results to return (default: 10) */
  top_k?: number;
  /** Metadata filter */
  filter?: Record<string, unknown>;
  /** Enable reranking */
  rerank?: boolean;
  /** Include chunk content in results */
  include_content?: boolean;
  /** Retrieval strategy to use (default: standard) */
  strategy?: RetrievalStrategy;
  /** Strategy-specific options */
  strategy_options?: StrategyOptions;
}

export interface HybridSearchOptions extends SearchOptions {
  /** Weight for vector search (0-1) */
  vector_weight?: number;
  /** Weight for keyword search (0-1) */
  keyword_weight?: number;
}

// ============================================================================
// RAG Chat Types
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
}

export interface ChatSource {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  score: number;
  collection_name?: string;
}

/**
 * Options for unified RAG chat (single or multi-collection)
 */
export interface RagChatOptions {
  /** Collection(s) to use - single name or array of names */
  collection: string | string[];
  /** User message */
  message: string;
  /** Conversation ID for multi-turn chat */
  conversation_id?: string;
  /** Include source documents in response */
  include_sources?: boolean;
  /** Number of chunks to retrieve */
  top_k?: number;
  /** Enable streaming response */
  stream?: boolean;
}

/**
 * Response from unified RAG chat endpoint
 */
export interface RagChatResponse {
  /** Generated answer */
  answer: string;
  /** Model's thinking/reasoning (if model supports it) */
  thinking?: string;
  /** Source documents used */
  sources: ChatSource[];
  /** Collections that contributed to the response */
  collections_used: string[];
  /** Conversation ID for follow-up messages */
  conversation_id?: string;
  /** Total tokens used */
  tokens_used: number;
}

/**
 * Streaming event types from RAG chat
 */
export type StreamEventType = 'sources' | 'thinking' | 'content' | 'done' | 'error';

export interface StreamSourcesEvent {
  type: 'sources';
  sources: ChatSource[];
}

export interface StreamThinkingEvent {
  type: 'thinking';
  content: string;
}

export interface StreamContentEvent {
  type: 'content';
  content: string;
}

export interface StreamDoneEvent {
  type: 'done';
  conversation_id: string | null;
  tokens_used: number;
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
}

export type StreamEvent =
  | StreamSourcesEvent
  | StreamThinkingEvent
  | StreamContentEvent
  | StreamDoneEvent
  | StreamErrorEvent;

/**
 * Callbacks for streaming RAG chat
 */
export interface RagStreamCallbacks {
  /** Called when sources are retrieved */
  onSources?: (sources: ChatSource[]) => void;
  /** Called with thinking/reasoning content */
  onThinking?: (thinking: string) => void;
  /** Called for each content chunk */
  onContent?: (content: string) => void;
  /** Called when generation is complete */
  onDone?: (conversationId: string | null, tokensUsed: number) => void;
  /** Called on error */
  onError?: (error: string) => void;
}


// ============================================================================
// Knowledge Graph Types
// ============================================================================

export interface Entity {
  id: string;
  name: string;
  entity_type: string;
  description: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Relationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  description: string | null;
  confidence: number;
  created_at: string;
}

export interface EntityGraph {
  entity: Entity;
  relationships: Array<{
    relationship: Relationship;
    connected_entity: Entity;
  }>;
}

export interface ExtractKnowledgeOptions {
  /** Document ID to extract from */
  document_id?: string;
  /** Collection name to extract from all documents */
  collection?: string;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
  id: string;
  project_id: string;
  collection_id: string;
  user_id: string | null;
  title: string | null;
  summary: string | null;
  message_count: number;
  total_tokens: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithCollection extends Conversation {
  collection_name: string;
}

// ============================================================================
// Project Member & Invitation Types
// ============================================================================

export interface ProjectMember {
  id: string;
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: ProjectRole;
  joined_at: string;
}

export interface ProjectInvitation {
  id: string;
  email: string;
  role: ProjectRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  created_at: string;
  expires_at: string;
}

export interface CreateInvitationInput {
  email: string;
  role?: ProjectRole;
}

// ============================================================================
// Prompt Types
// ============================================================================

export interface Prompt {
  name: string;
  description: string | null;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptInput {
  name: string;
  content: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePromptInput {
  content?: string;
  description?: string;
}

// ============================================================================
// Evaluation Types
// ============================================================================

export interface EvaluationDataset {
  id: string;
  collection_name: string;
  name: string;
  description: string | null;
  case_count: number;
  run_count: number;
  last_run: string | null;
  created_at: string;
}

export interface EvaluationRun {
  id: string;
  dataset_id: string;
  search_mode: string;
  config: Record<string, unknown> | null;
  metrics: Record<string, unknown>;
  case_results: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================================
// API Key Types
// ============================================================================

export interface ApiKey {
  id: string;
  name: string;
  key_preview: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expires_in_days?: number;
}

export interface CreateApiKeyResponse {
  api_key: ApiKey;
  key: string; // Full key, only shown once
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEvent =
  | 'document.created'
  | 'document.processed'
  | 'document.failed'
  | 'collection.created'
  | 'collection.deleted'
  | 'table.row.created'
  | 'table.row.updated'
  | 'table.row.deleted';

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateWebhookInput {
  url: string;
  events: WebhookEvent[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for all Devabase errors.
 * Contains machine-readable error codes and actionable fix hints.
 */
export class DevabaseError extends Error {
  constructor(
    message: string,
    /** Machine-readable error code (e.g., 'DUPLICATE_VALUE', 'FOREIGN_KEY_VIOLATION') */
    public readonly code: string,
    /** HTTP status code */
    public readonly status: number,
    /** Actionable hint on how to fix this error */
    public readonly fix?: string,
    /** Additional error details */
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DevabaseError';
  }

  /**
   * Returns a formatted error message including the fix hint if available
   */
  toDetailedString(): string {
    let result = `[${this.code}] ${this.message}`;
    if (this.fix) {
      result += `\n\nHow to fix: ${this.fix}`;
    }
    return result;
  }

  /**
   * Returns the error as a plain object for logging/debugging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      fix: this.fix,
      details: this.details,
    };
  }
}

export class AuthenticationError extends DevabaseError {
  constructor(message: string = 'Authentication failed', fix?: string) {
    super(message, 'AUTHENTICATION_ERROR', 401, fix);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends DevabaseError {
  constructor(message: string = 'Access denied', fix?: string) {
    super(message, 'AUTHORIZATION_ERROR', 403, fix);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends DevabaseError {
  constructor(message: string = 'Resource not found', fix?: string) {
    super(message, 'NOT_FOUND', 404, fix);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DevabaseError {
  constructor(message: string, code?: string, fix?: string, details?: Record<string, unknown>) {
    super(message, code || 'VALIDATION_ERROR', 400, fix, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends DevabaseError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfter?: number,
    fix?: string
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, fix);
    this.name = 'RateLimitError';
  }
}

/**
 * Database operation error with specific error codes for constraints, types, etc.
 */
export class DatabaseError extends DevabaseError {
  constructor(message: string, code: string, fix?: string) {
    super(message, code, 400, fix);
    this.name = 'DatabaseError';
  }
}

/**
 * Configuration error (e.g., missing embedding provider, invalid LLM settings)
 */
export class ConfigurationError extends DevabaseError {
  constructor(message: string, code: string, fix?: string) {
    super(message, code, 422, fix);
    this.name = 'ConfigurationError';
  }
}

/**
 * External service error (e.g., LLM provider unreachable, embedding API failure)
 */
export class ExternalServiceError extends DevabaseError {
  constructor(message: string, code: string, fix?: string) {
    super(message, code, 502, fix);
    this.name = 'ExternalServiceError';
  }
}
