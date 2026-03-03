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

  /**
   * Create a new Devabase client
   *
   * @example
   * // With API key
   * const client = new DevabaseClient({
   *   baseUrl: 'http://localhost:8080',
   *   apiKey: 'dvb_your_api_key'
   * });
   *
   * @example
   * // With login
   * const client = new DevabaseClient({
   *   baseUrl: 'http://localhost:8080'
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
    return this;
  }

  /**
   * Get the current project ID
   */
  getCurrentProjectId(): string | null {
    return this.projects.getCurrentId();
  }
}

/**
 * Create a new Devabase client instance
 *
 * @example
 * import { createClient } from '@devabase/sdk';
 *
 * const client = createClient({
 *   baseUrl: 'http://localhost:8080',
 *   apiKey: 'dvb_your_api_key'
 * });
 */
export function createClient(config: DevabaseConfig): DevabaseClient {
  return new DevabaseClient(config);
}
