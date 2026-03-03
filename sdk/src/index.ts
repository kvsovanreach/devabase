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

  // Pagination
  PaginationMeta,
  PaginatedResponse,
  QueryOptions,

  // Search
  SearchResult,
  SearchOptions,
  HybridSearchOptions,

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
  CreateWebhookInput,
} from './types';

// Errors
export {
  DevabaseError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
} from './types';

// Resource classes (for advanced usage)
export { AuthResource } from './resources/auth';
export { ProjectsResource } from './resources/projects';
export { CollectionsResource } from './resources/collections';
export { DocumentsResource } from './resources/documents';
export { TablesResource, TableRowsClient } from './resources/tables';
export { SearchResource } from './resources/search';
export { ChatResource } from './resources/chat';
export { KnowledgeResource } from './resources/knowledge';
