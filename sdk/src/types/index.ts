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
}

export interface ChatSource {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  score: number;
}

export interface ChatOptions {
  /** Collection to use for context */
  collection: string;
  /** User message */
  message: string;
  /** Conversation ID for multi-turn chat */
  conversation_id?: string;
  /** Include source documents in response */
  include_sources?: boolean;
  /** System prompt override */
  system_prompt?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Max tokens for response */
  max_tokens?: number;
}

export interface ChatResponse {
  message: string;
  conversation_id: string;
  sources?: ChatSource[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChatOptions extends ChatOptions {
  /** Callback for each chunk */
  onChunk?: (chunk: string) => void;
  /** Callback when complete */
  onComplete?: (response: ChatResponse) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
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

export class DevabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DevabaseError';
  }
}

export class AuthenticationError extends DevabaseError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends DevabaseError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends DevabaseError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DevabaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends DevabaseError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
  }
}
