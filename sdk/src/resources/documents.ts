import { HttpClient } from '../utils/http';
import {
  Document,
  UploadDocumentInput,
  PaginatedResponse,
  QueryOptions,
  RequestOptions,
} from '../types';

export interface ListDocumentsOptions extends QueryOptions {
  /** Filter by status */
  status?: 'uploaded' | 'pending' | 'processing' | 'processed' | 'failed';
}

export class DocumentsResource {
  constructor(private http: HttpClient) {}

  /**
   * List documents in a collection with pagination
   * @example
   * const result = await client.documents.list('my-collection', { limit: 10 });
   * console.log(result.data); // Array of documents
   * console.log(result.pagination.total); // Total count
   */
  async list(
    collection: string,
    options?: ListDocumentsOptions & RequestOptions
  ): Promise<PaginatedResponse<Document>> {
    const { status, limit, offset, page, per_page, cursor, ...reqOptions } = options ?? {};
    return this.http.get<PaginatedResponse<Document>>(
      `/v1/collections/${collection}/documents`,
      { status, limit, offset, page, per_page, cursor },
      reqOptions
    );
  }

  /**
   * Get a document by ID
   * @example
   * const doc = await client.documents.get('document-id');
   */
  async get(documentId: string, options?: RequestOptions): Promise<Document> {
    return this.http.get<Document>(`/v1/documents/${documentId}`, undefined, options);
  }

  /**
   * Upload a document to a collection
   * @example
   * // From Buffer
   * const doc = await client.documents.upload('my-collection', {
   *   file: Buffer.from('Hello, World!'),
   *   filename: 'hello.txt'
   * });
   *
   * // From file path (Node.js)
   * import { readFileSync } from 'fs';
   * const doc = await client.documents.upload('my-collection', {
   *   file: readFileSync('document.pdf'),
   *   filename: 'document.pdf',
   *   metadata: { author: 'John Doe' }
   * });
   */
  async upload(
    collection: string,
    input: UploadDocumentInput,
    options?: RequestOptions & { onProgress?: (progress: number) => void }
  ): Promise<Document> {
    const formData = new FormData();

    // Handle different file input types
    if (input.file instanceof Buffer) {
      formData.append('file', new Blob([input.file]), input.filename);
    } else if (input.file instanceof Blob) {
      formData.append('file', input.file, input.filename);
    } else {
      // ReadableStream - need to collect it first
      const chunks: Uint8Array[] = [];
      const reader = (input.file as ReadableStream).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks);
      formData.append('file', blob, input.filename);
    }

    if (input.metadata) {
      formData.append('metadata', JSON.stringify(input.metadata));
    }

    if (input.extract_knowledge) {
      formData.append('extract_knowledge', 'true');
    }

    if (input.process) {
      formData.append('process', 'true');
    }

    return this.http.upload<Document>(
      `/v1/collections/${collection}/documents`,
      formData,
      options
    );
  }

  /**
   * Upload multiple documents
   * @example
   * const docs = await client.documents.uploadMany('my-collection', [
   *   { file: buffer1, filename: 'doc1.pdf' },
   *   { file: buffer2, filename: 'doc2.pdf' },
   * ]);
   */
  async uploadMany(
    collection: string,
    inputs: UploadDocumentInput[],
    options?: RequestOptions
  ): Promise<Document[]> {
    const results = await Promise.all(
      inputs.map((input) => this.upload(collection, input, options))
    );
    return results;
  }

  /**
   * Delete a document
   * @example
   * await client.documents.delete('document-id');
   */
  async delete(documentId: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/documents/${documentId}`, options);
  }

  /**
   * Reprocess a document (re-chunk and re-embed)
   * @example
   * const doc = await client.documents.reprocess('document-id');
   */
  async reprocess(documentId: string, options?: RequestOptions): Promise<Document> {
    return this.http.post<Document>(`/v1/documents/${documentId}/reprocess`, undefined, options);
  }

  /**
   * Get document chunks
   * @example
   * const chunks = await client.documents.chunks('document-id');
   */
  async chunks(
    documentId: string,
    options?: RequestOptions
  ): Promise<Array<{ id: string; content: string; metadata: Record<string, unknown> }>> {
    return this.http.get(`/v1/documents/${documentId}/chunks`, undefined, options);
  }

  /**
   * List all documents across collections
   * @example
   * const docs = await client.documents.listAll({ status: 'processed', limit: 50 });
   */
  async listAll(
    options?: ListDocumentsOptions & RequestOptions
  ): Promise<PaginatedResponse<Document>> {
    const { status, limit, offset, page, per_page, cursor, ...reqOptions } = options ?? {};
    return this.http.get<PaginatedResponse<Document>>(
      '/v1/documents',
      { status, limit, offset, page, per_page, cursor },
      reqOptions
    );
  }
}
