import { HttpClient } from '../utils/http';
import {
  User,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  RequestOptions,
} from '../types';

export class AuthResource {
  constructor(private http: HttpClient) {}

  /**
   * Login with email and password
   * @example
   * const auth = await client.auth.login({ email: 'user@example.com', password: 'secret' });
   * console.log(auth.user.name);
   */
  async login(credentials: LoginCredentials, options?: RequestOptions): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>('/v1/auth/login', credentials, options);
    this.http.setToken(response.token);
    return response;
  }

  /**
   * Register a new user
   * @example
   * const auth = await client.auth.register({
   *   email: 'user@example.com',
   *   password: 'secret',
   *   name: 'John Doe'
   * });
   */
  async register(credentials: RegisterCredentials, options?: RequestOptions): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>('/v1/auth/register', credentials, options);
    this.http.setToken(response.token);
    return response;
  }

  /**
   * Refresh the access token
   * @example
   * const newAuth = await client.auth.refresh(refreshToken);
   */
  async refresh(refreshToken: string, options?: RequestOptions): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>(
      '/v1/auth/refresh',
      { refresh_token: refreshToken },
      options
    );
    this.http.setToken(response.token);
    return response;
  }

  /**
   * Logout and invalidate tokens
   * @example
   * await client.auth.logout();
   */
  async logout(options?: RequestOptions): Promise<void> {
    await this.http.post<void>('/v1/auth/logout', undefined, options);
    this.http.setToken(null);
  }

  /**
   * Get the current authenticated user
   * @example
   * const user = await client.auth.me();
   * console.log(user.email);
   */
  async me(options?: RequestOptions): Promise<User> {
    return this.http.get<User>('/v1/users/me', undefined, options);
  }

  /**
   * Update the current user's profile
   * @example
   * const user = await client.auth.updateProfile({ name: 'New Name' });
   */
  async updateProfile(
    data: { name?: string; avatar_url?: string },
    options?: RequestOptions
  ): Promise<User> {
    return this.http.patch<User>('/v1/users/me', data, options);
  }

  /**
   * Change the current user's password
   * @example
   * await client.auth.changePassword('oldPassword', 'newPassword');
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/change-password',
      { current_password: currentPassword, new_password: newPassword },
      options
    );
  }

  /**
   * Request a password reset email
   * @example
   * await client.auth.forgotPassword('user@example.com');
   */
  async forgotPassword(email: string, options?: RequestOptions): Promise<void> {
    await this.http.post<void>('/v1/auth/forgot-password', { email }, options);
  }

  /**
   * Reset password with token from email
   * @example
   * await client.auth.resetPassword(token, 'newPassword');
   */
  async resetPassword(token: string, newPassword: string, options?: RequestOptions): Promise<void> {
    await this.http.post<void>(
      '/v1/auth/reset-password',
      { token, new_password: newPassword },
      options
    );
  }

  /**
   * Set the authentication token manually
   * @example
   * client.auth.setToken('your-jwt-token');
   */
  setToken(token: string | null): void {
    this.http.setToken(token);
  }
}
