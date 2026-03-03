import {
  DevabaseError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  RequestOptions,
} from '../types';

export interface HttpClientConfig {
  baseUrl: string;
  timeout: number;
  headers: Record<string, string>;
}

export class HttpClient {
  private config: HttpClientConfig;
  private token: string | null = null;
  private apiKey: string | null = null;
  private projectId: string | null = null;

  constructor(config: HttpClientConfig) {
    this.config = config;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
  }

  setProjectId(projectId: string | null): void {
    this.projectId = projectId;
  }

  getProjectId(): string | null {
    return this.projectId;
  }

  private getAuthHeader(): string | null {
    if (this.apiKey) {
      return `Bearer ${this.apiKey}`;
    }
    if (this.token) {
      return `Bearer ${this.token}`;
    }
    return null;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!response.ok) {
      let errorData: { error?: string; message?: string; details?: Record<string, unknown> } = {};

      if (isJson) {
        try {
          const parsed = await response.json() as { error?: string; message?: string; details?: Record<string, unknown> };
          errorData = parsed;
        } catch {
          // Ignore JSON parse errors
        }
      }

      const message = errorData.error || errorData.message || response.statusText;

      switch (response.status) {
        case 401:
          throw new AuthenticationError(message);
        case 403:
          throw new AuthorizationError(message);
        case 404:
          throw new NotFoundError(message);
        case 400:
        case 422:
          throw new ValidationError(message, errorData.details);
        case 429:
          const retryAfter = response.headers.get('retry-after');
          throw new RateLimitError(message, retryAfter ? parseInt(retryAfter) : undefined);
        default:
          throw new DevabaseError(message, 'API_ERROR', response.status, errorData.details);
      }
    }

    if (response.status === 204 || !isJson) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.config.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private buildHeaders(options?: RequestOptions): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...options?.headers,
    });

    const auth = this.getAuthHeader();
    if (auth) {
      headers.set('Authorization', auth);
    }

    if (this.projectId) {
      headers.set('X-Project-ID', this.projectId);
    }

    return headers;
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: RequestOptions
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.buildUrl(path, params), {
        method: 'GET',
        headers: this.buildHeaders(options),
        signal: options?.signal ?? controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'POST',
        headers: this.buildHeaders(options),
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal ?? controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'PATCH',
        headers: this.buildHeaders(options),
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal ?? controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'PUT',
        headers: this.buildHeaders(options),
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal ?? controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'DELETE',
        headers: this.buildHeaders(options),
        signal: options?.signal ?? controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async upload<T>(
    path: string,
    formData: FormData,
    options?: RequestOptions & { onProgress?: (progress: number) => void }
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout * 5; // Longer timeout for uploads
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Remove Content-Type to let browser set it with boundary
    const headers = this.buildHeaders(options);
    headers.delete('Content-Type');

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'POST',
        headers,
        body: formData,
        signal: options?.signal ?? controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async stream(
    path: string,
    body: unknown,
    onChunk: (chunk: string) => void,
    options?: RequestOptions
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout * 10; // Longer timeout for streams
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers = this.buildHeaders(options);
    headers.set('Accept', 'text/event-stream');

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options?.signal ?? controller.signal,
      });

      if (!response.ok) {
        await this.handleResponse(response);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new DevabaseError('Streaming not supported', 'STREAM_ERROR', 500);
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              onChunk(data);
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
