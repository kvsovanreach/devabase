// User types
export type UserStatus = 'pending' | 'active' | 'suspended';

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  name: string;
  avatar_url: string | null;
  status: UserStatus;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refresh_token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

// Project types
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

export interface ProjectMember {
  id: string;
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: ProjectRole;
  joined_at: string;
}

export interface CreateProjectRequest {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

// Collection types
export interface Collection {
  id: string;
  name: string;
  dimensions: number;
  metric: string;
  index_type: string;
  metadata: Record<string, unknown> | null;
  vector_count: number;
  document_count: number;
  rag_enabled: boolean;
  rag_config: RagConfig | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCollectionRequest {
  name: string;
  dimensions?: number;
  metric?: string;
  index_type?: string;
  metadata?: Record<string, unknown>;
}

// Document types
export type DocumentStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface Document {
  id: string;
  collection_id: string;
  filename: string;
  content_type: string;
  file_size: number;
  status: DocumentStatus;
  chunk_count: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  collection_id: string;
  content: string;
  chunk_index: number;
  start_offset: number;
  end_offset: number;
  token_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Search types
export interface SearchRequest {
  query: string;
  collection?: string;
  limit?: number;
  filter?: Record<string, unknown>;
  rerank?: boolean;
}

export interface SearchResult {
  id: string;
  document_id: string;
  content: string;
  score: number;
  rerank_score?: number;
  metadata: Record<string, unknown> | null;
}

// Hybrid search types
export type SearchType = 'vector' | 'keyword' | 'hybrid';

export interface HybridSearchRequest {
  query: string;
  collection: string;
  limit?: number;
  vector_weight?: number;  // 0.0-1.0, default 0.7
  keyword_weight?: number; // 0.0-1.0, default 0.3
  filter?: Record<string, unknown>;
}

export interface HybridSearchResult {
  id: string;
  document_id: string;
  content: string;
  score: number;           // Combined RRF score
  vector_score: number;    // Vector similarity score
  keyword_score: number;   // BM25/keyword score
  metadata: Record<string, unknown> | null;
}

// API Key types
export type ApiKeyType = 'personal' | 'project';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  key_type: ApiKeyType;
  project_id: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes?: string[];
  key_type?: ApiKeyType;
  expires_in_days?: number;
}

export interface CreateApiKeyResponse {
  id: string;
  key: string;  // The actual secret key - only shown once
  name: string;
  scopes: string[];
}

// Prompt types
export interface Prompt {
  id: string;
  name: string;
  version: number;
  content: string;
  variables: string[];
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreatePromptRequest {
  name: string;
  content: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// AI Provider types
export type LLMProviderType = 'openai' | 'anthropic' | 'google' | 'custom';
export type EmbeddingProviderType = 'openai' | 'cohere' | 'voyage' | 'custom';
export type RerankProviderType = 'cohere' | 'jina' | 'custom';

export interface LLMProvider {
  id: string;
  name: string;
  type: LLMProviderType;
  api_key: string;
  base_url?: string;
  models: string[];
  default_model?: string;
  is_active: boolean;
}

export interface EmbeddingProvider {
  id: string;
  name: string;
  type: EmbeddingProviderType;
  api_key: string;
  base_url?: string;
  model: string;
  dimensions: number;
  max_tokens: number;  // Max input tokens for embedding model
  is_active: boolean;
}

export interface RerankProvider {
  id: string;
  name: string;
  type: RerankProviderType;
  api_key: string;
  base_url?: string;
  model?: string;
  is_active: boolean;
}

export interface ProjectSettings {
  llm_providers: LLMProvider[];
  embedding_providers: EmbeddingProvider[];
  reranking_providers?: RerankProvider[];
  default_llm_provider?: string;
  default_embedding_provider?: string;
  default_reranking_provider?: string;
}

// Invitation types
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface Invitation {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  status: InvitationStatus;
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface CreateInvitationRequest {
  email: string;
  role?: ProjectRole;
}

// RAG types
export interface RagConfig {
  enabled: boolean;
  llm_provider_id: string;  // References LLMProvider from project settings
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  top_k: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  include_sources?: boolean;
}

export interface ChatSource {
  document_id: string;
  document_name: string;
  chunk_content: string;
  relevance_score: number;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  conversation_id: string;
  tokens_used: number;
}

// Evaluation types
export interface EvaluationDataset {
  id: string;
  project_id: string;
  collection_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluationDatasetWithStats extends EvaluationDataset {
  case_count: number;
  run_count: number;
  last_run: string | null;
  collection_name: string;
}

export interface EvaluationCase {
  id: string;
  dataset_id: string;
  query: string;
  expected_chunk_ids: string[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluationDatasetDetail extends EvaluationDataset {
  collection_name: string;
  cases: EvaluationCase[];
}

export interface EvaluationMetrics {
  precision_at_k: number;
  recall_at_k: number;
  mrr: number;
  ndcg: number;
  cases_evaluated: number;
  k: number;
}

export interface CaseResult {
  case_id: string;
  query: string;
  expected_count: number;
  retrieved_ids: string[];
  relevant_retrieved: number;
  precision: number;
  recall: number;
  reciprocal_rank: number;
  ndcg: number;
}

export interface EvaluationRun {
  id: string;
  dataset_id: string;
  search_mode: string;
  config: {
    top_k?: number;
    vector_weight?: number;
    keyword_weight?: number;
  } | null;
  metrics: EvaluationMetrics;
  case_results: CaseResult[] | null;
  created_at: string;
}

export interface CreateDatasetRequest {
  collection_name: string;
  name: string;
  description?: string;
}

export interface CreateCaseRequest {
  query: string;
  expected_chunk_ids: string[];
  metadata?: Record<string, unknown>;
}

export interface RunEvaluationRequest {
  search_mode?: 'vector' | 'hybrid';
  top_k?: number;
  vector_weight?: number;
  keyword_weight?: number;
}

export interface RunResult {
  run: EvaluationRun;
  metrics: EvaluationMetrics;
}

// Knowledge Graph types
export interface Entity {
  id: string;
  project_id: string;
  collection_id: string | null;
  document_id: string | null;
  chunk_id: string | null;
  name: string;
  entity_type: string;
  description: string | null;
  aliases: string[];
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  project_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  description: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
  document_id: string | null;
  chunk_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntitySummary {
  id: string;
  name: string;
  entity_type: string;
}

export interface RelationshipWithEntity {
  relationship: Relationship;
  related_entity: EntitySummary;
}

export interface EntityWithRelationships extends Entity {
  outgoing_relationships: RelationshipWithEntity[];
  incoming_relationships: RelationshipWithEntity[];
}

export interface GraphNode {
  id: string;
  name: string;
  entity_type: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface KnowledgeStats {
  total_entities: number;
  total_relationships: number;
  entities_by_type: Array<{
    entity_type: string;
    count: number;
  }>;
}

// API response types
export interface ApiError {
  error: string;
  message?: string;
}

// Pagination types for table API endpoints
export interface PaginationMeta {
  /** Total number of rows matching the filter */
  total: number;
  /** Number of rows returned in this response */
  count: number;
  /** Current limit (rows per page) */
  limit: number;
  /** Current offset */
  offset: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  total_pages: number;
  /** Whether there is a next page */
  has_next: boolean;
  /** Whether there is a previous page */
  has_previous: boolean;
  /** Cursor for next page (if available) */
  next_cursor?: string;
  /** Cursor for previous page (if available) */
  prev_cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** @deprecated Use PaginatedResponse with pagination metadata instead */
export interface LegacyPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
