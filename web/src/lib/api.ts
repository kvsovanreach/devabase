import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
  Project,
  ProjectMember,
  CreateProjectRequest,
  UpdateProjectRequest,
  Collection,
  CreateCollectionRequest,
  Document,
  Chunk,
  SearchRequest,
  SearchResult,
  HybridSearchRequest,
  HybridSearchResult,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  Prompt,
  CreatePromptRequest,
  Invitation,
  CreateInvitationRequest,
  ApiError,
} from '@/types';
import { API_CONFIG, SECURITY_CONFIG, logger } from './config';

class ApiClient {
  private client: AxiosInstance;
  private projectId: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_CONFIG.baseUrl}/v1`,
      timeout: API_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token and security headers to requests
    this.client.interceptors.request.use((config) => {
      const token = this.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      if (this.projectId) {
        config.headers['X-Project-ID'] = this.projectId;
      }
      // Add request timestamp for debugging
      config.headers['X-Request-Time'] = new Date().toISOString();
      return config;
    });

    // Handle auth errors with improved error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        // Network error handling
        if (!error.response) {
          logger.error('Network error:', error.message);
          return Promise.reject(new Error('Network error. Please check your connection.'));
        }

        if (error.response?.status === 401) {
          const refreshToken = this.getRefreshToken();
          if (refreshToken && error.config && !error.config.headers['X-Retry']) {
            try {
              const { token, refresh_token } = await this.refreshToken(refreshToken);
              this.setTokens(token, refresh_token);
              error.config.headers.Authorization = `Bearer ${token}`;
              error.config.headers['X-Retry'] = 'true';
              return this.client.request(error.config);
            } catch {
              logger.debug('Token refresh failed, redirecting to login');
              this.clearTokens();
              // Use router instead of direct location change to preserve state
              if (typeof window !== 'undefined') {
                window.location.href = '/login';
              }
            }
          }
        }

        // Extract error message safely
        const errorMessage = error.response?.data?.message ||
                            error.response?.data?.error ||
                            'An unexpected error occurred';
        return Promise.reject(new Error(errorMessage));
      }
    );
  }

  // Token management with secure keys
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(SECURITY_CONFIG.tokenKey);
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(SECURITY_CONFIG.refreshTokenKey);
  }

  setTokens(token: string, refreshToken: string): void {
    localStorage.setItem(SECURITY_CONFIG.tokenKey, token);
    localStorage.setItem(SECURITY_CONFIG.refreshTokenKey, refreshToken);
  }

  clearTokens(): void {
    localStorage.removeItem(SECURITY_CONFIG.tokenKey);
    localStorage.removeItem(SECURITY_CONFIG.refreshTokenKey);
    localStorage.removeItem(SECURITY_CONFIG.projectIdKey);
    this.projectId = null;
  }

  setProjectId(projectId: string | null): void {
    this.projectId = projectId;
    if (projectId) {
      localStorage.setItem(SECURITY_CONFIG.projectIdKey, projectId);
    } else {
      localStorage.removeItem(SECURITY_CONFIG.projectIdKey);
    }
  }

  getStoredProjectId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(SECURITY_CONFIG.projectIdKey);
  }

  getStoredToken(): string | null {
    return this.getToken();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Auth endpoints
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/register', data);
    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', data);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } finally {
      // Always clear tokens even if logout request fails
      this.clearTokens();
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  }

  async getMe(): Promise<User> {
    const response = await this.client.get<User>('/auth/me');
    return response.data;
  }

  async updateMe(data: { name?: string; avatar_url?: string }): Promise<User> {
    const response = await this.client.patch<User>('/auth/me', data);
    return response.data;
  }

  // Project endpoints
  async listProjects(): Promise<Project[]> {
    const response = await this.client.get<{ data: Project[]; pagination: unknown }>('/projects');
    // Backend returns paginated response, extract the data array
    return response.data.data;
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    const response = await this.client.post<Project>('/projects', data);
    return response.data;
  }

  async getProject(id: string): Promise<Project> {
    const response = await this.client.get<Project>(`/projects/${id}`);
    return response.data;
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    const response = await this.client.patch<Project>(`/projects/${id}`, data);
    return response.data;
  }

  async deleteProject(id: string): Promise<void> {
    await this.client.delete(`/projects/${id}`);
  }

  // Project members
  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const response = await this.client.get<{ data: ProjectMember[]; pagination: unknown }>(`/projects/${projectId}/members`);
    // Backend returns paginated response, extract the data array
    return response.data.data;
  }

  async addMember(projectId: string, userId: string, role?: string): Promise<ProjectMember> {
    const response = await this.client.post<ProjectMember>(`/projects/${projectId}/members`, {
      user_id: userId,
      role,
    });
    return response.data;
  }

  async updateMember(projectId: string, userId: string, role: string): Promise<ProjectMember> {
    const response = await this.client.patch<ProjectMember>(
      `/projects/${projectId}/members/${userId}`,
      { role }
    );
    return response.data;
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.client.delete(`/projects/${projectId}/members/${userId}`);
  }

  // Invitations
  async listInvitations(projectId: string): Promise<Invitation[]> {
    const response = await this.client.get<{ data: Invitation[]; pagination: unknown }>(`/projects/${projectId}/invitations`);
    // Backend returns paginated response, extract the data array
    return response.data.data;
  }

  async createInvitation(projectId: string, data: CreateInvitationRequest): Promise<Invitation> {
    const response = await this.client.post<Invitation>(
      `/projects/${projectId}/invitations`,
      data
    );
    return response.data;
  }

  async revokeInvitation(projectId: string, invitationId: string): Promise<void> {
    await this.client.delete(`/projects/${projectId}/invitations/${invitationId}`);
  }

  async acceptInvitation(token: string): Promise<ProjectMember> {
    const response = await this.client.post<ProjectMember>(`/invitations/${token}/accept`);
    return response.data;
  }

  // Collection endpoints
  async listCollections(): Promise<Collection[]> {
    const response = await this.client.get<{ data: Collection[]; pagination: unknown }>('/collections');
    // Backend returns paginated response, extract the data array
    return response.data.data;
  }

  async createCollection(data: CreateCollectionRequest): Promise<Collection> {
    const response = await this.client.post<Collection>('/collections', data);
    return response.data;
  }

  async getCollection(name: string): Promise<Collection> {
    const response = await this.client.get<Collection>(`/collections/${encodeURIComponent(name)}`);
    return response.data;
  }

  async deleteCollection(name: string): Promise<void> {
    await this.client.delete(`/collections/${encodeURIComponent(name)}`);
  }

  async updateCollection(name: string, data: {
    rag_enabled?: boolean;
    rag_config?: {
      llm_provider_id: string;
      model: string;
      system_prompt: string;
      top_k: number;
      temperature: number;
      max_tokens: number;
    } | null;
    metadata?: Record<string, unknown>;
  }): Promise<Collection> {
    const response = await this.client.patch<Collection>(`/collections/${encodeURIComponent(name)}`, data);
    return response.data;
  }

  // Document endpoints
  async listDocuments(collection: string): Promise<Document[]> {
    const response = await this.client.get<{ data: Document[]; pagination: unknown }>('/documents', {
      params: { collection },
    });
    // Backend returns paginated response, extract the data array
    return response.data.data;
  }

  async uploadDocument(
    collection: string,
    file: File,
    name?: string,
    onProgress?: (progress: number) => void
  ): Promise<Document> {
    const formData = new FormData();
    formData.append('collection', collection);
    formData.append('file', file);
    if (name) {
      formData.append('name', name);
    }

    const response = await this.client.post<Document>(
      '/documents/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: API_CONFIG.uploadTimeout, // 5 minutes for uploads
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      }
    );
    return response.data;
  }

  async getDocument(collection: string, id: string): Promise<Document> {
    const response = await this.client.get<Document>(`/documents/${id}`);
    return response.data;
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    await this.client.delete(`/documents/${id}`);
  }

  async getDocumentChunks(id: string): Promise<Chunk[]> {
    const response = await this.client.get<Chunk[]>(`/documents/${id}/chunks`);
    return response.data;
  }

  // Search/Retrieve endpoint
  async search(data: SearchRequest): Promise<SearchResult[]> {
    const response = await this.client.post<SearchResult[]>('/retrieve', {
      collection: data.collection,
      query: data.query,
      top_k: data.limit,
      filter: data.filter,
      rerank: data.rerank,
    });
    return response.data;
  }

  // Hybrid search endpoint (vector + keyword/BM25)
  async hybridSearch(data: HybridSearchRequest): Promise<HybridSearchResult[]> {
    const collection = encodeURIComponent(data.collection);
    const response = await this.client.post<HybridSearchResult[]>(
      `/collections/${collection}/vectors/hybrid-search`,
      {
        query: data.query,
        top_k: data.limit || 10,
        vector_weight: data.vector_weight,
        keyword_weight: data.keyword_weight,
        filter: data.filter,
      }
    );
    return response.data;
  }

  // API Key endpoints
  async listApiKeys(): Promise<ApiKey[]> {
    const response = await this.client.get<{ data: ApiKey[]; pagination: unknown }>('/keys');
    // Backend returns paginated response, extract the data array
    return response.data.data;
  }

  async createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const response = await this.client.post<CreateApiKeyResponse>('/keys', data);
    return response.data;
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.client.delete(`/keys/${id}`);
  }

  // Prompt endpoints
  async listPrompts(): Promise<Prompt[]> {
    const response = await this.client.get<{ data: Prompt[]; pagination: unknown }>('/prompts');
    // Backend returns paginated response, extract the data array
    return response.data.data;
  }

  async createPrompt(data: CreatePromptRequest): Promise<Prompt> {
    const response = await this.client.post<Prompt>('/prompts', data);
    return response.data;
  }

  async getPrompt(id: string): Promise<Prompt> {
    const response = await this.client.get<Prompt>(`/prompts/${id}`);
    return response.data;
  }

  async updatePrompt(id: string, data: Partial<CreatePromptRequest>): Promise<Prompt> {
    const response = await this.client.patch<Prompt>(`/prompts/${id}`, data);
    return response.data;
  }

  async deletePrompt(id: string): Promise<void> {
    await this.client.delete(`/prompts/${id}`);
  }

  // Provider Testing
  async testLLMProvider(data: {
    provider_type: string;
    api_key: string;
    base_url?: string;
    model: string;
  }): Promise<{ success: boolean; message: string; response?: string }> {
    const response = await this.client.post<{ success: boolean; message: string; response?: string }>(
      '/providers/test-llm',
      data
    );
    return response.data;
  }

  async testEmbeddingProvider(data: {
    provider_type: string;
    api_key: string;
    base_url?: string;
    model: string;
  }): Promise<{ success: boolean; message: string; response?: string }> {
    const response = await this.client.post<{ success: boolean; message: string; response?: string }>(
      '/providers/test-embedding',
      data
    );
    return response.data;
  }

  // Generic HTTP methods for hooks
  async get<T>(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: T }> {
    return this.client.get<T>(url, config);
  }

  async post<T>(url: string, data?: unknown): Promise<{ data: T }> {
    return this.client.post<T>(url, data);
  }

  // For long-running operations like knowledge extraction
  async postLongRunning<T>(url: string, data?: unknown): Promise<{ data: T }> {
    return this.client.post<T>(url, data, {
      timeout: API_CONFIG.longRunningTimeout,
    });
  }

  async patch<T>(url: string, data?: unknown): Promise<{ data: T }> {
    return this.client.patch<T>(url, data);
  }

  async delete(url: string): Promise<void> {
    await this.client.delete(url);
  }
}

export const api = new ApiClient();
export default api;
