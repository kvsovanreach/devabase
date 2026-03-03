//! HyDE (Hypothetical Document Embeddings) Strategy
//!
//! Instead of embedding the query directly, this strategy:
//! 1. Uses an LLM to generate a hypothetical answer to the query
//! 2. Embeds the hypothetical answer
//! 3. Searches using that embedding
//!
//! This often retrieves more relevant results because the hypothetical
//! answer is more semantically similar to actual documents than the question.

use crate::rag::RetrievalResult;
use crate::Result;
use async_trait::async_trait;

use super::{LlmOptions, RetrievalStrategy, StrategyContext, StrategyInput};
use super::standard::standard_search;

/// HyDE retrieval strategy
pub struct HydeStrategy;

const HYDE_PROMPT_TEMPLATE: &str = r#"You are an AI assistant helping with document retrieval.

Given the following question, write a hypothetical passage that would directly answer this question. The passage should be informative and factual, as if it were extracted from a relevant document.

Question: {query}

Write a concise, informative passage (2-3 sentences) that answers this question:
"#;

#[async_trait]
impl RetrievalStrategy for HydeStrategy {
    async fn retrieve(
        &self,
        ctx: &StrategyContext<'_>,
        input: StrategyInput,
    ) -> Result<Vec<RetrievalResult>> {
        let llm = ctx.llm_provider.ok_or_else(|| {
            crate::Error::Config("HyDE strategy requires an LLM provider".to_string())
        })?;

        // Get options
        let temperature = input.options.hyde_temperature.unwrap_or(0.7);
        let num_hypotheticals = input.options.hyde_num_hypotheticals.unwrap_or(1).max(1);

        // Generate hypothetical document(s)
        let mut all_results: Vec<RetrievalResult> = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for _ in 0..num_hypotheticals {
            let prompt = HYDE_PROMPT_TEMPLATE.replace("{query}", &input.query);

            let hypothetical = llm
                .complete(
                    &prompt,
                    LlmOptions {
                        temperature,
                        max_tokens: 200,
                    },
                )
                .await?;

            // Embed the hypothetical document
            let embeddings = ctx.embedding_provider.embed(&[hypothetical]).await?;
            let embedding = embeddings
                .into_iter()
                .next()
                .ok_or_else(|| crate::Error::Embedding("No embedding returned".to_string()))?;

            // Search with the hypothetical embedding
            let results = standard_search(
                ctx.pool,
                ctx.project_id,
                &input.collection,
                embedding,
                input.top_k,
                input.filter.clone(),
            )
            .await?;

            // Merge results, avoiding duplicates
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
        "hyde"
    }

    fn requires_llm(&self) -> bool {
        true
    }
}
