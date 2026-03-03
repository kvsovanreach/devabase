//! Multi-Query Retrieval Strategy
//!
//! Expands the user's query into multiple variations, then:
//! 1. Uses an LLM to generate N alternative phrasings of the query
//! 2. Embeds all variations
//! 3. Searches with each variation
//! 4. Merges and deduplicates results
//!
//! This improves recall by capturing different aspects and phrasings
//! of what the user might be looking for.

use crate::rag::RetrievalResult;
use crate::Result;
use async_trait::async_trait;
use std::collections::HashSet;

use super::standard::standard_search;
use super::{LlmOptions, RetrievalStrategy, StrategyContext, StrategyInput};

/// Multi-query retrieval strategy
pub struct MultiQueryStrategy;

const MULTI_QUERY_PROMPT_TEMPLATE: &str = r#"You are an AI assistant helping with document retrieval.

Your task is to generate {n} alternative versions of the following search query. Each version should capture a different aspect or phrasing of the original intent.

Original query: {query}

Generate {n} alternative queries, one per line. Do not number them or add any prefixes.
"#;

#[async_trait]
impl RetrievalStrategy for MultiQueryStrategy {
    async fn retrieve(
        &self,
        ctx: &StrategyContext<'_>,
        input: StrategyInput,
    ) -> Result<Vec<RetrievalResult>> {
        let llm = ctx.llm_provider.ok_or_else(|| {
            crate::Error::Config("Multi-query strategy requires an LLM provider".to_string())
        })?;

        // Get options
        let num_variations = input.options.num_query_variations.unwrap_or(3).clamp(1, 5);

        // Generate query variations
        let prompt = MULTI_QUERY_PROMPT_TEMPLATE
            .replace("{n}", &num_variations.to_string())
            .replace("{query}", &input.query);

        let response = llm
            .complete(
                &prompt,
                LlmOptions {
                    temperature: 0.7,
                    max_tokens: 300,
                },
            )
            .await?;

        // Parse variations (one per line)
        let mut queries: Vec<String> = vec![input.query.clone()]; // Always include original
        for line in response.lines() {
            let line = line.trim();
            if !line.is_empty() && line.len() > 3 {
                // Skip empty or very short lines
                // Remove common prefixes like "1.", "-", "*"
                let cleaned = line
                    .trim_start_matches(|c: char| c.is_numeric() || c == '.' || c == '-' || c == '*')
                    .trim();
                if !cleaned.is_empty() {
                    queries.push(cleaned.to_string());
                }
            }
        }

        // Limit to prevent excessive API calls
        queries.truncate(num_variations as usize + 1);

        // Embed all queries
        let embeddings = ctx.embedding_provider.embed(&queries).await?;

        // Search with each embedding and collect results
        let mut all_results: Vec<RetrievalResult> = Vec::new();
        let mut seen_ids: HashSet<uuid::Uuid> = HashSet::new();

        for embedding in embeddings {
            let results = standard_search(
                ctx.pool,
                ctx.project_id,
                &input.collection,
                embedding,
                input.top_k,
                input.filter.clone(),
            )
            .await?;

            for result in results {
                if seen_ids.insert(result.id) {
                    all_results.push(result);
                }
            }
        }

        // Sort by score and take top_k
        all_results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        all_results.truncate(input.top_k as usize);

        // Apply reranking if available
        if let Some(reranker) = ctx.reranker {
            if !all_results.is_empty() {
                let documents: Vec<String> =
                    all_results.iter().map(|r| r.content.clone()).collect();
                let reranked = reranker.rerank(&input.query, documents, None).await?;

                let mut reranked_results: Vec<RetrievalResult> = reranked
                    .into_iter()
                    .map(|r| {
                        let mut result = all_results[r.index].clone();
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

        Ok(all_results)
    }

    fn name(&self) -> &'static str {
        "multi_query"
    }

    fn requires_llm(&self) -> bool {
        true
    }
}
