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

Building AI-powered applications in 2024+ typically requires:

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

### 🛠️ Developer Experience

- **Modern dashboard** — Beautiful React UI for all operations
- **Interactive playground** — Test APIs directly in the browser
- **Real-time events** — WebSocket notifications for all changes
- **Webhooks** — Get notified when documents are processed
- **Comprehensive API docs** — Built-in API documentation page
- **CLI tool** — Manage everything from your terminal

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
open http://localhost:3000
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
export DATABASE_URL="postgres://user:pass@localhost:5432/devabase"
export JWT_SECRET="your-secret-key-min-32-chars"

# Run backend
cargo run --release -- serve

# Run frontend (new terminal)
cd web
npm install
npm run dev

# Open dashboard
open http://localhost:3000
```

### First Steps

1. **Register an account** at `http://localhost:3000/register`
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
curl -X POST localhost:8080/v1/collections \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Project-ID: $PROJECT_ID" \
  -d '{"name": "company-docs", "dimensions": 1536}'

# 2. Upload documents
curl -X POST localhost:8080/v1/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "collection=company-docs" \
  -F "file=@employee-handbook.pdf"

# 3. Enable RAG
curl -X PATCH localhost:8080/v1/collections/company-docs \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"rag_enabled": true, "rag_config": {"llm_provider_id": "...", "model": "gpt-4o"}}'

# 4. Chat!
curl -X POST localhost:8080/v1/collections/company-docs/chat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "What is our PTO policy?"}'
```

### 🔍 Semantic Search

Add intelligent search to your application:

```bash
# Vector search
curl -X POST localhost:8080/v1/retrieve \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "collection": "products",
    "query": "comfortable running shoes for marathon",
    "top_k": 10,
    "rerank": true
  }'

# Hybrid search (vector + keyword)
curl -X POST localhost:8080/v1/collections/products/vectors/hybrid-search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "Nike running shoes",
    "top_k": 10,
    "vector_weight": 0.7,
    "keyword_weight": 0.3
  }'
```

### 🕸️ Knowledge Graph Analysis

Extract and explore entities from your documents:

```bash
# Extract knowledge from a document
curl -X POST localhost:8080/v1/knowledge/extract/$DOCUMENT_ID \
  -H "Authorization: Bearer $TOKEN"

# Response: {"entities_extracted": 15, "relationships_extracted": 8}

# Query entities
curl localhost:8080/v1/knowledge/entities?entity_type=person \
  -H "Authorization: Bearer $TOKEN"

# Get entity graph (2-hop neighborhood)
curl localhost:8080/v1/knowledge/graph/$ENTITY_ID?depth=2 \
  -H "Authorization: Bearer $TOKEN"
```

### 📱 Backend for Apps

Auto-generate REST APIs for your application data:

```bash
# Create a table
curl -X POST localhost:8080/v1/tables \
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
curl -X POST localhost:8080/v1/tables/posts/rows \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title": "Hello World", "content": "My first post!"}'

# Query with filters
curl "localhost:8080/v1/tables/posts/rows?published=true&order=created_at.desc" \
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
POST /v1/collections/:name/vectors/search
{"query": "...", "top_k": 10, "filter": {...}}

# Hybrid search (vector + keyword)
POST /v1/collections/:name/vectors/hybrid-search
{"query": "...", "top_k": 10, "vector_weight": 0.7, "keyword_weight": 0.3}

# Cross-collection retrieval with reranking
POST /v1/retrieve
{"collection": "...", "query": "...", "top_k": 10, "rerank": true}
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

### API Keys

```http
POST   /v1/keys                            # Create API key
GET    /v1/keys                            # List API keys
DELETE /v1/keys/:id                        # Revoke API key
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

---

## 🖥️ Dashboard

The web dashboard provides a complete interface for managing your Devabase instance:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview stats, recent activity, quick actions |
| **Collections** | Create and manage vector collections |
| **Documents** | Upload, process, view chunks, extract knowledge |
| **Search** | Test vector, hybrid, and reranked search |
| **RAG Chat** | Interactive chat with your knowledge base |
| **Knowledge** | Explore entities, relationships, and graph visualization |
| **Evaluation** | Create test datasets and run retrieval evaluations |
| **Tables** | Create tables, browse data, import/export |
| **SQL Editor** | Direct SQL access with schema browser |
| **Prompts** | Manage prompt templates with versioning |
| **API Keys** | Create and manage scoped API keys |
| **Settings** | Project config, team members, AI providers |
| **API Docs** | Built-in API documentation and examples |

---

## 💻 CLI

The `deva` CLI lets you manage Devabase from your terminal:

```bash
# Install
cargo install devabase-cli

# Authenticate
deva login
deva project use my-project

# Manage collections
deva collections list
deva collections create docs --dimensions 1536

# Upload documents
deva documents upload ./manual.pdf -c docs
deva documents list -c docs

# Query
deva search "how to reset password" -c docs --top-k 5

# Tables
deva tables list
deva tables export users -f csv -o users.csv

# SQL
deva sql "SELECT * FROM customers LIMIT 10"
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) | Required |
| `DEVABASE_HOST` | Server bind address | `0.0.0.0` |
| `DEVABASE_PORT` | Server port | `8080` |
| `STORAGE_PATH` | File storage directory | `./data/storage` |
| `MAX_UPLOAD_SIZE_MB` | Maximum upload size | `50` |
| `RUST_LOG` | Log level | `info` |

### Config File (devabase.toml)

```toml
[server]
host = "0.0.0.0"
port = 8080
max_upload_size_mb = 50

[database]
url = "${DATABASE_URL}"
max_connections = 20

[vector]
default_dimensions = 1536
default_metric = "cosine"

[chunking]
default_chunk_size = 512
default_overlap = 50

[rate_limit]
enabled = true
requests_per_window = 100
window_seconds = 60
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
│  │   sys_* tables│  │  sys_vectors  │  │  ut_* tables  │                │
│  │    (system)   │  │  (embeddings) │  │  (user data)  │                │
│  └───────────────┘  └───────────────┘  └───────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Table Naming Convention

| Prefix | Purpose | Example |
|--------|---------|---------|
| `sys_` | System tables | `sys_users`, `sys_projects`, `sys_collections` |
| `sys_vectors` | Vector embeddings | Stores all embeddings with collection/chunk references |
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
