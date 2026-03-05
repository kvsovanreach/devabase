import { HttpClient } from '../utils/http';
import { AuthResource } from '../resources/auth';
import { AppAuthResource } from '../resources/app-auth';
import { ProjectsResource } from '../resources/projects';
import { CollectionsResource } from '../resources/collections';
import { DocumentsResource } from '../resources/documents';
import { TablesResource } from '../resources/tables';
import { SearchResource } from '../resources/search';
import { ChatResource } from '../resources/chat';
import { KnowledgeResource } from '../resources/knowledge';
import { ChunksResource } from '../resources/chunks';
import { EvaluationResource } from '../resources/evaluation';
import { PromptsResource } from '../resources/prompts';
import { WebhooksResource } from '../resources/webhooks';
import { SqlResource } from '../resources/sql';
import { StorageResource } from '../resources/storage';
import { ProvidersResource } from '../resources/providers';
import { DevabaseConfig } from '../types';

export class DevabaseClient {
  private http: HttpClient;

  /** Authentication operations (for admin/developer users) */
  public readonly auth: AuthResource;
  /** Application user authentication (for end-users of your app) */
  public readonly appAuth: AppAuthResource;
  /** Project management */
  public readonly projects: ProjectsResource;
  /** Collection management */
  public readonly collections: CollectionsResource;
  /** Document management */
  public readonly documents: DocumentsResource;
  /** Table CRUD operations with pagination */
  public readonly tables: TablesResource;
  /** Vector and hybrid search */
  public readonly search: SearchResource;
  /** RAG chat operations */
  public readonly chat: ChatResource;
  /** Knowledge graph operations */
  public readonly knowledge: KnowledgeResource;
  /** Chunk management */
  public readonly chunks: ChunksResource;
  /** RAG evaluation */
  public readonly evaluation: EvaluationResource;
  /** Prompt templates */
  public readonly prompts: PromptsResource;
  /** Webhook subscriptions */
  public readonly webhooks: WebhooksResource;
  /** SQL query execution */
  public readonly sql: SqlResource;
  /** File storage */
  public readonly storage: StorageResource;
  /** LLM, Embedding, and Rerank provider management */
  public readonly providers: ProvidersResource;

  /**
   * Create a new Devabase client
   *
   * @example
   * // With API key
   * const client = new DevabaseClient({
   *   baseUrl: 'http://localhost:9002',
   *   apiKey: 'dvb_your_api_key'
   * });
   *
   * @example
   * // With login
   * const client = new DevabaseClient({
   *   baseUrl: 'http://localhost:9002'
   * });
   * await client.auth.login({ email: 'user@example.com', password: 'secret' });
   */
  constructor(config: DevabaseConfig) {
    // Normalize base URL (remove trailing slash)
    const baseUrl = config.baseUrl.replace(/\/$/, '');

    this.http = new HttpClient({
      baseUrl,
      timeout: config.timeout ?? 30000,
      headers: config.headers ?? {},
    });

    // Set API key if provided
    if (config.apiKey) {
      this.http.setApiKey(config.apiKey);
    }

    // Initialize resources
    this.auth = new AuthResource(this.http);
    this.appAuth = new AppAuthResource(this.http);
    this.projects = new ProjectsResource(this.http);
    this.collections = new CollectionsResource(this.http);
    this.documents = new DocumentsResource(this.http);
    this.tables = new TablesResource(this.http);
    this.search = new SearchResource(this.http);
    this.chat = new ChatResource(this.http);
    this.knowledge = new KnowledgeResource(this.http);
    this.chunks = new ChunksResource(this.http);
    this.evaluation = new EvaluationResource(this.http);
    this.prompts = new PromptsResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.sql = new SqlResource(this.http);
    this.storage = new StorageResource(this.http);
    this.providers = new ProvidersResource(this.http);
  }

  /**
   * Set the project to use for subsequent requests
   *
   * @example
   * client.useProject('project-id');
   * // Now all requests will be scoped to this project
   */
  useProject(projectId: string): this {
    this.projects.use(projectId);
    this.http.setProjectId(projectId);
    return this;
  }

  /**
   * Get the current project ID
   */
  getCurrentProjectId(): string | null {
    return this.http.getProjectId();
  }

  /**
   * Set user context for dual-auth scenarios.
   *
   * When both API key and user token are set:
   * - API key → authorizes the request (project access)
   * - User token → identifies WHO is making the request
   *
   * This enables:
   * - Row-level security (RLS) based on user ID
   * - Audit logs with user attribution
   * - User-scoped queries
   *
   * @param userToken - The app user's access token, or null to clear
   * @returns this for chaining
   *
   * @example
   * // Server-side: verify user and set context
   * const client = createClient({ baseUrl: '...', apiKey: 'dvb_xxx' });
   *
   * // Verify the user's token
   * const user = await client.appAuth.getUserFromToken(userAccessToken);
   *
   * // Set user context for subsequent requests
   * client.asUser(userAccessToken);
   *
   * // Now queries respect RLS policies
   * const articles = await client.tables.rows('articles').query();
   * // Returns only articles the user has access to
   */
  asUser(userToken: string | null): this {
    this.http.setUserToken(userToken);
    return this;
  }

  /**
   * Clear user context
   * @returns this for chaining
   */
  clearUserContext(): this {
    this.http.setUserToken(null);
    return this;
  }

  /**
   * Get the current user token
   */
  getUserToken(): string | null {
    return this.http.getUserToken();
  }
}

/**
 * Create a new Devabase client instance
 *
 * @example
 * import { createClient } from '@devabase/sdk';
 *
 * const client = createClient({
 *   baseUrl: 'http://localhost:9002',
 *   apiKey: 'dvb_your_api_key'
 * });
 */
export function createClient(config: DevabaseConfig): DevabaseClient {
  return new DevabaseClient(config);
}
