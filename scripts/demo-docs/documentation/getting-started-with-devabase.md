# Getting Started with Devabase

# Getting Started with Devabase

Devabase is an open-source backend platform purpose-built for AI applications. It combines vector search, document processing, RAG pipelines, knowledge graphs, and auto-generated APIs into a single, unified backend.

## Installation

### Using Docker (Recommended)

```bash
git clone https://github.com/kvsovanreach/devabase.git
cd devabase
docker compose up -d
```

### From Source

Prerequisites:
- Rust 1.75+
- Node.js 18+
- PostgreSQL 16 with pgvector extension

```bash
# Setup database
createdb devabase
psql -d devabase -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run backend
cargo run --release -- serve

# Run frontend
cd web && npm install && npm run dev
```

## Quick Start

1. Register an account at http://localhost:9001/register
2. Create a project - this isolates your data
3. Configure providers - add your OpenAI/Anthropic API keys
4. Create a collection - where your documents live
5. Upload documents - drag & drop PDFs, markdown, etc.
6. Enable RAG - turn on the RAG toggle to enable chat
7. Start chatting - ask questions about your documents!