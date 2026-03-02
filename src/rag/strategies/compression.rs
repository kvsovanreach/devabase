//! Contextual Compression Strategy
//!
//! Compresses retrieved chunks to only the most relevant portions:
//! 1. Performs standard retrieval to get candidate chunks
//! 2. Uses an LLM to extract only relevant parts for the query
//! 3. Filters out chunks that aren't relevant
//!
//! This is useful for reducing context size while preserving relevance,
//! especially when chunks are large or contain mixed content.

use crate::rag::RetrievalResult;
use crate::Result;
use async_trait::async_trait;

use super::standard::standard_search;
use super::{LlmOptions, RetrievalStrategy, StrategyContext, StrategyInput};

/// Contextual compression strategy
pub struct CompressionStrategy;

const COMPRESSION_PROMPT_TEMPLATE: &str = r#"You are an AI assistant that extracts relevant information from text.

Given a user's query and a document chunk, extract ONLY the parts that are directly relevant to answering the query. If the chunk contains no relevant information, respond with exactly "NOT_RELEVANT".

Query: {query}

Document chunk:
{chunk}

Extract the relevant portion (or respond "NOT_RELEVANT"):
"#;

#[async_trait]
impl RetrievalStrategy for CompressionStrategy {
    async fn retrieve(
        &self,
        ctx: &StrategyContext<'_>,
        input: StrategyInput,
    ) -> Result<Vec<RetrievalResult>> {
        let llm = ctx.llm_provider.ok_or_else(|| {
            crate::Error::Config("Compression strategy requires an LLM provider".to_string())
        })?;

        // Get options
        let max_length = input.options.max_compressed_length.unwrap_or(500);

        // First, do standard retrieval to get more candidates than we need
        // (we'll filter some out during compression)
        let fetch_multiplier = 2;
        let embeddings = ctx.embedding_provider.embed(&[input.query.clone()]).await?;
        let embedding = embeddings
            .into_iter()
            .next()
            .ok_or_else(|| crate::Error::Embedding("No embedding returned".to_string()))?;

        let candidates = standard_search(
            ctx.pool,
            ctx.project_id,
            &input.collection,
            embedding,
            input.top_k * fetch_multiplier,
            input.filter.clone(),
        )
        .await?;

        // Compress each chunk
        let mut compressed_results: Vec<RetrievalResult> = Vec::new();

        for result in candidates {
            let prompt = COMPRESSION_PROMPT_TEMPLATE
                .replace("{query}", &input.query)
                .replace("{chunk}", &result.content);

            let compressed = llm
                .complete(
                    &prompt,
                    LlmOptions {
                        temperature: 0.0,
                        max_tokens: max_length as i32,
                    },
                )
                .await?;

            let compressed = compressed.trim();

            // Filter out non-relevant chunks
            if compressed.to_uppercase() == "NOT_RELEVANT" || compressed.is_empty() {
                continue;
            }

            // Create result with compressed content
            compressed_results.push(RetrievalResult {
                id: result.id,
                document_id: result.document_id,
                content: compressed.to_string(),
                score: result.score,
                rerank_score: None,
                metadata: result.metadata,
            });

            // Stop when we have enough
            if compressed_results.len() >= input.top_k as usize {
                break;
            }
        }

        // Apply reranking if available (on compressed content)
        if let Some(reranker) = ctx.reranker {
            if !compressed_results.is_empty() {
                let documents: Vec<String> = compressed_results
                    .iter()
                    .map(|r| r.content.clone())
                    .collect();
                let reranked = reranker.rerank(&input.query, documents, None).await?;

                let mut reranked_results: Vec<RetrievalResult> = reranked
                    .into_iter()
                    .map(|r| {
                        let mut result = compressed_results[r.index].clone();
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

        Ok(compressed_results)
    }

    fn name(&self) -> &'static str {
        "compression"
    }

    fn requires_llm(&self) -> bool {
        true
    }
}
