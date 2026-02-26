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
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
  user?: User;
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
}

export interface SearchResult {
  id: string;
  document_id: string;
  content: string;
  score: number;
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

export interface ProjectSettings {
  llm_providers: LLMProvider[];
  embedding_providers: EmbeddingProvider[];
  default_llm_provider?: string;
  default_embedding_provider?: string;
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

// API response types
export interface ApiError {
  error: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
