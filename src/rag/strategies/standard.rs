//! Standard Retrieval Strategy
//!
//! Basic vector similarity search - the default retrieval method.
//! This is a pass-through to the existing retrieval implementation.

use crate::db::DbPool;
use crate::rag::RetrievalResult;
use crate::vector::{self, SearchQuery};
use crate::Result;
use async_trait::async_trait;

use super::{RetrievalStrategy, StrategyContext, StrategyInput};

/// Standard retrieval strategy using vector similarity search
pub struct StandardStrategy;

#[async_trait]
impl RetrievalStrategy for StandardStrategy {
    async fn retrieve(
        &self,
        ctx: &StrategyContext<'_>,
        input: StrategyInput,
    ) -> Result<Vec<RetrievalResult>> {
        // Generate query embedding
        let embeddings = ctx.embedding_provider.embed(&[input.query.clone()]).await?;
        let query_embedding = embeddings
            .into_iter()
            .next()
            .ok_or_else(|| crate::Error::Embedding("No embedding returned".to_string()))?;

        // Perform vector search
        let search_query = SearchQuery {
            embedding: query_embedding,
            top_k: Some(input.top_k),
            filter: input.filter,
            include_metadata: Some(true),
        };

        let results =
            vector::search_with_content(ctx.pool, ctx.project_id, &input.collection, search_query)
                .await?;

        // Convert to RetrievalResult
        let results: Vec<RetrievalResult> = results
            .into_iter()
            .map(|r| RetrievalResult {
                id: r.id,
                document_id: r.document_id,
                content: r.content,
                score: r.score,
                rerank_score: None,
                metadata: r.metadata,
            })
            .collect();

        // Apply reranking if available
        if let Some(reranker) = ctx.reranker {
            if !results.is_empty() {
                let documents: Vec<String> = results.iter().map(|r| r.content.clone()).collect();
                let reranked = reranker.rerank(&input.query, documents, None).await?;

                let mut reranked_results: Vec<RetrievalResult> = reranked
                    .into_iter()
                    .map(|r| {
                        let mut result = results[r.index].clone();
                        result.rerank_score = Some(r.score);
                        result
                    })
                    .collect();

                reranked_results.sort_by(|a, b| {
                    b.rerank_score
                        .unwrap_or(0.0)
                        .partial_cmp(&a.rerank_score.unwrap_or(0.0))
                        .unwrap_or(std::cmp::Ordering::Equal)
                });

                return Ok(reranked_results);
            }
        }

        Ok(results)
    }

    fn name(&self) -> &'static str {
        "standard"
    }

    fn requires_llm(&self) -> bool {
        false
    }
}

/// Helper function to perform standard vector search
pub(crate) async fn standard_search(
    pool: &DbPool,
    project_id: uuid::Uuid,
    collection: &str,
    query_embedding: Vec<f32>,
    top_k: i32,
    filter: Option<serde_json::Value>,
) -> Result<Vec<RetrievalResult>> {
    let search_query = SearchQuery {
        embedding: query_embedding,
        top_k: Some(top_k),
        filter,
        include_metadata: Some(true),
    };

    let results = vector::search_with_content(pool, project_id, collection, search_query).await?;

    Ok(results
        .into_iter()
        .map(|r| RetrievalResult {
            id: r.id,
            document_id: r.document_id,
            content: r.content,
            score: r.score,
            rerank_score: None,
            metadata: r.metadata,
        })
        .collect())
}
