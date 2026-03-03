# How does reranking work?

**Q: How does reranking work?**

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
```typescript
const results = await client.search.query({
  collection: 'docs',
  query: 'authentication',
  rerank: true
});
```