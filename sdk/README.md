# @devabase/sdk

Official Node.js SDK for [Devabase](https://devabase.dev) - Backend for RAG/LLM Applications.

## Installation

```bash
npm install @devabase/sdk
# or
yarn add @devabase/sdk
# or
pnpm add @devabase/sdk
```

## Quick Start

```typescript
import { createClient } from '@devabase/sdk';

// Initialize with API key
const client = createClient({
  baseUrl: 'http://localhost:8080',
  apiKey: 'dvb_your_api_key'
});

// Or authenticate with email/password
const client = createClient({ baseUrl: 'http://localhost:8080' });
await client.auth.login({ email: 'user@example.com', password: 'secret' });

// Set the project to work with
client.useProject('your-project-id');
```

## Features

- **Authentication** - Login, register, token management
- **Projects** - Multi-tenant project management
- **Collections** - Vector collection management
- **Documents** - Upload, process, and manage documents
- **Tables** - PostgreSQL tables with automatic REST API
- **Search** - Vector, keyword, and hybrid search
- **RAG Chat** - Conversational AI with document context
- **Knowledge Graph** - Entity and relationship extraction

## Authentication

```typescript
// Login
const auth = await client.auth.login({
  email: 'user@example.com',
  password: 'secret'
});
console.log(auth.user.name);

// Register
const auth = await client.auth.register({
  email: 'newuser@example.com',
  password: 'secret',
  name: 'New User'
});

// Get current user
const user = await client.auth.me();

// Logout
await client.auth.logout();
```

## Projects

```typescript
// List projects (paginated)
const result = await client.projects.list({ limit: 10 });
console.log(result.data);       // Array of projects
console.log(result.pagination); // Pagination info

// Create project
const project = await client.projects.create({
  name: 'My Project',
  description: 'Project description'
});

// Set active project
client.useProject(project.id);

// API Keys (paginated)
const keysResult = await client.projects.apiKeys.list(undefined, { limit: 10 });
console.log(keysResult.data); // Array of API keys

const { key } = await client.projects.apiKeys.create({
  name: 'Production Key',
  scopes: ['read', 'write']
});

// Members (paginated)
const membersResult = await client.projects.members.list(undefined, { limit: 10 });
console.log(membersResult.data); // Array of members

// Invite members
await client.projects.members.invite('colleague@example.com', 'member');

// Invitations (paginated)
const invitations = await client.projects.invitations.list(undefined, { limit: 10 });
```

## Collections

```typescript
// Create collection
const collection = await client.collections.create({
  name: 'my-docs',
  description: 'My document collection',
  dimensions: 1536,
  metric: 'cosine'
});

// List collections (paginated)
const result = await client.collections.list({ limit: 10 });
console.log(result.data);       // Array of collections
console.log(result.pagination); // Pagination info

// Get stats
const stats = await client.collections.stats('my-docs');
console.log(`${stats.document_count} documents, ${stats.chunk_count} chunks`);
```

## Documents

```typescript
import { readFileSync } from 'fs';

// Upload document
const doc = await client.documents.upload('my-docs', {
  file: readFileSync('document.pdf'),
  filename: 'document.pdf',
  metadata: { author: 'John Doe' }
});

// Upload with knowledge extraction
const doc = await client.documents.upload('my-docs', {
  file: buffer,
  filename: 'document.pdf',
  extract_knowledge: true
});

// List documents (paginated)
const result = await client.documents.list('my-docs', {
  status: 'processed',
  limit: 50
});
console.log(result.data);       // Array of documents
console.log(result.pagination); // Pagination info

// Get document chunks
const chunks = await client.documents.chunks(doc.id);
```

## Tables (with Pagination)

```typescript
// List tables (paginated)
const tablesResult = await client.tables.list({ limit: 10 });
console.log(tablesResult.data);       // Array of tables
console.log(tablesResult.pagination); // Pagination info

// Create table
const table = await client.tables.create({
  name: 'users',
  columns: [
    { name: 'id', type: 'uuid', primary: true },
    { name: 'email', type: 'text', unique: true },
    { name: 'name', type: 'text' },
    { name: 'age', type: 'int' },
    { name: 'created_at', type: 'timestamptz', default: 'now()' }
  ]
});

// Insert row
const user = await client.tables.rows('users').insert({
  email: 'user@example.com',
  name: 'John Doe',
  age: 30
});

// Query with pagination
const result = await client.tables.rows('users').query({
  page: 1,
  per_page: 20,
  order: 'created_at:desc',
  filter: 'age.gte=18'
});

console.log(result.rows);
console.log(result.pagination);
// {
//   total: 150,
//   count: 20,
//   page: 1,
//   total_pages: 8,
//   has_next: true,
//   has_previous: false,
//   next_cursor: 'b2Zmc2V0OjIw'
// }

// Cursor-based pagination
const page2 = await client.tables.rows('users').query({
  cursor: result.pagination.next_cursor
});

// Get all rows (auto-paginate)
const allUsers = await client.tables.rows('users').all({
  filter: 'status.eq=active'
});

// Find first matching row
const user = await client.tables.rows('users').findFirst(
  'email.eq=user@example.com'
);

// Update row
await client.tables.rows('users').update(user.id, {
  name: 'Jane Doe'
});

// Delete row
await client.tables.rows('users').delete(user.id);
```

## Search

```typescript
// Vector search
const results = await client.search.query({
  collection: 'my-docs',
  query: 'How to implement authentication?',
  top_k: 10,
  rerank: true
});

// Hybrid search
const results = await client.search.hybrid({
  collection: 'my-docs',
  query: 'authentication JWT tokens',
  vector_weight: 0.7,
  keyword_weight: 0.3
});

// Global search (all collections)
const results = await client.search.global('authentication');

// Create embeddings
const embeddings = await client.search.embed(['Hello, World!']);
```

## RAG Chat

```typescript
// Single message
const response = await client.chat.send({
  collection: 'my-docs',
  message: 'What is the authentication flow?',
  include_sources: true
});

console.log(response.message);
console.log(response.sources);

// Streaming response
await client.chat.stream({
  collection: 'my-docs',
  message: 'Explain the architecture',
  onChunk: (chunk) => process.stdout.write(chunk),
  onComplete: (response) => {
    console.log('\nSources:', response.sources);
  }
});

// Multi-turn conversation
const response1 = await client.chat.send({
  collection: 'my-docs',
  message: 'What is authentication?'
});

const response2 = await client.chat.continue(
  response1.conversation_id,
  'How do I implement it?'
);
```

## Knowledge Graph

```typescript
// Extract from document
const knowledge = await client.knowledge.extractFromDocument('document-id');
console.log(knowledge.entities);
console.log(knowledge.relationships);

// List entities (paginated)
const entitiesResult = await client.knowledge.entities.list({ limit: 20 });
console.log(entitiesResult.data);       // Array of entities
console.log(entitiesResult.pagination); // Pagination info

// Search entities
const entities = await client.knowledge.entities.search('John');

// List relationships (paginated)
const relationshipsResult = await client.knowledge.relationships.list({ limit: 20 });
console.log(relationshipsResult.data); // Array of relationships

// Get entity graph
const graph = await client.knowledge.getGraph('entity-id', { depth: 2 });

// Find path between entities
const paths = await client.knowledge.findPath('entity-1', 'entity-2');

// Create relationship
await client.knowledge.relationships.create({
  source_entity_id: 'person-id',
  target_entity_id: 'company-id',
  relationship_type: 'works_at'
});
```

## Error Handling

```typescript
import {
  DevabaseError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError
} from '@devabase/sdk';

try {
  await client.collections.get('non-existent');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Collection not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Please login first');
  } else if (error instanceof ValidationError) {
    console.log('Invalid input:', error.details);
  } else if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof DevabaseError) {
    console.log(`Error ${error.code}: ${error.message}`);
  }
}
```

## Request Options

All methods accept optional request options:

```typescript
// Custom timeout
const result = await client.collections.list({
  timeout: 60000
});

// Custom headers
const result = await client.search.query({
  collection: 'my-docs',
  query: 'test'
}, {
  headers: { 'X-Custom-Header': 'value' }
});

// Abort signal for cancellation
const controller = new AbortController();
const promise = client.chat.stream({
  collection: 'my-docs',
  message: 'Long query...',
  onChunk: console.log
}, {
  signal: controller.signal
});

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  User,
  Project,
  Collection,
  Document,
  SearchResult,
  ChatResponse,
  PaginationMeta
} from '@devabase/sdk';

// Types are automatically inferred
const user = await client.auth.me(); // User
const results = await client.search.query({...}); // SearchResult[]
```

## Filter Syntax

For table queries, use the filter parameter with these operators:

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal | `status.eq=active` |
| `neq` | Not equal | `status.neq=deleted` |
| `gt` | Greater than | `age.gt=18` |
| `gte` | Greater or equal | `age.gte=18` |
| `lt` | Less than | `price.lt=100` |
| `lte` | Less or equal | `price.lte=100` |
| `like` | Contains (case-insensitive) | `name.like=john` |
| `is` | Is null/true/false | `deleted_at.is=null` |

Combine filters with `&`:

```typescript
const result = await client.tables.rows('products').query({
  filter: 'price.gte=10&price.lte=100&status.eq=active'
});
```

## Order Syntax

```typescript
// Single column
const result = await client.tables.rows('users').query({
  order: 'created_at:desc'
});

// Multiple columns
const result = await client.tables.rows('users').query({
  order: 'status:asc,created_at:desc'
});
```

## License

MIT
