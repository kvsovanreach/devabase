import { HttpClient } from '../utils/http';
import {
  Table,
  CreateTableInput,
  QueryOptions,
  PaginatedResponse,
  PaginatedRowsResponse,
  BatchInsertResponse,
  RequestOptions,
} from '../types';

export class TablesResource {
  constructor(private http: HttpClient) {}

  /**
   * List all tables with pagination
   * @example
   * const result = await client.tables.list({ limit: 10 });
   * console.log(result.data); // Array of tables
   * console.log(result.pagination.total); // Total count
   */
  async list(query?: QueryOptions, options?: RequestOptions): Promise<PaginatedResponse<Table>> {
    return this.http.get<PaginatedResponse<Table>>('/v1/tables', query, options);
  }

  /**
   * Get a table by name
   * @example
   * const table = await client.tables.get('users');
   */
  async get(tableName: string, options?: RequestOptions): Promise<Table> {
    return this.http.get<Table>(`/v1/tables/${tableName}`, undefined, options);
  }

  /**
   * Create a new table
   * @example
   * const table = await client.tables.create({
   *   name: 'users',
   *   columns: [
   *     { name: 'id', type: 'uuid', primary: true },
   *     { name: 'email', type: 'text', unique: true },
   *     { name: 'name', type: 'text' },
   *     { name: 'created_at', type: 'timestamptz', default: 'now()' }
   *   ]
   * });
   */
  async create(input: CreateTableInput, options?: RequestOptions): Promise<Table> {
    return this.http.post<Table>('/v1/tables', input, options);
  }

  /**
   * Delete a table
   * @example
   * await client.tables.delete('users');
   */
  async delete(tableName: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(`/v1/tables/${tableName}`, options);
  }

  // =========================================================================
  // Row Operations
  // =========================================================================

  /**
   * Query rows from a table with pagination
   * @example
   * // Basic query
   * const result = await client.tables.rows('users').query();
   *
   * // With pagination
   * const result = await client.tables.rows('users').query({
   *   page: 1,
   *   per_page: 20,
   *   order: 'created_at:desc'
   * });
   *
   * // With filters
   * const result = await client.tables.rows('users').query({
   *   filter: 'status.eq=active&age.gte=18',
   *   select: 'id,name,email'
   * });
   *
   * // Cursor-based pagination
   * const page1 = await client.tables.rows('users').query({ limit: 50 });
   * const page2 = await client.tables.rows('users').query({
   *   cursor: page1.pagination.next_cursor
   * });
   */
  rows(tableName: string): TableRowsClient {
    return new TableRowsClient(this.http, tableName);
  }

  /**
   * Export table data
   * @example
   * const csv = await client.tables.export('users', 'csv');
   * const json = await client.tables.export('users', 'json');
   */
  async export(
    tableName: string,
    format: 'csv' | 'json' = 'json',
    options?: RequestOptions
  ): Promise<string> {
    return this.http.get<string>(
      `/v1/tables/${tableName}/export`,
      { format },
      options
    );
  }

  /**
   * Import data into a table
   * @example
   * const result = await client.tables.import('users', csvData, 'csv');
   */
  async import(
    tableName: string,
    data: string | Buffer,
    format: 'csv' | 'json' = 'json',
    options?: RequestOptions
  ): Promise<{ imported: number; errors: string[] }> {
    const formData = new FormData();
    const blob = new Blob([data], {
      type: format === 'csv' ? 'text/csv' : 'application/json',
    });
    formData.append('file', blob, `import.${format}`);

    return this.http.upload(
      `/v1/tables/${tableName}/import`,
      formData,
      options
    );
  }
}

/**
 * Fluent client for table row operations
 */
export class TableRowsClient {
  constructor(
    private http: HttpClient,
    private tableName: string
  ) {}

  /**
   * Query rows with pagination and filtering
   */
  async query<T = Record<string, unknown>>(
    queryOptions?: QueryOptions,
    options?: RequestOptions
  ): Promise<PaginatedRowsResponse<T>> {
    return this.http.get<PaginatedRowsResponse<T>>(
      `/v1/tables/${this.tableName}/rows`,
      queryOptions as Record<string, string | number | boolean | undefined>,
      options
    );
  }

  /**
   * Get all rows (auto-paginate)
   * @example
   * const allUsers = await client.tables.rows('users').all();
   */
  async all<T = Record<string, unknown>>(
    queryOptions?: Omit<QueryOptions, 'page' | 'per_page' | 'offset' | 'limit' | 'cursor'>,
    options?: RequestOptions
  ): Promise<T[]> {
    const allRows: T[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.query<T>({ ...queryOptions, cursor, limit: 1000 }, options);
      allRows.push(...result.rows);
      cursor = result.pagination.next_cursor;
    } while (cursor);

    return allRows;
  }

  /**
   * Get a single row by ID
   * @example
   * const user = await client.tables.rows('users').get('user-id');
   */
  async get<T = Record<string, unknown>>(
    rowId: string,
    options?: RequestOptions
  ): Promise<T> {
    const result = await this.http.get<{ row: T }>(
      `/v1/tables/${this.tableName}/rows/${rowId}`,
      undefined,
      options
    );
    return result.row;
  }

  /**
   * Insert a new row
   * @example
   * const user = await client.tables.rows('users').insert({
   *   email: 'user@example.com',
   *   name: 'John Doe'
   * });
   */
  async insert<T = Record<string, unknown>>(
    data: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    const result = await this.http.post<{ row: T }>(
      `/v1/tables/${this.tableName}/rows`,
      data,
      options
    );
    return result.row;
  }

  /**
   * Insert multiple rows in a single batch request
   * @example
   * const users = await client.tables.rows('users').insertMany([
   *   { email: 'user1@example.com', name: 'User 1' },
   *   { email: 'user2@example.com', name: 'User 2' },
   * ]);
   */
  async insertMany<T = Record<string, unknown>>(
    rows: Record<string, unknown>[],
    options?: RequestOptions
  ): Promise<T[]> {
    if (rows.length === 0) return [];
    if (rows.length === 1) return [await this.insert<T>(rows[0], options)];

    const result = await this.http.post<BatchInsertResponse<T>>(
      `/v1/tables/${this.tableName}/rows/batch`,
      { rows },
      options
    );
    return result.rows;
  }

  /**
   * Update a row by ID
   * @example
   * const user = await client.tables.rows('users').update('user-id', {
   *   name: 'Jane Doe'
   * });
   */
  async update<T = Record<string, unknown>>(
    rowId: string,
    data: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    const result = await this.http.patch<{ row: T }>(
      `/v1/tables/${this.tableName}/rows/${rowId}`,
      data,
      options
    );
    return result.row;
  }

  /**
   * Delete a row by ID
   * @example
   * await client.tables.rows('users').delete('user-id');
   */
  async delete(rowId: string, options?: RequestOptions): Promise<void> {
    await this.http.delete<void>(
      `/v1/tables/${this.tableName}/rows/${rowId}`,
      options
    );
  }

  /**
   * Count rows matching a filter
   * @example
   * const count = await client.tables.rows('users').count('status.eq=active');
   */
  async count(filter?: string, options?: RequestOptions): Promise<number> {
    const result = await this.query({ filter, limit: 1 }, options);
    return result.pagination.total;
  }

  /**
   * Check if a row exists
   * @example
   * const exists = await client.tables.rows('users').exists('user-id');
   */
  async exists(rowId: string, options?: RequestOptions): Promise<boolean> {
    try {
      await this.get(rowId, options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find first row matching filter
   * @example
   * const user = await client.tables.rows('users').findFirst('email.eq=user@example.com');
   */
  async findFirst<T = Record<string, unknown>>(
    filter: string,
    options?: RequestOptions
  ): Promise<T | null> {
    const result = await this.query<T>({ filter, limit: 1 }, options);
    return result.rows[0] ?? null;
  }
}
