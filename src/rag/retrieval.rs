use crate::db::DbPool;
use crate::vector;
use crate::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{EmbeddingProvider, EmbeddingService};

#[derive(Debug, Clone, Deserialize)]
pub struct RetrievalQuery {
    pub collection: String,
    pub query: String,
    pub top_k: Option<i32>,
    pub filter: Option<serde_json::Value>,
    pub rerank: Option<bool>,
    pub include_content: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MultiCollectionQuery {
    pub collections: Vec<String>,
    pub query: String,
    pub top_k: Option<i32>,
    pub filter: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RetrievalResult {
    pub id: uuid::Uuid,
    pub document_id: uuid::Uuid,
    pub content: String,
    pub score: f64,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MultiCollectionResult {
    pub id: uuid::Uuid,
    pub document_id: uuid::Uuid,
    pub collection_name: String,
    pub content: String,
    pub score: f64,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MultiCollectionResponse {
    pub results: Vec<MultiCollectionResult>,
    pub collections_searched: Vec<String>,
    pub total_results: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContextQuery {
    pub collection: String,
    pub query: String,
    pub top_k: Option<i32>,
    pub max_tokens: Option<usize>,
    pub format: Option<ContextFormat>,
}

#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ContextFormat {
    #[default]
    Plain,
    Markdown,
    Numbered,
    Xml,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContextResult {
    pub context: String,
    pub sources: Vec<ContextSource>,
    pub token_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContextSource {
    pub document_id: uuid::Uuid,
    pub chunk_id: uuid::Uuid,
    pub score: f64,
}

pub async fn retrieve(
    pool: &DbPool,
    embedding_service: &EmbeddingService,
    query: RetrievalQuery,
    project_id: Option<Uuid>,
) -> Result<Vec<RetrievalResult>> {
    // Verify collection exists in this project
    let _collection = vector::get_collection(pool, &query.collection, project_id).await?;

    // Generate embedding for the query
    let query_embedding = embedding_service.embed_single(&query.query).await?;

    // Search vectors
    let search_query = vector::SearchQuery {
        embedding: query_embedding,
        top_k: query.top_k,
        filter: query.filter,
        include_metadata: Some(true),
    };

    let pid = project_id.ok_or_else(|| crate::Error::BadRequest("Project ID required".to_string()))?;
    let results = vector::search_with_content(pool, pid, &query.collection, search_query).await?;

    Ok(results
        .into_iter()
        .map(|r| RetrievalResult {
            id: r.id,
            document_id: r.document_id,
            content: r.content,
            score: r.score,
            metadata: r.metadata,
        })
        .collect())
}

/// Retrieve with a dynamic embedding provider (for project-specific providers)
pub async fn retrieve_with_provider(
    pool: &DbPool,
    embedding_provider: &dyn EmbeddingProvider,
    query: RetrievalQuery,
    project_id: Option<Uuid>,
) -> Result<Vec<RetrievalResult>> {
    // Verify collection exists in this project
    let _collection = vector::get_collection(pool, &query.collection, project_id).await?;

    // Generate embedding for the query using the dynamic provider
    let embeddings = embedding_provider.embed(&[query.query.clone()]).await?;
    let query_embedding = embeddings.into_iter().next()
        .ok_or_else(|| crate::Error::Embedding("No embedding returned".to_string()))?;

    // Search vectors
    let search_query = vector::SearchQuery {
        embedding: query_embedding,
        top_k: query.top_k,
        filter: query.filter,
        include_metadata: Some(true),
    };

    let pid = project_id.ok_or_else(|| crate::Error::BadRequest("Project ID required".to_string()))?;
    let results = vector::search_with_content(pool, pid, &query.collection, search_query).await?;

    Ok(results
        .into_iter()
        .map(|r| RetrievalResult {
            id: r.id,
            document_id: r.document_id,
            content: r.content,
            score: r.score,
            metadata: r.metadata,
        })
        .collect())
}

pub async fn retrieve_with_context(
    pool: &DbPool,
    embedding_service: &EmbeddingService,
    query: ContextQuery,
    project_id: Option<Uuid>,
) -> Result<ContextResult> {
    let retrieval_query = RetrievalQuery {
        collection: query.collection,
        query: query.query,
        top_k: query.top_k,
        filter: None,
        rerank: None,
        include_content: Some(true),
    };

    let results = retrieve(pool, embedding_service, retrieval_query, project_id).await?;

    let max_tokens = query.max_tokens.unwrap_or(4000);
    let format = query.format.unwrap_or_default();

    let (context, sources, token_count) = format_context(&results, format, max_tokens);

    Ok(ContextResult {
        context,
        sources,
        token_count,
    })
}

pub async fn retrieve_multi_collection(
    pool: &DbPool,
    embedding_service: &EmbeddingService,
    query: MultiCollectionQuery,
    project_id: Option<Uuid>,
) -> Result<MultiCollectionResponse> {
    // Generate embedding for the query once
    let query_embedding = embedding_service.embed_single(&query.query).await?;

    // Per-collection top_k (get more from each, then combine and limit)
    let per_collection_k = query.top_k.unwrap_or(10);
    let total_top_k = query.top_k.unwrap_or(10) as usize;

    let mut all_results: Vec<MultiCollectionResult> = Vec::new();
    let mut collections_searched: Vec<String> = Vec::new();

    for collection_name in &query.collections {
        // Verify collection exists in this project
        match vector::get_collection(pool, collection_name, project_id).await {
            Ok(_) => {
                collections_searched.push(collection_name.clone());

                // Search vectors in this collection
                let search_query = vector::SearchQuery {
                    embedding: query_embedding.clone(),
                    top_k: Some(per_collection_k),
                    filter: query.filter.clone(),
                    include_metadata: Some(true),
                };

                let pid = project_id.ok_or_else(|| crate::Error::BadRequest("Project ID required".to_string()))?;
                if let Ok(results) = vector::search_with_content(pool, pid, collection_name, search_query).await {
                    for r in results {
                        all_results.push(MultiCollectionResult {
                            id: r.id,
                            document_id: r.document_id,
                            collection_name: collection_name.clone(),
                            content: r.content,
                            score: r.score,
                            metadata: r.metadata,
                        });
                    }
                }
            }
            Err(_) => {
                // Skip collections that don't exist or aren't accessible
                continue;
            }
        }
    }

    // Sort all results by score (descending)
    all_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    // Limit to top_k total results
    all_results.truncate(total_top_k);

    let total_results = all_results.len();

    Ok(MultiCollectionResponse {
        results: all_results,
        collections_searched,
        total_results,
    })
}

fn format_context(
    results: &[RetrievalResult],
    format: ContextFormat,
    max_tokens: usize,
) -> (String, Vec<ContextSource>, usize) {
    let mut context = String::new();
    let mut sources = Vec::new();
    let mut token_count = 0;

    for (i, result) in results.iter().enumerate() {
        let chunk_text = match format {
            ContextFormat::Plain => result.content.clone(),
            ContextFormat::Markdown => format!("---\n{}\n", result.content),
            ContextFormat::Numbered => format!("[{}] {}\n", i + 1, result.content),
            ContextFormat::Xml => format!(
                "<source id=\"{}\">\n{}\n</source>\n",
                result.id, result.content
            ),
        };

        let chunk_tokens = chunk_text.len() / 4; // Approximate token count

        if token_count + chunk_tokens > max_tokens {
            break;
        }

        context.push_str(&chunk_text);
        if !matches!(format, ContextFormat::Markdown | ContextFormat::Xml) {
            context.push('\n');
        }

        sources.push(ContextSource {
            document_id: result.document_id,
            chunk_id: result.id,
            score: result.score,
        });

        token_count += chunk_tokens;
    }

    (context.trim().to_string(), sources, token_count)
}

// ─────────────────────────────────────────
// Provider-based functions for project-specific embedding
// ─────────────────────────────────────────

/// Retrieve context with a dynamic embedding provider
pub async fn retrieve_with_context_provider(
    pool: &DbPool,
    embedding_provider: &dyn EmbeddingProvider,
    query: ContextQuery,
    project_id: Option<Uuid>,
) -> Result<ContextResult> {
    let retrieval_query = RetrievalQuery {
        collection: query.collection,
        query: query.query,
        top_k: query.top_k,
        filter: None,
        rerank: None,
        include_content: Some(true),
    };

    let results = retrieve_with_provider(pool, embedding_provider, retrieval_query, project_id).await?;

    let max_tokens = query.max_tokens.unwrap_or(4000);
    let format = query.format.unwrap_or_default();

    let (context, sources, token_count) = format_context(&results, format, max_tokens);

    Ok(ContextResult {
        context,
        sources,
        token_count,
    })
}

/// Search across multiple collections with a dynamic embedding provider
pub async fn retrieve_multi_collection_with_provider(
    pool: &DbPool,
    embedding_provider: &dyn EmbeddingProvider,
    query: MultiCollectionQuery,
    project_id: Option<Uuid>,
) -> Result<MultiCollectionResponse> {
    // Generate embedding for the query once
    let embeddings = embedding_provider.embed(&[query.query.clone()]).await?;
    let query_embedding = embeddings.into_iter().next()
        .ok_or_else(|| crate::Error::Embedding("No embedding returned".to_string()))?;

    // Per-collection top_k (get more from each, then combine and limit)
    let per_collection_k = query.top_k.unwrap_or(10);
    let total_top_k = query.top_k.unwrap_or(10) as usize;

    let mut all_results: Vec<MultiCollectionResult> = Vec::new();
    let mut collections_searched: Vec<String> = Vec::new();

    for collection_name in &query.collections {
        // Verify collection exists in this project
        match vector::get_collection(pool, collection_name, project_id).await {
            Ok(_) => {
                collections_searched.push(collection_name.clone());

                // Search vectors in this collection
                let search_query = vector::SearchQuery {
                    embedding: query_embedding.clone(),
                    top_k: Some(per_collection_k),
                    filter: query.filter.clone(),
                    include_metadata: Some(true),
                };

                let pid = project_id.ok_or_else(|| crate::Error::BadRequest("Project ID required".to_string()))?;
                if let Ok(results) = vector::search_with_content(pool, pid, collection_name, search_query).await {
                    for r in results {
                        all_results.push(MultiCollectionResult {
                            id: r.id,
                            document_id: r.document_id,
                            collection_name: collection_name.clone(),
                            content: r.content,
                            score: r.score,
                            metadata: r.metadata,
                        });
                    }
                }
            }
            Err(_) => {
                // Skip collections that don't exist or aren't accessible
                continue;
            }
        }
    }

    // Sort all results by score (descending)
    all_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    // Limit to top_k total results
    all_results.truncate(total_top_k);

    let total_results = all_results.len();

    Ok(MultiCollectionResponse {
        results: all_results,
        collections_searched,
        total_results,
    })
}
