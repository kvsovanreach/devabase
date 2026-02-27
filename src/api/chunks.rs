use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::db::models::{Chunk, ChunkResponse, Collection, Project};
use crate::rag::{count_tokens, get_project_embedding_provider, EmbeddingProvider};
use crate::server::AppState;
use crate::vector;
use crate::{Error, Result};

// ─────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateChunkRequest {
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct SplitChunkRequest {
    pub split_at: usize, // Character position to split at
}

#[derive(Debug, Deserialize)]
pub struct MergeChunksRequest {
    pub chunk_ids: Vec<Uuid>,
    #[serde(default = "default_separator")]
    pub separator: String,
}

fn default_separator() -> String {
    "\n\n".to_string()
}

#[derive(Debug, Serialize)]
pub struct SplitChunkResponse {
    pub chunks: Vec<ChunkResponse>,
}

#[derive(Debug, Serialize)]
pub struct MergeChunkResponse {
    pub chunk: ChunkResponse,
    pub merged_count: usize,
}

// ─────────────────────────────────────────
// Chunk Endpoints
// ─────────────────────────────────────────

/// GET /chunks/:id - Get a single chunk by ID
pub async fn get_chunk(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<ChunkResponse>> {
    let project_id = auth.require_project()?;

    // Get chunk and verify it belongs to a collection in this project
    let chunk: Chunk = sqlx::query_as(
        r#"
        SELECT c.* FROM sys_chunks c
        JOIN sys_collections col ON c.collection_id = col.id
        WHERE c.id = $1 AND col.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Chunk not found".to_string()))?;

    Ok(Json(ChunkResponse::from(chunk)))
}

/// PUT /chunks/:id - Update chunk content and/or metadata
pub async fn update_chunk(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateChunkRequest>,
) -> Result<Json<ChunkResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get chunk and verify it belongs to this project
    let chunk: Chunk = sqlx::query_as(
        r#"
        SELECT c.* FROM sys_chunks c
        JOIN sys_collections col ON c.collection_id = col.id
        WHERE c.id = $1 AND col.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Chunk not found".to_string()))?;

    let content_changed = req.content.is_some();
    let new_content = req.content.unwrap_or_else(|| chunk.content.clone());
    let new_metadata = req.metadata.or(chunk.metadata.clone());
    let new_token_count = count_tokens(&new_content) as i32;

    // Update chunk
    let updated_chunk: Chunk = sqlx::query_as(
        r#"
        UPDATE sys_chunks
        SET content = $1, metadata = $2, token_count = $3
        WHERE id = $4
        RETURNING *
        "#,
    )
    .bind(&new_content)
    .bind(&new_metadata)
    .bind(new_token_count)
    .bind(id)
    .fetch_one(state.pool.inner())
    .await?;

    // If content changed, regenerate embedding
    if content_changed {
        regenerate_chunk_embedding(&state, project_id, id, &new_content).await?;
    }

    Ok(Json(ChunkResponse::from(updated_chunk)))
}

/// DELETE /chunks/:id - Delete chunk and its vector
pub async fn delete_chunk(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get chunk and verify it belongs to this project
    let chunk: Chunk = sqlx::query_as(
        r#"
        SELECT c.* FROM sys_chunks c
        JOIN sys_collections col ON c.collection_id = col.id
        WHERE c.id = $1 AND col.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Chunk not found".to_string()))?;

    // Delete vector first (foreign key constraint)
    sqlx::query("DELETE FROM sys_vectors WHERE chunk_id = $1")
        .bind(id)
        .execute(state.pool.inner())
        .await?;

    // Delete chunk
    sqlx::query("DELETE FROM sys_chunks WHERE id = $1")
        .bind(id)
        .execute(state.pool.inner())
        .await?;

    // Update document chunk count
    sqlx::query(
        "UPDATE sys_documents SET chunk_count = chunk_count - 1 WHERE id = $1"
    )
    .bind(chunk.document_id)
    .execute(state.pool.inner())
    .await?;

    // Update collection vector count
    vector::update_vector_count(&state.pool, chunk.collection_id, -1).await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

/// POST /chunks/:id/split - Split chunk into two at a given position
pub async fn split_chunk(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
    Json(req): Json<SplitChunkRequest>,
) -> Result<Json<SplitChunkResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get chunk and verify it belongs to this project
    let chunk: Chunk = sqlx::query_as(
        r#"
        SELECT c.* FROM sys_chunks c
        JOIN sys_collections col ON c.collection_id = col.id
        WHERE c.id = $1 AND col.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Chunk not found".to_string()))?;

    // Validate split position
    let char_count: usize = chunk.content.chars().count();
    if req.split_at == 0 || req.split_at >= char_count {
        return Err(Error::BadRequest(format!(
            "split_at must be between 1 and {} (exclusive)",
            char_count
        )));
    }

    // Split content at character position
    let content1: String = chunk.content.chars().take(req.split_at).collect();
    let content2: String = chunk.content.chars().skip(req.split_at).collect();

    // Update original chunk with first half
    let updated_chunk1: Chunk = sqlx::query_as(
        r#"
        UPDATE sys_chunks
        SET content = $1, token_count = $2, end_offset = $3
        WHERE id = $4
        RETURNING *
        "#,
    )
    .bind(&content1)
    .bind(count_tokens(&content1) as i32)
    .bind(chunk.start_offset + req.split_at as i32)
    .bind(id)
    .fetch_one(state.pool.inner())
    .await?;

    // Increment chunk_index for subsequent chunks
    sqlx::query(
        r#"
        UPDATE sys_chunks
        SET chunk_index = chunk_index + 1
        WHERE document_id = $1 AND chunk_index > $2
        "#,
    )
    .bind(chunk.document_id)
    .bind(chunk.chunk_index)
    .execute(state.pool.inner())
    .await?;

    // Create new chunk with second half
    let new_chunk_id = Uuid::new_v4();
    let new_chunk: Chunk = sqlx::query_as(
        r#"
        INSERT INTO sys_chunks (id, document_id, collection_id, content, chunk_index, start_offset, end_offset, token_count, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        "#,
    )
    .bind(new_chunk_id)
    .bind(chunk.document_id)
    .bind(chunk.collection_id)
    .bind(&content2)
    .bind(chunk.chunk_index + 1)
    .bind(chunk.start_offset + req.split_at as i32)
    .bind(chunk.end_offset)
    .bind(count_tokens(&content2) as i32)
    .bind(&chunk.metadata)
    .fetch_one(state.pool.inner())
    .await?;

    // Update document chunk count
    sqlx::query(
        "UPDATE sys_documents SET chunk_count = chunk_count + 1 WHERE id = $1"
    )
    .bind(chunk.document_id)
    .execute(state.pool.inner())
    .await?;

    // Regenerate embeddings for both chunks
    regenerate_chunk_embedding(&state, project_id, id, &content1).await?;
    create_chunk_embedding(&state, project_id, chunk.collection_id, new_chunk_id, &content2).await?;

    // Update collection vector count
    vector::update_vector_count(&state.pool, chunk.collection_id, 1).await?;

    Ok(Json(SplitChunkResponse {
        chunks: vec![
            ChunkResponse::from(updated_chunk1),
            ChunkResponse::from(new_chunk),
        ],
    }))
}

/// POST /chunks/merge - Merge multiple chunks into one
pub async fn merge_chunks(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<MergeChunksRequest>,
) -> Result<Json<MergeChunkResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    if req.chunk_ids.len() < 2 {
        return Err(Error::BadRequest(
            "At least 2 chunk IDs are required for merge".to_string(),
        ));
    }

    // Fetch all chunks and verify they belong to this project and same document
    let chunks: Vec<Chunk> = sqlx::query_as(
        r#"
        SELECT c.* FROM sys_chunks c
        JOIN sys_collections col ON c.collection_id = col.id
        WHERE c.id = ANY($1) AND col.project_id = $2
        ORDER BY c.chunk_index ASC
        "#,
    )
    .bind(&req.chunk_ids)
    .bind(project_id)
    .fetch_all(state.pool.inner())
    .await?;

    if chunks.len() != req.chunk_ids.len() {
        return Err(Error::NotFound(
            "One or more chunks not found or not accessible".to_string(),
        ));
    }

    // Verify all chunks belong to the same document
    let document_id = chunks[0].document_id;
    let collection_id = chunks[0].collection_id;
    for chunk in &chunks {
        if chunk.document_id != document_id {
            return Err(Error::BadRequest(
                "All chunks must belong to the same document".to_string(),
            ));
        }
    }

    // Merge content with separator
    let merged_content: String = chunks
        .iter()
        .map(|c| c.content.as_str())
        .collect::<Vec<_>>()
        .join(&req.separator);

    // Get the first chunk to keep
    let first_chunk = &chunks[0];
    let last_chunk = &chunks[chunks.len() - 1];

    // Update first chunk with merged content
    let updated_chunk: Chunk = sqlx::query_as(
        r#"
        UPDATE sys_chunks
        SET content = $1, token_count = $2, end_offset = $3
        WHERE id = $4
        RETURNING *
        "#,
    )
    .bind(&merged_content)
    .bind(count_tokens(&merged_content) as i32)
    .bind(last_chunk.end_offset)
    .bind(first_chunk.id)
    .fetch_one(state.pool.inner())
    .await?;

    // Get IDs of chunks to delete (all except first)
    let chunks_to_delete: Vec<Uuid> = chunks[1..].iter().map(|c| c.id).collect();
    let delete_count = chunks_to_delete.len();

    // Delete vectors for chunks being removed
    sqlx::query("DELETE FROM sys_vectors WHERE chunk_id = ANY($1)")
        .bind(&chunks_to_delete)
        .execute(state.pool.inner())
        .await?;

    // Delete the other chunks
    sqlx::query("DELETE FROM sys_chunks WHERE id = ANY($1)")
        .bind(&chunks_to_delete)
        .execute(state.pool.inner())
        .await?;

    // Reindex subsequent chunks
    // Calculate the gap in chunk_index (merged chunks - 1)
    let index_gap = delete_count as i32;
    let last_merged_index = chunks[chunks.len() - 1].chunk_index;

    sqlx::query(
        r#"
        UPDATE sys_chunks
        SET chunk_index = chunk_index - $1
        WHERE document_id = $2 AND chunk_index > $3
        "#,
    )
    .bind(index_gap)
    .bind(document_id)
    .bind(last_merged_index)
    .execute(state.pool.inner())
    .await?;

    // Update document chunk count
    sqlx::query(
        "UPDATE sys_documents SET chunk_count = chunk_count - $1 WHERE id = $2"
    )
    .bind(delete_count as i32)
    .bind(document_id)
    .execute(state.pool.inner())
    .await?;

    // Regenerate embedding for merged chunk
    regenerate_chunk_embedding(&state, project_id, first_chunk.id, &merged_content).await?;

    // Update collection vector count
    vector::update_vector_count(&state.pool, collection_id, -(delete_count as i64)).await?;

    Ok(Json(MergeChunkResponse {
        chunk: ChunkResponse::from(updated_chunk),
        merged_count: chunks.len(),
    }))
}

// ─────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────

/// Get embedding provider for a collection's project
async fn get_embedding_provider_for_collection(
    state: &Arc<AppState>,
    project_id: Uuid,
) -> Result<Box<dyn EmbeddingProvider>> {
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings = project.settings.unwrap_or_default();
    get_project_embedding_provider(&settings)
}

/// Regenerate embedding for an existing chunk
async fn regenerate_chunk_embedding(
    state: &Arc<AppState>,
    project_id: Uuid,
    chunk_id: Uuid,
    content: &str,
) -> Result<()> {
    let embedding_provider = get_embedding_provider_for_collection(state, project_id).await?;

    // Generate embedding
    let embeddings = embedding_provider
        .embed(&[content.to_string()])
        .await?;

    let embedding = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| Error::Embedding("No embedding returned".to_string()))?;

    // Update existing vector
    sqlx::query(
        "UPDATE sys_vectors SET embedding = $1 WHERE chunk_id = $2"
    )
    .bind(&embedding)
    .bind(chunk_id)
    .execute(state.pool.inner())
    .await?;

    Ok(())
}

/// Create embedding for a new chunk
async fn create_chunk_embedding(
    state: &Arc<AppState>,
    project_id: Uuid,
    collection_id: Uuid,
    chunk_id: Uuid,
    content: &str,
) -> Result<()> {
    let embedding_provider = get_embedding_provider_for_collection(state, project_id).await?;

    // Get collection
    let collection: Collection = sqlx::query_as("SELECT * FROM sys_collections WHERE id = $1")
        .bind(collection_id)
        .fetch_one(state.pool.inner())
        .await?;

    // Generate embedding
    let embeddings = embedding_provider
        .embed(&[content.to_string()])
        .await?;

    let embedding = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| Error::Embedding("No embedding returned".to_string()))?;

    // Insert new vector
    let vectors = vec![vector::VectorUpsert {
        id: None,
        embedding,
        metadata: None,
        chunk_id: Some(chunk_id),
    }];

    vector::upsert_vectors(&state.pool, project_id, &collection.name, vectors).await?;

    Ok(())
}
