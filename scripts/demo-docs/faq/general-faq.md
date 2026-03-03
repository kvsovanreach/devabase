# Frequently Asked Questions

## General

### What is Devabase?

Devabase is an open-source backend platform purpose-built for AI applications. It combines:

- **Vector Database** - pgvector with HNSW indexing
- **Document Processing** - PDF, Markdown, HTML, and more
- **RAG Pipeline** - Chat with your documents
- **Knowledge Graphs** - Entity and relationship extraction
- **Auto-API Tables** - Instant REST endpoints for your data
- **Authentication** - JWT auth with multi-tenancy

Think of it as "Supabase for AI" - everything you need to build AI-powered applications in one unified platform.

### Is Devabase free?

Yes! Devabase is open-source under the MIT license. You can self-host it for free. We also offer managed cloud hosting for those who prefer not to manage infrastructure.

### Can I self-host Devabase?

Absolutely. Devabase is designed for self-hosting.

Requirements:
- PostgreSQL 16+ with pgvector extension
- 2GB RAM minimum (4GB+ recommended)
- Docker (optional but recommended)

Quick start:
```bash
git clone https://github.com/kvsovanreach/devabase.git
cd devabase
docker compose up -d
```

## Documents & Collections

### How do I upload documents?

There are multiple ways:

1. **Dashboard**: Drag and drop files into a collection
2. **API**: POST to `/v1/documents/upload` with multipart form data
3. **SDK**: Use `client.documents.upload()`

### What file formats are supported?

- PDF (.pdf)
- Markdown (.md)
- Plain text (.txt)
- HTML (.html)
- CSV (.csv)
- JSON (.json)
- Word documents (.docx)

### How does chunking work?

Documents are split into smaller pieces (chunks) for better search relevance:

1. Document is parsed and text extracted
2. Text is split by paragraphs/sections
3. Chunks are created with configurable size (default: 512 tokens)
4. Overlap is added between chunks (default: 50 tokens)
5. Each chunk is embedded and indexed

## Search & RAG

### What embedding providers are supported?

| Provider | Models |
|----------|--------|
| OpenAI | text-embedding-3-small, text-embedding-3-large |
| Cohere | embed-english-v3.0, embed-multilingual-v3.0 |
| Voyage | voyage-large-2, voyage-code-2 |
| Custom | Any OpenAI-compatible API |

### What is reranking?

Reranking improves search quality using a cross-encoder model:

1. Vector search finds top N candidates (e.g., 50)
2. Cross-encoder scores each against the query
3. Results are reordered by new scores
4. Top K are returned (e.g., 10)

Supported providers: Cohere, Jina, Voyage

### What LLMs are supported for RAG?

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1 |
| Anthropic | claude-3-opus, claude-3-sonnet, claude-3.5-sonnet |
| Google | gemini-pro, gemini-1.5-pro |
| Custom | Ollama, Together, Groq, any OpenAI-compatible |

## Tables & Data

### What is the Auto-API feature?

Create a PostgreSQL table and get instant REST endpoints:

```typescript
// Create table
await client.tables.create({
  name: 'users',
  columns: [
    { name: 'id', type: 'uuid', primary: true },
    { name: 'email', type: 'text', unique: true },
    { name: 'name', type: 'text' }
  ]
});

// Now you have:
// GET    /v1/tables/users/rows
// POST   /v1/tables/users/rows
// PATCH  /v1/tables/users/rows/:id
// DELETE /v1/tables/users/rows/:id
```

### Can I use raw SQL?

Yes! Use the SQL Editor in the dashboard or the SQL API endpoint for direct queries.

## Security

### How is authentication handled?

Devabase uses JWT-based authentication:

1. Users login with email/password
2. Server returns JWT token + refresh token
3. Token included in Authorization header
4. Tokens expire and can be refreshed

API keys are also supported for server-to-server communication.

### Is my data secure?

- All data is stored in your PostgreSQL database
- Self-hosted: you control everything
- Passwords hashed with Argon2
- JWT tokens with configurable expiration
- Role-based access control (Owner/Admin/Member/Viewer)
- Project-level data isolation
