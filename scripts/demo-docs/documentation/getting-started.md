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

1. **Register an account** at http://localhost:3000/register
2. **Create a project** - this isolates your data
3. **Configure providers** - add your OpenAI/Anthropic API keys
4. **Create a collection** - where your documents live
5. **Upload documents** - drag & drop PDFs, markdown, etc.
6. **Enable RAG** - turn on the RAG toggle to enable chat
7. **Start chatting** - ask questions about your documents!

## Core Concepts

### Projects

Projects provide complete data isolation. Each project has its own:
- Collections and documents
- Tables and data
- API keys and team members
- Provider configurations

### Collections

Collections are containers for documents with vector search capabilities:
- Each collection has a specific embedding dimension
- Documents are automatically chunked and embedded
- Enable RAG to chat with documents in a collection

### Documents

Upload various file formats:
- PDF, Markdown, HTML, Text
- CSV, JSON
- Word documents (.docx)

Documents are processed automatically:
1. Content extraction
2. Smart chunking
3. Embedding generation
4. Vector indexing

## Next Steps

- [Vector Search Guide](./vector-search.md) - Learn about search capabilities
- [RAG Configuration](./rag-configuration.md) - Set up AI chat
- [API Reference](./api-reference.md) - Full API documentation
