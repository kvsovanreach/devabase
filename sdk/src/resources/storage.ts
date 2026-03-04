import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface StorageFile {
  path: string;
  size: number;
  content_type: string;
  url: string;
  created_at?: string;
}

export class StorageResource {
  constructor(private http: HttpClient) {}

  /**
   * Upload a file to storage
   * @example
   * const file = await client.storage.upload({
   *   file: Buffer.from('Hello, World!'),
   *   path: 'assets/hello.txt',
   *   contentType: 'text/plain'
   * });
   */
  async upload(
    input: {
      file: Buffer | Blob;
      path: string;
      contentType?: string;
    },
    options?: RequestOptions
  ): Promise<StorageFile> {
    const formData = new FormData();

    if (input.file instanceof Buffer) {
      formData.append('file', new Blob([input.file]), input.path);
    } else {
      formData.append('file', input.file, input.path);
    }

    formData.append('path', input.path);

    return this.http.upload<StorageFile>('/v1/storage', formData, options);
  }

  /**
   * Get a file from storage
   * @example
   * const blob = await client.storage.get('assets/hello.txt');
   */
  async get(path: string, options?: RequestOptions): Promise<Blob> {
    const response = await fetch(`/v1/storage/${path}`, {
      method: 'GET',
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to get file: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * Delete a file from storage
   * @example
   * await client.storage.delete('assets/hello.txt');
   */
  async delete(path: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/storage/${path}`, options);
  }

  /**
   * Get the URL for a file
   * @example
   * const url = client.storage.getUrl('assets/logo.png');
   */
  getUrl(path: string): string {
    return `/v1/storage/${path}`;
  }
}
