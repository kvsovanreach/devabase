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
  Share2,
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
          {
            method: 'GET',
            path: `/collections/:name/stats`,
            name: 'Get Collection Stats',
            description: 'Get detailed statistics for a collection including vector count and storage usage',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            responseExample: {
              name: 'my_collection',
              vector_count: 1500,
              document_count: 75,
              storage_bytes: 4500000,
              dimensions: 1536,
              metric: 'cosine',
            },
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
            path: '/collections/:name/documents',
            name: 'Upload Document',
            description: 'Upload a document to be processed and embedded. Supports PDF, TXT, MD, DOCX, and more.',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
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
          {
            method: 'POST',
            path: '/documents/:id/reprocess',
            name: 'Reprocess Document',
            description: 'Re-chunk and re-embed a document with updated settings',
            pathParams: [{ name: 'id', description: 'Document UUID' }],
            responseExample: {
              id: 'uuid',
              status: 'processing',
              message: 'Document reprocessing started',
            },
          },
          {
            method: 'GET',
            path: '/collections/:name/documents',
            name: 'List Collection Documents',
            description: 'List all documents in a specific collection',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            queryParams: [
              { name: 'status', description: 'Filter by status (pending, processing, processed, failed)' },
              { name: 'limit', description: 'Number of results (default: 50)' },
              { name: 'offset', description: 'Pagination offset' },
            ],
          },
        ],
      },
      {
        name: 'Vectors (Low-Level)',
        icon: <Database className="w-5 h-5" />,
        description: 'Low-level vector operations for advanced users. For most use cases, use the Search endpoints instead.',
        endpoints: [
          {
            method: 'POST',
            path: '/collections/:name/vectors',
            name: 'Upsert Vectors',
            description: 'Insert or update vectors with their embeddings directly',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
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
            method: 'POST',
            path: '/collections/:name/vectors/search',
            name: 'Search by Embedding',
            description: 'Search vectors using a raw embedding array',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              embedding: [0.1, 0.2, '...', 0.3],
              top_k: 10,
              filter: { category: 'docs' },
            },
          },
          {
            method: 'POST',
            path: '/collections/:name/vectors/hybrid-search',
            name: 'Hybrid Search by Embedding',
            description: 'Search using both vector similarity and keyword matching with raw embeddings',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              embedding: [0.1, 0.2, '...', 0.3],
              query: 'search keywords',
              top_k: 10,
              vector_weight: 0.7,
              keyword_weight: 0.3,
            },
          },
          {
            method: 'DELETE',
            path: '/collections/:name/vectors/:vid',
            name: 'Delete Vector',
            description: 'Delete a specific vector by ID',
            pathParams: [
              { name: 'name', description: 'Collection name' },
              { name: 'vid', description: 'Vector UUID' },
            ],
          },
        ],
      },
      {
        name: 'Search',
        icon: <Search className="w-5 h-5" />,
        description: 'Semantic search with automatic embedding generation, hybrid search, and optional reranking',
        endpoints: [
          {
            method: 'POST',
            path: '/search',
            name: 'Unified Search',
            description: 'Search across one or multiple collections. Automatically generates embeddings from your query. Supports vector, keyword, or hybrid search modes with optional reranking.',
            requestBody: {
              collections: [exampleCollection],
              query: 'What is the return policy?',
              top_k: 5,
              mode: 'hybrid',
              vector_weight: 0.7,
              keyword_weight: 0.3,
              rerank: true,
            },
            responseExample: {
              results: [
                {
                  id: 'chunk_uuid',
                  collection: exampleCollection,
                  document_id: 'doc_uuid',
                  content: 'Our return policy allows...',
                  score: 0.94,
                  vector_score: 0.92,
                  keyword_score: 0.88,
                  rerank_score: 0.97,
                  metadata: { document_name: 'policy.pdf' },
                },
              ],
            },
          },
          {
            method: 'POST',
            path: `/collections/:name/search`,
            name: 'Collection Search',
            description: 'Search within a specific collection using vector, keyword, or hybrid search modes.',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              query: 'authentication best practices',
              top_k: 10,
              mode: 'hybrid',
              vector_weight: 0.7,
              keyword_weight: 0.3,
              filter: { category: 'security' },
              rerank: true,
            },
            responseExample: {
              results: [
                {
                  id: 'chunk_uuid',
                  document_id: 'doc_uuid',
                  content: 'Authentication best practices include...',
                  score: 0.94,
                  vector_score: 0.92,
                  keyword_score: 0.88,
                  rerank_score: 0.97,
                  metadata: { document_name: 'security-guide.pdf' },
                },
              ],
            },
          },
        ],
      },
      {
        name: 'RAG Chat',
        icon: <MessageSquare className="w-5 h-5" />,
        description: 'Chat with your documents using RAG-enabled collections. Unified endpoint supports single or multiple collections.',
        endpoints: [
          {
            method: 'POST',
            path: '/rag',
            name: 'Single Collection Chat',
            description:
              'Send a message and get an AI response grounded in your documents. Pass collection as a string for single collection. Requires RAG to be enabled on the collection.',
            requestBody: {
              collection: exampleCollection,
              message: 'What products do you offer?',
              conversation_id: 'conv_123',
              include_sources: true,
              top_k: 5,
              stream: false,
            },
            responseExample: {
              answer: 'Based on the documentation, we offer...',
              thinking: 'Let me analyze the relevant documents...',
              sources: [
                {
                  collection_name: exampleCollection,
                  document_id: 'doc_uuid',
                  document_name: 'products.pdf',
                  chunk_content: 'We offer a wide range...',
                  relevance_score: 0.95,
                },
              ],
              collections_used: [exampleCollection],
              conversation_id: 'conv_123',
              tokens_used: 450,
            },
          },
          {
            method: 'POST',
            path: '/rag',
            name: 'Multi-Collection Chat',
            description:
              'Chat across multiple collections by passing collection as an array. Sources from all collections are retrieved and merged by relevance.',
            requestBody: {
              collection: [exampleCollection, 'faq', 'support_docs'],
              message: 'How do I reset my password?',
              include_sources: true,
              top_k: 10,
              stream: false,
            },
            responseExample: {
              answer: 'To reset your password, follow these steps...',
              sources: [
                {
                  collection_name: 'faq',
                  document_id: 'doc_uuid',
                  document_name: 'account-faq.pdf',
                  chunk_content: 'Password reset instructions...',
                  relevance_score: 0.98,
                },
                {
                  collection_name: exampleCollection,
                  document_id: 'doc_uuid2',
                  document_name: 'user-guide.pdf',
                  chunk_content: 'Account security settings...',
                  relevance_score: 0.92,
                },
              ],
              collections_used: ['faq', exampleCollection],
              conversation_id: 'conv_456',
              tokens_used: 520,
            },
          },
          {
            method: 'POST',
            path: '/rag',
            name: 'Streaming Chat (SSE)',
            description:
              'Enable real-time streaming responses using Server-Sent Events. Set stream: true to receive incremental content. Works with both single and multiple collections.',
            requestBody: {
              collection: [exampleCollection, 'faq'],
              message: 'Explain our pricing tiers',
              include_sources: true,
              stream: true,
            },
            responseExample: {
              _note: 'Server-Sent Events stream',
              events: [
                { type: 'sources', sources: [{ document_name: 'pricing.pdf', score: 0.95 }] },
                { type: 'thinking', content: 'Analyzing pricing documentation...' },
                { type: 'content', content: 'Our pricing has three tiers: ' },
                { type: 'content', content: 'Basic, Pro, and Enterprise...' },
                { type: 'done', conversation_id: 'conv_789', tokens_used: 380 },
              ],
            },
          },
          {
            method: 'POST',
            path: '/collections/:name/chat',
            name: 'Collection Chat',
            description: 'Chat with a specific collection. Alternative to /rag for single-collection use.',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              message: 'What are the key features?',
              conversation_id: 'conv_123',
              include_sources: true,
              top_k: 5,
            },
            responseExample: {
              answer: 'The key features include...',
              sources: [{ document_name: 'features.pdf', relevance_score: 0.94 }],
              conversation_id: 'conv_123',
              tokens_used: 320,
            },
          },
          {
            method: 'POST',
            path: '/collections/:name/chat/stream',
            name: 'Collection Chat (Streaming)',
            description: 'Streaming chat with a specific collection using Server-Sent Events',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              message: 'Explain the architecture',
              include_sources: true,
              top_k: 5,
            },
            responseExample: {
              _note: 'Server-Sent Events stream',
              events: [
                { type: 'sources', sources: [{ document_name: 'arch.pdf', score: 0.95 }] },
                { type: 'content', content: 'The architecture consists of...' },
                { type: 'done', conversation_id: 'conv_123', tokens_used: 280 },
              ],
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
            method: 'POST',
            path: '/conversations',
            name: 'Create Conversation',
            description: 'Create a new conversation manually',
            requestBody: {
              collection_id: 'uuid',
              title: 'Support Chat',
            },
          },
          {
            method: 'GET',
            path: '/conversations/:id',
            name: 'Get Conversation',
            description: 'Get conversation details with all messages',
            pathParams: [{ name: 'id', description: 'Conversation UUID' }],
          },
          {
            method: 'PATCH',
            path: '/conversations/:id',
            name: 'Update Conversation',
            description: 'Update conversation title or metadata',
            pathParams: [{ name: 'id', description: 'Conversation UUID' }],
            requestBody: {
              title: 'Updated Title',
            },
          },
          {
            method: 'DELETE',
            path: '/conversations/:id',
            name: 'Delete Conversation',
            description: 'Delete a conversation and all its messages',
            pathParams: [{ name: 'id', description: 'Conversation UUID' }],
          },
        ],
      },
      {
        name: 'Knowledge Graph',
        icon: <Share2 className="w-5 h-5" />,
        description: 'Extract and manage entities and relationships from documents',
        endpoints: [
          {
            method: 'GET',
            path: '/knowledge/entities',
            name: 'List Entities',
            description: 'List all entities in the knowledge graph',
            queryParams: [
              { name: 'entity_type', description: 'Filter by type (person, organization, location, etc.)' },
              { name: 'collection_id', description: 'Filter by collection UUID' },
              { name: 'limit', description: 'Number of results (default: 50)' },
              { name: 'offset', description: 'Pagination offset' },
            ],
            responseExample: [
              {
                id: 'uuid',
                name: 'Acme Corp',
                entity_type: 'organization',
                description: 'A technology company',
                aliases: ['Acme', 'Acme Corporation'],
              },
            ],
          },
          {
            method: 'POST',
            path: '/knowledge/entities',
            name: 'Create Entity',
            description: 'Manually create an entity',
            requestBody: {
              name: 'John Doe',
              entity_type: 'person',
              description: 'Software engineer',
              aliases: ['JD'],
            },
          },
          {
            method: 'GET',
            path: '/knowledge/entities/:id',
            name: 'Get Entity',
            description: 'Get entity details with all relationships',
            pathParams: [{ name: 'id', description: 'Entity UUID' }],
          },
          {
            method: 'PATCH',
            path: '/knowledge/entities/:id',
            name: 'Update Entity',
            description: 'Update entity name, description, or aliases',
            pathParams: [{ name: 'id', description: 'Entity UUID' }],
            requestBody: {
              name: 'John Smith',
              description: 'Senior software engineer',
            },
          },
          {
            method: 'DELETE',
            path: '/knowledge/entities/:id',
            name: 'Delete Entity',
            description: 'Delete an entity and its relationships',
            pathParams: [{ name: 'id', description: 'Entity UUID' }],
          },
          {
            method: 'POST',
            path: '/knowledge/entities/search',
            name: 'Search Entities',
            description: 'Search entities by name (fuzzy match)',
            requestBody: {
              query: 'acme',
              entity_type: 'organization',
              limit: 10,
            },
          },
          {
            method: 'POST',
            path: '/knowledge/entities/merge',
            name: 'Merge Entities',
            description: 'Merge two duplicate entities into one',
            requestBody: {
              source_id: 'uuid-to-merge',
              target_id: 'uuid-to-keep',
            },
          },
          {
            method: 'GET',
            path: '/knowledge/relationships',
            name: 'List Relationships',
            description: 'List all relationships between entities',
            queryParams: [
              { name: 'entity_id', description: 'Filter by entity UUID' },
              { name: 'relationship_type', description: 'Filter by type (works_at, located_in, etc.)' },
              { name: 'limit', description: 'Number of results (default: 50)' },
            ],
          },
          {
            method: 'POST',
            path: '/knowledge/relationships',
            name: 'Create Relationship',
            description: 'Create a relationship between two entities',
            requestBody: {
              source_entity_id: 'uuid',
              target_entity_id: 'uuid',
              relationship_type: 'works_at',
              description: 'John works at Acme Corp',
            },
          },
          {
            method: 'DELETE',
            path: '/knowledge/relationships/:id',
            name: 'Delete Relationship',
            description: 'Delete a relationship',
            pathParams: [{ name: 'id', description: 'Relationship UUID' }],
          },
          {
            method: 'GET',
            path: '/knowledge/graph/:entity_id',
            name: 'Get Entity Graph',
            description: 'Get an entity with connected nodes for visualization',
            pathParams: [{ name: 'entity_id', description: 'Entity UUID' }],
            queryParams: [
              { name: 'depth', description: 'Graph traversal depth (default: 1, max: 3)' },
            ],
            responseExample: {
              nodes: [
                { id: 'uuid', name: 'John', entity_type: 'person' },
                { id: 'uuid', name: 'Acme Corp', entity_type: 'organization' },
              ],
              edges: [
                { id: 'uuid', source: 'uuid', target: 'uuid', relationship_type: 'works_at' },
              ],
            },
          },
          {
            method: 'GET',
            path: '/knowledge/stats',
            name: 'Get Statistics',
            description: 'Get knowledge graph statistics',
            responseExample: {
              total_entities: 150,
              total_relationships: 320,
              entities_by_type: [
                { entity_type: 'person', count: 45 },
                { entity_type: 'organization', count: 30 },
              ],
            },
          },
          {
            method: 'POST',
            path: '/knowledge/extract/:document_id',
            name: 'Extract from Document',
            description: 'Extract entities and relationships from a processed document using LLM',
            pathParams: [{ name: 'document_id', description: 'Document UUID' }],
            responseExample: {
              document_id: 'uuid',
              entities_extracted: 12,
              relationships_extracted: 8,
              message: 'Extracted 12 entities and 8 relationships',
            },
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
            method: 'GET',
            path: '/keys/:id',
            name: 'Get API Key',
            description: 'Get API key details (key value is not returned)',
            pathParams: [{ name: 'id', description: 'API key UUID' }],
            responseExample: {
              id: 'uuid',
              name: 'Production Key',
              prefix: 'deva_xxxx',
              scopes: ['read', 'write'],
              last_used_at: '2024-01-15T10:30:00Z',
              expires_at: '2025-12-31T23:59:59Z',
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
      {
        name: 'Evaluation',
        icon: <Zap className="w-5 h-5" />,
        description: 'Evaluate RAG retrieval quality with datasets and metrics',
        endpoints: [
          {
            method: 'GET',
            path: '/evaluation/datasets',
            name: 'List Datasets',
            description: 'List all evaluation datasets in the project',
            responseExample: [
              {
                id: 'uuid',
                name: 'Product FAQ Evaluation',
                collection_id: 'uuid',
                collection_name: exampleCollection,
                case_count: 25,
                run_count: 3,
                last_run: '2024-01-15T10:30:00Z',
              },
            ],
          },
          {
            method: 'POST',
            path: '/evaluation/datasets',
            name: 'Create Dataset',
            description: 'Create a new evaluation dataset linked to a collection',
            requestBody: {
              collection_name: exampleCollection,
              name: 'Customer Support Evaluation',
              description: 'Test queries for customer support documentation',
            },
          },
          {
            method: 'GET',
            path: '/evaluation/datasets/:id',
            name: 'Get Dataset',
            description: 'Get dataset details including all test cases',
            pathParams: [{ name: 'id', description: 'Dataset UUID' }],
          },
          {
            method: 'PATCH',
            path: '/evaluation/datasets/:id',
            name: 'Update Dataset',
            description: 'Update dataset name or description',
            pathParams: [{ name: 'id', description: 'Dataset UUID' }],
            requestBody: {
              name: 'Updated Dataset Name',
              description: 'Updated description',
            },
          },
          {
            method: 'POST',
            path: '/evaluation/datasets/:id/cases',
            name: 'Add Test Case',
            description: 'Add a test case with query and expected relevant chunk IDs',
            pathParams: [{ name: 'id', description: 'Dataset UUID' }],
            requestBody: {
              query: 'How do I reset my password?',
              expected_chunk_ids: ['chunk_uuid_1', 'chunk_uuid_2'],
              metadata: { category: 'account' },
            },
          },
          {
            method: 'POST',
            path: '/evaluation/datasets/:id/run',
            name: 'Run Evaluation',
            description: 'Execute evaluation and compute retrieval metrics (Precision@K, Recall@K, MRR, NDCG)',
            pathParams: [{ name: 'id', description: 'Dataset UUID' }],
            requestBody: {
              search_mode: 'hybrid',
              top_k: 5,
              vector_weight: 0.7,
              keyword_weight: 0.3,
            },
            responseExample: {
              run: { id: 'uuid', dataset_id: 'uuid', search_mode: 'hybrid' },
              metrics: {
                precision_at_k: 0.82,
                recall_at_k: 0.75,
                mrr: 0.88,
                ndcg: 0.84,
                cases_evaluated: 25,
                k: 5,
              },
            },
          },
          {
            method: 'GET',
            path: '/evaluation/datasets/:id/runs',
            name: 'List Runs',
            description: 'Get all evaluation runs for a dataset',
            pathParams: [{ name: 'id', description: 'Dataset UUID' }],
          },
          {
            method: 'GET',
            path: '/evaluation/runs/:id',
            name: 'Get Run Details',
            description: 'Get detailed results for an evaluation run including per-case metrics',
            pathParams: [{ name: 'id', description: 'Run UUID' }],
          },
          {
            method: 'PATCH',
            path: '/evaluation/cases/:id',
            name: 'Update Test Case',
            description: 'Update a test case query or expected chunk IDs',
            pathParams: [{ name: 'id', description: 'Case UUID' }],
            requestBody: {
              query: 'Updated test query?',
              expected_chunk_ids: ['chunk_uuid_1', 'chunk_uuid_2', 'chunk_uuid_3'],
            },
          },
          {
            method: 'DELETE',
            path: '/evaluation/cases/:id',
            name: 'Delete Test Case',
            description: 'Delete a test case from a dataset',
            pathParams: [{ name: 'id', description: 'Case UUID' }],
          },
          {
            method: 'DELETE',
            path: '/evaluation/datasets/:id',
            name: 'Delete Dataset',
            description: 'Delete a dataset and all its test cases and runs',
            pathParams: [{ name: 'id', description: 'Dataset UUID' }],
          },
        ],
      },
      {
        name: 'Chunks',
        icon: <FileText className="w-5 h-5" />,
        description: 'Manage document chunks for fine-grained control',
        endpoints: [
          {
            method: 'GET',
            path: '/chunks/:id',
            name: 'Get Chunk',
            description: 'Get a specific chunk with content and metadata',
            pathParams: [{ name: 'id', description: 'Chunk UUID' }],
            responseExample: {
              id: 'uuid',
              document_id: 'uuid',
              collection_id: 'uuid',
              content: 'This is the chunk content...',
              chunk_index: 0,
              token_count: 256,
              metadata: { page: 1 },
            },
          },
          {
            method: 'PATCH',
            path: '/chunks/:id',
            name: 'Update Chunk',
            description: 'Update chunk content or metadata. Embeddings are automatically regenerated.',
            pathParams: [{ name: 'id', description: 'Chunk UUID' }],
            requestBody: {
              content: 'Updated chunk content...',
              metadata: { reviewed: true },
            },
          },
          {
            method: 'DELETE',
            path: '/chunks/:id',
            name: 'Delete Chunk',
            description: 'Delete a chunk and its vector embedding',
            pathParams: [{ name: 'id', description: 'Chunk UUID' }],
          },
          {
            method: 'POST',
            path: '/chunks/:id/split',
            name: 'Split Chunk',
            description: 'Split a chunk into multiple smaller chunks at specified positions',
            pathParams: [{ name: 'id', description: 'Chunk UUID' }],
            requestBody: {
              split_positions: [100, 250],
            },
            responseExample: {
              original_chunk_id: 'uuid',
              new_chunks: [
                { id: 'uuid1', content: 'First part...' },
                { id: 'uuid2', content: 'Second part...' },
                { id: 'uuid3', content: 'Third part...' },
              ],
            },
          },
          {
            method: 'POST',
            path: '/chunks/merge',
            name: 'Merge Chunks',
            description: 'Merge multiple consecutive chunks into one',
            requestBody: {
              chunk_ids: ['uuid1', 'uuid2', 'uuid3'],
            },
            responseExample: {
              merged_chunk: {
                id: 'uuid',
                content: 'Combined content from all chunks...',
                token_count: 512,
              },
            },
          },
        ],
      },
      {
        name: 'Storage',
        icon: <FolderOpen className="w-5 h-5" />,
        description: 'Generic file storage for assets, images, and documents',
        endpoints: [
          {
            method: 'POST',
            path: '/storage',
            name: 'Upload File',
            description: 'Upload a file to storage. Returns the storage path.',
            requestBody: {
              file: '(multipart file upload)',
              path: 'images/logo.png',
            },
            responseExample: {
              path: 'images/logo.png',
              size: 45678,
              content_type: 'image/png',
              url: '/v1/storage/images/logo.png',
            },
          },
          {
            method: 'GET',
            path: '/storage/:path',
            name: 'Get File',
            description: 'Download or stream a file from storage',
            pathParams: [{ name: 'path', description: 'File path (e.g., images/logo.png)' }],
          },
          {
            method: 'DELETE',
            path: '/storage/:path',
            name: 'Delete File',
            description: 'Delete a file from storage',
            pathParams: [{ name: 'path', description: 'File path' }],
          },
        ],
      },
      {
        name: 'Webhooks',
        icon: <Zap className="w-5 h-5" />,
        description: 'Configure webhooks to receive real-time event notifications',
        endpoints: [
          {
            method: 'GET',
            path: '/webhooks',
            name: 'List Webhooks',
            description: 'List all webhooks configured for the project',
            responseExample: [
              {
                id: 'uuid',
                name: 'Document Processed',
                url: 'https://api.example.com/webhooks/devabase',
                events: ['document.processed', 'document.failed'],
                is_active: true,
              },
            ],
          },
          {
            method: 'POST',
            path: '/webhooks',
            name: 'Create Webhook',
            description: 'Create a new webhook subscription',
            requestBody: {
              name: 'Document Events',
              url: 'https://api.example.com/webhooks/devabase',
              events: ['document.processed', 'document.failed', 'collection.created'],
              secret: 'whsec_xxxxx',
            },
          },
          {
            method: 'GET',
            path: '/webhooks/:id',
            name: 'Get Webhook',
            description: 'Get webhook details',
            pathParams: [{ name: 'id', description: 'Webhook UUID' }],
          },
          {
            method: 'PATCH',
            path: '/webhooks/:id',
            name: 'Update Webhook',
            description: 'Update webhook configuration',
            pathParams: [{ name: 'id', description: 'Webhook UUID' }],
            requestBody: {
              events: ['document.processed'],
              is_active: false,
            },
          },
          {
            method: 'DELETE',
            path: '/webhooks/:id',
            name: 'Delete Webhook',
            description: 'Delete a webhook subscription',
            pathParams: [{ name: 'id', description: 'Webhook UUID' }],
          },
          {
            method: 'POST',
            path: '/webhooks/:id/test',
            name: 'Test Webhook',
            description: 'Send a test event to verify webhook configuration',
            pathParams: [{ name: 'id', description: 'Webhook UUID' }],
            responseExample: {
              success: true,
              status_code: 200,
              response_time_ms: 125,
            },
          },
          {
            method: 'GET',
            path: '/webhooks/:id/logs',
            name: 'Get Webhook Logs',
            description: 'View delivery logs for a webhook',
            pathParams: [{ name: 'id', description: 'Webhook UUID' }],
            queryParams: [
              { name: 'limit', description: 'Number of logs (default: 50)' },
              { name: 'status', description: 'Filter by status (success, failed)' },
            ],
          },
        ],
      },
      {
        name: 'Prompts',
        icon: <FileText className="w-5 h-5" />,
        description: 'Manage reusable prompt templates with version control',
        endpoints: [
          {
            method: 'GET',
            path: '/prompts',
            name: 'List Prompts',
            description: 'List all prompt templates in the project',
            responseExample: [
              {
                id: 'uuid',
                name: 'rag_system_prompt',
                version: 3,
                content: 'You are a helpful assistant...',
                variables: ['context', 'question'],
                is_active: true,
              },
            ],
          },
          {
            method: 'POST',
            path: '/prompts',
            name: 'Create Prompt',
            description: 'Create a new prompt template with variable placeholders',
            requestBody: {
              name: 'customer_support',
              content: 'You are a customer support agent for {{company}}. Answer questions based on:\n\n{{context}}\n\nQuestion: {{question}}',
              description: 'Customer support RAG prompt',
            },
          },
          {
            method: 'GET',
            path: '/prompts/:name',
            name: 'Get Prompt',
            description: 'Get the latest version of a prompt template',
            pathParams: [{ name: 'name', description: 'Prompt name' }],
          },
          {
            method: 'PATCH',
            path: '/prompts/:name',
            name: 'Update Prompt',
            description: 'Update a prompt template (creates a new version)',
            pathParams: [{ name: 'name', description: 'Prompt name' }],
            requestBody: {
              content: 'Updated prompt content with {{variables}}...',
            },
          },
          {
            method: 'DELETE',
            path: '/prompts/:name',
            name: 'Delete Prompt',
            description: 'Delete a prompt template and all versions',
            pathParams: [{ name: 'name', description: 'Prompt name' }],
          },
          {
            method: 'POST',
            path: '/prompts/:name/render',
            name: 'Render Prompt',
            description: 'Render a prompt template with provided variables',
            pathParams: [{ name: 'name', description: 'Prompt name' }],
            requestBody: {
              variables: {
                company: 'Acme Corp',
                context: 'Product documentation content...',
                question: 'What is the return policy?',
              },
            },
            responseExample: {
              rendered: 'You are a customer support agent for Acme Corp. Answer questions based on:\n\nProduct documentation content...\n\nQuestion: What is the return policy?',
              variables_used: ['company', 'context', 'question'],
            },
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
