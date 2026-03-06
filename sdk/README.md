<p align="center">
  <strong>⚡</strong>
</p>

<h1 align="center">Devabase SDK</h1>

<p align="center">
  <strong>The complete TypeScript SDK for building AI-powered applications</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/devabase-sdk"><img src="https://img.shields.io/npm/v/devabase-sdk.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/devabase-sdk"><img src="https://img.shields.io/npm/dm/devabase-sdk.svg" alt="npm downloads"></a>
  <a href="https://github.com/kvsovanreach/devabase/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://sovanreach.com/projects/devabase/docs"><img src="https://img.shields.io/badge/docs-documentation-blue.svg" alt="Documentation"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#examples">Examples</a>
</p>

---

## Installation

```bash
npm install devabase-sdk
```

```bash
yarn add devabase-sdk
```

```bash
pnpm add devabase-sdk
```

**Requirements:** Node.js 18+, TypeScript 4.7+ (optional)

---

## Quick Start

```typescript
import { createClient } from 'devabase-sdk';

// 1. Initialize the client
const devabase = createClient({
  baseUrl: 'https://your-server.com',
  apiKey: 'dvb_your_api_key'
});

// 2. Set project context
devabase.useProject('project-id');

// 3. Create a collection and upload documents
await devabase.collections.create({ name: 'knowledge-base', dimensions: 1536 });
await devabase.documents.upload('knowledge-base', {
  file: pdfBuffer,
  filename: 'manual.pdf'
});

// 4. Search your documents
const results = await devabase.search.query({
  collection: 'knowledge-base',
  query: 'How do I get started?',
  rerank: true
});

// 5. Chat with your documents (RAG)
const response = await devabase.chat.send({
  collection: 'knowledge-base',
  message: 'Summarize the onboarding process'
});

console.log(response.answer);
console.log(response.sources);
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Vector Collections** | Store and query millions of embeddings with cosine, L2, or inner product similarity |
| **Document Storage & Processing** | Upload PDF, DOCX, TXT, MD files with optional chunking and embedding (processing disabled by default) |
| **Semantic Search** | Vector search, hybrid retrieval (vector + BM25), and cross-encoder reranking |
| **Advanced Retrieval** | HyDE, Multi-Query, Self-Query, Parent-Child, and Compression strategies |
| **RAG Chat** | Conversational AI with source attribution, streaming, and conversation memory |
| **Knowledge Graphs** | Extract entities and relationships from documents, traverse connections |
| **Tables & REST API** | Create PostgreSQL tables with auto-generated CRUD endpoints |
| **App Authentication** | Complete auth system for end-users with JWT, password reset, email verification |
| **SQL Queries** | Execute parameterized SQL with history and schema introspection |
| **File Storage** | Upload, download, and manage files with project isolation |
| **Webhooks** | Subscribe to events with retry logic and delivery logs |
| **Prompt Templates** | Version-controlled prompts with variable substitution |
| **Real-Time Events** | WebSocket subscriptions for live data changes |
| **Evaluation & Benchmarks** | RAG quality evaluation datasets and BEIR academic benchmarks |
| **Admin & Analytics** | Cache management and usage analytics |

---

## API Reference

### Configuration

```typescript
import { createClient } from 'devabase-sdk';

const client = createClient({
  baseUrl: string,      // Required: Your Devabase server URL
  apiKey?: string,      // API key (starts with 'dvb_')
  timeout?: number,     // Request timeout in ms (default: 30000)
  headers?: object      // Custom headers for all requests
});

// Set active project (required before operations)
client.useProject(projectId: string);
```

---

### Projects & API Keys

```typescript
// Projects
const projects = await client.projects.list();
const project = await client.projects.create({ name: 'My App' });
await client.projects.update(project.id, { description: 'Updated' });
await client.projects.delete(project.id);
client.useProject(project.id);

// API Keys
const keys = await client.projects.apiKeys.list(projectId);
const key = await client.projects.apiKeys.create(projectId, {
  name: 'Production',
  scopes: ['read', 'write']
});  // Save key.key - only shown once!
await client.projects.apiKeys.toggle(projectId, keyId);
await client.projects.apiKeys.revoke(projectId, keyId);

// Team Members
const members = await client.projects.members.list(projectId);
await client.projects.members.invite('dev@team.com', 'member', projectId);
await client.projects.members.updateRole(memberId, 'admin', projectId);
await client.projects.members.remove(memberId, projectId);

// Invitations
const invitations = await client.projects.invitations.list(projectId);
await client.projects.invitations.revoke(invitationId, projectId);
await client.projects.invitations.accept(invitationId);
```

---

### Providers

Configure LLM, embedding, and rerank providers.

```typescript
// LLM providers
await client.providers.llm.upsert({
  id: 'my-openai',
  type: 'openai',       // 'openai' | 'anthropic' | 'google' | 'custom'
  api_key: 'sk-...',
  model: 'gpt-4o-mini'
});
const llmProviders = await client.providers.llm.list();
await client.providers.llm.test({ type: 'openai', api_key: 'sk-...', model: 'gpt-4o-mini' });
await client.providers.llm.delete('my-openai');

// Embedding providers
await client.providers.embedding.upsert({
  id: 'my-embeddings',
  type: 'openai',       // 'openai' | 'cohere' | 'voyage' | 'custom'
  api_key: 'sk-...',
  model: 'text-embedding-3-small',
  dimensions: 1536
});

// Rerank providers
await client.providers.rerank.upsert({
  id: 'my-reranker',
  type: 'cohere',       // 'cohere' | 'jina' | 'custom'
  api_key: 'co-...',
  model: 'rerank-v3.5'
});

// Project settings (default providers)
const settings = await client.providers.getSettings();
await client.providers.updateSettings({
  default_llm_provider: 'my-openai',
  default_embedding_provider: 'my-embeddings',
  default_rerank_provider: 'my-reranker'
});
```

---

### Collections

Manage vector collections for storing document embeddings.

```typescript
// Create
const collection = await client.collections.create({
  name: 'docs',
  dimensions: 1536,              // Must match your embedding model
  metric: 'cosine'               // 'cosine' | 'l2' | 'ip'
});

// List
const { data, pagination } = await client.collections.list({ limit: 50 });

// Get
const collection = await client.collections.get('docs');

// Stats
const stats = await client.collections.stats('docs');

// Update
await client.collections.update('docs', { description: 'Updated description' });

// Update RAG config
await client.collections.updateRagConfig('docs', {
  llm_provider_id: 'my-llm',
  model: 'gpt-4o-mini',
  system_prompt: 'You are a helpful assistant.'
});

// Delete
await client.collections.delete('docs');
```

<details>
<summary><strong>Embedding Dimensions Reference</strong></summary>

| Provider | Model | Dimensions |
|----------|-------|------------|
| OpenAI | text-embedding-3-small | 1536 |
| OpenAI | text-embedding-3-large | 3072 |
| Cohere | embed-english-v3.0 | 1024 |
| Local | all-MiniLM-L6-v2 | 384 |

</details>

---

### Documents

Upload and manage documents. Supported formats: PDF, DOCX, TXT, Markdown.

```typescript
// Upload document (stored only, no processing by default)
const doc = await client.documents.upload('collection-name', {
  file: Buffer | Blob | ReadableStream,
  filename: 'document.pdf',
  metadata: { author: 'John', category: 'technical' }
});
// Returns: { id, status: 'uploaded', ... }
// Document is stored but NOT chunked or embedded

// Upload with processing enabled (auto chunk + embed)
const doc = await client.documents.upload('collection-name', {
  file: pdfBuffer,
  filename: 'document.pdf',
  process: true  // Enable chunking & embedding
});
// Returns: { id, status: 'pending', ... }
// Document will be processed asynchronously

// Upload multiple
const docs = await client.documents.uploadMany('collection-name', [
  { file: buffer1, filename: 'doc1.pdf' },
  { file: buffer2, filename: 'doc2.pdf', process: true }
]);

// List documents
const { data } = await client.documents.list('collection-name', {
  status: 'processed',
  limit: 50
});

// List all documents across collections
const allDocs = await client.documents.listAll({ status: 'processed' });

// Get document
const doc = await client.documents.get('document-id');

// Get chunks
const chunks = await client.documents.chunks('document-id');

// Update metadata
await client.documents.updateMetadata('document-id', { category: 'updated' });

// Reprocess
await client.documents.reprocess('document-id');

// Delete
await client.documents.delete('document-id');
```

> **Note:** By default, uploaded documents are stored without processing (`status: 'uploaded'`). Set `process: true` to enable automatic chunking and embedding. When processing is enabled, it runs asynchronously — poll the document status or use webhooks to know when it completes.

---

### Chunks

Fine-grained control over document chunks.

```typescript
// Get a chunk
const chunk = await client.chunks.get('chunk-id');
// { id, document_id, content, chunk_index, token_count, metadata }

// Update chunk content or metadata
await client.chunks.update('chunk-id', {
  content: 'Updated text',
  metadata: { reviewed: true }
});

// Delete a chunk
await client.chunks.delete('chunk-id');

// Split a chunk at a character position
const { chunks } = await client.chunks.split('chunk-id', 500);

// Merge multiple chunks into one
const { chunk, merged_count } = await client.chunks.merge(
  ['chunk-1', 'chunk-2', 'chunk-3'],
  { separator: '\n\n' }
);
```

---

### Vectors

Low-level vector operations for pre-computed embeddings.

```typescript
// Upsert vectors
await client.vectors.upsert('collection-name', [
  {
    id: 'vec-1',                    // Optional: auto-generated if omitted
    embedding: [0.1, 0.2, ...],     // Float array matching collection dimensions
    metadata: { source: 'api' },
    chunk_id: 'chunk-id'            // Optional: link to a chunk
  }
]);

// Search by raw embedding
const results = await client.vectors.search('collection-name', {
  embedding: [0.1, 0.2, ...],
  top_k: 10,
  include_metadata: true,
  filter: { source: 'api' }
});

// Hybrid search (vector + keyword)
const hybrid = await client.vectors.hybridSearch('collection-name', {
  embedding: [0.1, 0.2, ...],
  query: 'search text',
  top_k: 10
});

// Delete a vector
await client.vectors.delete('collection-name', 'vec-1');
```

---

### Search

High-level text search with automatic embedding.

```typescript
// Semantic search
const results = await client.search.query({
  collection: 'docs',
  query: 'authentication best practices',
  top_k: 10,
  rerank: true,
  filter: { category: 'security' }
});
// Returns: Array<{ id, content, score, document_id, document_name, metadata }>

// Hybrid search (vector + BM25 with RRF fusion)
const results = await client.search.hybrid({
  collection: 'docs',
  query: 'JWT refresh tokens',
  top_k: 10,
  vector_weight: 0.7,
  keyword_weight: 0.3,
  filter: { type: 'guide' }
});

// Search by pre-computed vector
const results = await client.search.byVector('docs', [0.1, 0.2, ...], {
  top_k: 10,
  filter: { status: 'published' }
});

// Multi-collection search
const results = await client.search.multi({
  collections: ['docs', 'faq', 'tutorials'],
  query: 'authentication',
  top_k: 20,
  rerank: true
});
```

**Advanced Retrieval Strategies:**

```typescript
// HyDE - Hypothetical Document Embeddings
const results = await client.search.hyde({
  collection: 'docs',
  query: 'What causes memory leaks in JavaScript?',
  strategy_options: { hyde_num_hypotheticals: 2 }
});

// Multi-Query - Generates query variations, merges results
const results = await client.search.multiQuery({
  collection: 'docs',
  query: 'authentication best practices',
  strategy_options: { num_query_variations: 4 }
});

// Self-Query - Extracts filters from natural language
const results = await client.search.selfQuery({
  collection: 'docs',
  query: 'Python tutorials from 2023',
  strategy_options: {
    extractable_fields: [
      { name: 'language', description: 'Programming language', type: 'string' },
      { name: 'year', description: 'Publication year', type: 'number' }
    ]
  }
});

// Parent-Child - Search small chunks, return parent context
const results = await client.search.parentChild({
  collection: 'docs',
  query: 'error handling patterns',
  strategy_options: { parent_depth: 1 }
});

// Compression - Reduces chunks to only relevant portions
const results = await client.search.compressed({
  collection: 'docs',
  query: 'How to reset password?',
  strategy_options: { max_compressed_length: 300 }
});
```

---

### RAG Chat

Conversational AI with document context, source attribution, and streaming.

```typescript
// Basic chat (single or multiple collections)
const response = await client.chat.send({
  collection: 'docs',                    // string or string[]
  message: 'How do I implement OAuth?',
  include_sources: true,
  top_k: 5
});
// Returns: { answer, sources, conversation_id, tokens_used }

// Streaming
await client.chat.stream({
  collection: 'docs',
  message: 'Explain the architecture'
}, {
  onSources: (sources) => console.log('Sources:', sources.length),
  onThinking: (text) => console.log('Thinking:', text),
  onContent: (chunk) => process.stdout.write(chunk),
  onDone: (convId, tokens) => console.log('Done:', tokens, 'tokens'),
  onError: (err) => console.error(err)
});

// Collection-scoped chat (better error handling)
const response = await client.chat.collection('docs', {
  message: 'What is authentication?',
  include_sources: true
});

// Collection-scoped streaming
await client.chat.streamCollection('docs', {
  message: 'Explain the architecture'
}, {
  onContent: (chunk) => process.stdout.write(chunk),
  onDone: (id, tokens) => console.log('Done', tokens)
});

// Continue conversation
const response2 = await client.chat.continue(
  response.conversation_id,
  'What about refresh tokens?'
);

// Conversation management
const conversations = await client.chat.listConversations({ limit: 20 });
const conversation = await client.chat.getConversation('conv-id');
await client.chat.createConversation({ collection_id: 'uuid', title: 'Chat' });
await client.chat.updateConversation('conv-id', { title: 'Updated' });
await client.chat.deleteConversation('conv-id');
```

---

### Knowledge Graph

Extract and explore entities and relationships from documents.

```typescript
// Extract knowledge from a document
const result = await client.knowledge.extractFromDocument('document-id');
// { document_id, entities_extracted, relationships_extracted, message }

// Get stats
const stats = await client.knowledge.getStats();
// { total_entities, total_relationships, entities_by_type }
```

**Entities:**

```typescript
// List entities
const { data, pagination } = await client.knowledge.entities.list({
  entity_type: 'person',
  limit: 50
});

// Get entity with relationships
const entity = await client.knowledge.entities.get('entity-id');

// Search entities by name
const results = await client.knowledge.entities.search('John Doe', {
  entity_type: 'person',
  limit: 10
});

// Create entity
const entity = await client.knowledge.entities.create({
  name: 'OAuth 2.0',
  entity_type: 'technology',
  description: 'Authorization framework'
});

// Update entity
await client.knowledge.entities.update('entity-id', {
  description: 'Updated',
  aliases: ['OAuth2']
});

// Merge duplicates
const merged = await client.knowledge.entities.merge(
  'primary-id',
  ['duplicate-1', 'duplicate-2']
);

// Delete
await client.knowledge.entities.delete('entity-id');
```

**Relationships & Graph:**

```typescript
// List relationships
const { data } = await client.knowledge.relationships.list({
  entity_id: 'entity-id',
  limit: 50
});

// Create relationship
await client.knowledge.relationships.create({
  source_entity_id: 'entity-1',
  target_entity_id: 'entity-2',
  relationship_type: 'works_at',
  description: 'Senior Engineer since 2020'
});

// Delete relationship
await client.knowledge.relationships.delete('relationship-id');

// Get entity subgraph (N-hop neighborhood)
const graph = await client.knowledge.getGraph('entity-id', { depth: 2 });
// { entities: Entity[], relationships: Relationship[] }
```

---

### Tables

PostgreSQL tables with auto-generated REST API.

```typescript
// Create table
await client.tables.create({
  name: 'users',
  columns: [
    { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
    { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
    { name: 'name', type: 'varchar(255)' },
    { name: 'role', type: 'varchar(50)', default: "'user'" },
    { name: 'metadata', type: 'jsonb' },
    { name: 'created_at', type: 'timestamptz', default: 'now()' }
  ]
});

// Table operations
const tables = await client.tables.list();
const table = await client.tables.get('users');
await client.tables.delete('users');
```

**Row Operations:**

```typescript
const rows = client.tables.rows('users');

// Insert
const user = await rows.insert({ email: 'user@example.com', name: 'John' });
const users = await rows.insertMany([{ email: 'a@b.com' }, { email: 'c@d.com' }]);

// Query
const { rows: data, pagination } = await rows.query({
  filter: 'role.eq=admin&created_at.gte=2024-01-01',
  order: 'created_at:desc',
  select: 'id,name,email',
  limit: 20
});

// Get single row
const user = await rows.get('user-id');
const user = await rows.findFirst('email.eq=user@example.com');

// Update
const updated = await rows.update('user-id', { name: 'Jane' });

// Delete
await rows.delete('user-id');

// Utilities
const count = await rows.count('role.eq=admin');
const exists = await rows.exists('user-id');
const allUsers = await rows.all({ filter: 'role.eq=user' }); // Auto-paginated
```

<details>
<summary><strong>Filter Operators</strong></summary>

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `status.eq=active` |
| `neq` | Not equals | `status.neq=deleted` |
| `gt` | Greater than | `age.gt=18` |
| `gte` | Greater or equal | `age.gte=18` |
| `lt` | Less than | `price.lt=100` |
| `lte` | Less or equal | `price.lte=100` |
| `like` | Contains (case-insensitive) | `name.like=john` |
| `is` | Is null/true/false | `deleted_at.is=null` |

Combine with `&`: `age.gte=18&status.eq=active`

</details>

<details>
<summary><strong>Supported Column Types</strong></summary>

`uuid`, `text`, `varchar(n)`, `integer`, `bigint`, `smallint`, `serial`, `bigserial`, `real`, `double`, `numeric`, `boolean`, `jsonb`, `timestamptz`, `date`, `time`, `bytea`

</details>

---

### SQL Queries

Execute raw SQL when you need full database control.

```typescript
// Execute parameterized query
const result = await client.sql.execute(
  'SELECT * FROM articles WHERE category = $1 ORDER BY created_at DESC',
  ['technology'],
  { limit: 100 }
);
// { columns, rows, row_count, execution_time_ms }

// Get query history
const history = await client.sql.getHistory({ limit: 50 });

// Get database schema
const schema = await client.sql.getSchema();
// Array<{ table_name, columns: [{ name, type, nullable }] }>
```

> **Security:** Always use parameterized queries (`$1`, `$2`) to prevent SQL injection.

---

### App Authentication

Complete auth system for your application's end-users.

```typescript
// Register
const auth = await client.appAuth.register({
  email: 'user@example.com',
  password: 'securePassword123',
  name: 'John Doe',
  metadata: { plan: 'free' }
});
// Returns: { user, access_token, refresh_token, expires_in }

// Login
const auth = await client.appAuth.login({
  email: 'user@example.com',
  password: 'securePassword123'
});

// Current user & profile
const user = await client.appAuth.me();
await client.appAuth.updateProfile({ name: 'Jane Doe' });

// Password management
await client.appAuth.changePassword({
  current_password: 'old',
  new_password: 'new'
});
await client.appAuth.forgotPassword('user@example.com');
await client.appAuth.resetPassword(token, 'newPassword');

// Email verification
await client.appAuth.verifyEmail(token);
await client.appAuth.resendVerification();

// Token management
await client.appAuth.refresh(refreshToken);
await client.appAuth.logout();

// Delete account
await client.appAuth.deleteAccount();
```

**Server-Side Token Verification:**

```typescript
// OAuth2-style introspection
const result = await client.appAuth.verifyToken(userToken);
if (result.active) {
  console.log(result.user_id, result.email);
}

// Convenience method (throws on invalid)
const user = await client.appAuth.getUserFromToken(userToken);
```

**Dual-Auth (API Key + User Context for RLS):**

```typescript
// API key authorizes project access
// User token identifies WHO is making the request
client.asUser(userToken);

// Queries now respect row-level security
const articles = await client.tables.rows('articles').query();

client.clearUserContext();
```

**Session Helper:**

```typescript
const auth = await client.appAuth.login({ email, password });
const session = client.appAuth.createSession(auth);

session.isExpired();          // Check if expired
session.expiresWithin(300);   // Expiring within 5 minutes?
session.getPayload();         // Decoded JWT payload
```

**Admin Operations:**

```typescript
const { data } = await client.appAuth.users.list({ limit: 20 });
const user = await client.appAuth.users.get('user-id');
await client.appAuth.users.update('user-id', { status: 'suspended' });
await client.appAuth.users.delete('user-id');
```

---

### File Storage

```typescript
// Upload
const file = await client.storage.upload({
  file: buffer,                        // Buffer, Blob, or File
  path: 'uploads/profile.jpg',
  contentType: 'image/jpeg'            // Optional
});
// { path, size, content_type, url, created_at }

// Download
const blob = await client.storage.get('uploads/profile.jpg');

// Get public URL
const url = client.storage.getUrl('uploads/profile.jpg');

// Delete
await client.storage.delete('uploads/profile.jpg');
```

---

### Webhooks

```typescript
// Create
const webhook = await client.webhooks.create({
  url: 'https://yourapp.com/webhooks/devabase',
  events: ['document.processed', 'row.created', 'row.updated'],
  secret: 'whsec_your_secret'
});

// List, get, update
const webhooks = await client.webhooks.list();
const webhook = await client.webhooks.get(webhookId);
await client.webhooks.update(webhookId, { events: ['document.processed'] });

// Test (sends a test event)
const result = await client.webhooks.test(webhookId);

// Delivery logs
const logs = await client.webhooks.getLogs(webhookId, { limit: 50 });

// Delete
await client.webhooks.delete(webhookId);
```

---

### Prompt Templates

```typescript
// Create
await client.prompts.create({
  name: 'summarize',
  content: 'Summarize the following {{topic}} article:\n\n{{content}}',
  description: 'Article summarizer'
});

// Render with variables
const { rendered, variables_used } = await client.prompts.render('summarize', {
  topic: 'AI',
  content: 'Long article text...'
});

// List, get, update, delete
const prompts = await client.prompts.list();
const prompt = await client.prompts.get('summarize');
await client.prompts.update('summarize', { content: 'Updated: {{content}}' });
await client.prompts.delete('summarize');
```

---

### Real-Time Events

```typescript
// Connect to WebSocket
const connection = client.realtime.connect({
  onOpen: () => console.log('Connected'),
  onMessage: (event) => console.log(event.type, event.payload),
  onError: (err) => console.error(err),
  onClose: () => console.log('Disconnected')
});

// Subscribe to channels
client.realtime.subscribe(['documents', 'rows:articles']);

// Unsubscribe
client.realtime.unsubscribe(['documents']);

// Check status & disconnect
console.log(client.realtime.isConnected);
client.realtime.disconnect();
```

---

### Evaluation & Benchmarks

**RAG Evaluation:**

```typescript
// Create dataset with test cases
const dataset = await client.evaluation.datasets.create({
  name: 'qa-suite',
  description: 'Quality assurance'
});

await client.evaluation.cases.add(dataset.id, {
  query: 'What is OAuth?',
  expected_answer: 'OAuth is an authorization framework...',
  context: 'OAuth 2.0 enables...'
});

// Run evaluation
const run = await client.evaluation.runs.run(dataset.id, { collection: 'docs' });
const result = await client.evaluation.runs.getRun(run.id);
const runs = await client.evaluation.runs.listRuns(dataset.id);

// Dataset management
const datasets = await client.evaluation.datasets.list();
await client.evaluation.datasets.update(dataset.id, { name: 'updated' });
await client.evaluation.datasets.delete(dataset.id);
```

**Academic Benchmarks (BEIR):**

```typescript
// List available datasets
const datasets = await client.benchmarks.listDatasets();

// Run a benchmark
const run = await client.benchmarks.run({
  dataset: { source: 'beir', name: 'scifact' },
  config: { collection: 'bench-test', top_k: 10 }
});

// Results
const runs = await client.benchmarks.list();
const result = await client.benchmarks.get(run.id);
const comparison = await client.benchmarks.compare([run1.id, run2.id]);
const exported = await client.benchmarks.export(run.id);
const presets = await client.benchmarks.getPresetConfigs();
```

---

### Admin & Analytics

```typescript
// Cache management
const stats = await client.admin.cache.getStats();
await client.admin.cache.clear();
await client.admin.cache.delete('cache-key');

// Usage analytics
const usage = await client.admin.usage.get({
  start_date: '2025-01-01',
  end_date: '2025-01-31',
  limit: 100
});
const exported = await client.admin.usage.export({
  start_date: '2025-01-01',
  end_date: '2025-01-31',
  format: 'csv'
});
```

---

## Error Handling

```typescript
import {
  DevabaseError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  DatabaseError,
  ConfigurationError,
  ExternalServiceError
} from 'devabase-sdk';

try {
  await client.collections.get('non-existent');
} catch (error) {
  if (error instanceof NotFoundError) {
    // Resource not found (404)
  } else if (error instanceof AuthenticationError) {
    // Invalid or expired credentials (401)
  } else if (error instanceof AuthorizationError) {
    // Insufficient permissions (403)
  } else if (error instanceof ValidationError) {
    // Invalid input (400)
    console.log(error.details);
  } else if (error instanceof RateLimitError) {
    // Too many requests (429)
    console.log('Retry after:', error.retryAfter);
  } else if (error instanceof DevabaseError) {
    // Other API error
    console.log(error.code, error.status, error.message);
  }
}
```

---

## Advanced Configuration

### Request Options

All methods accept an optional `RequestOptions` parameter:

```typescript
const result = await client.search.query(options, {
  timeout: 60000,
  headers: { 'X-Custom': 'value' },
  signal: abortController.signal
});
```

### Cancellation

```typescript
const controller = new AbortController();

client.chat.stream(options, callbacks, { signal: controller.signal });

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);
```

---

## TypeScript Support

Full type definitions included:

```typescript
import type {
  // Config
  DevabaseConfig, RequestOptions,

  // Resources
  Collection, Document, Table, Project,

  // Search & AI
  SearchResult, HybridSearchResult, SearchOptions,
  RagChatResponse, RagChatOptions, RagStreamCallbacks,
  ChatMessage, ChatSource,
  Entity, Relationship, EntityGraph,

  // Auth
  AppUser, AppAuthResponse, TokenIntrospectionResult, ApiKey,

  // Data
  PaginatedResponse, PaginationMeta, QueryOptions,

  // Platform
  Webhook, WebhookEvent, Prompt,
  LLMProvider, EmbeddingProvider, RerankProvider,
} from 'devabase-sdk';
```

---

## Examples

### RAG Chatbot

```typescript
import { createClient } from 'devabase-sdk';
import { readFileSync } from 'fs';

const client = createClient({ baseUrl: URL, apiKey: KEY });
client.useProject(PROJECT_ID);

// Setup
await client.collections.create({ name: 'support-docs', dimensions: 1536 });
await client.documents.upload('support-docs', {
  file: readFileSync('./faq.pdf'),
  filename: 'faq.pdf'
});

// Chat
async function chat(message: string, conversationId?: string) {
  return client.chat.send({
    collection: 'support-docs',
    message,
    conversation_id: conversationId,
    include_sources: true
  });
}
```

### Full-Stack App with User Auth & RLS

```typescript
import { createClient } from 'devabase-sdk';

const db = createClient({
  baseUrl: process.env.DEVABASE_URL!,
  apiKey: process.env.DEVABASE_API_KEY!
});
db.useProject(process.env.PROJECT_ID!);

// Register endpoint
app.post('/api/register', async (req, res) => {
  const auth = await db.appAuth.register({
    email: req.body.email,
    password: req.body.password,
    name: req.body.name
  });
  res.json(auth);
});

// Protected endpoint with RLS
app.get('/api/my-articles', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = await db.appAuth.getUserFromToken(token);

  db.asUser(token);
  const { rows } = await db.tables.rows('articles').query({
    order: 'created_at:desc',
    limit: 20
  });
  db.clearUserContext();

  res.json(rows);
});
```

### Advanced Search Pipeline

```typescript
async function intelligentSearch(query: string) {
  // HyDE for complex questions
  if (query.includes('how') || query.includes('why')) {
    return client.search.hyde({ collection: 'docs', query, rerank: true });
  }

  // Self-query for filtered searches
  if (query.match(/from \d{4}|in \w+/)) {
    return client.search.selfQuery({
      collection: 'docs',
      query,
      strategy_options: {
        extractable_fields: [
          { name: 'year', type: 'number' },
          { name: 'category', type: 'string' }
        ]
      }
    });
  }

  // Default: hybrid search
  return client.search.hybrid({
    collection: 'docs',
    query,
    vector_weight: 0.7,
    keyword_weight: 0.3
  });
}
```

---

## Important Notes

| Topic | Note |
|-------|------|
| **Project Context** | Always call `useProject()` before operations |
| **Table ID Column** | Tables must have an `id` column for update/delete |
| **String Defaults** | Use `"'value'"` (with inner quotes) for string defaults |
| **Async Processing** | Document uploads return immediately; poll status for completion |
| **Dimensions** | Collection dimensions must match your embedding model |
| **Knowledge Extraction** | Requires LLM provider configured in project settings |
| **Advanced Strategies** | HyDE, Multi-Query, Self-Query, Compression require LLM provider |
| **Reranking** | Requires reranking provider (Cohere, Jina, or custom) configured |

---

## Support

- **Documentation:** [sovanreach.com/projects/devabase/docs](https://sovanreach.com/projects/devabase/docs)
- **Issues:** [GitHub Issues](https://github.com/kvsovanreach/devabase/issues)

---

## License

MIT © [Devabase](https://github.com/kvsovanreach/devabase)
