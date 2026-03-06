// Main client
export { DevabaseClient, createClient } from './client';

// Types
export type {
  // Config
  DevabaseConfig,
  RequestOptions,

  // Auth
  User,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,

  // App Auth (for end-users of your application)
  AppUser,
  AppAuthResponse,
  AppRefreshResponse,
  AppAuthTokens,
  TokenIntrospectionResult,
  AppUserRegisterInput,
  AppUserLoginInput,
  AppUserUpdateInput,
  AppUserChangePasswordInput,
  AppUserAdminUpdateInput,

  // Project
  Project,
  ProjectRole,
  CreateProjectInput,
  UpdateProjectInput,

  // Collection
  Collection,
  CreateCollectionInput,
  CollectionStats,

  // Document
  Document,
  DocumentStatus,
  UploadDocumentInput,

  // Table
  Table,
  TableColumn,
  ColumnDefinition,
  CreateTableInput,
  BatchInsertResponse,

  // Pagination
  PaginationMeta,
  PaginatedResponse,
  PaginatedRowsResponse,
  QueryOptions,

  // Search
  SearchResult,
  VectorMatch,
  HybridSearchResult,
  SearchOptions,
  HybridSearchOptions,
  MultiSearchOptions,
  RetrievalStrategy,
  StrategyOptions,
  FilterFieldSchema,

  // Chat / RAG
  ChatMessage,
  ChatSource,
  RagChatOptions,
  RagChatResponse,
  RagStreamCallbacks,
  StreamEvent,
  StreamEventType,
  StreamSourcesEvent,
  StreamThinkingEvent,
  StreamContentEvent,
  StreamDoneEvent,
  StreamErrorEvent,

  // Knowledge Graph
  Entity,
  Relationship,
  EntityGraph,
  ExtractKnowledgeOptions,

  // API Keys
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,

  // Webhooks
  Webhook,
  WebhookEvent,
  WebhookStatus,
  WebhookLog,
  CreateWebhookInput,
  UpdateWebhookInput,
  TestWebhookResponse,
} from './types';

// Errors
export {
  DevabaseError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  DatabaseError,
  ConfigurationError,
  ExternalServiceError,
} from './types';

// App Auth Session helper class
export { AppAuthSession } from './types';

// Resource classes (for advanced usage)
export { AuthResource } from './resources/auth';
export { AppAuthResource } from './resources/app-auth';
export { ProjectsResource } from './resources/projects';
export { CollectionsResource } from './resources/collections';
export { DocumentsResource } from './resources/documents';
export { TablesResource, TableRowsClient } from './resources/tables';
export { SearchResource } from './resources/search';
export { VectorsResource } from './resources/vectors';
export { ChatResource } from './resources/chat';
export { KnowledgeResource } from './resources/knowledge';
export { ChunksResource } from './resources/chunks';
export { EvaluationResource } from './resources/evaluation';
export { BenchmarksResource } from './resources/benchmarks';
export { PromptsResource } from './resources/prompts';
export { WebhooksResource } from './resources/webhooks';
export { SqlResource } from './resources/sql';
export { StorageResource } from './resources/storage';
export { ProvidersResource } from './resources/providers';
export { AdminResource } from './resources/admin';
export { RealtimeResource } from './resources/realtime';

// Provider types
export type {
  LLMProvider,
  EmbeddingProvider,
  RerankProvider,
  LLMProviderType,
  EmbeddingProviderType,
  RerankProviderType,
  CreateLLMProviderInput,
  CreateEmbeddingProviderInput,
  CreateRerankProviderInput,
  TestProviderResponse,
  ProjectSettings,
} from './resources/providers';

// Vector types
export type {
  VectorUpsert,
} from './resources/vectors';

// Benchmark types
export type {
  BenchmarkConfig,
  DatasetSource,
  RunBenchmarkInput,
  BenchmarkRunResponse,
  BenchmarkListItem,
  BeirDatasetInfo,
} from './resources/benchmarks';

// Admin types
export type {
  CacheStats,
  UsageSummary,
  UsageByEndpoint,
  UsageResponse,
} from './resources/admin';

// Realtime types
export type {
  RealtimeEvent,
  RealtimeMessage,
  RealtimeCallbacks,
} from './resources/realtime';
