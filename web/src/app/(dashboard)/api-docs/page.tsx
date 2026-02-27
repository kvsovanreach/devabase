'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useProjectStore } from '@/stores/project-store';
import { useCollections } from '@/hooks/use-collections';
import { useTables } from '@/hooks/use-tables';
import { useApiKeys } from '@/hooks/use-api-keys';
import { cn } from '@/lib/utils';
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Table2,
  Search,
  MessageSquare,
  FileText,
  Database,
  Key,
  Zap,
} from 'lucide-react';
import { API_CONFIG } from '@/lib/config';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Endpoint {
  method: HttpMethod;
  path: string;
  name: string;
  description: string;
  requestBody?: Record<string, unknown>;
  responseExample?: Record<string, unknown> | Record<string, unknown>[];
  pathParams?: { name: string; description: string }[];
  queryParams?: { name: string; description: string; required?: boolean }[];
}

interface EndpointCategory {
  name: string;
  icon: React.ReactNode;
  description: string;
  endpoints: Endpoint[];
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  PATCH: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  PUT: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
};

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-[#1e1e1e] text-gray-300 rounded-lg p-3 overflow-x-auto text-[12px] font-mono">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
        title="Copy to clipboard"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function EndpointCard({
  endpoint,
  baseUrl,
  projectId,
  apiKeyExample,
}: {
  endpoint: Endpoint;
  baseUrl: string;
  projectId: string;
  apiKeyExample: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Replace path params with example values
  const displayPath = endpoint.path
    .replace(':name', '{collection_name}')
    .replace(':id', '{id}')
    .replace(':table', '{table_name}');

  const curlExample = useMemo(() => {
    let curl = `curl -X ${endpoint.method} "${baseUrl}${endpoint.path}"`;
    curl += ` \\\n  -H "Authorization: Bearer ${apiKeyExample}"`;
    curl += ` \\\n  -H "X-Project-ID: ${projectId}"`;

    if (endpoint.requestBody) {
      curl += ` \\\n  -H "Content-Type: application/json"`;
      curl += ` \\\n  -d '${JSON.stringify(endpoint.requestBody, null, 2)}'`;
    }

    return curl;
  }, [endpoint, baseUrl, projectId, apiKeyExample]);

  return (
    <div className="border border-border-light rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-hover transition-colors text-left"
      >
        <span
          className={cn(
            'px-2 py-0.5 rounded text-[10px] font-bold uppercase border',
            methodColors[endpoint.method]
          )}
        >
          {endpoint.method}
        </span>
        <code className="text-[13px] font-mono text-foreground flex-1">{displayPath}</code>
        <span className="text-[12px] text-text-secondary hidden sm:block">{endpoint.name}</span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-tertiary" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border-light p-3 space-y-3 bg-surface-secondary/30">
          <p className="text-[13px] text-text-secondary">{endpoint.description}</p>

          {endpoint.pathParams && endpoint.pathParams.length > 0 && (
            <div>
              <h4 className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Path Parameters
              </h4>
              <div className="space-y-1">
                {endpoint.pathParams.map((param) => (
                  <div key={param.name} className="flex items-start gap-2 text-[13px]">
                    <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-primary font-mono">
                      {param.name}
                    </code>
                    <span className="text-text-secondary">{param.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.queryParams && endpoint.queryParams.length > 0 && (
            <div>
              <h4 className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Query Parameters
              </h4>
              <div className="space-y-1">
                {endpoint.queryParams.map((param) => (
                  <div key={param.name} className="flex items-start gap-2 text-[13px]">
                    <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-primary font-mono">
                      {param.name}
                    </code>
                    {param.required && (
                      <span className="text-[10px] text-error font-medium">required</span>
                    )}
                    <span className="text-text-secondary">{param.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.requestBody && (
            <div>
              <h4 className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Request Body
              </h4>
              <CodeBlock
                code={JSON.stringify(endpoint.requestBody, null, 2)}
                language="json"
              />
            </div>
          )}

          <div>
            <h4 className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
              Example Request
            </h4>
            <CodeBlock code={curlExample} language="bash" />
          </div>

          {endpoint.responseExample && (
            <div>
              <h4 className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Example Response
              </h4>
              <CodeBlock
                code={JSON.stringify(endpoint.responseExample, null, 2)}
                language="json"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  const { currentProject } = useProjectStore();
  const { data: collections } = useCollections();
  const { data: tables } = useTables();
  const { data: apiKeys } = useApiKeys();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Dynamic values
  const projectId = currentProject?.id || 'your-project-id';
  const baseUrl = `${API_CONFIG.baseUrl}/v1`;
  const exampleCollection = collections?.[0]?.name || 'my_collection';
  const exampleTable = tables?.[0]?.name || 'my_table';
  const apiKeyExample = apiKeys?.[0]?.prefix
    ? `${apiKeys[0].prefix}...`
    : 'deva_xxxxxxxxxxxx';

  // Define all endpoint categories with dynamic examples
  const categories: EndpointCategory[] = useMemo(
    () => [
      {
        name: 'Collections',
        icon: <FolderOpen className="w-5 h-5" />,
        description: 'Manage vector collections for storing and searching embeddings',
        endpoints: [
          {
            method: 'GET',
            path: '/collections',
            name: 'List Collections',
            description: 'Retrieve all collections in the project',
            responseExample: [
              {
                id: 'uuid',
                name: exampleCollection,
                dimensions: 1536,
                metric: 'cosine',
                vector_count: 1000,
                document_count: 50,
              },
            ],
          },
          {
            method: 'POST',
            path: '/collections',
            name: 'Create Collection',
            description: 'Create a new vector collection',
            requestBody: {
              name: 'new_collection',
              dimensions: 1536,
              metric: 'cosine',
            },
          },
          {
            method: 'GET',
            path: `/collections/:name`,
            name: 'Get Collection',
            description: 'Get details of a specific collection',
            pathParams: [{ name: 'name', description: 'Collection name' }],
          },
          {
            method: 'PATCH',
            path: `/collections/:name`,
            name: 'Update Collection',
            description: 'Update collection settings including RAG configuration',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              rag_enabled: true,
              rag_config: {
                llm_provider_id: 'openai-1',
                model: 'gpt-4o-mini',
                system_prompt: 'You are a helpful assistant.',
                temperature: 0.7,
                max_tokens: 1000,
                top_k: 5,
              },
            },
          },
          {
            method: 'DELETE',
            path: `/collections/:name`,
            name: 'Delete Collection',
            description: 'Delete a collection and all its vectors',
            pathParams: [{ name: 'name', description: 'Collection name' }],
          },
        ],
      },
      {
        name: 'Documents',
        icon: <FileText className="w-5 h-5" />,
        description: 'Upload and manage documents for RAG pipelines',
        endpoints: [
          {
            method: 'GET',
            path: '/documents',
            name: 'List Documents',
            description: 'List all documents across collections',
            queryParams: [
              { name: 'collection', description: 'Filter by collection name' },
              { name: 'status', description: 'Filter by status (pending, processing, processed, failed)' },
              { name: 'limit', description: 'Number of results (default: 50)' },
              { name: 'offset', description: 'Pagination offset' },
            ],
          },
          {
            method: 'POST',
            path: '/documents/upload',
            name: 'Upload Document',
            description: 'Upload a document to be processed and embedded. Supports PDF, TXT, MD, DOCX, and more.',
            requestBody: {
              collection: exampleCollection,
              file: '(multipart file upload)',
              metadata: { source: 'api' },
            },
          },
          {
            method: 'GET',
            path: '/documents/:id',
            name: 'Get Document',
            description: 'Get document details including processing status',
            pathParams: [{ name: 'id', description: 'Document UUID' }],
          },
          {
            method: 'GET',
            path: '/documents/:id/chunks',
            name: 'Get Document Chunks',
            description: 'Retrieve all text chunks for a document',
            pathParams: [{ name: 'id', description: 'Document UUID' }],
          },
          {
            method: 'DELETE',
            path: '/documents/:id',
            name: 'Delete Document',
            description: 'Delete a document and its associated vectors',
            pathParams: [{ name: 'id', description: 'Document UUID' }],
          },
        ],
      },
      {
        name: 'Vector Search',
        icon: <Search className="w-5 h-5" />,
        description: 'Search vectors using embeddings or text queries',
        endpoints: [
          {
            method: 'POST',
            path: '/vectors/search',
            name: 'Search by Embedding',
            description: 'Search vectors using a raw embedding array. Use this for low-level vector operations.',
            requestBody: {
              collection: exampleCollection,
              embedding: [0.1, 0.2, '...', 0.3],
              top_k: 10,
              filter: { category: 'docs' },
            },
          },
          {
            method: 'POST',
            path: '/vectors/upsert',
            name: 'Upsert Vectors',
            description: 'Insert or update vectors with their embeddings',
            requestBody: {
              collection: exampleCollection,
              vectors: [
                {
                  id: 'vec_1',
                  embedding: [0.1, 0.2, '...'],
                  metadata: { text: 'Hello world' },
                },
              ],
            },
          },
          {
            method: 'DELETE',
            path: '/vectors/:id',
            name: 'Delete Vector',
            description: 'Delete a specific vector by ID',
            pathParams: [{ name: 'id', description: 'Vector UUID' }],
          },
        ],
      },
      {
        name: 'RAG Retrieval',
        icon: <Zap className="w-5 h-5" />,
        description: 'Semantic search with automatic embedding generation',
        endpoints: [
          {
            method: 'POST',
            path: '/retrieve',
            name: 'Retrieve',
            description: 'Search using natural language. Automatically generates embeddings from your query.',
            requestBody: {
              collection: exampleCollection,
              query: 'What is the return policy?',
              top_k: 5,
              filter: {},
            },
            responseExample: {
              results: [
                {
                  id: 'chunk_id',
                  content: 'Our return policy allows...',
                  score: 0.92,
                  metadata: { document_name: 'policy.pdf' },
                },
              ],
            },
          },
          {
            method: 'POST',
            path: '/retrieve/with-context',
            name: 'Retrieve with Context',
            description: 'Retrieve chunks with surrounding context for better RAG responses',
            requestBody: {
              collection: exampleCollection,
              query: 'How do I reset my password?',
              top_k: 5,
              context_chunks: 1,
            },
          },
          {
            method: 'POST',
            path: '/retrieve/multi',
            name: 'Multi-Collection Retrieve',
            description: 'Search across multiple collections simultaneously',
            requestBody: {
              collections: [exampleCollection, 'faq'],
              query: 'Product specifications',
              top_k: 5,
            },
          },
        ],
      },
      {
        name: 'RAG Chat',
        icon: <MessageSquare className="w-5 h-5" />,
        description: 'Chat with your documents using RAG-enabled collections',
        endpoints: [
          {
            method: 'POST',
            path: `/rag/${exampleCollection}/chat`,
            name: 'Chat',
            description:
              'Send a message and get an AI response grounded in your documents. Requires RAG to be enabled on the collection.',
            requestBody: {
              message: 'What products do you offer?',
              conversation_id: 'conv_123',
              include_sources: true,
            },
            responseExample: {
              answer: 'Based on the documentation, we offer...',
              sources: [
                {
                  document_id: 'doc_uuid',
                  document_name: 'products.pdf',
                  chunk_content: 'We offer a wide range...',
                  relevance_score: 0.95,
                },
              ],
              conversation_id: 'conv_123',
              tokens_used: 450,
            },
          },
          {
            method: 'GET',
            path: '/conversations',
            name: 'List Conversations',
            description: 'Get all chat conversations',
            queryParams: [
              { name: 'collection', description: 'Filter by collection' },
              { name: 'limit', description: 'Number of results' },
            ],
          },
          {
            method: 'GET',
            path: '/conversations/:id/messages',
            name: 'Get Conversation Messages',
            description: 'Retrieve all messages in a conversation',
            pathParams: [{ name: 'id', description: 'Conversation UUID' }],
          },
        ],
      },
      {
        name: 'Tables',
        icon: <Table2 className="w-5 h-5" />,
        description: 'Relational database tables with REST API',
        endpoints: [
          {
            method: 'GET',
            path: '/tables',
            name: 'List Tables',
            description: 'List all tables in the project',
          },
          {
            method: 'POST',
            path: '/tables',
            name: 'Create Table',
            description: 'Create a new table with schema definition',
            requestBody: {
              name: 'customers',
              columns: [
                { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
                { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
                { name: 'name', type: 'varchar(255)', nullable: false },
                { name: 'created_at', type: 'timestamptz', default: 'now()' },
              ],
            },
          },
          {
            method: 'GET',
            path: `/tables/:table`,
            name: 'Get Table Schema',
            description: 'Get table schema and column definitions',
            pathParams: [{ name: 'table', description: 'Table name' }],
          },
          {
            method: 'DELETE',
            path: `/tables/:table`,
            name: 'Delete Table',
            description: 'Delete a table and all its data',
            pathParams: [{ name: 'table', description: 'Table name' }],
          },
          {
            method: 'GET',
            path: `/tables/:table/rows`,
            name: 'List Rows',
            description: 'Query rows with filtering, sorting, and pagination',
            pathParams: [{ name: 'table', description: 'Table name' }],
            queryParams: [
              { name: 'select', description: 'Columns to return (comma-separated)' },
              { name: 'filter', description: 'Filter expression (e.g., status.eq=active)' },
              { name: 'order', description: 'Sort order (e.g., created_at:desc)' },
              { name: 'limit', description: 'Number of rows (default: 100, max: 1000)' },
              { name: 'offset', description: 'Pagination offset' },
            ],
          },
          {
            method: 'POST',
            path: `/tables/:table/rows`,
            name: 'Insert Row',
            description: 'Insert a new row into the table',
            pathParams: [{ name: 'table', description: 'Table name' }],
            requestBody: {
              email: 'john@example.com',
              name: 'John Doe',
            },
          },
          {
            method: 'GET',
            path: `/tables/:table/rows/:id`,
            name: 'Get Row',
            description: 'Get a single row by ID',
            pathParams: [
              { name: 'table', description: 'Table name' },
              { name: 'id', description: 'Row ID' },
            ],
          },
          {
            method: 'PATCH',
            path: `/tables/:table/rows/:id`,
            name: 'Update Row',
            description: 'Update specific fields in a row',
            pathParams: [
              { name: 'table', description: 'Table name' },
              { name: 'id', description: 'Row ID' },
            ],
            requestBody: {
              name: 'John Updated',
            },
          },
          {
            method: 'DELETE',
            path: `/tables/:table/rows/:id`,
            name: 'Delete Row',
            description: 'Delete a row by ID',
            pathParams: [
              { name: 'table', description: 'Table name' },
              { name: 'id', description: 'Row ID' },
            ],
          },
          {
            method: 'GET',
            path: `/tables/:table/export`,
            name: 'Export Table',
            description: 'Export table data as CSV or JSON',
            pathParams: [{ name: 'table', description: 'Table name' }],
            queryParams: [{ name: 'format', description: 'Export format: csv or json (default: json)' }],
          },
          {
            method: 'POST',
            path: `/tables/:table/import`,
            name: 'Import Data',
            description: 'Import data from CSV or JSON file',
            pathParams: [{ name: 'table', description: 'Table name' }],
            requestBody: {
              file: '(multipart file upload - CSV or JSON)',
            },
          },
        ],
      },
      {
        name: 'SQL',
        icon: <Database className="w-5 h-5" />,
        description: 'Execute SQL queries on your tables',
        endpoints: [
          {
            method: 'POST',
            path: '/sql/execute',
            name: 'Execute SQL',
            description: 'Execute a SELECT query. Only SELECT statements are allowed for security.',
            requestBody: {
              query: `SELECT * FROM ${exampleTable} WHERE status = 'active' LIMIT 10`,
              limit: 100,
            },
            responseExample: {
              columns: [{ name: 'id', type_name: 'UUID' }, { name: 'name', type_name: 'TEXT' }],
              rows: [['uuid-here', 'John Doe']],
              row_count: 1,
              execution_time_ms: 12,
            },
          },
          {
            method: 'GET',
            path: '/sql/history',
            name: 'Query History',
            description: 'Get recent query history for the current user',
            queryParams: [{ name: 'limit', description: 'Number of results (default: 50)' }],
          },
          {
            method: 'GET',
            path: '/sql/schema',
            name: 'Get Schema',
            description: 'Get schema information for all tables (useful for autocomplete)',
          },
        ],
      },
      {
        name: 'API Keys',
        icon: <Key className="w-5 h-5" />,
        description: 'Manage API keys for authentication',
        endpoints: [
          {
            method: 'GET',
            path: '/keys',
            name: 'List API Keys',
            description: 'List all API keys for the project',
          },
          {
            method: 'POST',
            path: '/keys',
            name: 'Create API Key',
            description: 'Create a new API key. The full key is only shown once.',
            requestBody: {
              name: 'Production Key',
              scopes: ['read', 'write'],
              expires_at: '2025-12-31T23:59:59Z',
            },
            responseExample: {
              id: 'uuid',
              name: 'Production Key',
              key: 'deva_xxxxxxxxxxxxxxxxxxxx',
              prefix: 'deva_xxxx',
              scopes: ['read', 'write'],
            },
          },
          {
            method: 'DELETE',
            path: '/keys/:id',
            name: 'Revoke API Key',
            description: 'Revoke/delete an API key',
            pathParams: [{ name: 'id', description: 'API key UUID' }],
          },
        ],
      },
    ],
    [exampleCollection, exampleTable]
  );

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              API Documentation
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Complete reference for all Devabase API endpoints with examples.
            </p>
          </div>
        </div>

        {/* Quick Reference Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface border border-border-light rounded-xl p-4">
            <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
              Base URL
            </p>
            <p className="text-[13px] font-mono text-primary mt-1 truncate" title={baseUrl}>
              {baseUrl}
            </p>
          </div>
          <div className="bg-surface border border-border-light rounded-xl p-4">
            <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
              Project ID
            </p>
            <p className="text-[13px] font-mono text-primary mt-1 truncate" title={projectId}>
              {projectId.slice(0, 8)}...
            </p>
          </div>
          <div className="bg-surface border border-border-light rounded-xl p-4">
            <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
              Collections
            </p>
            <p className="text-[24px] font-bold text-foreground mt-1">
              {collections?.length || 0}
            </p>
          </div>
          <div className="bg-surface border border-border-light rounded-xl p-4">
            <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
              Tables
            </p>
            <p className="text-[24px] font-bold text-foreground mt-1">
              {tables?.length || 0}
            </p>
          </div>
        </div>

        {/* Authentication - Compact */}
        <div className="bg-surface border border-border-light rounded-xl p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="flex-1">
              <h3 className="text-[14px] font-semibold text-foreground mb-2">Required Headers</h3>
              <CodeBlock
                code={`Authorization: Bearer ${apiKeyExample}
X-Project-ID: ${projectId}`}
              />
            </div>
            <div className="flex-1 space-y-2">
              {collections && collections.length > 0 && (
                <div>
                  <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium mb-1">
                    Your Collections
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {collections.slice(0, 5).map((c) => (
                      <code
                        key={c.name}
                        className="px-2 py-0.5 bg-surface-secondary rounded text-[11px] font-mono text-text-secondary"
                      >
                        {c.name}
                      </code>
                    ))}
                    {collections.length > 5 && (
                      <span className="text-[11px] text-text-tertiary">+{collections.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
              {tables && tables.length > 0 && (
                <div>
                  <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium mb-1">
                    Your Tables
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tables.slice(0, 5).map((t) => (
                      <code
                        key={t.name}
                        className="px-2 py-0.5 bg-surface-secondary rounded text-[11px] font-mono text-text-secondary"
                      >
                        {t.name}
                      </code>
                    ))}
                    {tables.length > 5 && (
                      <span className="text-[11px] text-text-tertiary">+{tables.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Category Navigation */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((category) => (
            <button
              key={category.name}
              onClick={() =>
                setActiveCategory(activeCategory === category.name ? null : category.name)
              }
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition-all',
                activeCategory === category.name
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border-light text-text-secondary hover:text-foreground hover:bg-surface-hover'
              )}
            >
              {category.icon}
              {category.name}
            </button>
          ))}
        </div>

        {/* Endpoint Categories */}
        <div className="space-y-8">
          {categories
            .filter((c) => !activeCategory || c.name === activeCategory)
            .map((category) => (
              <div key={category.name}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center text-text-secondary">
                    {category.icon}
                  </div>
                  <div>
                    <h2 className="text-[18px] font-semibold text-foreground">{category.name}</h2>
                    <p className="text-[13px] text-text-secondary">{category.description}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {category.endpoints.map((endpoint, index) => (
                    <EndpointCard
                      key={`${endpoint.method}-${endpoint.path}-${index}`}
                      endpoint={endpoint}
                      baseUrl={baseUrl}
                      projectId={projectId}
                      apiKeyExample={apiKeyExample}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border-light text-center">
          <p className="text-[13px] text-text-tertiary">
            Test endpoints in the{' '}
            <a href="/playground" className="text-primary hover:underline">
              Playground
            </a>{' '}
            · Manage{' '}
            <a href="/keys" className="text-primary hover:underline">
              API Keys
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
