//! Advanced Retrieval Strategies
//!
//! This module provides various retrieval strategies to improve RAG quality:
//! - **Standard**: Basic vector similarity search
//! - **ParentChild**: Retrieve small chunks, return larger parent context
//! - **HyDE**: Generate hypothetical answer, embed that, then search
//! - **MultiQuery**: Expand query into variations, search all, merge results
//! - **SelfQuery**: Extract structured filters from natural language
//! - **Compression**: Compress retrieved chunks to relevant parts only

mod compression;
mod hyde;
mod llm;
mod multi_query;
mod parent_child;
mod self_query;
mod standard;

pub use compression::CompressionStrategy;
pub use hyde::HydeStrategy;
pub use llm::{LlmOptions, LlmProvider, ProjectLlmProvider};
pub use multi_query::MultiQueryStrategy;
pub use parent_child::ParentChildStrategy;
pub use self_query::{FilterFieldSchema, SelfQueryStrategy};
pub use standard::StandardStrategy;

use crate::db::DbPool;
use crate::rag::{EmbeddingProvider, Reranker, RetrievalResult};
use crate::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================================
// Strategy Types
// ============================================================================

/// Available retrieval strategy types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetrievalStrategyType {
    /// Standard vector similarity search
    #[default]
    Standard,
    /// Retrieve small chunks, return larger parent chunks for context
    ParentChild,
    /// Hypothetical Document Embeddings - generate answer, embed that, search
    Hyde,
    /// Expand query into multiple variations, search all
    MultiQuery,
    /// Extract structured filters from natural language query
    SelfQuery,
    /// Compress results to only relevant portions
    Compression,
}

impl RetrievalStrategyType {
    /// Check if this strategy requires an LLM
    pub fn requires_llm(&self) -> bool {
        matches!(
            self,
            Self::Hyde | Self::MultiQuery | Self::SelfQuery | Self::Compression
        )
    }
}

impl std::fmt::Display for RetrievalStrategyType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Standard => write!(f, "standard"),
            Self::ParentChild => write!(f, "parent_child"),
            Self::Hyde => write!(f, "hyde"),
            Self::MultiQuery => write!(f, "multi_query"),
            Self::SelfQuery => write!(f, "self_query"),
            Self::Compression => write!(f, "compression"),
        }
    }
}

// ============================================================================
// Strategy Options
// ============================================================================

/// Options for configuring retrieval strategies
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StrategyOptions {
    // Parent-child options
    /// How many levels up to fetch parent chunks (default: 1)
    pub parent_depth: Option<i32>,

    // HyDE options
    /// Temperature for hypothetical generation (default: 0.7)
    pub hyde_temperature: Option<f32>,
    /// Number of hypothetical documents to generate (default: 1)
    pub hyde_num_hypotheticals: Option<i32>,

    // Multi-query options
    /// Number of query variations to generate (default: 3)
    pub num_query_variations: Option<i32>,

    // Self-query options
    /// Fields that can be extracted as filters
    pub extractable_fields: Option<Vec<FilterFieldSchema>>,

    // Compression options
    /// Maximum length of compressed content (default: 500)
    pub max_compressed_length: Option<usize>,
}

// ============================================================================
// Strategy Context
// ============================================================================

/// Context passed to strategy execution
pub struct StrategyContext<'a> {
    /// Database connection pool
    pub pool: &'a DbPool,
    /// Embedding provider for generating query embeddings
    pub embedding_provider: &'a dyn EmbeddingProvider,
    /// LLM provider for strategies that need text generation
    pub llm_provider: Option<&'a dyn LlmProvider>,
    /// Reranker for post-retrieval reranking
    pub reranker: Option<&'a dyn Reranker>,
    /// Project ID for scoping queries
    pub project_id: Uuid,
}

// ============================================================================
// Strategy Input
// ============================================================================

/// Input to a retrieval strategy
#[derive(Debug, Clone)]
pub struct StrategyInput {
    /// Collection to search in
    pub collection: String,
    /// User's query text
    pub query: String,
    /// Number of results to return
    pub top_k: i32,
    /// Optional metadata filter
    pub filter: Option<serde_json::Value>,
    /// Strategy-specific options
    pub options: StrategyOptions,
}

// ============================================================================
// Strategy Trait
// ============================================================================

/// The core trait that all retrieval strategies implement
#[async_trait]
pub trait RetrievalStrategy: Send + Sync {
    /// Execute the retrieval strategy
    async fn retrieve(
        &self,
        ctx: &StrategyContext<'_>,
        input: StrategyInput,
    ) -> Result<Vec<RetrievalResult>>;

    /// Strategy name for logging/debugging
    fn name(&self) -> &'static str;

    /// Whether this strategy requires an LLM provider
    fn requires_llm(&self) -> bool {
        false
    }
}

// ============================================================================
// Strategy Factory
// ============================================================================

/// Create a strategy instance from a strategy type
pub fn create_strategy(strategy_type: RetrievalStrategyType) -> Box<dyn RetrievalStrategy> {
    match strategy_type {
        RetrievalStrategyType::Standard => Box::new(StandardStrategy),
        RetrievalStrategyType::ParentChild => Box::new(ParentChildStrategy),
        RetrievalStrategyType::Hyde => Box::new(HydeStrategy),
        RetrievalStrategyType::MultiQuery => Box::new(MultiQueryStrategy),
        RetrievalStrategyType::SelfQuery => Box::new(SelfQueryStrategy),
        RetrievalStrategyType::Compression => Box::new(CompressionStrategy),
    }
}

/// Execute a retrieval with the specified strategy
pub async fn execute_strategy(
    ctx: &StrategyContext<'_>,
    input: StrategyInput,
    strategy_type: RetrievalStrategyType,
) -> Result<Vec<RetrievalResult>> {
    let strategy = create_strategy(strategy_type);

    // Validate LLM requirement
    if strategy.requires_llm() && ctx.llm_provider.is_none() {
        return Err(crate::Error::Config(format!(
            "Strategy '{}' requires an LLM provider, but none is configured",
            strategy.name()
        )));
    }

    strategy.retrieve(ctx, input).await
}

/// Execute a pipeline of strategies (for composition)
///
/// Pipeline composition rules:
/// - Pre-retrieval strategies (HyDE, MultiQuery, SelfQuery) modify the query/search
/// - Post-retrieval strategies (ParentChild, Compression) modify results
/// - Standard is the base retrieval
///
/// Order: Pre-retrieval -> Standard retrieval -> Post-retrieval
pub async fn execute_pipeline(
    ctx: &StrategyContext<'_>,
    input: StrategyInput,
    strategies: &[RetrievalStrategyType],
) -> Result<Vec<RetrievalResult>> {
    if strategies.is_empty() {
        return execute_strategy(ctx, input, RetrievalStrategyType::Standard).await;
    }

    if strategies.len() == 1 {
        return execute_strategy(ctx, input, strategies[0]).await;
    }

    // Categorize strategies
    let mut pre_retrieval: Vec<RetrievalStrategyType> = Vec::new();
    let mut post_retrieval: Vec<RetrievalStrategyType> = Vec::new();

    for &strategy in strategies {
        match strategy {
            // Pre-retrieval: modify query before searching
            RetrievalStrategyType::Hyde
            | RetrievalStrategyType::MultiQuery
            | RetrievalStrategyType::SelfQuery => {
                pre_retrieval.push(strategy);
            }
            // Post-retrieval: modify results after searching
            RetrievalStrategyType::ParentChild | RetrievalStrategyType::Compression => {
                post_retrieval.push(strategy);
            }
            // Standard is our base retrieval
            RetrievalStrategyType::Standard => {}
        }
    }

    // Execute pipeline: use the first pre-retrieval strategy if any, otherwise standard
    let retrieval_strategy = pre_retrieval.first().copied().unwrap_or(RetrievalStrategyType::Standard);
    let mut results = execute_strategy(ctx, input.clone(), retrieval_strategy).await?;

    // Apply post-retrieval strategies in order
    for strategy_type in post_retrieval {
        let strategy = create_strategy(strategy_type);

        // For post-retrieval, we pass results through each strategy
        // ParentChild expands to parent chunks, Compression reduces content
        match strategy_type {
            RetrievalStrategyType::ParentChild => {
                // Re-retrieve with parent-child to expand context
                results = strategy.retrieve(ctx, input.clone()).await?;
            }
            RetrievalStrategyType::Compression => {
                // Compress the existing results
                if ctx.llm_provider.is_some() {
                    // Create a modified input with the results to compress
                    let compress_input = StrategyInput {
                        collection: input.collection.clone(),
                        query: input.query.clone(),
                        top_k: results.len() as i32,
                        filter: input.filter.clone(),
                        options: input.options.clone(),
                    };
                    results = strategy.retrieve(ctx, compress_input).await?;
                }
            }
            _ => {}
        }
    }

    Ok(results)
}
