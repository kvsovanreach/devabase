/**
 * Devabase Demo Initialization Script
 * ====================================
 * Run with: npx ts-node scripts/init-demo.ts
 * Or: npx tsx scripts/init-demo.ts
 *
 * This script sets up comprehensive demo data to showcase all Devabase features.
 */

// Configuration
const BASE_URL = process.env.DEVABASE_URL || "http://localhost:8080";
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@devabase.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo123456";
const DEMO_NAME = process.env.DEMO_NAME || "Demo User";

// Sample documents for RAG demonstration
const SAMPLE_DOCUMENTS = {
  documentation: [
    {
      title: "Getting Started with Devabase",
      content: `# Getting Started with Devabase

Devabase is an open-source backend platform purpose-built for AI applications. It combines vector search, document processing, RAG pipelines, knowledge graphs, and auto-generated APIs into a single, unified backend.

## Installation

### Using Docker (Recommended)

\`\`\`bash
git clone https://github.com/kvsovanreach/devabase.git
cd devabase
docker compose up -d
\`\`\`

### From Source

Prerequisites:
- Rust 1.75+
- Node.js 18+
- PostgreSQL 16 with pgvector extension

\`\`\`bash
# Setup database
createdb devabase
psql -d devabase -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run backend
cargo run --release -- serve

# Run frontend
cd web && npm install && npm run dev
\`\`\`

## Quick Start

1. Register an account at http://localhost:3000/register
2. Create a project - this isolates your data
3. Configure providers - add your OpenAI/Anthropic API keys
4. Create a collection - where your documents live
5. Upload documents - drag & drop PDFs, markdown, etc.
6. Enable RAG - turn on the RAG toggle to enable chat
7. Start chatting - ask questions about your documents!`,
    },
    {
      title: "Vector Search Guide",
      content: `# Vector Search in Devabase

Devabase provides powerful vector search capabilities powered by pgvector with HNSW indexing.

## Basic Search

\`\`\`typescript
const results = await client.search.query({
  collection: 'my-docs',
  query: 'How to implement authentication?',
  top_k: 10,
  rerank: true
});
\`\`\`

## Hybrid Search

Combine vector similarity with keyword matching:

\`\`\`typescript
const results = await client.search.hybrid({
  collection: 'my-docs',
  query: 'authentication JWT tokens',
  vector_weight: 0.7,
  keyword_weight: 0.3
});
\`\`\`

## Advanced Retrieval Strategies

### HyDE (Hypothetical Document Embeddings)
Generate a hypothetical answer, embed it, then search:

\`\`\`typescript
const results = await client.search.hyde({
  collection: 'docs',
  query: 'What causes memory leaks?'
});
\`\`\`

### Multi-Query
Expand query into variations for better recall:

\`\`\`typescript
const results = await client.search.multiQuery({
  collection: 'docs',
  query: 'authentication best practices',
  strategy_options: { num_query_variations: 4 }
});
\`\`\`

### Self-Query
Extract filters from natural language:

\`\`\`typescript
const results = await client.search.selfQuery({
  collection: 'docs',
  query: 'Python tutorials from 2023'
});
\`\`\`

## Metadata Filtering

Filter results by metadata:

\`\`\`typescript
const results = await client.search.query({
  collection: 'products',
  query: 'comfortable running shoes',
  filter: {
    category: 'footwear',
    price: { $lt: 100 }
  }
});
\`\`\``,
    },
    {
      title: "RAG Chat Configuration",
      content: `# Configuring RAG Chat

RAG (Retrieval-Augmented Generation) allows you to chat with your documents using AI.

## Enabling RAG

1. Navigate to your collection in the dashboard
2. Click "Settings" or the gear icon
3. Toggle "Enable RAG"
4. Select your LLM provider and model
5. Customize the system prompt (optional)

## API Usage

\`\`\`typescript
// Single message
const response = await client.chat.send({
  collection: 'my-docs',
  message: 'What is the authentication flow?',
  include_sources: true
});

console.log(response.message);
console.log(response.sources);
\`\`\`

## Streaming Responses

\`\`\`typescript
await client.chat.stream({
  collection: 'my-docs',
  message: 'Explain the architecture',
  onChunk: (chunk) => process.stdout.write(chunk),
  onComplete: (response) => {
    console.log('\\nSources:', response.sources);
  }
});
\`\`\`

## Multi-turn Conversations

\`\`\`typescript
const response1 = await client.chat.send({
  collection: 'my-docs',
  message: 'What is authentication?'
});

const response2 = await client.chat.continue(
  response1.conversation_id,
  'How do I implement it?'
);
\`\`\`

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| temperature | Creativity (0-2) | 0.7 |
| max_tokens | Max response length | 1000 |
| top_k | Documents to retrieve | 5 |
| system_prompt | Custom instructions | Default RAG prompt |`,
    },
  ],
  faq: [
    {
      title: "What is Devabase?",
      content: `**Q: What is Devabase?**

A: Devabase is an open-source backend platform purpose-built for AI applications. It combines:
- Vector Database (pgvector with HNSW indexing)
- Document Processing (PDF, Markdown, HTML, etc.)
- RAG Pipeline (chat with your documents)
- Knowledge Graphs (entity extraction)
- Auto-API Tables (instant REST endpoints)
- Authentication & Multi-tenancy

Think of it as "Supabase for AI" - everything you need to build AI-powered applications in one unified platform.`,
    },
    {
      title: "How do I upload documents?",
      content: `**Q: How do I upload documents?**

A: There are multiple ways to upload documents:

1. **Dashboard**: Drag and drop files into a collection
2. **API**: POST to /v1/documents/upload with multipart form data
3. **SDK**: Use client.documents.upload()

Supported formats:
- PDF (.pdf)
- Markdown (.md)
- Plain text (.txt)
- HTML (.html)
- CSV (.csv)
- JSON (.json)
- Word documents (.docx)

Documents are automatically chunked, embedded, and indexed for search.`,
    },
    {
      title: "What embedding providers are supported?",
      content: `**Q: What embedding providers are supported?**

A: Devabase supports multiple embedding providers:

| Provider | Models | Dimensions |
|----------|--------|------------|
| OpenAI | text-embedding-3-small, text-embedding-3-large | 1536, 3072 |
| Cohere | embed-english-v3.0, embed-multilingual-v3.0 | 1024 |
| Voyage | voyage-large-2, voyage-code-2 | 1536 |
| Custom | Any OpenAI-compatible API (Ollama, etc.) | Configurable |

Configure your provider in Project Settings > Providers.`,
    },
    {
      title: "How does reranking work?",
      content: `**Q: How does reranking work?**

A: Reranking improves search relevance by using a cross-encoder model to re-score results after initial vector search.

How it works:
1. Vector search retrieves top-N candidates (e.g., 50)
2. Cross-encoder model scores each candidate against the query
3. Results are reordered by the new scores
4. Top-K results are returned (e.g., 10)

Supported reranking providers:
- Cohere (rerank-english-v3.0)
- Jina (jina-reranker-v2-base-multilingual)
- Voyage (rerank-2)

Enable reranking in your search request:
\`\`\`typescript
const results = await client.search.query({
  collection: 'docs',
  query: 'authentication',
  rerank: true
});
\`\`\``,
    },
    {
      title: "Can I self-host Devabase?",
      content: `**Q: Can I self-host Devabase?**

A: Yes! Devabase is fully open-source and designed for self-hosting.

Requirements:
- PostgreSQL 16+ with pgvector extension
- 2GB RAM minimum (4GB+ recommended)
- Docker (optional but recommended)

Quick start with Docker:
\`\`\`bash
git clone https://github.com/kvsovanreach/devabase.git
cd devabase
docker compose up -d
\`\`\`

Or run from source:
\`\`\`bash
cargo run --release -- serve
\`\`\`

All data stays on your infrastructure. No external dependencies required (except for AI providers if using cloud APIs).`,
    },
  ],
  "knowledge-base": [
    {
      title: "API Authentication",
      content: `# API Authentication

Devabase uses JWT-based authentication for API access.

## Getting a Token

### Login
\`\`\`bash
curl -X POST http://localhost:8080/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user@example.com", "password": "secret"}'
\`\`\`

Response:
\`\`\`json
{
  "user": { "id": "...", "email": "user@example.com" },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "..."
}
\`\`\`

## Using the Token

Include the token in the Authorization header:
\`\`\`bash
curl -H "Authorization: Bearer YOUR_TOKEN" \\
     -H "X-Project-ID: YOUR_PROJECT_ID" \\
     http://localhost:8080/v1/collections
\`\`\`

## API Keys

For production, use API keys instead of JWT tokens:
\`\`\`bash
curl -H "Authorization: Bearer dvb_your_api_key" \\
     -H "X-Project-ID: YOUR_PROJECT_ID" \\
     http://localhost:8080/v1/collections
\`\`\`

Create API keys in the dashboard under Project Settings > API Keys.`,
    },
    {
      title: "Knowledge Graph Extraction",
      content: `# Knowledge Graph Extraction

Devabase can automatically extract entities and relationships from your documents.

## How It Works

1. Upload a document with knowledge extraction enabled
2. LLM analyzes the content
3. Entities are identified (people, organizations, concepts, etc.)
4. Relationships between entities are mapped
5. Graph is stored and queryable

## Entity Types

- **Person** - People mentioned in documents
- **Organization** - Companies, institutions
- **Location** - Places, addresses
- **Concept** - Abstract ideas, topics
- **Product** - Products, services
- **Event** - Dates, occurrences
- **Technology** - Tools, frameworks, languages

## Querying the Graph

\`\`\`typescript
// Search entities
const entities = await client.knowledge.entities.search('John Smith');

// Get entity with relationships
const graph = await client.knowledge.getGraph(entityId, { depth: 2 });

// Find path between entities
const paths = await client.knowledge.findPath(entity1Id, entity2Id);
\`\`\`

## Dashboard

The Knowledge Graph page provides an interactive visualization to explore entities and their connections.`,
    },
    {
      title: "Table Auto-API",
      content: `# Table Auto-API

Create PostgreSQL tables and get instant REST endpoints.

## Creating a Table

\`\`\`typescript
const table = await client.tables.create({
  name: 'users',
  columns: [
    { name: 'id', type: 'uuid', primary: true },
    { name: 'email', type: 'text', unique: true },
    { name: 'name', type: 'text' },
    { name: 'created_at', type: 'timestamptz', default: 'now()' }
  ]
});
\`\`\`

## CRUD Operations

\`\`\`typescript
// Create
const user = await client.tables.rows('users').insert({
  email: 'user@example.com',
  name: 'John Doe'
});

// Read with filtering
const result = await client.tables.rows('users').query({
  filter: 'name.like=John',
  order: 'created_at:desc',
  limit: 10
});

// Update
await client.tables.rows('users').update(userId, {
  name: 'Jane Doe'
});

// Delete
await client.tables.rows('users').delete(userId);
\`\`\`

## Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| eq | Equal | status.eq=active |
| neq | Not equal | status.neq=deleted |
| gt | Greater than | age.gt=18 |
| gte | Greater or equal | age.gte=18 |
| lt | Less than | price.lt=100 |
| lte | Less or equal | price.lte=100 |
| like | Contains | name.like=john |
| is | Is null/true/false | deleted_at.is=null |`,
    },
  ],
};

// Sample table data
const SAMPLE_CUSTOMERS = [
  { name: "Alice Johnson", email: "alice@techcorp.com", company: "TechCorp", plan: "enterprise", status: "active" },
  { name: "Bob Smith", email: "bob@startup.io", company: "StartupXYZ", plan: "pro", status: "active" },
  { name: "Carol Williams", email: "carol@bigco.com", company: "BigCo Inc", plan: "enterprise", status: "active" },
  { name: "David Brown", email: "david@devshop.dev", company: "DevShop", plan: "pro", status: "active" },
  { name: "Eva Martinez", email: "eva@dataflow.ai", company: "DataFlow AI", plan: "enterprise", status: "active" },
  { name: "Frank Lee", email: "frank@acme.com", company: "ACME Corp", plan: "free", status: "active" },
  { name: "Grace Kim", email: "grace@innovate.co", company: "Innovate Co", plan: "pro", status: "active" },
  { name: "Henry Wang", email: "henry@techstart.io", company: "TechStart", plan: "free", status: "pending" },
];

const SAMPLE_PRODUCTS = [
  { name: "Devabase Cloud Starter", description: "Managed instance - 10GB storage, 100K vectors", price: 49, category: "SaaS", in_stock: true },
  { name: "Devabase Cloud Pro", description: "Managed instance - 100GB storage, 1M vectors", price: 199, category: "SaaS", in_stock: true },
  { name: "Devabase Cloud Enterprise", description: "Managed instance - Unlimited, dedicated resources", price: 999, category: "SaaS", in_stock: true },
  { name: "Self-Hosted License", description: "Annual license for self-hosted deployment", price: 2499, category: "License", in_stock: true },
  { name: "Premium Support", description: "24/7 support with 1-hour response SLA", price: 499, category: "Support", in_stock: true },
  { name: "Implementation Package", description: "Professional setup and configuration", price: 5000, category: "Services", in_stock: true },
  { name: "Training Workshop", description: "2-day hands-on training for your team", price: 3000, category: "Training", in_stock: true },
  { name: "Custom Integration", description: "Custom integration development", price: 10000, category: "Services", in_stock: false },
];

const SAMPLE_ORDERS = [
  { customer_email: "alice@techcorp.com", product_name: "Devabase Cloud Enterprise", quantity: 1, total: 999, status: "active" },
  { customer_email: "alice@techcorp.com", product_name: "Premium Support", quantity: 1, total: 499, status: "active" },
  { customer_email: "bob@startup.io", product_name: "Devabase Cloud Pro", quantity: 1, total: 199, status: "active" },
  { customer_email: "carol@bigco.com", product_name: "Self-Hosted License", quantity: 3, total: 7497, status: "completed" },
  { customer_email: "carol@bigco.com", product_name: "Implementation Package", quantity: 1, total: 5000, status: "completed" },
  { customer_email: "david@devshop.dev", product_name: "Devabase Cloud Pro", quantity: 1, total: 199, status: "active" },
  { customer_email: "eva@dataflow.ai", product_name: "Training Workshop", quantity: 2, total: 6000, status: "pending" },
  { customer_email: "frank@acme.com", product_name: "Devabase Cloud Starter", quantity: 1, total: 49, status: "active" },
  { customer_email: "grace@innovate.co", product_name: "Devabase Cloud Pro", quantity: 1, total: 199, status: "active" },
  { customer_email: "henry@techstart.io", product_name: "Devabase Cloud Starter", quantity: 1, total: 49, status: "pending" },
];

// Helper functions
async function apiCall(method: string, endpoint: string, body?: any, token?: string, projectId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (projectId) headers["X-Project-ID"] = projectId;

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function log(message: string, type: "info" | "success" | "warning" | "error" = "info") {
  const colors = {
    info: "\x1b[34m",
    success: "\x1b[32m",
    warning: "\x1b[33m",
    error: "\x1b[31m",
  };
  const reset = "\x1b[0m";
  const symbols = {
    info: "ℹ",
    success: "✓",
    warning: "⚠",
    error: "✗",
  };
  console.log(`${colors[type]}${symbols[type]}${reset} ${message}`);
}

async function main() {
  console.log("\n\x1b[34m============================================\x1b[0m");
  console.log("\x1b[34m   Devabase Demo Data Initialization\x1b[0m");
  console.log("\x1b[34m============================================\x1b[0m\n");

  // Step 1: Register/Login
  log("Step 1: Setting up demo user...", "info");

  // Try to register
  await apiCall("POST", "/v1/auth/register", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: DEMO_NAME,
  });

  // Login
  const loginResult = await apiCall("POST", "/v1/auth/login", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (!loginResult.token) {
    log(`Failed to login: ${JSON.stringify(loginResult)}`, "error");
    process.exit(1);
  }

  const token = loginResult.token;
  log(`Logged in as ${DEMO_EMAIL}`, "success");

  // Step 2: Create Project
  log("Step 2: Creating demo project...", "info");

  let projectId: string;
  const projectResult = await apiCall(
    "POST",
    "/v1/projects",
    { name: "Demo Project", description: "A demo project showcasing Devabase features" },
    token
  );

  if (projectResult.id) {
    projectId = projectResult.id;
  } else {
    // Project might exist, get it
    const projects = await apiCall("GET", "/v1/projects", undefined, token);
    projectId = projects.data?.[0]?.id || projects[0]?.id;
  }

  if (!projectId) {
    log("Failed to create/get project", "error");
    process.exit(1);
  }

  log(`Project ID: ${projectId}`, "success");

  // Step 3: Create Collections
  log("Step 3: Creating collections...", "info");

  const collections = [
    { name: "documentation", description: "Technical documentation and guides", dimensions: 1536 },
    { name: "faq", description: "Frequently asked questions", dimensions: 1536 },
    { name: "knowledge-base", description: "General knowledge articles", dimensions: 1536 },
  ];

  for (const collection of collections) {
    await apiCall("POST", "/v1/collections", collection, token, projectId);
    log(`Created '${collection.name}' collection`, "success");
  }

  // Step 4: Create Tables
  log("Step 4: Creating demo tables...", "info");

  const tables = [
    {
      name: "customers",
      columns: [
        { name: "id", type: "uuid", primary: true, default: "gen_random_uuid()" },
        { name: "name", type: "text", nullable: false },
        { name: "email", type: "text", nullable: false, unique: true },
        { name: "company", type: "text" },
        { name: "plan", type: "text", default: "'free'" },
        { name: "status", type: "text", default: "'active'" },
        { name: "created_at", type: "timestamptz", default: "now()" },
      ],
    },
    {
      name: "products",
      columns: [
        { name: "id", type: "uuid", primary: true, default: "gen_random_uuid()" },
        { name: "name", type: "text", nullable: false },
        { name: "description", type: "text" },
        { name: "price", type: "numeric", nullable: false },
        { name: "category", type: "text" },
        { name: "in_stock", type: "boolean", default: "true" },
        { name: "created_at", type: "timestamptz", default: "now()" },
      ],
    },
    {
      name: "orders",
      columns: [
        { name: "id", type: "uuid", primary: true, default: "gen_random_uuid()" },
        { name: "customer_email", type: "text", nullable: false },
        { name: "product_name", type: "text", nullable: false },
        { name: "quantity", type: "integer", default: "1" },
        { name: "total", type: "numeric", nullable: false },
        { name: "status", type: "text", default: "'pending'" },
        { name: "created_at", type: "timestamptz", default: "now()" },
      ],
    },
  ];

  for (const table of tables) {
    await apiCall("POST", "/v1/tables", table, token, projectId);
    log(`Created '${table.name}' table`, "success");
  }

  // Step 5: Insert Sample Data
  log("Step 5: Inserting sample data...", "info");

  for (const customer of SAMPLE_CUSTOMERS) {
    await apiCall("POST", "/v1/tables/customers/rows", customer, token, projectId);
  }
  log(`Inserted ${SAMPLE_CUSTOMERS.length} customers`, "success");

  for (const product of SAMPLE_PRODUCTS) {
    await apiCall("POST", "/v1/tables/products/rows", product, token, projectId);
  }
  log(`Inserted ${SAMPLE_PRODUCTS.length} products`, "success");

  for (const order of SAMPLE_ORDERS) {
    await apiCall("POST", "/v1/tables/orders/rows", order, token, projectId);
  }
  log(`Inserted ${SAMPLE_ORDERS.length} orders`, "success");

  // Step 6: Summary
  console.log("\n\x1b[34m============================================\x1b[0m");
  console.log("\x1b[32m   Demo Data Initialization Complete!\x1b[0m");
  console.log("\x1b[34m============================================\x1b[0m\n");

  console.log("Demo Credentials:");
  console.log(`  Email:    \x1b[33m${DEMO_EMAIL}\x1b[0m`);
  console.log(`  Password: \x1b[33m${DEMO_PASSWORD}\x1b[0m`);
  console.log(`\nProject ID: \x1b[33m${projectId}\x1b[0m`);

  console.log("\nCreated Resources:");
  console.log("  \x1b[32m✓\x1b[0m 3 Collections: documentation, faq, knowledge-base");
  console.log("  \x1b[32m✓\x1b[0m 3 Tables: customers, products, orders");
  console.log(`  \x1b[32m✓\x1b[0m ${SAMPLE_CUSTOMERS.length + SAMPLE_PRODUCTS.length + SAMPLE_ORDERS.length} Sample records`);

  console.log("\nNext Steps:");
  console.log("  1. Open \x1b[33mhttp://localhost:3000\x1b[0m in your browser");
  console.log("  2. Login with the demo credentials");
  console.log("  3. Configure your AI providers in Settings > Providers");
  console.log("  4. Upload documents to collections");
  console.log("  5. Try the search and RAG chat features\n");

  // Save sample documents to files
  log("Saving sample documents to scripts/demo-docs/...", "info");
  const fs = await import("fs");
  const path = await import("path");

  const docsDir = path.join(process.cwd(), "scripts", "demo-docs");
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  for (const [collection, docs] of Object.entries(SAMPLE_DOCUMENTS)) {
    const collectionDir = path.join(docsDir, collection);
    if (!fs.existsSync(collectionDir)) {
      fs.mkdirSync(collectionDir, { recursive: true });
    }

    for (const doc of docs) {
      const filename = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".md";
      fs.writeFileSync(path.join(collectionDir, filename), `# ${doc.title}\n\n${doc.content}`);
    }
  }

  log("Sample documents saved to scripts/demo-docs/", "success");
  console.log("\nUpload these documents via the dashboard or API to enable RAG features.\n");
}

main().catch(console.error);
