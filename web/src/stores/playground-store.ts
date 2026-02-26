import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestHistoryItem {
  id: string;
  method: HttpMethod;
  path: string;
  body?: string;
  timestamp: number;
  status?: number;
  duration?: number;
}

export interface EndpointTemplate {
  method: HttpMethod;
  path: string;
  name: string;
  body?: Record<string, unknown>;
  description?: string;
}

export interface EndpointCategory {
  name: string;
  description?: string;
  endpoints: EndpointTemplate[];
}

interface PlaygroundState {
  // Request
  method: HttpMethod;
  path: string;
  body: string;
  headers: Record<string, string>;

  // Response
  response: string | null;
  status: number | null;
  duration: number | null;
  isLoading: boolean;
  error: string | null;

  // History
  history: RequestHistoryItem[];

  // Actions
  setMethod: (method: HttpMethod) => void;
  setPath: (path: string) => void;
  setBody: (body: string) => void;
  setHeaders: (headers: Record<string, string>) => void;
  setResponse: (response: string | null, status: number | null, duration: number | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addToHistory: (item: Omit<RequestHistoryItem, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
  loadFromHistory: (item: RequestHistoryItem) => void;
  loadFromTemplate: (template: EndpointTemplate) => void;
  reset: () => void;
}

export const usePlaygroundStore = create<PlaygroundState>()(
  persist(
    (set) => ({
      // Initial state
      method: 'GET',
      path: '/v1/collections',
      body: '',
      headers: {},
      response: null,
      status: null,
      duration: null,
      isLoading: false,
      error: null,
      history: [],

      // Actions
      setMethod: (method) => set({ method }),
      setPath: (path) => set({ path }),
      setBody: (body) => set({ body }),
      setHeaders: (headers) => set({ headers }),

      setResponse: (response, status, duration) =>
        set({ response, status, duration, error: null }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, response: null, status: null }),

      addToHistory: (item) =>
        set((state) => ({
          history: [
            {
              ...item,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            },
            ...state.history.slice(0, 49), // Keep last 50 items
          ],
        })),

      clearHistory: () => set({ history: [] }),

      loadFromHistory: (item) =>
        set({
          method: item.method,
          path: item.path,
          body: item.body || '',
        }),

      loadFromTemplate: (template) =>
        set({
          method: template.method,
          path: template.path,
          body: template.body ? JSON.stringify(template.body, null, 2) : '',
          response: null,
          status: null,
          duration: null,
          error: null,
        }),

      reset: () =>
        set({
          method: 'GET',
          path: '/v1/collections',
          body: '',
          response: null,
          status: null,
          duration: null,
          error: null,
        }),
    }),
    {
      name: 'playground-storage',
      partialize: (state) => ({
        history: state.history,
      }),
    }
  )
);

// Predefined endpoint templates
export const endpointCategories: EndpointCategory[] = [
  {
    name: 'Collections',
    endpoints: [
      { method: 'GET', path: '/v1/collections', name: 'List Collections' },
      {
        method: 'POST',
        path: '/v1/collections',
        name: 'Create Collection',
        body: { name: 'my_collection', dimensions: 1536, metric: 'cosine' },
      },
      { method: 'GET', path: '/v1/collections/:name', name: 'Get Collection' },
      { method: 'DELETE', path: '/v1/collections/:name', name: 'Delete Collection' },
    ],
  },
  {
    name: 'Documents',
    endpoints: [
      { method: 'GET', path: '/v1/documents', name: 'List Documents' },
      { method: 'GET', path: '/v1/documents/:id', name: 'Get Document' },
      { method: 'GET', path: '/v1/documents/:id/chunks', name: 'Get Document Chunks' },
      { method: 'DELETE', path: '/v1/documents/:id', name: 'Delete Document' },
    ],
  },
  {
    name: 'Vectors (Raw)',
    description: 'Low-level vector operations with raw embeddings. For semantic search with text, use Search or RAG endpoints.',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/vectors/upsert',
        name: 'Upsert Vectors',
        body: {
          collection: 'my_collection',
          vectors: [
            { id: 'vec_1', embedding: [0.1, 0.2, 0.3], metadata: { text: 'Hello world' } },
          ],
        },
      },
      {
        method: 'POST',
        path: '/v1/vectors/search',
        name: 'Search Vectors (Raw)',
        body: {
          collection: 'my_collection',
          embedding: [0.1, 0.2, 0.3],
          top_k: 5,
        },
      },
      { method: 'DELETE', path: '/v1/vectors/:id', name: 'Delete Vector' },
    ],
  },
  {
    name: 'RAG Retrieval',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/retrieve',
        name: 'Retrieve',
        body: {
          collection: 'my_collection',
          query: 'What is...?',
          top_k: 5,
        },
      },
      {
        method: 'POST',
        path: '/v1/retrieve/with-context',
        name: 'Retrieve with Context',
        body: {
          collection: 'my_collection',
          query: 'What is...?',
          top_k: 5,
        },
      },
    ],
  },
  {
    name: 'Tables',
    endpoints: [
      { method: 'GET', path: '/v1/tables', name: 'List Tables' },
      {
        method: 'POST',
        path: '/v1/tables',
        name: 'Create Table',
        body: {
          name: 'my_table',
          columns: [
            { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'varchar(255)', nullable: false },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      },
      { method: 'GET', path: '/v1/tables/:table', name: 'Get Table Schema' },
      { method: 'DELETE', path: '/v1/tables/:table', name: 'Delete Table' },
      { method: 'GET', path: '/v1/tables/:table/rows', name: 'List Rows' },
      {
        method: 'POST',
        path: '/v1/tables/:table/rows',
        name: 'Insert Row',
        body: { name: 'Example' },
      },
      { method: 'GET', path: '/v1/tables/:table/rows/:id', name: 'Get Row' },
      {
        method: 'PATCH',
        path: '/v1/tables/:table/rows/:id',
        name: 'Update Row',
        body: { name: 'Updated' },
      },
      { method: 'DELETE', path: '/v1/tables/:table/rows/:id', name: 'Delete Row' },
    ],
  },
  {
    name: 'SQL',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/sql/execute',
        name: 'Execute SQL',
        body: { query: 'SELECT * FROM my_table LIMIT 10' },
      },
      { method: 'GET', path: '/v1/sql/history', name: 'Query History' },
      { method: 'GET', path: '/v1/sql/schema', name: 'Get Schema' },
    ],
  },
];
