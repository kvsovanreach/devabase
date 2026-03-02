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

Combine vector similarity with keyword matching for the best of both worlds:

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

Generate a hypothetical answer, embed it, then search. This often retrieves more relevant results for question-type queries:

```typescript
const results = await client.search.hyde({
  collection: 'docs',
  query: 'What causes memory leaks in JavaScript?'
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

Extract filters from natural language automatically:

```typescript
// "Python tutorials from 2023" becomes:
// query: "Python tutorials"
// filter: { year: 2023 }
const results = await client.search.selfQuery({
  collection: 'docs',
  query: 'Python tutorials from 2023'
});
```

### Parent-Child

Search small precise chunks but return larger parent context:

```typescript
const results = await client.search.parentChild({
  collection: 'docs',
  query: 'error handling',
  strategy_options: { parent_depth: 1 }
});
```

### Compression

Compress retrieved chunks to only relevant portions:

```typescript
const results = await client.search.compressed({
  collection: 'docs',
  query: 'password reset',
  strategy_options: { max_compressed_length: 300 }
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

## Supported Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| $eq | Equal | `{ status: { $eq: "active" } }` |
| $ne | Not equal | `{ status: { $ne: "deleted" } }` |
| $gt | Greater than | `{ price: { $gt: 100 } }` |
| $gte | Greater or equal | `{ age: { $gte: 18 } }` |
| $lt | Less than | `{ price: { $lt: 50 } }` |
| $lte | Less or equal | `{ rating: { $lte: 5 } }` |
| $in | In array | `{ category: { $in: ["tech", "science"] } }` |
| $contains | Text contains | `{ title: { $contains: "guide" } }` |

## Reranking

Enable cross-encoder reranking for better relevance:

```typescript
const results = await client.search.query({
  collection: 'docs',
  query: 'How to deploy to production?',
  top_k: 10,
  rerank: true  // Uses configured reranking provider
});
```

Reranking improves results by:
1. First retrieving more candidates (e.g., 50)
2. Using a cross-encoder to re-score each result
3. Returning the top-K best matches
