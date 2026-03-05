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
  Shield,
  Users,
  Radio,
  BarChart3,
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

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface border border-border-light rounded-xl p-4">
      <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
        {label}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <code className="text-[13px] font-mono text-primary break-all select-all flex-1">
          {value}
        </code>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-foreground transition-colors flex-shrink-0 cursor-pointer"
          title={`Copy ${label}`}
        >
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

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

  // Replace path params with readable placeholders
  const displayPath = endpoint.path
    .replace(':name', '{collection_name}')
    .replace(':table', '{table_name}')
    .replace(':vid', '{vector_id}')
    .replace(':entity_id', '{entity_id}')
    .replace(':document_id', '{document_id}')
    .replace(':iid', '{invitation_id}')
    .replace(':uid', '{user_id}')
    .replace(':token', '{token}')
    .replace(':path', '{path}')
    .replace(':id', '{id}');

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
  const firstKey = apiKeys?.data?.[0];
  const apiKeyExample = firstKey?.prefix
    ? `${firstKey.prefix}...`
    : 'deva_xxxxxxxxxxxx';

  // Define all endpoint categories with dynamic examples
  const categories: EndpointCategory[] = useMemo(
    () => [
      {
        name: 'App Authentication',
        icon: <Shield className="w-5 h-5" />,
        description: 'Authentication for end-users of apps built with Devabase',
        endpoints: [
          {
            method: 'POST',
            path: '/auth/app/register',
            name: 'Register User',
            description: 'Register a new app user with email and password',
            requestBody: {
              email: 'user@example.com',
              password: 'securePassword123',
              name: 'Jane Doe',
            },
            responseExample: {
              user: { id: 'uuid', email: 'user@example.com', name: 'Jane Doe' },
              access_token: 'eyJhbGciOi...',
              refresh_token: 'eyJhbGciOi...',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/login',
            name: 'Login',
            description: 'Authenticate an app user and receive tokens',
            requestBody: {
              email: 'user@example.com',
              password: 'securePassword123',
            },
            responseExample: {
              user: { id: 'uuid', email: 'user@example.com', name: 'Jane Doe' },
              access_token: 'eyJhbGciOi...',
              refresh_token: 'eyJhbGciOi...',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/refresh',
            name: 'Refresh Token',
            description: 'Exchange a refresh token for a new access token',
            requestBody: {
              refresh_token: 'eyJhbGciOi...',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/logout',
            name: 'Logout',
            description: 'Invalidate the current session',
          },
          {
            method: 'GET',
            path: '/auth/app/me',
            name: 'Get Current User',
            description: 'Get the authenticated app user profile. Requires X-App-User-Token header.',
          },
          {
            method: 'PATCH',
            path: '/auth/app/me',
            name: 'Update Profile',
            description: 'Update the authenticated app user profile',
            requestBody: {
              name: 'Jane Updated',
              metadata: { preferences: { theme: 'dark' } },
            },
          },
          {
            method: 'DELETE',
            path: '/auth/app/me',
            name: 'Delete Account',
            description: 'Delete the authenticated app user account',
          },
          {
            method: 'POST',
            path: '/auth/app/password',
            name: 'Change Password',
            description: 'Change password for the authenticated user',
            requestBody: {
              current_password: 'oldPassword123',
              new_password: 'newPassword456',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/forgot-password',
            name: 'Forgot Password',
            description: 'Request a password reset email',
            requestBody: {
              email: 'user@example.com',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/reset-password',
            name: 'Reset Password',
            description: 'Reset password using a reset token',
            requestBody: {
              token: 'reset-token-from-email',
              new_password: 'newPassword456',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/verify-email',
            name: 'Verify Email',
            description: 'Verify email address using a verification token',
            requestBody: {
              token: 'verification-token',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/resend-verification',
            name: 'Resend Verification',
            description: 'Resend the email verification link',
            requestBody: {
              email: 'user@example.com',
            },
          },
          {
            method: 'POST',
            path: '/auth/app/introspect',
            name: 'Introspect Token',
            description: 'Stateless token introspection (OAuth2-style) for server-side validation',
            requestBody: {
              token: 'eyJhbGciOi...',
            },
            responseExample: {
              active: true,
              user_id: 'uuid',
              email: 'user@example.com',
              exp: 1700000000,
            },
          },
        ],
      },
      {
        name: 'App User Management',
        icon: <Users className="w-5 h-5" />,
        description: 'Admin endpoints for managing app users',
        endpoints: [
          {
            method: 'GET',
            path: '/auth/app/users',
            name: 'List App Users',
            description: 'List all app users in the project (admin only)',
            queryParams: [
              { name: 'limit', description: 'Number of results (default: 50)' },
              { name: 'offset', description: 'Pagination offset' },
              { name: 'search', description: 'Search by name or email' },
            ],
          },
          {
            method: 'GET',
            path: '/auth/app/users/:id',
            name: 'Get App User',
            description: 'Get details of a specific app user',
            pathParams: [{ name: 'id', description: 'User UUID' }],
          },
          {
            method: 'PATCH',
            path: '/auth/app/users/:id',
            name: 'Update App User',
            description: 'Update an app user (admin only)',
            pathParams: [{ name: 'id', description: 'User UUID' }],
            requestBody: {
              name: 'Updated Name',
              is_active: true,
            },
          },
          {
            method: 'DELETE',
            path: '/auth/app/users/:id',
            name: 'Delete App User',
            description: 'Delete an app user account (admin only)',
            pathParams: [{ name: 'id', description: 'User UUID' }],
          },
        ],
      },
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
            path: '/collections/:name',
            name: 'Get Collection',
            description: 'Get details of a specific collection',
            pathParams: [{ name: 'name', description: 'Collection name' }],
          },
          {
            method: 'PATCH',
            path: '/collections/:name',
            name: 'Update Collection',
            description: 'Update collection settings',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              description: 'Updated description',
            },
          },
          {
            method: 'DELETE',
            path: '/collections/:name',
            name: 'Delete Collection',
            description: 'Delete a collection and all its vectors',
            pathParams: [{ name: 'name', description: 'Collection name' }],
          },
          {
            method: 'GET',
            path: '/collections/:name/stats',
            name: 'Get Collection Stats',
            description: 'Get detailed statistics for a collection including vector count and storage usage',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            responseExample: {
              name: exampleCollection,
              vector_count: 1500,
              document_count: 75,
              storage_bytes: 4500000,
              dimensions: 1536,
              metric: 'cosine',
            },
          },
          {
            method: 'PATCH',
            path: '/collections/:name/config',
            name: 'Update RAG Config',
            description: 'Update the RAG configuration for a collection (LLM provider, prompt, retrieval settings)',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              rag_enabled: true,
              rag_config: {
                llm_provider_id: 'openai-1',
                model: 'gpt-4o',
                system_prompt: 'You are a helpful assistant.',
                temperature: 0.7,
                max_tokens: 1000,
                top_k: 5,
              },
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
            description: 'Search across one or multiple collections. Automatically generates embeddings from your query text. Supports optional reranking and advanced retrieval strategies.',
            requestBody: {
              collections: [exampleCollection],
              query: 'What is the return policy?',
              top_k: 5,
              rerank: true,
              filter: { category: 'support' },
            },
            responseExample: {
              results: [
                {
                  id: 'chunk_uuid',
                  collection: exampleCollection,
                  document_id: 'doc_uuid',
                  document_name: 'policy.pdf',
                  content: 'Our return policy allows...',
                  score: 0.94,
                  rerank_score: 0.97,
                  metadata: { document_name: 'policy.pdf' },
                },
              ],
              total: 1,
              query: 'What is the return policy?',
            },
          },
          {
            method: 'POST',
            path: '/collections/:name/search',
            name: 'Collection Search',
            description: 'Search within a specific collection. Automatically generates embeddings from your query text. Supports filtering, reranking, and retrieval strategies.',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              query: 'authentication best practices',
              top_k: 10,
              filter: { category: 'security' },
              rerank: true,
              include_content: true,
              include_metadata: true,
            },
            responseExample: {
              results: [
                {
                  id: 'chunk_uuid',
                  document_id: 'doc_uuid',
                  document_name: 'security-guide.pdf',
                  collection: exampleCollection,
                  content: 'Authentication best practices include...',
                  score: 0.94,
                  metadata: { document_name: 'security-guide.pdf' },
                },
              ],
              total: 1,
              query: 'authentication best practices',
            },
          },
        ],
      },
      {
        name: 'RAG Chat',
        icon: <MessageSquare className="w-5 h-5" />,
        description: 'Chat with your documents using RAG. Unified endpoint supports single or multiple collections.',
        endpoints: [
          {
            method: 'POST',
            path: '/rag',
            name: 'Single Collection Chat',
            description: 'Send a message and get an AI response grounded in your documents. Pass collection as a string for single collection.',
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
              sources: [
                {
                  collection: exampleCollection,
                  document_id: 'doc_uuid',
                  document_name: 'products.pdf',
                  content: 'We offer a wide range...',
                  score: 0.95,
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
            description: 'Chat across multiple collections by passing collection as an array. Sources from all collections are merged by relevance.',
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
                  collection: 'faq',
                  document_id: 'doc_uuid',
                  document_name: 'account-faq.pdf',
                  content: 'To reset your password...',
                  score: 0.98,
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
            description: 'Enable real-time streaming responses using Server-Sent Events. Set stream: true to receive incremental content.',
            requestBody: {
              collection: exampleCollection,
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
          },
        ],
      },
      {
        name: 'Conversations',
        icon: <MessageSquare className="w-5 h-5" />,
        description: 'Manage chat conversation history',
        endpoints: [
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
        name: 'Vectors (Low-Level)',
        icon: <Database className="w-5 h-5" />,
        description: 'Low-level vector operations for advanced users. For most use cases, use the Search endpoints.',
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
            name: 'Hybrid Search',
            description: 'Combine vector similarity and keyword matching (BM25) with RRF fusion. Embeddings are generated automatically from your query text.',
            pathParams: [{ name: 'name', description: 'Collection name' }],
            requestBody: {
              query: 'search keywords',
              top_k: 10,
              vector_weight: 0.7,
              keyword_weight: 0.3,
              filter: { category: 'docs' },
            },
            responseExample: [
              {
                id: 'uuid',
                document_id: 'doc_uuid',
                content: 'Matching document content...',
                score: 0.042,
                vector_score: 0.91,
                keyword_score: 0.85,
                metadata: { document_name: 'guide.pdf' },
              },
            ],
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
            path: '/tables/:table',
            name: 'Get Table Schema',
            description: 'Get table schema and column definitions',
            pathParams: [{ name: 'table', description: 'Table name' }],
          },
          {
            method: 'DELETE',
            path: '/tables/:table',
            name: 'Delete Table',
            description: 'Delete a table and all its data',
            pathParams: [{ name: 'table', description: 'Table name' }],
          },
          {
            method: 'GET',
            path: '/tables/:table/rows',
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
            path: '/tables/:table/rows',
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
            path: '/tables/:table/rows/:id',
            name: 'Get Row',
            description: 'Get a single row by ID',
            pathParams: [
              { name: 'table', description: 'Table name' },
              { name: 'id', description: 'Row ID' },
            ],
          },
          {
            method: 'PATCH',
            path: '/tables/:table/rows/:id',
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
            path: '/tables/:table/rows/:id',
            name: 'Delete Row',
            description: 'Delete a row by ID',
            pathParams: [
              { name: 'table', description: 'Table name' },
              { name: 'id', description: 'Row ID' },
            ],
          },
          {
            method: 'GET',
            path: '/tables/:table/export',
            name: 'Export Table',
            description: 'Export table data as CSV or JSON',
            pathParams: [{ name: 'table', description: 'Table name' }],
            queryParams: [{ name: 'format', description: 'Export format: csv or json (default: json)' }],
          },
          {
            method: 'POST',
            path: '/tables/:table/import',
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
        name: 'API Keys',
        icon: <Key className="w-5 h-5" />,
        description: 'Manage API keys for authentication',
        endpoints: [
          {
            method: 'GET',
            path: '/keys',
            name: 'List API Keys',
            description: 'List all API keys for the project',
            queryParams: [
              { name: 'limit', description: 'Number of results (default: 10)' },
              { name: 'offset', description: 'Pagination offset' },
            ],
          },
          {
            method: 'POST',
            path: '/keys',
            name: 'Create API Key',
            description: 'Create a new API key. The full key is only shown once.',
            requestBody: {
              name: 'Production Key',
              scopes: ['read', 'write'],
              expires_at: '2026-12-31T23:59:59Z',
            },
            responseExample: {
              id: 'uuid',
              name: 'Production Key',
              key: 'deva_xxxxxxxxxxxxxxxxxxxx',
              prefix: 'deva_xxxx',
              scopes: ['read', 'write'],
              is_active: true,
            },
          },
          {
            method: 'GET',
            path: '/keys/:id',
            name: 'Get API Key',
            description: 'Get API key details (key value is not returned)',
            pathParams: [{ name: 'id', description: 'API key UUID' }],
          },
          {
            method: 'PATCH',
            path: '/keys/:id',
            name: 'Toggle API Key',
            description: 'Enable or disable an API key. Disabled keys are immediately rejected.',
            pathParams: [{ name: 'id', description: 'API key UUID' }],
            requestBody: {
              is_active: false,
            },
          },
          {
            method: 'DELETE',
            path: '/keys/:id',
            name: 'Revoke API Key',
            description: 'Permanently delete an API key',
            pathParams: [{ name: 'id', description: 'API key UUID' }],
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
          },
          {
            method: 'POST',
            path: '/prompts',
            name: 'Create Prompt',
            description: 'Create a new prompt template with variable placeholders ({{variable}})',
            requestBody: {
              name: 'customer_support',
              content: 'You are a support agent for {{company}}.\n\nContext: {{context}}\n\nQuestion: {{question}}',
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
              content: 'Updated prompt with {{variables}}...',
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
                context: 'Product documentation...',
                question: 'What is the return policy?',
              },
            },
            responseExample: {
              rendered: 'You are a support agent for Acme Corp...',
              variables_used: ['company', 'context', 'question'],
            },
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
          },
          {
            method: 'POST',
            path: '/evaluation/datasets',
            name: 'Create Dataset',
            description: 'Create a new evaluation dataset linked to a collection',
            requestBody: {
              collection_name: exampleCollection,
              name: 'Customer Support Evaluation',
              description: 'Test queries for support docs',
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
          },
          {
            method: 'DELETE',
            path: '/evaluation/datasets/:id',
            name: 'Delete Dataset',
            description: 'Delete a dataset and all its test cases and runs',
            pathParams: [{ name: 'id', description: 'Dataset UUID' }],
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
              metrics: {
                precision_at_k: 0.82,
                recall_at_k: 0.75,
                mrr: 0.88,
                ndcg: 0.84,
                cases_evaluated: 25,
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
          },
          {
            method: 'DELETE',
            path: '/evaluation/cases/:id',
            name: 'Delete Test Case',
            description: 'Delete a test case from a dataset',
            pathParams: [{ name: 'id', description: 'Case UUID' }],
          },
        ],
      },
      {
        name: 'Benchmarks',
        icon: <BarChart3 className="w-5 h-5" />,
        description: 'Run academic-style RAG benchmarks against standard datasets',
        endpoints: [
          {
            method: 'POST',
            path: '/benchmarks/run',
            name: 'Run Benchmark',
            description: 'Run a benchmark evaluation against a dataset with specified configuration',
            requestBody: {
              dataset: 'ms_marco',
              config: {
                search_mode: 'hybrid',
                top_k: 10,
                collection_name: exampleCollection,
              },
            },
          },
          {
            method: 'GET',
            path: '/benchmarks',
            name: 'List Benchmarks',
            description: 'List all benchmark runs for the project',
          },
          {
            method: 'GET',
            path: '/benchmarks/:id',
            name: 'Get Benchmark',
            description: 'Get detailed results for a benchmark run',
            pathParams: [{ name: 'id', description: 'Benchmark UUID' }],
          },
          {
            method: 'DELETE',
            path: '/benchmarks/:id',
            name: 'Delete Benchmark',
            description: 'Delete a benchmark run',
            pathParams: [{ name: 'id', description: 'Benchmark UUID' }],
          },
          {
            method: 'GET',
            path: '/benchmarks/:id/export',
            name: 'Export Benchmark',
            description: 'Export benchmark results as JSON',
            pathParams: [{ name: 'id', description: 'Benchmark UUID' }],
          },
          {
            method: 'GET',
            path: '/benchmarks/datasets',
            name: 'List Available Datasets',
            description: 'List available benchmark datasets (MS MARCO, NQ, etc.)',
          },
          {
            method: 'POST',
            path: '/benchmarks/datasets/download',
            name: 'Download Dataset',
            description: 'Download a benchmark dataset for local use',
            requestBody: {
              dataset: 'ms_marco',
              split: 'dev',
            },
          },
          {
            method: 'GET',
            path: '/benchmarks/configs',
            name: 'Get Preset Configs',
            description: 'Get preset benchmark configurations',
          },
          {
            method: 'POST',
            path: '/benchmarks/compare',
            name: 'Compare Benchmarks',
            description: 'Compare results across multiple benchmark runs',
            requestBody: {
              benchmark_ids: ['uuid1', 'uuid2'],
            },
          },
        ],
      },
      {
        name: 'Realtime',
        icon: <Radio className="w-5 h-5" />,
        description: 'WebSocket endpoint for real-time data subscriptions',
        endpoints: [
          {
            method: 'GET',
            path: '/realtime',
            name: 'WebSocket Connection',
            description: 'Upgrade to WebSocket for real-time event subscriptions. Subscribe to collection changes, document processing events, and more.',
            responseExample: {
              _note: 'WebSocket upgrade - not a REST endpoint',
              example_message: {
                type: 'subscribe',
                channel: 'collection:my_collection',
              },
              example_event: {
                type: 'document.processed',
                data: { document_id: 'uuid', collection: exampleCollection },
              },
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <CopyableField label="Base URL" value={baseUrl} />
          <CopyableField label="Project ID" value={projectId} />
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
                  <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium mb-1 flex items-center gap-1.5">
                    Your Collections
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold normal-case tracking-normal">{collections.length}</span>
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
                  <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium mb-1 flex items-center gap-1.5">
                    Your Tables
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold normal-case tracking-normal">{tables.length}</span>
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
