import { HttpClient } from '../utils/http';
import { RequestOptions } from '../types';

export interface SqlResult {
  columns: Array<{ name: string; type_name: string }>;
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
}

export interface SqlHistoryEntry {
  id: string;
  query: string;
  row_count: number;
  execution_time_ms: number;
  created_at: string;
}

export interface TableSchema {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primary_key: boolean;
  }>;
}

export class SqlResource {
  constructor(private http: HttpClient) {}

  /**
   * Execute a SQL query (SELECT only)
   * @example
   * const result = await client.sql.execute('SELECT * FROM users WHERE status = $1', ['active']);
   */
  async execute(
    query: string,
    params?: unknown[],
    options?: RequestOptions & { limit?: number }
  ): Promise<SqlResult> {
    const { limit, ...reqOptions } = options ?? {};
    return this.http.post<SqlResult>(
      '/v1/sql/execute',
      { query, params, limit },
      reqOptions
    );
  }

  /**
   * Get query history
   * @example
   * const history = await client.sql.getHistory({ limit: 50 });
   */
  async getHistory(
    query?: { limit?: number },
    options?: RequestOptions
  ): Promise<SqlHistoryEntry[]> {
    return this.http.get<SqlHistoryEntry[]>('/v1/sql/history', query, options);
  }

  /**
   * Get schema information for all tables
   * @example
   * const schema = await client.sql.getSchema();
   */
  async getSchema(options?: RequestOptions): Promise<TableSchema[]> {
    return this.http.get<TableSchema[]>('/v1/sql/schema', undefined, options);
  }
}
