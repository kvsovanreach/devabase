# Vector Search Guide

# Vector Search in Devabase

Devabase provides powerful vector search capabilities powered by pgvector with HNSW indexing.

## Basic Search

```typescript
const results = await client.search.query({
  collection: 'my-docs',
  query: 'How to implement authentication?',
  top_k: 10,
  rerank: true
});
```

## Hybrid Search

Combine vector similarity with keyword matching:

```typescript
const results = await client.search.hybrid({
  collection: 'my-docs',
  query: 'authentication JWT tokens',
  vector_weight: 0.7,
  keyword_weight: 0.3
});
```

## Advanced Retrieval Strategies

### HyDE (Hypothetical Document Embeddings)
Generate a hypothetical answer, embed it, then search:

```typescript
const results = await client.search.hyde({
  collection: 'docs',
  query: 'What causes memory leaks?'
});
```

### Multi-Query
Expand query into variations for better recall:

```typescript
const results = await client.search.multiQuery({
  collection: 'docs',
  query: 'authentication best practices',
  strategy_options: { num_query_variations: 4 }
});
```

### Self-Query
Extract filters from natural language:

```typescript
const results = await client.search.selfQuery({
  collection: 'docs',
  query: 'Python tutorials from 2023'
});
```

## Metadata Filtering

Filter results by metadata:

```typescript
const results = await client.search.query({
  collection: 'products',
  query: 'comfortable running shoes',
  filter: {
    category: 'footwear',
    price: { $lt: 100 }
  }
});
```