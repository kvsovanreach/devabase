<div align="center">

# Devabase

### The Open-Source AI Backend for Modern Applications

**Vector Database • RAG Engine • Knowledge Graphs • Auto-API — All in One**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com/r/devabase/devabase)

[Documentation](https://docs.devabase.io) · [Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Dashboard](#-dashboard)

<br />

<img src="docs/assets/system_demo.gif" alt="Devabase System" width="1000" />

</div>

---

## What is Devabase?

**Devabase is an open-source backend platform purpose-built for AI applications.** Think of it as "Supabase for AI" — combining vector search, document processing, RAG pipelines, knowledge graphs, and auto-generated APIs into a single, self-hosted backend.

Instead of stitching together Pinecone + LangChain + Auth0 + PostgreSQL + custom glue code, you get everything unified in one cohesive platform with a beautiful dashboard and comprehensive APIs.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          YOUR APPLICATION                                │
│                   (Web, Mobile, Desktop, API)                           │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             DEVABASE                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ │
│  │  Vector   │ │    RAG    │ │ Knowledge │ │  Auto-API │ │   Auth    │ │
│  │  Search   │ │  Engine   │ │   Graphs  │ │  Tables   │ │ & Teams   │ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL + pgvector                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Why We Built Devabase

Building AI-powered applications today typically requires:

| Component | Common Solutions | Problems |
|-----------|------------------|----------|
| Vector Database | Pinecone, Weaviate, Qdrant | Separate service, vendor lock-in, costs scale quickly |
| Document Processing | LangChain, LlamaIndex | Custom code, no persistence, hard to debug |
| RAG Pipeline | Custom orchestration | Complex setup, no observability, maintenance burden |
| Knowledge Graphs | Neo4j, custom solutions | Yet another database, complex integration |
| User Data | PostgreSQL, MongoDB | No vector support, manual API building |
| Auth & Multi-tenancy | Auth0, Clerk | Additional cost, external dependency |

**The result?** Developers spend weeks on infrastructure instead of building features.

**Devabase solves this** by providing all these capabilities in a single, unified backend:

| What you need | With Devabase |
|---------------|---------------|
| Vector search | ✅ Built-in with pgvector (HNSW indexing) |
| Document processing | ✅ Upload → Chunk → Embed → Index (one API call) |
| RAG pipeline | ✅ Enable RAG on any collection, instant chat API |
| Knowledge graphs | ✅ Auto-extract entities & relationships from documents |
| Reranking | ✅ Cross-encoder reranking for better relevance |
| User data tables | ✅ Create tables via API, get instant REST endpoints |
| Auth & multi-tenancy | ✅ Projects, teams, roles, scoped API keys |

**Result:** Ship AI features in hours, not weeks.

---

## ✨ Features

### 🔍 Vector Database

- **pgvector with HNSW indexing** — Fast, accurate vector search
- **Multiple distance metrics** — Cosine, L2, inner product
- **Automatic embeddings** — Just upload documents, we handle the rest
- **Hybrid search** — Vector + keyword (BM25) with configurable weights
- **Metadata filtering** — Filter results by any metadata field

### 📄 Document Processing

- **Multi-format support** — PDF, Markdown, TXT, HTML, CSV, JSON, DOCX
- **Smart chunking** — Configurable chunk size and overlap
- **Background processing** — Upload and forget, get notified when ready
- **Real-time status** — WebSocket updates on processing progress
- **Chunk management** — View, edit, split, merge chunks via API or dashboard

### 🤖 RAG Pipeline

- **One-click RAG** — Enable chat on any collection with one toggle
- **Multi-collection search** — Query across multiple knowledge bases
- **Conversation memory** — Maintain context across messages
- **Source attribution** — See which documents informed each answer
- **Streaming responses** — Real-time token streaming via SSE

### 🔄 Reranking

- **Cross-encoder reranking** — Improve relevance with semantic reranking
- **Multiple providers** — Cohere, Jina, Voyage, or custom
- **Configurable top-N** — Rerank top results for better accuracy
- **Per-query control** — Enable/disable reranking per request

### 🎯 Advanced Retrieval Strategies

- **HyDE (Hypothetical Document Embeddings)** — Generate hypothetical answer, embed it, then search for better semantic matching
- **Multi-Query** — Expand query into multiple variations, search all, merge results for improved recall
- **Self-Query** — Extract structured filters from natural language queries (e.g., "Python docs from 2023")
- **Parent-Child Retrieval** — Search small precise chunks, return larger parent context
- **Contextual Compression** — Compress retrieved chunks to only relevant portions, reducing noise

### 🕸️ Knowledge Graphs

- **Auto-extraction** — Extract entities and relationships from documents using LLMs
- **Entity types** — People, organizations, locations, concepts, products, events, technologies
- **Relationship mapping** — Automatically identify connections between entities
- **Graph visualization** — Interactive graph explorer in dashboard
- **Graph queries** — Traverse relationships, find paths between entities

### 🗄️ Auto-API Tables

- **Instant REST APIs** — Create a table, get CRUD endpoints immediately
- **Column types** — UUID, text, integer, float, boolean, timestamp, JSONB
- **Filtering & sorting** — Query with operators (=, >, <, contains, etc.)
- **Import/Export** — CSV and JSON support
- **SQL Editor** — Direct SQL access with syntax highlighting

### 👥 Multi-tenancy & Auth

- **Project isolation** — Complete data separation per project
- **Team management** — Invite members with role-based access
- **Role hierarchy** — Owner → Admin → Member → Viewer
- **Scoped API keys** — Create keys with specific permissions
- **JWT auth** — Secure token-based authentication

### 🎯 Evaluation & Benchmarking

- **Standard IR benchmarks** — BEIR, MS MARCO, Natural Questions support
- **Retrieval metrics** — Precision@K, Recall@K, MRR, NDCG, MAP with confidence intervals
- **Ablation studies** — Compare search methods, chunk sizes, reranking
- **Statistical significance** — Paired t-tests with effect sizes (Cohen's d)
- **Publication-ready exports** — LaTeX tables, CSV, Markdown reports
- **Custom datasets** — Create your own test cases

### 📝 Prompt Management

- **Template storage** — Store and version your prompt templates
- **Variable rendering** — Handlebars-style variable interpolation
- **Token counting** — Preview token usage before sending
- **CRUD operations** — Full management via API or dashboard

### 💬 Conversation Management

- **Conversation persistence** — Store chat history with context
- **Message tracking** — User/assistant role tracking with metadata
- **Source attribution** — Track which documents informed each response
- **Conversation summaries** — Auto-generate conversation titles

### 🔐 Application User Auth

- **End-user authentication** — Built-in auth for your app's users
- **Registration & login** — Email/password auth with JWT tokens
- **Password reset flow** — Secure password recovery via email tokens
- **Email verification** — Optional email verification workflow
- **Account security** — Failed login tracking, account lockout

### 📡 Real-time Events

- **WebSocket support** — Real-time updates for all operations
- **Event streaming** — Live document processing status
- **Pub/Sub architecture** — Subscribe to specific event channels
- **Connection indicators** — Built-in UI connection status

### 🛠️ Developer Experience

- **Modern dashboard** — Beautiful React UI for all operations
- **Interactive playground** — Test APIs directly in the browser
- **Real-time events** — WebSocket notifications for all changes
- **Webhooks** — Get notified when documents are processed
- **Comprehensive API docs** — Built-in API documentation page
- **CLI tool** — Manage everything from your terminal
- **TypeScript SDK** — Type-safe client library for easy integration

---

## 🚀 Quick Start

### Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/kvsovanreach/devabase.git
cd devabase

# Start all services
docker compose up -d

# Open dashboard
open http://localhost:9001
```

### From Source

```bash
# Prerequisites
# - Rust 1.75+
# - Node.js 18+
# - PostgreSQL 16 with pgvector extension

# Setup database
createdb devabase
psql -d devabase -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d devabase -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Configure environment
export DATABASE_URL="postgres://user:pass@localhost:9003/devabase"
export JWT_SECRET="your-secret-key-min-32-chars"

# Run backend
cargo run --release -- serve

# Run frontend (new terminal)
cd web
npm install
npm run dev

# Open dashboard
open http://localhost:9001
```

### First Steps

1. **Register an account** at `http://localhost:9001/register`
2. **Create a project** — This isolates your data
3. **Configure providers** — Add your OpenAI/Anthropic API keys in Settings → Providers
4. **Create a collection** — This is where your documents live
5. **Upload documents** — Drag & drop PDFs, markdown, etc.
6. **Enable RAG** — Turn on the RAG toggle to enable chat
7. **Start chatting** — Ask questions about your documents!

---

## 💡 Use Cases

### 📚 Knowledge Base Chat

Build a ChatGPT-like interface for your internal documentation:

```bash
# 1. Create a collection
curl -X POST localhost:9002/v1/collections \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Project-ID: $PROJECT_ID" \
  -d '{"name": "company-docs", "dimensions": 1536}'

# 2. Upload documents
curl -X POST localhost:9002/v1/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "collection=company-docs" \
  -F "file=@employee-handbook.pdf"

# 3. Enable RAG
curl -X PATCH localhost:9002/v1/collections/company-docs \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"rag_enabled": true, "rag_config": {"llm_provider_id": "...", "model": "gpt-4o"}}'

# 4. Chat!
curl -X POST localhost:9002/v1/collections/company-docs/chat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "What is our PTO policy?"}'
```

### 🔍 Semantic Search

Add intelligent search to your application:

```bash
# Vector search
curl -X POST localhost:9002/v1/collections/products/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "comfortable running shoes for marathon",
    "top_k": 10,
    "rerank": true
  }'

# Hybrid search (vector + keyword)
curl -X POST localhost:9002/v1/collections/products/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "Nike running shoes",
    "top_k": 10,
    "search_type": "hybrid",
    "vector_weight": 0.7,
    "keyword_weight": 0.3
  }'

# HyDE strategy (generates hypothetical answer first)
curl -X POST localhost:9002/v1/collections/docs/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "How do I implement OAuth2?",
    "strategy": "hyde",
    "rerank": true
  }'

# Multi-query strategy (expands query into variations)
curl -X POST localhost:9002/v1/collections/docs/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "authentication best practices",
    "strategy": "multi_query",
    "strategy_options": {"num_query_variations": 3}
  }'

# Self-query strategy (extracts filters from natural language)
curl -X POST localhost:9002/v1/collections/docs/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "Python tutorials from 2023",
    "strategy": "self_query"
  }'
```

### 🕸️ Knowledge Graph Analysis

Extract and explore entities from your documents:

```bash
# Extract knowledge from a document
curl -X POST localhost:9002/v1/knowledge/extract/$DOCUMENT_ID \
  -H "Authorization: Bearer $TOKEN"

# Response: {"entities_extracted": 15, "relationships_extracted": 8}

# Query entities
curl localhost:9002/v1/knowledge/entities?entity_type=person \
  -H "Authorization: Bearer $TOKEN"

# Get entity graph (2-hop neighborhood)
curl localhost:9002/v1/knowledge/graph/$ENTITY_ID?depth=2 \
  -H "Authorization: Bearer $TOKEN"
```

### 📱 Backend for Apps

Auto-generate REST APIs for your application data:

```bash
# Create a table
curl -X POST localhost:9002/v1/tables \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "posts",
    "columns": [
      {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
      {"name": "title", "type": "text", "nullable": false},
      {"name": "content", "type": "text"},
      {"name": "published", "type": "boolean", "default": "false"},
      {"name": "created_at", "type": "timestamp", "default": "now()"}
    ]
  }'

# Insert data
curl -X POST localhost:9002/v1/tables/posts/rows \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title": "Hello World", "content": "My first post!"}'

# Query with filters
curl "localhost:9002/v1/tables/posts/rows?published=true&order=created_at.desc" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📖 API Reference

### Authentication

```http
POST /v1/auth/register    # Create account
POST /v1/auth/login       # Login → Returns JWT
POST /v1/auth/refresh     # Refresh token
POST /v1/auth/logout      # Logout
GET  /v1/auth/me          # Get current user
```

### Projects & Teams

```http
POST   /v1/projects                        # Create project
GET    /v1/projects                        # List projects
GET    /v1/projects/:id                    # Get project
PATCH  /v1/projects/:id                    # Update project
DELETE /v1/projects/:id                    # Delete project

GET    /v1/projects/:id/members            # List members
POST   /v1/projects/:id/members            # Add member
PATCH  /v1/projects/:id/members/:user_id   # Update role
DELETE /v1/projects/:id/members/:user_id   # Remove member

POST   /v1/projects/:id/invitations        # Invite by email
```

### Collections

```http
POST   /v1/collections                     # Create collection
GET    /v1/collections                     # List collections
GET    /v1/collections/:name               # Get collection
PATCH  /v1/collections/:name               # Update (enable RAG, etc.)
DELETE /v1/collections/:name               # Delete collection
```

### Documents & Chunks

```http
POST   /v1/documents/upload                # Upload document
GET    /v1/documents?collection=:name      # List documents
GET    /v1/documents/:id                   # Get document
DELETE /v1/documents/:id                   # Delete document
GET    /v1/documents/:id/chunks            # Get document chunks

GET    /v1/chunks/:id                      # Get chunk
PUT    /v1/chunks/:id                      # Update chunk
DELETE /v1/chunks/:id                      # Delete chunk
POST   /v1/chunks/:id/split                # Split chunk
POST   /v1/chunks/merge                    # Merge chunks
```

### Search & Retrieval

```http
# Vector search (single collection)
POST /v1/collections/:name/search
{"query": "...", "top_k": 10, "filter": {...}, "rerank": true}

# Advanced retrieval strategies
POST /v1/collections/:name/search
{
  "query": "...",
  "top_k": 10,
  "strategy": "hyde",           # or: standard, multi_query, self_query, parent_child, compression
  "strategy_options": {
    "hyde_temperature": 0.7,    # HyDE: temperature for generation
    "hyde_num_hypotheticals": 1,# HyDE: number of hypothetical docs
    "num_query_variations": 3,  # Multi-query: number of variations
    "max_compressed_length": 500# Compression: max length
  },
  "rerank": true
}

# Unified search (multiple collections)
POST /v1/search
{"collections": ["docs", "faq"], "query": "...", "top_k": 10}
```

### RAG Chat

```http
# Single collection chat
POST /v1/collections/:name/chat
{"message": "...", "conversation_id": "..."}

# Multi-collection chat
POST /v1/chat
{"collections": ["docs", "faq"], "message": "..."}
```

### Knowledge Graph

```http
# Entities
GET    /v1/knowledge/entities              # List entities
GET    /v1/knowledge/entities/:id          # Get entity with relationships
POST   /v1/knowledge/entities              # Create entity
PATCH  /v1/knowledge/entities/:id          # Update entity
DELETE /v1/knowledge/entities/:id          # Delete entity
POST   /v1/knowledge/entities/search       # Search entities
POST   /v1/knowledge/entities/merge        # Merge duplicate entities

# Relationships
GET    /v1/knowledge/relationships         # List relationships
POST   /v1/knowledge/relationships         # Create relationship
DELETE /v1/knowledge/relationships/:id     # Delete relationship

# Graph queries
GET    /v1/knowledge/graph/:entity_id      # Get entity subgraph
GET    /v1/knowledge/stats                 # Get knowledge stats

# Extraction
POST   /v1/knowledge/extract/:document_id  # Extract from document
```

### Evaluation

```http
POST   /v1/evaluation/datasets             # Create dataset
GET    /v1/evaluation/datasets             # List datasets
GET    /v1/evaluation/datasets/:id         # Get dataset with cases
DELETE /v1/evaluation/datasets/:id         # Delete dataset

POST   /v1/evaluation/datasets/:id/cases   # Add test case
DELETE /v1/evaluation/cases/:id            # Delete case

POST   /v1/evaluation/datasets/:id/run     # Run evaluation
GET    /v1/evaluation/datasets/:id/runs    # Get run history
```

### Benchmarks (Academic)

```http
# Run benchmarks
POST   /v1/benchmarks/run                  # Run benchmark evaluation
GET    /v1/benchmarks                      # List benchmark results
GET    /v1/benchmarks/:id                  # Get benchmark details
DELETE /v1/benchmarks/:id                  # Delete benchmark result

# Export (LaTeX, CSV, Markdown, JSON)
GET    /v1/benchmarks/:id/export?format=latex     # LaTeX table
GET    /v1/benchmarks/:id/export?format=csv       # CSV data
GET    /v1/benchmarks/:id/export?format=markdown  # Markdown report

# Datasets (BEIR, MS MARCO, etc.)
GET    /v1/benchmarks/datasets             # List available datasets
POST   /v1/benchmarks/datasets/download    # Download dataset

# Configurations
GET    /v1/benchmarks/configs              # Get preset configs
POST   /v1/benchmarks/compare              # Compare two runs
```

### Tables (Auto-API)

```http
POST   /v1/tables                          # Create table
GET    /v1/tables                          # List tables
GET    /v1/tables/:name/schema             # Get table schema
DELETE /v1/tables/:name                    # Delete table

GET    /v1/tables/:name/rows               # List rows (with filtering)
POST   /v1/tables/:name/rows               # Insert row
PATCH  /v1/tables/:name/rows/:id           # Update row
DELETE /v1/tables/:name/rows/:id           # Delete row

POST   /v1/tables/:name/import             # Import CSV/JSON
GET    /v1/tables/:name/export             # Export CSV/JSON
```

### Prompts

```http
POST   /v1/prompts                         # Create prompt template
GET    /v1/prompts                         # List prompts
GET    /v1/prompts/:id                     # Get prompt
PATCH  /v1/prompts/:id                     # Update prompt
DELETE /v1/prompts/:id                     # Delete prompt
POST   /v1/prompts/:id/render              # Render with variables
```

### Conversations

```http
POST   /v1/conversations                   # Create conversation
GET    /v1/conversations                   # List conversations
GET    /v1/conversations/:id               # Get conversation with messages
PATCH  /v1/conversations/:id               # Update conversation
DELETE /v1/conversations/:id               # Delete conversation
```

### App User Authentication

```http
POST   /v1/auth/app/register               # Register app user
POST   /v1/auth/app/login                  # Login app user
POST   /v1/auth/app/logout                 # Logout app user
POST   /v1/auth/app/refresh                # Refresh tokens
GET    /v1/auth/app/me                     # Get current app user
PATCH  /v1/auth/app/me                     # Update profile
DELETE /v1/auth/app/me                     # Delete account
POST   /v1/auth/app/change-password        # Change password
POST   /v1/auth/app/forgot-password        # Request password reset
POST   /v1/auth/app/reset-password         # Reset with token
POST   /v1/auth/app/verify-email           # Verify email
POST   /v1/auth/app/resend-verification    # Resend verification
```

### Webhooks

```http
POST   /v1/webhooks                        # Create webhook
GET    /v1/webhooks                        # List webhooks
GET    /v1/webhooks/:id                    # Get webhook
PATCH  /v1/webhooks/:id                    # Update webhook
DELETE /v1/webhooks/:id                    # Delete webhook
POST   /v1/webhooks/:id/test               # Test webhook
GET    /v1/webhooks/:id/logs               # Get delivery logs
```

### API Keys

```http
POST   /v1/keys                            # Create API key
GET    /v1/keys                            # List API keys
GET    /v1/keys/:id                        # Get API key
DELETE /v1/keys/:id                        # Revoke API key
```

### Real-time

```http
GET    /v1/ws                              # WebSocket connection
GET    /health                             # Health check
GET    /ready                              # Readiness check
```

---

## 🔌 Supported Providers

### Embedding Providers

| Provider | Models | Dimensions |
|----------|--------|------------|
| **OpenAI** | `text-embedding-3-small`, `text-embedding-3-large` | 1536, 3072 |
| **Cohere** | `embed-english-v3.0`, `embed-multilingual-v3.0` | 1024 |
| **Voyage** | `voyage-large-2`, `voyage-code-2` | 1536 |
| **Custom** | Any OpenAI-compatible API (Ollama, etc.) | Configurable |

### LLM Providers (for RAG & Knowledge Extraction)

| Provider | Models |
|----------|--------|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o1-mini` |
| **Anthropic** | `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`, `claude-3.5-sonnet` |
| **Google** | `gemini-pro`, `gemini-1.5-pro`, `gemini-1.5-flash` |
| **Custom** | Ollama, Together, Groq, DeepSeek, any OpenAI-compatible |

### Reranking Providers

| Provider | Models |
|----------|--------|
| **Cohere** | `rerank-english-v3.0`, `rerank-multilingual-v3.0` |
| **Jina** | `jina-reranker-v2-base-multilingual` |
| **Voyage** | `rerank-2`, `rerank-2-lite` |
| **Custom** | Any compatible reranking API |

### Supported Document Formats

| Format | Extensions | Notes |
|--------|------------|-------|
| **PDF** | `.pdf` | Text extraction with layout preservation |
| **Markdown** | `.md`, `.markdown` | Native parsing with header detection |
| **Plain Text** | `.txt` | Direct text ingestion |
| **HTML** | `.html`, `.htm` | HTML to text conversion |
| **CSV** | `.csv` | Row-based chunking |
| **JSON** | `.json` | Structured data extraction |
| **Word** | `.docx` | Microsoft Word documents |

---

## 🖥️ Dashboard

The web dashboard provides a complete interface for managing your Devabase instance:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview stats, recent activity, quick actions |
| **Collections** | Create and manage vector collections, enable RAG |
| **Documents** | Upload, process, view chunks, reprocess documents |
| **Search** | Test vector, hybrid, and reranked search with strategies |
| **RAG Chat** | Interactive chat with streaming responses, source attribution |
| **Knowledge** | Explore entities, relationships, graph visualization, extraction |
| **Evaluation** | Create test datasets, run retrieval evaluations, export reports |
| **Tables** | Create tables, browse data, import/export CSV/JSON |
| **SQL Editor** | Direct SQL access with syntax highlighting, query history |
| **Prompts** | Manage prompt templates with variable rendering |
| **Webhooks** | Configure event webhooks, view delivery logs, test endpoints |
| **API Keys** | Create and manage scoped API keys with permissions |
| **Settings** | Project config, team members, AI providers (embedding, LLM, reranking) |
| **API Docs** | Built-in API documentation with interactive examples |

---

## 💻 CLI

The `deva` CLI lets you manage Devabase from your terminal:

```bash
# Server Management
deva serve                               # Start the server
deva serve --host 0.0.0.0 --port 8080    # Custom host/port
deva init                                # Initialize new project

# Database Management
deva db setup                            # Create DB and run migrations
deva db migrate                          # Run pending migrations
deva db status                           # Check migration status
deva db backup --output backup.sql       # Backup database
deva db restore backup.sql --yes         # Restore from backup

# Configuration
deva config show                         # Display configuration
deva config show --section server        # Show specific section
deva config validate                     # Validate config file
deva config generate --output devabase.toml  # Generate default config

# User Management
deva user create --email admin@example.com --name Admin
deva user list --limit 50
deva user get admin@example.com
deva user delete admin@example.com --yes

# Project Management
deva project create --name "My Project" --owner user-id
deva project list --user user-id
deva project get project-id
deva project delete project-id --yes

# API Key Management
deva key create --project project-id --name "Production Key" --scopes read,write
deva key list --project project-id
deva key revoke --project project-id key-id

# Collection Management
deva vector create-collection docs --dimensions 1536 --metric cosine
deva vector list-collections
deva vector stats docs
deva vector delete-collection docs

# Document Management
deva document upload manual.pdf --collection docs --project project-id
deva document list --collection docs --project project-id --status processed
deva document get doc-id --project project-id
deva document reprocess doc-id --project project-id
deva document delete doc-id --project project-id --yes
```

---

## 📦 SDK

### TypeScript/JavaScript SDK

```bash
npm install devabase-sdk
```

```typescript
import { createClient } from 'devabase-sdk';

// Initialize client
const client = createClient({
  baseUrl: 'http://localhost:9002',
  apiKey: 'dvb_your_api_key',
});

// Set project context
client.useProject('your-project-id');

// Collections
const { data: collections } = await client.collections.list();
const collection = await client.collections.create({
  name: 'docs',
  dimensions: 1536,
  metric: 'cosine',
});

// Documents
const doc = await client.documents.upload('docs', {
  file: myFile,
  filename: 'document.pdf',
});

// Search
const results = await client.search.query({
  collection: 'docs',
  query: 'How do I reset my password?',
  top_k: 10,
  rerank: true,
});

// RAG Chat
const response = await client.chat.send({
  collection: 'docs',
  message: 'What is the refund policy?',
  conversation_id: 'conv-123',
});

// Tables (Auto-API)
const { rows } = await client.tables.rows('customers').query({
  filter: 'status.eq=active',
  limit: 50,
});

await client.tables.rows('customers').insert({
  name: 'John Doe',
  email: 'john@example.com',
});

// App User Auth
const { user, access_token } = await client.appAuth.register({
  email: 'user@example.com',
  password: 'securepassword',
  name: 'John Doe',
});

const session = await client.appAuth.login({
  email: 'user@example.com',
  password: 'securepassword',
});
```

---

## ⚙️ Configuration

### Port Configuration (Centralized)

All service ports are configured in the `.env` file. Change these values to customize ports:

```env
# .env
FRONTEND_PORT=9001    # Web dashboard
BACKEND_PORT=9002     # API server
POSTGRES_PORT=9003    # PostgreSQL database
```

After changing ports, update `NEXT_PUBLIC_API_URL` accordingly:
```env
NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_PORT` | Frontend web server port | `9001` |
| `BACKEND_PORT` | Backend API server port | `9002` |
| `POSTGRES_PORT` | PostgreSQL database port | `9003` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) | Required |
| `NEXT_PUBLIC_API_URL` | Frontend API URL | `http://localhost:9002` |
| `DEVABASE_HOST` | Server bind address | `0.0.0.0` |
| `DEVABASE_PORT` | Server port (same as BACKEND_PORT) | `9002` |
| `STORAGE_PATH` | File storage directory | `./data/storage` |
| `MAX_UPLOAD_SIZE_MB` | Maximum upload size | `50` |
| `RUST_LOG` | Log level | `info` |

### Config File (devabase.toml)

```toml
[server]
host = "0.0.0.0"
port = 9002
max_upload_size_mb = 100
ui_enabled = true

[database]
url = "${DATABASE_URL}"
max_connections = 20
auto_migrate = true

[storage]
type = "local"
path = "./data/storage"

[vector]
index_type = "hnsw"
default_dimensions = 1536
default_metric = "cosine"

[chunking]
default_strategy = "fixed"      # fixed, sentence, paragraph, markdown
default_chunk_size = 512
default_overlap = 50

[cache]
enabled = true
type = "memory"
ttl_seconds = 3600

[events]
enabled = true
channel_capacity = 1024

[auth]
jwt_secret = "${JWT_SECRET}"
token_expiry_seconds = 3600
refresh_token_expiry_seconds = 604800

[rate_limit]
enabled = true
requests_per_window = 100
window_seconds = 60

[cors]
allowed_origins = ["*"]
allow_credentials = true
max_age = 3600
```

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Devabase Backend (Rust)                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                           API Layer (Axum)                          │ │
│  │  Auth │ Projects │ Collections │ Documents │ Search │ RAG │ Tables │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                          Service Layer                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │  │ Document │ │   RAG    │ │ Knowledge│ │  Vector  │ │ Reranking│  │ │
│  │  │Processor │ │  Engine  │ │  Graph   │ │  Store   │ │  Engine  │  │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                         Provider Layer                              │ │
│  │  Embeddings: OpenAI │ Cohere │ Voyage │ Custom                      │ │
│  │  LLMs: OpenAI │ Anthropic │ Google │ Custom                         │ │
│  │  Rerankers: Cohere │ Jina │ Voyage │ Custom                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL + pgvector                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                │
│  │   sys_* tables│  │  uv_* tables  │  │  ut_* tables  │                │
│  │    (system)   │  │  (vectors)    │  │  (user data)  │                │
│  └───────────────┘  └───────────────┘  └───────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Table Naming Convention

| Prefix | Purpose | Example |
|--------|---------|---------|
| `sys_` | System tables | `sys_users`, `sys_projects`, `sys_collections` |
| `uv_{project}_{collection}` | Vector embeddings | Per-collection vector storage with pgvector |
| `sys_entities` | Knowledge graph entities | People, organizations, concepts, etc. |
| `sys_relationships` | Knowledge graph edges | Connections between entities |
| `ut_{project}_{table}` | User-defined tables | `ut_abc123_customers` |

---

## 🧑‍💻 Development

```bash
# Clone
git clone https://github.com/kvsovanreach/devabase.git
cd devabase

# Setup database
createdb devabase
psql -d devabase -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d devabase -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Run migrations
export DATABASE_URL="postgres://localhost/devabase"
cargo run -- migrate

# Backend development
cargo watch -x "run -- serve"

# Frontend development
cd web
npm install
npm run dev

# Run tests
cargo test
cd web && npm run test

# Build for production
cargo build --release
cd web && npm run build
```

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

- 🐛 **Report bugs** — [Open an issue](https://github.com/kvsovanreach/devabase/issues)
- 💡 **Request features** — [Start a discussion](https://github.com/kvsovanreach/devabase/discussions)
- 📖 **Improve docs** — [Edit documentation](https://github.com/kvsovanreach/devabase/tree/main/docs)
- 🔧 **Submit PRs** — [Contributing guide](CONTRIBUTING.md)

### Development Priorities

1. **Core stability** — Bug fixes and performance improvements
2. **Provider support** — Additional embedding/LLM/reranking providers
3. **Dashboard UX** — Improved visualizations and workflows
4. **Documentation** — Tutorials, examples, and API docs

---

## 📚 Inspiration

Devabase is inspired by several amazing projects:

- **[Supabase](https://supabase.com)** — The open-source Firebase alternative that showed how powerful a unified backend can be
- **[Pinecone](https://pinecone.io)** — Vector database that pioneered serverless vector search
- **[LangChain](https://langchain.com)** — The de facto RAG framework that defined patterns we've built upon
- **[PostgREST](https://postgrest.org)** — Auto-generating REST APIs from PostgreSQL schemas

We believe the future of AI applications needs a unified backend that's open-source, self-hostable, and developer-friendly. That's Devabase.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ for the AI developer community**

[Website](https://devabase.io) · [Documentation](https://docs.devabase.io) · [Discord](https://discord.gg/devabase) · [Twitter](https://twitter.com/devabase)

</div>
