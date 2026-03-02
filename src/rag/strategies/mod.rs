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

    // For multiple strategies, we need to be smart about composition:
    // - Pre-retrieval strategies (HyDE, MultiQuery, SelfQuery) modify how we search
    // - Post-retrieval strategies (ParentChild, Compression) modify results
    //
    // Current simple approach: just use the last strategy
    // TODO: Implement proper pipeline composition

    let last_strategy = strategies.last().unwrap();
    execute_strategy(ctx, input, *last_strategy).await
}
