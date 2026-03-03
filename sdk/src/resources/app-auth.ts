import { HttpClient } from '../utils/http';
import {
  AppUser,
  AppAuthResponse,
  AppUserRegisterInput,
  AppUserLoginInput,
  AppUserUpdateInput,
  AppUserChangePasswordInput,
  AppUserAdminUpdateInput,
  RequestOptions,
  PaginatedResponse,
  QueryOptions,
} from '../types';

/**
 * Application User Authentication Resource
 *
 * Provides authentication endpoints for end-users of applications built with Devabase.
 * SDK users can use this to add authentication to their applications without building
 * their own auth system.
 *
 * @example
 * // Initialize with project-scoped API key
 * const client = createClient({
 *   baseUrl: 'http://localhost:9002',
 *   apiKey: 'dvb_your_project_api_key'
 * });
 * client.useProject('your-project-id');
 *
 * // Register a new user
 * const auth = await client.appAuth.register({
 *   email: 'user@example.com',
 *   password: 'securePassword123'
 * });
 *
 * // Login
 * const auth = await client.appAuth.login({
 *   email: 'user@example.com',
 *   password: 'securePassword123'
 * });
 *
 * // Use the access token for authenticated requests
 * client.appAuth.setToken(auth.access_token);
 */
export class AppAuthResource {
  private appToken: string | null = null;

  constructor(private http: HttpClient) {}

  // ============================================================================
  // Public User Endpoints (for app end-users)
  // ============================================================================

  /**
   * Register a new application user
   * @example
   * const auth = await client.appAuth.register({
   *   email: 'user@example.com',
   *   password: 'securePassword123',
   *   name: 'John Doe'
   * });
   */
  async register(
    input: AppUserRegisterInput,
    options?: RequestOptions
  ): Promise<AppAuthResponse> {
    const response = await this.http.post<AppAuthResponse>(
      '/v1/auth/app/register',
      input,
      options
    );
    this.appToken = response.access_token;
    return response;
  }

  /**
   * Login an application user
   * @example
   * const auth = await client.appAuth.login({
   *   email: 'user@example.com',
   *   password: 'securePassword123'
   * });
   * // Access token is automatically stored for subsequent requests
   */
  async login(
    input: AppUserLoginInput,
    options?: RequestOptions
  ): Promise<AppAuthResponse> {
    const response = await this.http.post<AppAuthResponse>(
      '/v1/auth/app/login',
      input,
      options
    );
    this.appToken = response.access_token;
    return response;
  }

  /**
   * Refresh the access token using a refresh token
   * @example
   * const newAuth = await client.appAuth.refresh(refreshToken);
   */
  async refresh(
    refreshToken: string,
    options?: RequestOptions
  ): Promise<AppAuthResponse> {
    const response = await this.http.post<AppAuthResponse>(
      '/v1/auth/app/refresh',
      { refresh_token: refreshToken },
      options
    );
    this.appToken = response.access_token;
    return response;
  }

  /**
   * Logout the current application user
   * @example
   * await client.appAuth.logout();
   */
  async logout(options?: RequestOptions): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/app/logout',
      undefined,
      this.withAppToken(options)
    );
    this.appToken = null;
  }

  /**
   * Get the current authenticated application user
   * @example
   * const user = await client.appAuth.me();
   * console.log(user.email);
   */
  async me(options?: RequestOptions): Promise<AppUser> {
    return this.http.get<AppUser>(
      '/v1/auth/app/me',
      undefined,
      this.withAppToken(options)
    );
  }

  /**
   * Update the current application user's profile
   * @example
   * const user = await client.appAuth.updateProfile({
   *   name: 'Jane Doe',
   *   metadata: { preferences: { theme: 'dark' } }
   * });
   */
  async updateProfile(
    data: AppUserUpdateInput,
    options?: RequestOptions
  ): Promise<AppUser> {
    return this.http.patch<AppUser>(
      '/v1/auth/app/me',
      data,
      this.withAppToken(options)
    );
  }

  /**
   * Delete the current application user's account
   * @example
   * await client.appAuth.deleteAccount();
   */
  async deleteAccount(options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(
      '/v1/auth/app/me',
      this.withAppToken(options)
    );
    this.appToken = null;
  }

  /**
   * Change the current application user's password
   * @example
   * await client.appAuth.changePassword({
   *   current_password: 'oldPassword',
   *   new_password: 'newSecurePassword123'
   * });
   */
  async changePassword(
    input: AppUserChangePasswordInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/app/password',
      input,
      this.withAppToken(options)
    );
  }

  /**
   * Request a password reset email
   * @example
   * await client.appAuth.forgotPassword('user@example.com');
   */
  async forgotPassword(email: string, options?: RequestOptions): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/app/forgot-password',
      { email },
      options
    );
  }

  /**
   * Reset password using token from email
   * @example
   * await client.appAuth.resetPassword(token, 'newSecurePassword123');
   */
  async resetPassword(
    token: string,
    newPassword: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/app/reset-password',
      { token, new_password: newPassword },
      options
    );
  }

  /**
   * Verify email address using token from email
   * @example
   * await client.appAuth.verifyEmail(token);
   */
  async verifyEmail(token: string, options?: RequestOptions): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/app/verify-email',
      { token },
      options
    );
  }

  /**
   * Resend email verification
   * @example
   * await client.appAuth.resendVerification();
   */
  async resendVerification(options?: RequestOptions): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/app/resend-verification',
      undefined,
      this.withAppToken(options)
    );
  }

  /**
   * Set the application user token manually
   * Use this when you've stored the token and want to restore the session
   * @example
   * client.appAuth.setToken(storedAccessToken);
   */
  setToken(token: string | null): void {
    this.appToken = token;
  }

  /**
   * Get the current application user token
   * @example
   * const token = client.appAuth.getToken();
   */
  getToken(): string | null {
    return this.appToken;
  }

  // ============================================================================
  // Admin Endpoints (for managing app users)
  // ============================================================================

  /**
   * Admin: List all application users for the project
   * @example
   * const result = await client.appAuth.users.list({ limit: 20 });
   * console.log(result.data); // Array of AppUser
   * console.log(result.pagination); // Pagination info
   */
  users = {
    list: async (
      query?: QueryOptions,
      options?: RequestOptions
    ): Promise<PaginatedResponse<AppUser>> => {
      return this.http.get<PaginatedResponse<AppUser>>(
        '/v1/auth/app/users',
        query,
        options
      );
    },

    /**
     * Admin: Get a specific application user by ID
     * @example
     * const user = await client.appAuth.users.get('user-id');
     */
    get: async (id: string, options?: RequestOptions): Promise<AppUser> => {
      return this.http.get<AppUser>(
        `/v1/auth/app/users/${id}`,
        undefined,
        options
      );
    },

    /**
     * Admin: Update an application user
     * @example
     * const user = await client.appAuth.users.update('user-id', {
     *   status: 'suspended'
     * });
     */
    update: async (
      id: string,
      data: AppUserAdminUpdateInput,
      options?: RequestOptions
    ): Promise<AppUser> => {
      return this.http.patch<AppUser>(
        `/v1/auth/app/users/${id}`,
        data,
        options
      );
    },

    /**
     * Admin: Delete an application user
     * @example
     * await client.appAuth.users.delete('user-id');
     */
    delete: async (id: string, options?: RequestOptions): Promise<void> => {
      return this.http.delete<void>(
        `/v1/auth/app/users/${id}`,
        options
      );
    },
  };

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Add app token to request options if available
   */
  private withAppToken(options?: RequestOptions): RequestOptions | undefined {
    if (!this.appToken) {
      return options;
    }

    return {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${this.appToken}`,
      },
    };
  }
}
