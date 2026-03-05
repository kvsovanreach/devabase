use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::auth::AuthContext;
use crate::db::models::Project;
use crate::rag::{
    self, get_project_embedding_provider, get_project_reranker, ContextQuery, ContextResult,
    MultiCollectionQuery, MultiCollectionResponse, RetrievalQuery, RetrievalResult,
    // Strategies
    execute_strategy, ProjectLlmProvider, RetrievalStrategyType, StrategyContext, StrategyInput,
    StrategyOptions,
};
use crate::server::AppState;
use crate::{Error, Result};

// ─────────────────────────────────────────
// New Normalized Endpoints
// ─────────────────────────────────────────

/// Search request for collection-scoped and unified search
#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    /// The search query text
    pub query: String,
    /// Number of results to return (default: 10)
    #[serde(default = "default_top_k")]
    pub top_k: i32,
    /// Include full chunk content in results
    #[serde(default = "default_true")]
    pub include_content: bool,
    /// Include document metadata
    #[serde(default)]
    pub include_metadata: bool,
    /// Filter by metadata (e.g., {"type": "pdf", "year": {"$gte": 2020}})
    pub filter: Option<serde_json::Value>,
    /// For unified search: which collections to search
    pub collections: Option<Vec<String>>,
    /// Enable reranking of results (requires reranking provider configured)
    #[serde(default)]
    pub rerank: bool,
    /// Retrieval strategy to use (default: standard)
    #[serde(default)]
    pub strategy: RetrievalStrategyType,
    /// Strategy-specific options
    #[serde(default)]
    pub strategy_options: StrategyOptions,
}

fn default_top_k() -> i32 { 10 }
fn default_true() -> bool { true }

/// Search result with source information
#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub content: String,
    pub score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rerank_score: Option<f64>,
    pub document_id: String,
    pub document_name: Option<String>,
    pub collection: String,
    pub metadata: Option<serde_json::Value>,
}

/// Search response
#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total: usize,
    pub query: String,
}

/// POST /collections/:name/search - Semantic search within a collection
pub async fn collection_search(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>> {
    let project_id = auth.require_project()?;

    // Get project settings for embedding provider
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings = project.settings.unwrap_or_default();
    let embedding_provider = get_project_embedding_provider(&settings)?;

    // Get reranker if reranking is requested
    let reranker = if req.rerank {
        get_project_reranker(&settings).ok()
    } else {
        None
    };

    // Get LLM provider if strategy requires it
    let llm_provider = if req.strategy.requires_llm() {
        Some(ProjectLlmProvider::from_settings(&settings, None)?)
    } else {
        None
    };

    // Use strategy-based retrieval
    let strategy_input = StrategyInput {
        collection: collection_name.clone(),
        query: req.query.clone(),
        top_k: req.top_k,
        filter: req.filter,
        options: req.strategy_options,
    };

    let ctx = StrategyContext {
        pool: &state.pool,
        embedding_provider: embedding_provider.as_ref(),
        llm_provider: llm_provider.as_ref().map(|p| p as &dyn crate::rag::LlmProvider),
        reranker: reranker.as_deref(),
        project_id,
    };

    let results = execute_strategy(&ctx, strategy_input, req.strategy).await?;

    // Convert to search response
    let search_results: Vec<SearchResult> = results
        .into_iter()
        .map(|r| {
            // Extract document name from metadata if available
            let doc_name = r.metadata
                .as_ref()
                .and_then(|m| m.get("document_name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            SearchResult {
                id: r.id.to_string(),
                content: r.content,
                score: r.score,
                rerank_score: r.rerank_score,
                document_id: r.document_id.to_string(),
                document_name: doc_name,
                collection: collection_name.clone(),
                metadata: if req.include_metadata { r.metadata } else { None },
            }
        })
        .collect();

    let total = search_results.len();

    Ok(Json(SearchResponse {
        results: search_results,
        total,
        query: req.query,
    }))
}

/// POST /search - Unified search across multiple collections
pub async fn unified_search(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>> {
    let project_id = auth.require_project()?;

    let collections = req.collections.clone().unwrap_or_default();

    if collections.is_empty() {
        return Err(Error::BadRequest("At least one collection must be specified in 'collections' array".to_string()));
    }

    // Get project settings for embedding provider
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings = project.settings.unwrap_or_default();
    let embedding_provider = get_project_embedding_provider(&settings)?;

    // Get reranker if reranking is requested
    let reranker = if req.rerank {
        get_project_reranker(&settings).ok()
    } else {
        None
    };

    // Build multi-collection query
    let query = MultiCollectionQuery {
        collections,
        query: req.query.clone(),
        top_k: Some(req.top_k),
        filter: None,
    };

    let result = rag::retrieve_multi_collection_with_provider(&state.pool, embedding_provider.as_ref(), query, Some(project_id)).await?;

    // Convert to unified search response
    let mut search_results: Vec<SearchResult> = result.results
        .into_iter()
        .map(|r| {
            // Extract document name from metadata if available
            let doc_name = r.metadata
                .as_ref()
                .and_then(|m| m.get("document_name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            SearchResult {
                id: r.id.to_string(),
                content: r.content,
                score: r.score,
                rerank_score: None,
                document_id: r.document_id.to_string(),
                document_name: doc_name,
                collection: r.collection_name,
                metadata: if req.include_metadata { r.metadata } else { None },
            }
        })
        .collect();

    // Apply reranking if available
    if let Some(reranker) = reranker {
        if !search_results.is_empty() {
            let documents: Vec<String> = search_results.iter().map(|r| r.content.clone()).collect();
            let reranked = reranker.rerank(&req.query, documents, None).await?;

            let mut reranked_results: Vec<SearchResult> = reranked
                .into_iter()
                .map(|r| {
                    let mut result = search_results[r.index].clone();
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

            search_results = reranked_results;
        }
    }

    let total = search_results.len();

    Ok(Json(SearchResponse {
        results: search_results,
        total,
        query: req.query,
    }))
}

// ─────────────────────────────────────────
// Legacy Endpoints (Deprecated)
// ─────────────────────────────────────────

pub async fn retrieve(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(query): Json<RetrievalQuery>,
) -> Result<Json<Vec<RetrievalResult>>> {
    let project_id = auth.require_project()?;

    // Get project settings for embedding provider
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings = project.settings.unwrap_or_default();
    let embedding_provider = get_project_embedding_provider(&settings)?;

    let results = rag::retrieve_with_provider(&state.pool, embedding_provider.as_ref(), query, Some(project_id)).await?;
    Ok(Json(results))
}

pub async fn retrieve_with_context(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(query): Json<ContextQuery>,
) -> Result<Json<ContextResult>> {
    let project_id = auth.require_project()?;

    // Get project settings for embedding provider
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings = project.settings.unwrap_or_default();
    let embedding_provider = get_project_embedding_provider(&settings)?;

    let result = rag::retrieve_with_context_provider(&state.pool, embedding_provider.as_ref(), query, Some(project_id)).await?;
    Ok(Json(result))
}

/// Search across multiple collections at once
pub async fn retrieve_multi(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(query): Json<MultiCollectionQuery>,
) -> Result<Json<MultiCollectionResponse>> {
    let project_id = auth.require_project()?;

    if query.collections.is_empty() {
        return Err(Error::BadRequest("At least one collection must be specified".to_string()));
    }

    // Get project settings for embedding provider
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings = project.settings.unwrap_or_default();
    let embedding_provider = get_project_embedding_provider(&settings)?;

    let result = rag::retrieve_multi_collection_with_provider(&state.pool, embedding_provider.as_ref(), query, Some(project_id)).await?;
    Ok(Json(result))
}
