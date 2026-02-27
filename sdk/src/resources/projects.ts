import { HttpClient } from '../utils/http';
import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
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
   * List all projects for the current user
   * @example
   * const projects = await client.projects.list();
   */
  async list(options?: RequestOptions): Promise<Project[]> {
    return this.http.get<Project[]>('/v1/projects', undefined, options);
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
   * List API keys for a project
   * @example
   * const keys = await client.projects.apiKeys.list();
   */
  readonly apiKeys = {
    list: async (projectId?: string, options?: RequestOptions): Promise<ApiKey[]> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.get<ApiKey[]>(`/v1/projects/${id}/api-keys`, undefined, options);
    },

    create: async (
      input: CreateApiKeyInput,
      projectId?: string,
      options?: RequestOptions
    ): Promise<CreateApiKeyResponse> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.post<CreateApiKeyResponse>(`/v1/projects/${id}/api-keys`, input, options);
    },

    revoke: async (keyId: string, projectId?: string, options?: RequestOptions): Promise<void> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      await this.http.delete<void>(`/v1/projects/${id}/api-keys/${keyId}`, options);
    },
  };

  // =========================================================================
  // Members
  // =========================================================================

  /**
   * Project member management
   */
  readonly members = {
    list: async (projectId?: string, options?: RequestOptions): Promise<Array<{
      id: string;
      user_id: string;
      email: string;
      name: string;
      role: string;
      joined_at: string;
    }>> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.get(`/v1/projects/${id}/members`, undefined, options);
    },

    invite: async (
      email: string,
      role: 'admin' | 'member' | 'viewer' = 'member',
      projectId?: string,
      options?: RequestOptions
    ): Promise<{ id: string; email: string; role: string; expires_at: string }> => {
      const id = projectId ?? this.currentProjectId;
      if (!id) throw new Error('No project ID provided');
      return this.http.post(`/v1/projects/${id}/invitations`, { email, role }, options);
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
}
