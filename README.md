<div align="center">

# Devabase

### The Open-Source Backend for AI Applications

**Vector database + Relational database + RAG pipeline — all in one.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com/r/devabase/devabase)

[Documentation](https://docs.devabase.io) · [Quick Start](#-quick-start) · [API Reference](#-api-reference)

<br />

<img src="docs/assets/dashboard.png" alt="Devabase Dashboard" width="800" />

</div>

---

## Why Devabase?

Building AI applications shouldn't require stitching together 5 different services. Devabase gives you everything in one self-hosted backend:

| What you need | Without Devabase | With Devabase |
|--------------|------------------|---------------|
| Vector search | Pinecone, Weaviate, Qdrant | ✅ Built-in |
| Document storage | S3 + custom processing | ✅ Built-in |
| RAG pipeline | Custom code + orchestration | ✅ One API call |
| User data | Separate database | ✅ Auto-API tables |
| Auth & multi-tenancy | Auth0 + custom logic | ✅ Built-in |

**Result:** Ship AI features in hours, not weeks.

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔍 Vector Database
- pgvector with HNSW indexing
- Cosine, L2, inner product metrics
- Automatic embedding generation
- Project-isolated collections

</td>
<td width="50%">

### 📄 Document Processing
- PDF, Markdown, TXT, HTML, CSV, JSON
- Automatic chunking & embedding
- Background processing queue
- Real-time status updates

</td>
</tr>
<tr>
<td width="50%">

### 🤖 RAG Pipeline
- One-click chat API per collection
- Multi-collection search
- Conversation history
- OpenAI, Anthropic, Google, Ollama

</td>
<td width="50%">

### 🗄️ Auto-API Database
- Create tables via API/dashboard
- Instant REST endpoints
- CSV/JSON import & export
- SQL editor with syntax highlighting

</td>
</tr>
<tr>
<td width="50%">

### 👥 Multi-tenancy
- Project-based isolation
- Team invitations & roles
- Scoped API keys
- Usage analytics

</td>
<td width="50%">

### 🛠️ Developer Experience
- Modern React dashboard
- Interactive API playground
- WebSocket real-time events
- Configurable webhooks

</td>
</tr>
</table>

---

## 🚀 Quick Start

### One Command Deploy

```bash
curl -fsSL https://get.devabase.io | sh
```

### Docker Compose

```bash
# Clone and start
git clone https://github.com/kvsovanreach/devabase.git
cd devabase
docker compose up -d

# Open dashboard
open http://localhost:3000
```

### From Source

```bash
# Prerequisites: Rust 1.75+, Node.js 18+, PostgreSQL 16 with pgvector

# Backend
export DATABASE_URL="postgres://user:pass@localhost:5432/devabase"
export JWT_SECRET="your-secret-key"
cargo run --release -- serve

# Frontend (new terminal)
cd web && npm install && npm run dev
```

> 📖 See the [full installation guide](https://docs.devabase.io/installation) for detailed instructions.

---

## 💡 Use Cases

### Knowledge Base Chat
Upload your docs, enable RAG, get a chat API:

```bash
# 1. Upload documents
curl -X POST localhost:8080/v1/collections/docs/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@knowledge-base.pdf"

# 2. Enable RAG chat
curl -X PATCH localhost:8080/v1/collections/docs/config \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"rag_enabled": true, "llm_provider_id": "openai-1"}'

# 3. Chat with your docs
curl -X POST localhost:8080/v1/collections/docs/chat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "What is the refund policy?"}'
```

### Semantic Search
Build search into your app:

```bash
curl -X POST localhost:8080/v1/collections/products/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "comfortable running shoes", "top_k": 10}'
```

### Backend for Mobile/Web Apps
Auto-generate REST APIs for your data:

```bash
# Create a table
curl -X POST localhost:8080/v1/tables \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "todos", "columns": [
    {"name": "id", "type": "uuid", "primary": true},
    {"name": "title", "type": "text"},
    {"name": "completed", "type": "boolean", "default": false}
  ]}'

# Use it immediately
curl -X POST localhost:8080/v1/tables/todos/rows \
  -d '{"title": "Ship feature", "completed": false}'
```

---

## 📖 API Reference

### Authentication

```bash
# Register
POST /v1/auth/register
{"email": "user@example.com", "password": "...", "name": "..."}

# Login → Returns JWT token
POST /v1/auth/login
{"email": "user@example.com", "password": "..."}
```

### Collections & Documents

```bash
POST   /v1/collections                      # Create collection
GET    /v1/collections                      # List collections
GET    /v1/collections/:name                # Get collection
DELETE /v1/collections/:name                # Delete collection

POST   /v1/collections/:name/documents      # Upload document
GET    /v1/documents                        # List all documents
GET    /v1/documents/:id                    # Get document
DELETE /v1/documents/:id                    # Delete document
```

### Search & RAG Chat

```bash
# Semantic search (single collection)
POST /v1/collections/:name/search
{"query": "...", "top_k": 5}

# RAG chat (single collection)
POST /v1/collections/:name/chat
{"message": "...", "conversation_id": "..."}

# Cross-collection search
POST /v1/search
{"collections": ["docs", "support"], "query": "...", "top_k": 10}

# Cross-collection chat
POST /v1/chat
{"collections": ["docs", "support"], "message": "..."}
```

### Tables (Auto-API)

```bash
POST   /v1/tables                           # Create table
GET    /v1/tables/:table/rows               # List rows (supports filtering)
POST   /v1/tables/:table/rows               # Insert row
PATCH  /v1/tables/:table/rows/:id           # Update row
DELETE /v1/tables/:table/rows/:id           # Delete row
GET    /v1/tables/:table/export?format=csv  # Export data
POST   /v1/tables/:table/import             # Import data
```

### SQL & Admin

```bash
POST /v1/sql/execute                        # Execute SQL query
GET  /v1/sql/schema                         # Get database schema
GET  /v1/admin/usage                        # Usage analytics
```

> 📖 Full API documentation at [docs.devabase.io/api](https://docs.devabase.io/api)

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Your Application                           │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    Devabase Backend (Rust)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │   Auth   │ │  Vector  │ │   RAG    │ │ Auto-API │          │
│  │  & ACL   │ │  Search  │ │ Pipeline │ │  Tables  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                   PostgreSQL + pgvector                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │   sys_* tables │  │  uv_* vectors  │  │  ut_* tables   │   │
│  │    (system)    │  │  (embeddings)  │  │  (user data)   │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Table Naming Convention:**
- `sys_*` — System tables (users, projects, collections, etc.)
- `uv_{project}_{collection}` — Vector tables per project/collection
- `ut_{project}_{table}` — User-defined tables per project

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | Secret for JWT signing | ✅ |
| `DEVABASE_PORT` | Server port | Default: `8080` |
| `STORAGE_PATH` | File storage path | Default: `./data/storage` |

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

[rate_limit]
enabled = true
requests_per_window = 100
window_seconds = 60
```

---

## 🔌 Supported Providers

### Embedding Providers

| Provider | Models | Dimensions |
|----------|--------|------------|
| OpenAI | `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002` | 1536, 3072 |
| Ollama | Any local model (`nomic-embed-text`, `mxbai-embed-large`, etc.) | Configurable |
| Custom | Any OpenAI-compatible API | Configurable |

### LLM Providers (for RAG)

| Provider | Models |
|----------|--------|
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |
| Anthropic | `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku` |
| Google | `gemini-pro`, `gemini-1.5-pro` |
| Custom | Ollama, Together, Groq, any OpenAI-compatible |

---

## 🖥️ Dashboard

The web dashboard provides a complete interface for managing your Devabase instance:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview, stats, quick actions |
| **Collections** | Create and manage vector collections |
| **Documents** | Upload, process, and browse documents |
| **RAG Chat** | Interactive chat with your knowledge base |
| **Tables** | Create tables, browse data, import/export |
| **SQL Editor** | Direct SQL access with syntax highlighting |
| **Playground** | Test API endpoints interactively |
| **Settings** | Project config, team members, providers |

---

## 💻 CLI

The `deva` CLI lets you manage Devabase from your terminal — perfect for scripting, CI/CD, and developers who prefer the command line.

### Installation

```bash
# Quick install (macOS/Linux)
curl -fsSL https://get.devabase.io/cli | sh

# Or with Cargo
cargo install devabase-cli

# Or download from GitHub releases
# https://github.com/kvsovanreach/devabase/releases
```

### Usage

```bash
# Authenticate
deva login
deva login --api-key deva_xxxx    # Or use API key

# Select project
deva project list
deva project use my-project

# Manage collections
deva collections list
deva collections create docs --dimensions 1536
deva collections delete docs

# Upload documents
deva documents upload ./manual.pdf -c docs
deva documents list -c docs

# Query tables
deva tables list
deva tables export users -f csv -o users.csv
deva tables query orders --filter "status=pending" --limit 50

# Execute SQL
deva sql "SELECT * FROM customers WHERE created_at > '2024-01-01'"

# Output formats
deva collections list --format json    # JSON output
deva tables query users --format csv   # CSV output
```

### Configuration

Config is stored in `~/.devabase/config.json`:

```bash
deva config                           # Show current config
deva config api_url                   # Get value
deva config api_url http://localhost:8080  # Set value
```

Environment variables:
- `DEVABASE_API_URL` — Override API URL

---

## 🧑‍💻 Development

```bash
# Clone
git clone https://github.com/kvsovanreach/devabase.git
cd devabase

# Backend (Rust)
cargo build
cargo run -- serve

# Frontend (Next.js)
cd web
npm install
npm run dev

# Run tests
cargo test
npm run test

# Build for production
cargo build --release
cd web && npm run build
```

---

## 🤝 Contributing

- 🐛 [Report bugs](https://github.com/kvsovanreach/devabase/issues)
- 💡 [Request features](https://github.com/kvsovanreach/devabase/discussions)
- 📖 [Improve docs](https://github.com/kvsovanreach/devabase/tree/main/docs)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ by the Devabase team**

[Website](https://devabase.io) · [Documentation](https://docs.devabase.io)

</div>
