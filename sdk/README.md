# @devabase/sdk

Official Node.js/TypeScript SDK for Devabase - Backend for RAG/LLM Applications.

## Installation

```bash
npm install @devabase/sdk
```

## Initialization

```typescript
import { createClient } from '@devabase/sdk';

// Initialize with API key (required)
const client = createClient({
  baseUrl: 'http://localhost:9002',  // Your Devabase server URL
  apiKey: 'dvb_your_api_key'         // Get from dashboard /keys
});

// Set project context (required for all operations)
client.useProject('your-project-id');
```

## Authentication Headers

All requests automatically include:
- `Authorization: Bearer <api_key>`
- `X-Project-ID: <project_id>`
- `Content-Type: application/json`

---

## Collections

Manage vector collections for storing document embeddings.

### Create Collection

```typescript
const collection = await client.collections.create({
  name: 'my-docs',           // Required: unique name
  dimensions: 768,           // Required: embedding dimensions (768 for sentence-transformers, 1536 for OpenAI)
  metric: 'cosine'           // Optional: 'cosine' | 'l2' | 'ip' (default: cosine)
});
// Returns: { id, name, dimensions, metric, document_count, chunk_count, created_at }
```

### List Collections

```typescript
const result = await client.collections.list({ limit: 50, offset: 0 });
// Returns: { data: Collection[], pagination: { total, count, limit, offset, has_next, has_previous } }
```

### Get Collection

```typescript
const collection = await client.collections.get('my-docs');
// Returns: { id, name, dimensions, metric, document_count, chunk_count, created_at }
```

### Get Collection Stats

```typescript
const stats = await client.collections.stats('my-docs');
// Returns: { name, document_count, chunk_count, total_size_bytes }
```

### Update Collection

```typescript
const updated = await client.collections.update('my-docs', {
  description: 'Updated description'
});
```

### Delete Collection

```typescript
await client.collections.delete('my-docs');
// Deletes collection and all its documents/chunks
```

### Clear Collection

```typescript
await client.collections.clear('my-docs');
// Removes all documents but keeps collection
```

---

## Documents

Upload and manage documents for RAG. Supported formats: PDF, TXT, MD, DOCX.

### Upload Document

```typescript
import { readFileSync } from 'fs';

const doc = await client.documents.upload('my-docs', {
  file: readFileSync('document.pdf'),  // Buffer, Blob, or ReadableStream
  filename: 'document.pdf',            // Required: original filename
  metadata: { author: 'John' }         // Optional: custom metadata
});
// Returns: { id, collection_id, filename, content_type, size_bytes, status, chunk_count, created_at }
// Status: 'pending' | 'processing' | 'processed' | 'failed'
```

### Upload Multiple Documents

```typescript
const docs = await client.documents.uploadMany('my-docs', [
  { file: buffer1, filename: 'doc1.pdf' },
  { file: buffer2, filename: 'doc2.pdf' }
]);
```

### List Documents

```typescript
const result = await client.documents.list('my-docs', {
  status: 'processed',  // Optional: filter by status
  limit: 50,
  offset: 0
});
// Returns: { data: Document[], pagination: {...} }
```

### Get Document

```typescript
const doc = await client.documents.get('document-id');
```

### Get Document Chunks

```typescript
const chunks = await client.documents.chunks('document-id');
// Returns: Array<{ id, content, metadata }>
```

### Update Document Metadata

```typescript
const doc = await client.documents.updateMetadata('document-id', {
  author: 'Jane',
  category: 'Technical'
});
```

### Reprocess Document

```typescript
const doc = await client.documents.reprocess('document-id');
// Re-chunks and re-embeds the document
```

### Delete Document

```typescript
await client.documents.delete('document-id');
```

---

## Search

Semantic search with vector, keyword, and hybrid modes.

### Vector Search (Single Collection)

```typescript
const results = await client.search.query({
  collection: 'my-docs',      // Required
  query: 'How to authenticate?',  // Required
  top_k: 10,                  // Optional: number of results (default: 10)
  rerank: true,               // Optional: enable reranking for better results
  include_content: true,      // Optional: include chunk content (default: true)
  filter: { category: 'auth' } // Optional: metadata filter
});
// Returns: Array<{ id, content, score, document_id, document_name, metadata, rerank_score? }>
```

### Hybrid Search (Vector + Keyword)

```typescript
const results = await client.search.hybrid({
  collection: 'my-docs',
  query: 'authentication JWT tokens',
  top_k: 10,
  vector_weight: 0.7,   // Weight for vector similarity
  keyword_weight: 0.3,  // Weight for keyword matching
  rerank: true
});
```

### Keyword Search (BM25)

```typescript
const results = await client.search.keyword({
  collection: 'my-docs',
  query: 'authentication',
  top_k: 10
});
```

### Global Search (All Collections)

```typescript
const results = await client.search.global('authentication', {
  top_k: 20,
  rerank: true
});
```

### Search by Vector

```typescript
// First get embeddings
const embeddings = await client.search.embed(['my query text']);

// Then search by vector
const results = await client.search.byVector('my-docs', embeddings[0], {
  top_k: 10
});
```

### Create Embeddings

```typescript
const embeddings = await client.search.embed(['text 1', 'text 2']);
// Returns: number[][] (array of embedding vectors)
```

---

## RAG Chat

Conversational AI with document context. Supports single/multi-collection and streaming.

### Basic RAG Chat

```typescript
const response = await client.chat.send({
  collection: 'my-docs',           // Required: collection name or array of names
  message: 'What is the auth flow?', // Required: user message
  include_sources: true,           // Optional: include source documents (default: true)
  top_k: 5,                        // Optional: chunks to retrieve (default: 5)
  conversation_id: 'conv-id'       // Optional: continue existing conversation
});
// Returns: {
//   answer: string,
//   thinking?: string,
//   sources: Array<{ chunk_id, document_id, document_name, content, score, collection_name? }>,
//   collections_used: string[],
//   conversation_id?: string,
//   tokens_used: number
// }
```

### Multi-Collection RAG

```typescript
const response = await client.chat.send({
  collection: ['docs', 'faq', 'tutorials'],  // Search across multiple collections
  message: 'How do I implement OAuth?',
  top_k: 15
});

console.log(response.collections_used);  // Which collections contributed
```

### Streaming RAG Chat

```typescript
await client.chat.stream({
  collection: 'my-docs',
  message: 'Explain the architecture in detail'
}, {
  onSources: (sources) => {
    // Called once when sources are retrieved
    console.log('Found', sources.length, 'sources');
  },
  onThinking: (thinking) => {
    // Called with model's reasoning (if supported)
    console.log('Thinking:', thinking);
  },
  onContent: (chunk) => {
    // Called for each content chunk
    process.stdout.write(chunk);
  },
  onDone: (conversationId, tokensUsed) => {
    // Called when complete
    console.log('\nDone!', tokensUsed, 'tokens');
  },
  onError: (error) => {
    // Called on error
    console.error('Error:', error);
  }
});
```

### Continue Conversation

```typescript
const response1 = await client.chat.send({
  collection: 'my-docs',
  message: 'What is authentication?'
});

// Use conversation_id to continue
const response2 = await client.chat.continue(
  response1.conversation_id!,
  'How do I implement it?',
  { include_sources: true, top_k: 5 }
);
```

### List Conversations

```typescript
const conversations = await client.chat.listConversations({
  collection: 'my-docs',  // Optional: filter by collection
  limit: 20
});
// Returns: Array<{ id, collection_name, title, message_count, total_tokens, created_at, updated_at }>
```

### Get Conversation

```typescript
const conv = await client.chat.getConversation('conversation-id');
```

### Delete Conversation

```typescript
await client.chat.deleteConversation('conversation-id');
```

---

## Tables

PostgreSQL tables with automatic REST API.

### Create Table

```typescript
const table = await client.tables.create({
  name: 'users',
  columns: [
    { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
    { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
    { name: 'name', type: 'varchar(255)' },
    { name: 'age', type: 'integer' },
    { name: 'status', type: 'varchar(50)', default: "'active'" },
    { name: 'metadata', type: 'jsonb' },
    { name: 'created_at', type: 'timestamptz', default: 'now()' },
    { name: 'updated_at', type: 'timestamptz', default: 'now()' }
  ]
});
// Column types: uuid, varchar(n), text, integer, bigint, boolean, jsonb, timestamptz, date, time
```

### Timestamp Handling

ISO 8601 timestamp strings are automatically parsed:

```typescript
// All these formats work:
await client.tables.rows('events').insert({
  scheduled_at: new Date().toISOString(),           // "2024-01-15T10:30:00.000Z"
  event_date: '2024-01-15',                         // Date only
  start_time: '2024-01-15T10:30:00'                 // Without timezone
});
```

### Auto-Update `updated_at`

The `updated_at` column's `default: 'now()'` only applies on INSERT. To auto-update on UPDATE, manually include it:

```typescript
// Option 1: Include updated_at in every update
await client.tables.rows('users').update(id, {
  name: 'Jane',
  updated_at: new Date().toISOString()
});

// Option 2: Create a helper function
const updateRow = async (table: string, id: string, data: object) => {
  return client.tables.rows(table).update(id, {
    ...data,
    updated_at: new Date().toISOString()
  });
};
```

### List Tables

```typescript
const result = await client.tables.list({ limit: 50 });
// Returns: { data: Table[], pagination: {...} }
```

### Get Table

```typescript
const table = await client.tables.get('users');
// Returns: { name, columns: Array<{ name, data_type, is_nullable, is_primary, column_default }>, row_count, created_at }
```

### Delete Table

```typescript
await client.tables.delete('users');
```

### Insert Row

```typescript
const user = await client.tables.rows('users').insert({
  email: 'user@example.com',
  name: 'John Doe',
  age: 30,
  metadata: { plan: 'pro' }
});
// Returns the inserted row with generated fields (id, created_at, etc.)
```

### Insert Multiple Rows

```typescript
const users = await client.tables.rows('users').insertMany([
  { email: 'user1@example.com', name: 'User 1' },
  { email: 'user2@example.com', name: 'User 2' }
]);
```

### Query Rows

```typescript
const result = await client.tables.rows('users').query({
  limit: 20,                    // Max rows to return
  offset: 0,                    // Skip N rows
  order: 'created_at:desc',     // Sort: 'column:asc' or 'column:desc'
  filter: 'status.eq=active',   // Filter conditions
  select: 'id,name,email'       // Columns to return
});
// Returns: { rows: T[], pagination: { total, count, limit, offset, has_next, has_previous, next_cursor, prev_cursor } }
```

### Filter Syntax

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
filter: 'age.gte=18&status.eq=active&name.like=john'
```

### Get Single Row

```typescript
const user = await client.tables.rows('users').get('row-id');
```

### Find First Matching Row

```typescript
const user = await client.tables.rows('users').findFirst('email.eq=user@example.com');
// Returns row or null
```

### Update Row

```typescript
const updated = await client.tables.rows('users').update('row-id', {
  name: 'Jane Doe',
  status: 'premium'
});
```

### Delete Row

```typescript
await client.tables.rows('users').delete('row-id');
```

### Count Rows

```typescript
const count = await client.tables.rows('users').count('status.eq=active');
```

### Check If Row Exists

```typescript
const exists = await client.tables.rows('users').exists('row-id');
// Returns: boolean
```

### Get All Rows (Auto-Paginate)

```typescript
const allUsers = await client.tables.rows('users').all({
  filter: 'status.eq=active',
  order: 'created_at:desc'
});
// Returns all matching rows (handles pagination automatically)
```

### Cursor-Based Pagination

```typescript
const page1 = await client.tables.rows('users').query({ limit: 50 });
const page2 = await client.tables.rows('users').query({
  cursor: page1.pagination.next_cursor
});
```

---

## App Authentication

Complete authentication system for your application's end-users.

### Register User

```typescript
const auth = await client.appAuth.register({
  email: 'user@example.com',
  password: 'securePassword123',
  name: 'John Doe',                    // Optional
  phone: '+1234567890',                // Optional
  metadata: { plan: 'free' }           // Optional: custom data
});
// Returns: { user, access_token, refresh_token, token_type, expires_in }
```

### Login User

```typescript
const auth = await client.appAuth.login({
  email: 'user@example.com',
  password: 'securePassword123'
});
// Token is automatically stored for subsequent requests
```

### Set Token Manually

```typescript
client.appAuth.setToken(auth.access_token);
```

### Get Current User

```typescript
const user = await client.appAuth.me();
// Returns: { id, email, email_verified, name, avatar_url, phone, status, metadata, created_at }
```

### Update Profile

```typescript
const updated = await client.appAuth.updateProfile({
  name: 'Jane Doe',
  phone: '+1987654321',
  metadata: { plan: 'pro' }
});
```

### Change Password

```typescript
await client.appAuth.changePassword({
  current_password: 'oldPassword',
  new_password: 'newSecurePassword123'
});
```

### Password Reset Flow

```typescript
// Step 1: Request reset (sends email with token)
await client.appAuth.forgotPassword('user@example.com');

// Step 2: Reset with token from email
await client.appAuth.resetPassword(token, 'newPassword');
```

### Email Verification

```typescript
await client.appAuth.verifyEmail(token);
await client.appAuth.resendVerification();
```

### Refresh Token

```typescript
const newAuth = await client.appAuth.refresh(refreshToken);
```

### Logout

```typescript
await client.appAuth.logout();
```

### Delete Account

```typescript
await client.appAuth.deleteAccount();
```

### Admin: List Users

```typescript
const result = await client.appAuth.users.list({ limit: 20 });
// Returns: { data: AppUser[], pagination: {...} }
```

### Admin: Get User

```typescript
const user = await client.appAuth.users.get('user-id');
```

### Admin: Update User

```typescript
const updated = await client.appAuth.users.update('user-id', {
  status: 'suspended',
  email_verified: true
});
```

### Admin: Delete User

```typescript
await client.appAuth.users.delete('user-id');
```

---

## Projects

Manage projects and API keys.

### List Projects

```typescript
const result = await client.projects.list({ limit: 10 });
```

### Create Project

```typescript
const project = await client.projects.create({
  name: 'My Project',
  description: 'Project description'
});
```

### Set Active Project

```typescript
client.useProject(project.id);
```

### API Keys

```typescript
// List keys
const keys = await client.projects.apiKeys.list();

// Create key
const { key } = await client.projects.apiKeys.create({
  name: 'Production Key',
  scopes: ['read', 'write']
});
// IMPORTANT: Save the key - it's only shown once

// Revoke key
await client.projects.apiKeys.revoke('key-id');
```

### Members

```typescript
// List members
const members = await client.projects.members.list();

// Invite member
await client.projects.members.invite('colleague@example.com', 'member');  // 'admin' | 'member' | 'viewer'

// Update role
await client.projects.members.updateRole('member-id', 'admin');

// Remove member
await client.projects.members.remove('member-id');
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
  RateLimitError
} from '@devabase/sdk';

try {
  await client.collections.get('non-existent');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Collection not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid or expired API key');
  } else if (error instanceof AuthorizationError) {
    console.log('Access denied');
  } else if (error instanceof ValidationError) {
    console.log('Invalid input:', error.details);
  } else if (error instanceof RateLimitError) {
    console.log('Rate limited. Retry after:', error.retryAfter, 'seconds');
  } else if (error instanceof DevabaseError) {
    console.log(`Error ${error.code} (${error.status}): ${error.message}`);
  }
}
```

---

## Request Options

All methods accept optional request options:

```typescript
// Custom timeout (milliseconds)
const result = await client.collections.list(undefined, {
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
  message: 'Long query...'
}, callbacks, {
  signal: controller.signal
});

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);
```

---

## TypeScript Types

All types are exported:

```typescript
import type {
  // Config
  DevabaseConfig,
  RequestOptions,

  // Auth
  User,
  AuthResponse,
  AppUser,
  AppAuthResponse,

  // Resources
  Project,
  Collection,
  Document,
  Table,
  TableColumn,

  // Search
  SearchResult,
  SearchOptions,

  // Chat
  RagChatOptions,
  RagChatResponse,
  ChatSource,
  RagStreamCallbacks,

  // Pagination
  PaginatedResponse,
  PaginationMeta,
  QueryOptions
} from '@devabase/sdk';
```

---

## Complete Example

```typescript
import { createClient } from '@devabase/sdk';
import { readFileSync } from 'fs';

async function main() {
  // Initialize
  const client = createClient({
    baseUrl: 'http://localhost:9002',
    apiKey: 'dvb_your_api_key'
  });
  client.useProject('your-project-id');

  // Create collection
  await client.collections.create({
    name: 'docs',
    dimensions: 768
  });

  // Upload document
  const doc = await client.documents.upload('docs', {
    file: readFileSync('manual.pdf'),
    filename: 'manual.pdf'
  });
  console.log('Uploaded:', doc.id, 'Status:', doc.status);

  // Wait for processing (poll status)
  let status = doc.status;
  while (status === 'pending' || status === 'processing') {
    await new Promise(r => setTimeout(r, 1000));
    const updated = await client.documents.get(doc.id);
    status = updated.status;
  }

  // Search
  const results = await client.search.query({
    collection: 'docs',
    query: 'How to get started?',
    top_k: 5,
    rerank: true
  });
  console.log('Found', results.length, 'results');

  // RAG Chat
  const response = await client.chat.send({
    collection: 'docs',
    message: 'Summarize the getting started guide',
    include_sources: true
  });
  console.log('Answer:', response.answer);
  console.log('Sources:', response.sources.length);

  // Create table
  await client.tables.create({
    name: 'feedback',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'rating', type: 'integer' },
      { name: 'comment', type: 'text' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ]
  });

  // Insert data
  await client.tables.rows('feedback').insert({
    rating: 5,
    comment: 'Great documentation!'
  });

  // Query data
  const feedback = await client.tables.rows('feedback').query({
    order: 'created_at:desc',
    limit: 10
  });
  console.log('Feedback:', feedback.rows);
}

main().catch(console.error);
```

## License

MIT
