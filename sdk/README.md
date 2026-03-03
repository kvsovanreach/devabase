<p align="center">
  <strong>⚡</strong>
</p>

<h1 align="center">Devabase SDK</h1>

<p align="center">
  <strong>The complete backend SDK for RAG and LLM applications</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/devabase-sdk"><img src="https://img.shields.io/npm/v/devabase-sdk.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/devabase-sdk"><img src="https://img.shields.io/npm/dm/devabase-sdk.svg" alt="npm downloads"></a>
  <a href="https://github.com/kvsovanreach/devabase/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://sovanreach.com/projects/devabase"><img src="https://img.shields.io/badge/docs-documentation-blue.svg" alt="Documentation"></a>
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

Get up and running in under 5 minutes.

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
| **Document Processing** | Upload PDF, DOCX, TXT, MD, HTML, CSV, JSON files with automatic chunking and embedding |
| **Semantic Search** | Vector search, keyword search, hybrid retrieval, and cross-encoder reranking |
| **Advanced Retrieval** | HyDE, Multi-Query, Self-Query, Parent-Child, and Compression strategies |
| **RAG Chat** | Conversational AI with source attribution, streaming, and conversation memory |
| **Knowledge Graphs** | Extract entities and relationships from documents, traverse connections |
| **Tables & REST API** | Create PostgreSQL tables with auto-generated CRUD endpoints |
| **App Authentication** | Complete auth system for your end-users with JWT, password reset, and email verification |

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

// Delete
await client.collections.delete('docs');

// Clear (remove documents, keep collection)
await client.collections.clear('docs');
```

<details>
<summary><strong>Embedding Dimensions Reference</strong></summary>

| Provider | Model | Dimensions |
|----------|-------|------------|
| OpenAI | text-embedding-3-small | 1536 |
| OpenAI | text-embedding-3-large | 3072 |
| Cohere | embed-english-v3.0 | 1024 |
| Local | all-MiniLM-L6-v2 | 384 |
| Local | bge-small-en | 384 |

</details>

---

### Documents

Upload and manage documents. Supported formats: PDF, DOCX, TXT, Markdown.

```typescript
// Upload single document
const doc = await client.documents.upload('collection-name', {
  file: Buffer | Blob | ReadableStream,
  filename: 'document.pdf',
  metadata: { author: 'John', category: 'technical' }
});
// Returns: { id, status: 'pending' | 'processing' | 'processed' | 'failed', ... }

// Upload multiple
const docs = await client.documents.uploadMany('collection-name', [
  { file: buffer1, filename: 'doc1.pdf' },
  { file: buffer2, filename: 'doc2.pdf' }
]);

// List documents
const { data } = await client.documents.list('collection-name', {
  status: 'processed',
  limit: 50
});

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

> **Note:** Document processing is asynchronous. Poll the document status or use webhooks to know when processing completes.

---

### Search

Semantic search with multiple retrieval modes.

```typescript
// Vector search
const results = await client.search.query({
  collection: 'docs',
  query: 'authentication best practices',
  top_k: 10,
  rerank: true,
  filter: { category: 'security' }
});
// Returns: Array<{ id, content, score, document_id, document_name, metadata }>

// Hybrid search (vector + keyword)
const results = await client.search.hybrid({
  collection: 'docs',
  query: 'JWT refresh tokens',
  vector_weight: 0.7,
  keyword_weight: 0.3,
  rerank: true
});

// Keyword search (BM25)
const results = await client.search.keyword({
  collection: 'docs',
  query: 'authentication',
  top_k: 10
});

// Search across all collections
const results = await client.search.global('query', {
  top_k: 20
});

// Generate embeddings
const vectors = await client.search.embed(['text 1', 'text 2']);

// Search by vector
const results = await client.search.byVector('docs', vector, { top_k: 10 });

// Similar chunks
const similar = await client.search.similar('chunk-id', 'docs', 5);
```

**Advanced Retrieval Strategies:**

```typescript
// HyDE - Hypothetical Document Embeddings
// Generates a hypothetical answer, embeds it, then searches
const results = await client.search.hyde({
  collection: 'docs',
  query: 'What causes memory leaks in JavaScript?',
  rerank: true,
  strategy_options: { hyde_num_hypotheticals: 2 }
});

// Multi-Query - Expands query into variations
// Generates N variations, searches each, merges results
const results = await client.search.multiQuery({
  collection: 'docs',
  query: 'authentication best practices',
  strategy_options: { num_query_variations: 4 }
});

// Self-Query - Extracts filters from natural language
// Parses "Python docs from 2023" → query="docs" + filter={language:"Python", year:2023}
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

Conversational AI with document context.

```typescript
// Basic chat
const response = await client.chat.send({
  collection: 'docs',                    // string or string[]
  message: 'How do I implement OAuth?',
  include_sources: true,
  top_k: 5
});
// Returns: { answer, sources, collections_used, conversation_id, tokens_used }

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

// Continue conversation
const response2 = await client.chat.continue(
  response.conversation_id,
  'What about refresh tokens?'
);

// Conversation management
const conversations = await client.chat.listConversations({ limit: 20 });
const conversation = await client.chat.getConversation('conv-id');
await client.chat.deleteConversation('conv-id');
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

// Current user
const user = await client.appAuth.me();

// Profile management
await client.appAuth.updateProfile({ name: 'Jane Doe' });
await client.appAuth.changePassword({
  current_password: 'old',
  new_password: 'new'
});

// Password reset flow
await client.appAuth.forgotPassword('user@example.com');
await client.appAuth.resetPassword(token, 'newPassword');

// Email verification
await client.appAuth.verifyEmail(token);
await client.appAuth.resendVerification();

// Token management
await client.appAuth.refresh(refreshToken);
client.appAuth.setToken(accessToken);
await client.appAuth.logout();

// Delete account
await client.appAuth.deleteAccount();
```

**Admin Operations:**

```typescript
const { data } = await client.appAuth.users.list({ limit: 20 });
const user = await client.appAuth.users.get('user-id');
await client.appAuth.users.update('user-id', { status: 'suspended' });
await client.appAuth.users.delete('user-id');
```

---

### Projects & API Keys

```typescript
// Projects
const projects = await client.projects.list();
const project = await client.projects.create({ name: 'My App' });
client.useProject(project.id);

// API Keys
const keys = await client.projects.apiKeys.list();
const { key } = await client.projects.apiKeys.create({
  name: 'Production',
  scopes: ['read', 'write']
});  // Save this key - only shown once!
await client.projects.apiKeys.revoke('key-id');

// Team Members
const members = await client.projects.members.list();
await client.projects.members.invite('email@example.com', 'member');
await client.projects.members.updateRole('member-id', 'admin');
await client.projects.members.remove('member-id');
```

---

### Knowledge Graph

Extract and explore entities and relationships from your documents.

**Entity Operations:**

```typescript
// List entities
const { data, pagination } = await client.knowledge.entities.list({
  entity_type: 'person',
  limit: 50
});

// Get entity with relationships
const entity = await client.knowledge.entities.get('entity-id');

// Search entities
const results = await client.knowledge.entities.search('John Doe', {
  entity_type: 'person',
  limit: 10
});

// Update entity
await client.knowledge.entities.update('entity-id', {
  description: 'Updated description',
  aliases: ['Johnny', 'J. Doe']
});

// Merge duplicate entities
const merged = await client.knowledge.entities.merge(
  'primary-entity-id',
  ['duplicate-id-1', 'duplicate-id-2']
);

// Delete entity
await client.knowledge.entities.delete('entity-id');
```

**Relationship Operations:**

```typescript
// List relationships
const { data } = await client.knowledge.relationships.list({
  entity_id: 'entity-id',
  limit: 50
});

// Create relationship
const relationship = await client.knowledge.relationships.create({
  source_entity_id: 'person-1',
  target_entity_id: 'company-1',
  relationship_type: 'works_at',
  description: 'Senior Engineer since 2020'
});

// Delete relationship
await client.knowledge.relationships.delete('relationship-id');
```

**Graph Operations:**

```typescript
// Get entity subgraph (N-hop neighborhood)
const graph = await client.knowledge.getGraph('entity-id', { depth: 2 });
// Returns: { entities: Entity[], relationships: Relationship[] }

// Find paths between entities
const paths = await client.knowledge.findPath(
  'entity-1',
  'entity-2',
  { max_depth: 5 }
);
```

**Knowledge Extraction:**

```typescript
// Extract knowledge from a document
const knowledge = await client.knowledge.extractFromDocument('document-id');
// Returns: { entities: Entity[], relationships: Relationship[] }

// Extract from all documents in a collection (async job)
const job = await client.knowledge.extractFromCollection('my-collection');
// Returns: { job_id: string, status: string }

// Check extraction job status
const status = await client.knowledge.getExtractionStatus(job.job_id);
// Returns: { status: 'pending'|'processing'|'completed'|'failed', progress: number, ... }
```

<details>
<summary><strong>Entity Types</strong></summary>

| Type | Description |
|------|-------------|
| `person` | People, individuals |
| `organization` | Companies, institutions |
| `location` | Places, addresses |
| `concept` | Ideas, topics |
| `product` | Products, services |
| `event` | Events, occurrences |
| `technology` | Technologies, tools |

</details>

---

## Error Handling

```typescript
import {
  DevabaseError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError
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

Full type definitions included. Import types directly:

```typescript
import type {
  // Core
  Collection,
  Document,
  SearchResult,
  Table,
  PaginatedResponse,

  // RAG
  RagChatResponse,
  RagChatOptions,
  ChatMessage,
  ChatSource,
  RagStreamCallbacks,

  // Knowledge Graph
  Entity,
  Relationship,
  EntityGraph,

  // Auth
  AppUser,
  AuthResponse,
  ApiKey,

  // Webhooks
  Webhook,
  WebhookEvent,
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

// Chat endpoint
async function chat(message: string, conversationId?: string) {
  return client.chat.send({
    collection: 'support-docs',
    message,
    conversation_id: conversationId,
    include_sources: true
  });
}
```

### CRUD API

```typescript
// Create table
await client.tables.create({
  name: 'posts',
  columns: [
    { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
    { name: 'title', type: 'text', nullable: false },
    { name: 'content', type: 'text' },
    { name: 'author_id', type: 'uuid', references_table: 'users' },
    { name: 'published', type: 'boolean', default: 'false' },
    { name: 'created_at', type: 'timestamptz', default: 'now()' }
  ]
});

// CRUD operations
const post = await client.tables.rows('posts').insert({
  title: 'Hello World',
  content: 'My first post'
});

const { rows } = await client.tables.rows('posts').query({
  filter: 'published.eq=true',
  order: 'created_at:desc',
  limit: 10
});
```

### Knowledge Graph Analysis

```typescript
// Extract knowledge from documents
await client.knowledge.extractFromDocument('document-id');

// Search for a person
const [person] = await client.knowledge.entities.search('Elon Musk', {
  entity_type: 'person'
});

// Get their connections (2-hop)
const graph = await client.knowledge.getGraph(person.id, { depth: 2 });

// Find connections between entities
const paths = await client.knowledge.findPath(
  'person-id',
  'company-id',
  { max_depth: 3 }
);

// Visualize
console.log(`Found ${graph.entities.length} entities`);
console.log(`Found ${graph.relationships.length} relationships`);
```

### Advanced Search Pipeline

```typescript
// Combine strategies for best results
async function intelligentSearch(query: string) {
  // Try HyDE for complex questions
  if (query.includes('how') || query.includes('why')) {
    return client.search.hyde({
      collection: 'docs',
      query,
      rerank: true
    });
  }

  // Use self-query for filtered searches
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

  // Default to hybrid search
  return client.search.hybrid({
    collection: 'docs',
    query,
    vector_weight: 0.7,
    keyword_weight: 0.3,
    rerank: true
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
| **Reranking** | Requires reranking provider (Cohere, Jina, or Voyage) configured |

---

## Support

- **Documentation:** [sovanreach.com/projects/devabase](https://sovanreach.com/projects/devabase)
- **Issues:** [GitHub Issues](https://github.com/kvsovanreach/devabase/issues)

---

## License

MIT © [Devabase](https://github.com/kvsovanreach/devabase)
