//! Self-Query Retrieval Strategy
//!
//! Extracts structured filters from natural language queries:
//! 1. Uses an LLM to parse the query and extract metadata filters
//! 2. Separates the semantic search query from filter criteria
//! 3. Applies extracted filters to the vector search
//!
//! Example: "Python docs from 2023" -> query: "Python docs", filter: {year: 2023}

use crate::rag::RetrievalResult;
use crate::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::standard::standard_search;
use super::{LlmOptions, RetrievalStrategy, StrategyContext, StrategyInput};

/// Self-query retrieval strategy
pub struct SelfQueryStrategy;

/// Schema definition for extractable filter fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterFieldSchema {
    /// Field name in metadata
    pub name: String,
    /// Description of what this field contains
    pub description: String,
    /// Field type: "string", "number", "boolean", "date"
    #[serde(rename = "type")]
    pub field_type: String,
    /// Example values (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<String>>,
}

const SELF_QUERY_PROMPT_TEMPLATE: &str = r#"You are an AI assistant that parses search queries to extract structured filters.

Given a user's search query, extract:
1. The semantic search query (what they're looking for)
2. Any metadata filters (specific constraints like dates, types, authors, etc.)

Available filter fields:
{schema}

User query: {query}

Respond with ONLY valid JSON in this exact format:
{
  "search_query": "the semantic search part",
  "filters": {
    "field_name": "value"
  }
}

If no filters can be extracted, use an empty filters object: {}
Only use filter fields that are in the available fields list above.
For numeric comparisons, use: {"field": {"$gt": 5}} or {"field": {"$lt": 10}}
For date comparisons, use the same format with year values.

JSON response:
"#;

#[derive(Debug, Deserialize)]
struct SelfQueryResponse {
    search_query: String,
    filters: serde_json::Value,
}

#[async_trait]
impl RetrievalStrategy for SelfQueryStrategy {
    async fn retrieve(
        &self,
        ctx: &StrategyContext<'_>,
        input: StrategyInput,
    ) -> Result<Vec<RetrievalResult>> {
        let llm = ctx.llm_provider.ok_or_else(|| {
            crate::Error::Config("Self-query strategy requires an LLM provider".to_string())
        })?;

        // Get extractable fields from options or use defaults
        let fields = input.options.extractable_fields.clone().unwrap_or_else(|| {
            vec![
                FilterFieldSchema {
                    name: "type".to_string(),
                    description: "Document type (e.g., pdf, doc, markdown)".to_string(),
                    field_type: "string".to_string(),
                    examples: Some(vec!["pdf".to_string(), "markdown".to_string()]),
                },
                FilterFieldSchema {
                    name: "author".to_string(),
                    description: "Document author name".to_string(),
                    field_type: "string".to_string(),
                    examples: None,
                },
                FilterFieldSchema {
                    name: "year".to_string(),
                    description: "Year the document was created or published".to_string(),
                    field_type: "number".to_string(),
                    examples: Some(vec!["2023".to_string(), "2024".to_string()]),
                },
                FilterFieldSchema {
                    name: "category".to_string(),
                    description: "Document category or topic".to_string(),
                    field_type: "string".to_string(),
                    examples: None,
                },
            ]
        });

        // Build schema description for the prompt
        let schema_description = fields
            .iter()
            .map(|f| {
                let examples = f
                    .examples
                    .as_ref()
                    .map(|e| format!(" (examples: {})", e.join(", ")))
                    .unwrap_or_default();
                format!(
                    "- {}: {} (type: {}){}",
                    f.name, f.description, f.field_type, examples
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = SELF_QUERY_PROMPT_TEMPLATE
            .replace("{schema}", &schema_description)
            .replace("{query}", &input.query);

        // Extract query and filters from LLM
        let response = llm
            .complete(
                &prompt,
                LlmOptions {
                    temperature: 0.0, // Low temperature for structured output
                    max_tokens: 300,
                },
            )
            .await?;

        // Parse the JSON response
        let parsed: SelfQueryResponse = serde_json::from_str(&response).map_err(|e| {
            tracing::warn!("Failed to parse self-query response: {}, raw: {}", e, response);
            // Fall back to using the original query with no filters
            crate::Error::Internal(format!("Failed to parse self-query response: {}", e))
        }).unwrap_or(SelfQueryResponse {
            search_query: input.query.clone(),
            filters: serde_json::Value::Object(serde_json::Map::new()),
        });

        // Use the cleaned search query
        let search_query = if parsed.search_query.is_empty() {
            input.query.clone()
        } else {
            parsed.search_query
        };

        // Merge extracted filters with any existing filters
        let merged_filter = merge_filters(input.filter.clone(), parsed.filters);

        // Embed the semantic query
        let embeddings = ctx.embedding_provider.embed(&[search_query.clone()]).await?;
        let embedding = embeddings
            .into_iter()
            .next()
            .ok_or_else(|| crate::Error::Embedding("No embedding returned".to_string()))?;

        // Search with merged filters
        let results = standard_search(
            ctx.pool,
            ctx.project_id,
            &input.collection,
            embedding,
            input.top_k,
            merged_filter,
        )
        .await?;

        // Apply reranking if available
        if let Some(reranker) = ctx.reranker {
            if !results.is_empty() {
                let documents: Vec<String> = results.iter().map(|r| r.content.clone()).collect();
                let reranked = reranker.rerank(&search_query, documents, None).await?;

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
        "self_query"
    }

    fn requires_llm(&self) -> bool {
        true
    }
}

/// Merge two filter objects, with extracted filters taking precedence
fn merge_filters(
    existing: Option<serde_json::Value>,
    extracted: serde_json::Value,
) -> Option<serde_json::Value> {
    match (existing, extracted) {
        (None, serde_json::Value::Object(map)) if map.is_empty() => None,
        (None, extracted) if extracted.is_object() => Some(extracted),
        (Some(existing), serde_json::Value::Object(map)) if map.is_empty() => Some(existing),
        (Some(serde_json::Value::Object(mut existing_map)), serde_json::Value::Object(extracted_map)) => {
            // Merge extracted into existing
            for (key, value) in extracted_map {
                existing_map.insert(key, value);
            }
            Some(serde_json::Value::Object(existing_map))
        }
        (Some(existing), _) => Some(existing),
        _ => None,
    }
}
