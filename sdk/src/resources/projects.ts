import { HttpClient } from '../utils/http';
import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  PaginatedResponse,
  ProjectMember,
  ProjectInvitation,
  QueryOptions,
  RequestOptions,
} from '../types';

export class ProjectsResource {
  private currentProjectId: string | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Set the current project for subsequent requests
   * @example
   * client.projects.use('project-id');
   */
  use(projectId: string): this {
    this.currentProjectId = projectId;
    return this;
  }

  /**
   * Get the current project ID
   */
  getCurrentId(): string | null {
    return this.currentProjectId;
  }

  /**
   * List all projects for the current user with pagination
   * @example
   * const result = await client.projects.list({ limit: 10 });
   * console.log(result.data); // Array of projects
   * console.log(result.pagination.total); // Total count
   */
  async list(query?: QueryOptions, options?: RequestOptions): Promise<PaginatedResponse<Project>> {
    return this.http.get<PaginatedResponse<Project>>('/v1/projects', query, options);
  }

  /**
   * Get a project by ID
   * @example
   * const project = await client.projects.get('project-id');
   */
  async get(projectId?: string, options?: RequestOptions): Promise<Project> {
    const id = projectId ?? this.currentProjectId;
    if (!id) throw new Error('No project ID provided. Use client.projects.use(id) first.');
    return this.http.get<Project>(`/v1/projects/${id}`, undefined, options);
  }

  /**
   * Create a new project
   * @example
   * const project = await client.projects.create({ name: 'My Project' });
   */
  async create(input: CreateProjectInput, options?: RequestOptions): Promise<Project> {
    return this.http.post<Project>('/v1/projects', input, options);
  }

  /**
   * Update a project
   * @example
   * const project = await client.projects.update('project-id', { name: 'New Name' });
   */
  async update(
    projectId: string | undefined,
    input: UpdateProjectInput,
    options?: RequestOptions
  ): Promise<Project> {
    const id = projectId ?? this.currentProjectId;
    if (!id) throw new Error('No project ID provided');
    return this.http.patch<Project>(`/v1/projects/${id}`, input, options);
  }

  /**
   * Delete a project
   * @example
   * await client.projects.delete('project-id');
   */
  async delete(projectId?: string, options?: RequestOptions): Promise<void> {
    const id = projectId ?? this.currentProjectId;
    if (!id) throw new Error('No project ID provided');
    await this.http.delete<void>(`/v1/projects/${id}`, options);
  }

  // =========================================================================
  // API Keys
  // =========================================================================

  /**
   * List API keys for a project with pagination
   * @example
   * const result = await client.projects.apiKeys.list(undefined, { limit: 10 });
   * console.log(result.data); // Array of API keys
   */
  readonly apiKeys = {
    list: async (projectId?: string, query?: QueryOptions, options?: RequestOptions): Promise<PaginatedResponse<ApiKey>> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.get<PaginatedResponse<ApiKey>>('/v1/keys', query, options);
    },

    /**
     * Get a specific API key by ID
     */
    get: async (keyId: string, options?: RequestOptions): Promise<ApiKey> => {
      return this.http.get<ApiKey>(`/v1/keys/${keyId}`, undefined, options);
    },

    create: async (
      input: CreateApiKeyInput,
      projectId?: string,
      options?: RequestOptions
    ): Promise<CreateApiKeyResponse> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.post<CreateApiKeyResponse>('/v1/keys', input, options);
    },

    /**
     * Toggle an API key's active status
     * @example
     * await client.projects.apiKeys.toggle('key-id', false); // Disable
     */
    toggle: async (keyId: string, isActive: boolean, options?: RequestOptions): Promise<ApiKey> => {
      return this.http.patch<ApiKey>(`/v1/keys/${keyId}`, { is_active: isActive }, options);
    },

    revoke: async (keyId: string, projectId?: string, options?: RequestOptions): Promise<void> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      await this.http.delete<void>(`/v1/keys/${keyId}`, options);
    },
  };

  // =========================================================================
  // Members
  // =========================================================================

  /**
   * Project member management with pagination
   */
  readonly members = {
    list: async (projectId?: string, query?: QueryOptions, options?: RequestOptions): Promise<PaginatedResponse<ProjectMember>> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.get<PaginatedResponse<ProjectMember>>(`/v1/projects/${id}/members`, query, options);
    },

    invite: async (
      email: string,
      role: 'admin' | 'member' | 'viewer' = 'member',
      projectId?: string,
      options?: RequestOptions
    ): Promise<ProjectInvitation> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.post<ProjectInvitation>(`/v1/projects/${id}/invitations`, { email, role }, options);
    },

    remove: async (memberId: string, projectId?: string, options?: RequestOptions): Promise<void> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      await this.http.delete(`/v1/projects/${id}/members/${memberId}`, options);
    },

    updateRole: async (
      memberId: string,
      role: 'admin' | 'member' | 'viewer',
      projectId?: string,
      options?: RequestOptions
    ): Promise<void> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      await this.http.patch(`/v1/projects/${id}/members/${memberId}`, { role }, options);
    },
  };

  // =========================================================================
  // Invitations
  // =========================================================================

  /**
   * Project invitation management with pagination
   */
  readonly invitations = {
    list: async (projectId?: string, query?: QueryOptions, options?: RequestOptions): Promise<PaginatedResponse<ProjectInvitation>> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.get<PaginatedResponse<ProjectInvitation>>(`/v1/projects/${id}/invitations`, query, options);
    },

    revoke: async (invitationId: string, projectId?: string, options?: RequestOptions): Promise<void> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      await this.http.delete(`/v1/projects/${id}/invitations/${invitationId}`, options);
    },

    /**
     * Accept a project invitation using the token from the invitation email
     * @example
     * await client.projects.invitations.accept('invitation-token');
     */
    accept: async (token: string, options?: RequestOptions): Promise<void> => {
      await this.http.post<void>(`/v1/invitations/${token}/accept`, undefined, options);
    },
  };
}
