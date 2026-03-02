//! Parent-Child Retrieval Strategy
//!
//! Retrieves small chunks for precision, but returns larger parent chunks for context:
//! 1. Searches against child chunks (small, precise embeddings)
//! 2. Fetches the parent chunks for each match
//! 3. Returns parent chunks with larger context
//!
//! This requires hierarchical chunking to be enabled on the collection,
//! with parent_chunk_id populated in sys_chunks.

use crate::rag::RetrievalResult;
use crate::Result;
use async_trait::async_trait;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use super::standard::standard_search;
use super::{RetrievalStrategy, StrategyContext, StrategyInput};

/// Parent-child retrieval strategy
pub struct ParentChildStrategy;

#[async_trait]
impl RetrievalStrategy for ParentChildStrategy {
    async fn retrieve(
        &self,
        ctx: &StrategyContext<'_>,
        input: StrategyInput,
    ) -> Result<Vec<RetrievalResult>> {
        // Get options
        let _parent_depth = input.options.parent_depth.unwrap_or(1);

        // First, search against child chunks
        let embeddings = ctx.embedding_provider.embed(&[input.query.clone()]).await?;
        let embedding = embeddings
            .into_iter()
            .next()
            .ok_or_else(|| crate::Error::Embedding("No embedding returned".to_string()))?;

        // Fetch more child chunks than needed to ensure we get enough unique parents
        let child_results = standard_search(
            ctx.pool,
            ctx.project_id,
            &input.collection,
            embedding,
            input.top_k * 3,
            input.filter.clone(),
        )
        .await?;

        if child_results.is_empty() {
            return Ok(vec![]);
        }

        // Get chunk IDs to fetch parent information
        let chunk_ids: Vec<Uuid> = child_results.iter().map(|r| r.id).collect();

        // Query to get parent chunk information
        let parent_query = r#"
            SELECT
                c.id as child_id,
                c.parent_chunk_id,
                pc.id as parent_id,
                pc.document_id,
                pc.content as parent_content,
                pc.metadata as parent_metadata
            FROM sys_chunks c
            LEFT JOIN sys_chunks pc ON c.parent_chunk_id = pc.id
            WHERE c.id = ANY($1)
        "#;

        let rows: Vec<(Uuid, Option<Uuid>, Option<Uuid>, Option<Uuid>, Option<String>, Option<serde_json::Value>)> =
            sqlx::query_as(parent_query)
                .bind(&chunk_ids)
                .fetch_all(ctx.pool.inner())
                .await?;

        // Build a map of child_id -> (parent_id, parent_content, parent_metadata, document_id)
        let mut parent_map: HashMap<Uuid, (Uuid, Uuid, String, Option<serde_json::Value>)> = HashMap::new();
        let mut child_to_parent: HashMap<Uuid, Uuid> = HashMap::new();

        for (child_id, parent_chunk_id, parent_id, doc_id, parent_content, parent_metadata) in rows {
            if let (Some(pid), Some(doc), Some(content)) = (parent_id, doc_id, parent_content) {
                parent_map.insert(pid, (pid, doc, content, parent_metadata));
                child_to_parent.insert(child_id, pid);
            } else if parent_chunk_id.is_none() {
                // This chunk has no parent, use itself as the "parent"
                if let Some(child_result) = child_results.iter().find(|r| r.id == child_id) {
                    parent_map.insert(
                        child_id,
                        (
                            child_id,
                            child_result.document_id,
                            child_result.content.clone(),
                            child_result.metadata.clone(),
                        ),
                    );
                    child_to_parent.insert(child_id, child_id);
                }
            }
        }

        // Score parents by best child score
        let mut parent_scores: HashMap<Uuid, f64> = HashMap::new();
        for result in &child_results {
            if let Some(&parent_id) = child_to_parent.get(&result.id) {
                let entry = parent_scores.entry(parent_id).or_insert(0.0);
                *entry = entry.max(result.score);
            }
        }

        // Build unique parent results
        let mut seen_parents: HashSet<Uuid> = HashSet::new();
        let mut parent_results: Vec<RetrievalResult> = Vec::new();

        // Sort by parent score
        let mut scored_parents: Vec<(Uuid, f64)> = parent_scores.into_iter().collect();
        scored_parents.sort_by(|a, b| {
            b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
        });

        for (parent_id, score) in scored_parents {
            if seen_parents.insert(parent_id) {
                if let Some((id, doc_id, content, metadata)) = parent_map.get(&parent_id) {
                    parent_results.push(RetrievalResult {
                        id: *id,
                        document_id: *doc_id,
                        content: content.clone(),
                        score,
                        rerank_score: None,
                        metadata: metadata.clone(),
                    });
                }

                if parent_results.len() >= input.top_k as usize {
                    break;
                }
            }
        }

        // Apply reranking if available
        if let Some(reranker) = ctx.reranker {
            if !parent_results.is_empty() {
                let documents: Vec<String> =
                    parent_results.iter().map(|r| r.content.clone()).collect();
                let reranked = reranker.rerank(&input.query, documents, None).await?;

                let mut reranked_results: Vec<RetrievalResult> = reranked
                    .into_iter()
                    .map(|r| {
                        let mut result = parent_results[r.index].clone();
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

        Ok(parent_results)
    }

    fn name(&self) -> &'static str {
        "parent_child"
    }

    fn requires_llm(&self) -> bool {
        false
    }
}
