use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::db::models::{Chunk, ChunkResponse, Document, DocumentResponse, Project};
use crate::rag::{Chunker, EmbeddingProvider, get_project_embedding_provider};
use crate::server::AppState;
use crate::vector;
use crate::{Error, Result};

// ─────────────────────────────────────────
// New Collection-Scoped Document Endpoints
// ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CollectionDocumentsQuery {
    pub status: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 { 100 }

/// GET /collections/:name/documents - List documents in a collection
pub async fn collection_documents(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    Query(query): Query<CollectionDocumentsQuery>,
) -> Result<Json<Vec<DocumentResponse>>> {
    let project_id = auth.require_project()?;

    // Get collection
    let collection = vector::get_collection(&state.pool, &collection_name, Some(project_id)).await?;

    let documents: Vec<Document> = if let Some(status) = &query.status {
        sqlx::query_as(
            r#"
            SELECT * FROM sys_documents
            WHERE collection_id = $1 AND status = $2
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(collection.id)
        .bind(status)
        .bind(query.limit)
        .bind(query.offset)
        .fetch_all(state.pool.inner())
        .await?
    } else {
        sqlx::query_as(
            r#"
            SELECT * FROM sys_documents
            WHERE collection_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(collection.id)
        .bind(query.limit)
        .bind(query.offset)
        .fetch_all(state.pool.inner())
        .await?
    };

    Ok(Json(documents.into_iter().map(Into::into).collect()))
}

/// POST /collections/:name/documents - Upload document to a specific collection
pub async fn collection_upload(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    multipart: Multipart,
) -> Result<Json<DocumentResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get collection
    let collection = vector::get_collection(&state.pool, &collection_name, Some(project_id)).await?;

    // Use the internal upload function with the collection
    upload_document_to_collection(&state, auth, collection, multipart).await
}

// ─────────────────────────────────────────
// Legacy Document Endpoints
// ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ListDocumentsQuery {
    pub collection: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_documents(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<ListDocumentsQuery>,
) -> Result<Json<Vec<DocumentResponse>>> {
    let project_id = auth.require_project()?;

    let limit = query.limit.unwrap_or(100);
    let offset = query.offset.unwrap_or(0);

    let documents: Vec<Document> = if let Some(collection_name) = &query.collection {
        let collection = vector::get_collection(&state.pool, collection_name, Some(project_id)).await?;
        sqlx::query_as(
            r#"
            SELECT * FROM sys_documents
            WHERE collection_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(collection.id)
        .bind(limit)
        .bind(offset)
        .fetch_all(state.pool.inner())
        .await?
    } else {
        // List all documents from collections in this project
        sqlx::query_as(
            r#"
            SELECT d.* FROM sys_documents d
            JOIN sys_collections c ON d.collection_id = c.id
            WHERE c.project_id = $1
            ORDER BY d.created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(project_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(state.pool.inner())
        .await?
    };

    Ok(Json(documents.into_iter().map(DocumentResponse::from).collect()))
}

/// Legacy upload endpoint - requires collection name in multipart form
pub async fn upload_document(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    mut multipart: Multipart,
) -> Result<Json<DocumentResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let mut collection_name: Option<String> = None;
    let mut filename: Option<String> = None;
    let mut document_name: Option<String> = None;
    let mut content: Option<Vec<u8>> = None;
    let mut metadata: Option<serde_json::Value> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        Error::BadRequest(format!("Failed to read multipart field: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "collection" => {
                collection_name = Some(field.text().await.map_err(|e| {
                    Error::BadRequest(format!("Failed to read collection field: {}", e))
                })?);
            }
            "name" => {
                document_name = Some(field.text().await.map_err(|e| {
                    Error::BadRequest(format!("Failed to read name field: {}", e))
                })?);
            }
            "file" => {
                filename = field.file_name().map(|s| s.to_string());
                content = Some(field.bytes().await.map_err(|e| {
                    Error::BadRequest(format!("Failed to read file content: {}", e))
                })?.to_vec());
            }
            "metadata" => {
                let text = field.text().await.map_err(|e| {
                    Error::BadRequest(format!("Failed to read metadata field: {}", e))
                })?;
                metadata = Some(serde_json::from_str(&text)?);
            }
            _ => {}
        }
    }

    let collection_name = collection_name
        .ok_or_else(|| Error::BadRequest("Collection name is required".to_string()))?;
    let filename = filename
        .ok_or_else(|| Error::BadRequest("File is required".to_string()))?;
    let content = content
        .ok_or_else(|| Error::BadRequest("File content is required".to_string()))?;

    // Use custom name if provided, otherwise use original filename
    let display_name = document_name.unwrap_or_else(|| filename.clone());

    // Get collection (project-scoped)
    let collection = vector::get_collection(&state.pool, &collection_name, Some(project_id)).await?;

    // Use internal upload function
    upload_document_internal(&state, collection, filename, display_name, content, metadata).await
}

/// Internal helper for uploading document to a collection
async fn upload_document_to_collection(
    state: &Arc<AppState>,
    _auth: AuthContext,
    collection: crate::db::models::Collection,
    mut multipart: Multipart,
) -> Result<Json<DocumentResponse>> {
    let mut filename: Option<String> = None;
    let mut document_name: Option<String> = None;
    let mut content: Option<Vec<u8>> = None;
    let mut metadata: Option<serde_json::Value> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        Error::BadRequest(format!("Failed to read multipart field: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "name" => {
                document_name = Some(field.text().await.map_err(|e| {
                    Error::BadRequest(format!("Failed to read name field: {}", e))
                })?);
            }
            "file" => {
                filename = field.file_name().map(|s| s.to_string());
                content = Some(field.bytes().await.map_err(|e| {
                    Error::BadRequest(format!("Failed to read file content: {}", e))
                })?.to_vec());
            }
            "metadata" => {
                let text = field.text().await.map_err(|e| {
                    Error::BadRequest(format!("Failed to read metadata field: {}", e))
                })?;
                metadata = Some(serde_json::from_str(&text)?);
            }
            _ => {}
        }
    }

    let filename = filename
        .ok_or_else(|| Error::BadRequest("File is required".to_string()))?;
    let content = content
        .ok_or_else(|| Error::BadRequest("File content is required".to_string()))?;

    let display_name = document_name.unwrap_or_else(|| filename.clone());

    upload_document_internal(state, collection, filename, display_name, content, metadata).await
}

/// Core upload logic shared by all upload endpoints
async fn upload_document_internal(
    state: &Arc<AppState>,
    collection: crate::db::models::Collection,
    filename: String,
    display_name: String,
    content: Vec<u8>,
    metadata: Option<serde_json::Value>,
) -> Result<Json<DocumentResponse>> {

    // Store file
    let stored = state.storage.store(&filename, content.clone().into()).await?;

    // Detect content type
    let content_type = mime_guess::from_path(&filename)
        .first_or_octet_stream()
        .to_string();

    // Create document record
    let doc_id = Uuid::new_v4();
    let _document: Document = sqlx::query_as(
        r#"
        INSERT INTO sys_documents (id, collection_id, filename, content_type, file_path, file_size, metadata, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
        "#,
    )
    .bind(doc_id)
    .bind(collection.id)
    .bind(&display_name)
    .bind(&content_type)
    .bind(&stored.file_path)
    .bind(content.len() as i64)
    .bind(&metadata)
    .fetch_one(state.pool.inner())
    .await?;

    // Process document asynchronously
    let doc_id_clone = doc_id;
    let state_clone = state.clone();
    tokio::spawn(async move {
        if let Err(e) = process_document(state_clone.clone(), doc_id_clone).await {
            // Update document with error status
            let _ = sqlx::query(
                "UPDATE sys_documents SET status = 'failed', error_message = $2 WHERE id = $1"
            )
            .bind(doc_id_clone)
            .bind(e.to_string())
            .execute(state_clone.pool.inner())
            .await;
        }
    });

    // Return document in pending/processing state - UI will poll for status
    let updated: Document = sqlx::query_as("SELECT * FROM sys_documents WHERE id = $1")
        .bind(doc_id)
        .fetch_one(state.pool.inner())
        .await?;

    Ok(Json(DocumentResponse::from(updated)))
}

async fn process_document(state: Arc<AppState>, doc_id: Uuid) -> Result<()> {
    // Update status to processing
    sqlx::query("UPDATE sys_documents SET status = 'processing' WHERE id = $1")
        .bind(doc_id)
        .execute(state.pool.inner())
        .await?;

    // Get document
    let document: Document = sqlx::query_as("SELECT * FROM sys_documents WHERE id = $1")
        .bind(doc_id)
        .fetch_one(state.pool.inner())
        .await?;

    // Get collection to check embedding model limits
    let collection = vector::get_collection_by_id(&state.pool, document.collection_id).await?;

    // Get project settings for embedding provider
    let project_id = collection.project_id.ok_or_else(|| Error::Internal("Collection missing project_id".to_string()))?;
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings = project.settings.unwrap_or_default();
    let embedding_provider = get_project_embedding_provider(&settings)?;

    // Extract max tokens from collection metadata (default to 128 - conservative for small models)
    // If collection doesn't have this metadata (created before this feature), use conservative default
    // The embed_with_retry function will handle any remaining token limit issues
    let max_tokens = collection.metadata
        .as_ref()
        .and_then(|m| m.get("embedding_max_tokens"))
        .and_then(|v| v.as_i64())
        .unwrap_or(128) as usize;

    // Calculate chunk size based on token limit
    // For multilingual text (CJK, Khmer, etc.), 1 char can be 1-2 tokens
    // Use 40% of max_tokens as char limit to be safe for all languages
    let target_chunk_size = (max_tokens as f64 * 0.4) as usize;
    let chunk_size = target_chunk_size.max(30).min(state.config.chunking.chunk_size);

    // Overlap is 10-20% of chunk size for context continuity
    let chunk_overlap = (chunk_size as f64 * 0.15) as usize;
    let chunk_overlap = chunk_overlap.max(10).min(state.config.chunking.chunk_overlap);

    tracing::info!(
        "Chunking document with max_tokens={}, chunk_size={}, overlap={}",
        max_tokens, chunk_size, chunk_overlap
    );

    // Read file content
    let file_path = document.file_path.as_ref()
        .ok_or_else(|| Error::Internal("Document has no file path".to_string()))?;
    let content = state.storage.retrieve(file_path).await?;

    // Extract text based on content type
    let text = extract_text(&document.content_type, &content)?;

    // Chunk the content with collection-specific size
    let chunk_config = crate::rag::ChunkConfig {
        strategy: crate::rag::ChunkStrategy::from(state.config.chunking.default_strategy.as_str()),
        chunk_size,
        chunk_overlap,
    };
    let chunker = Chunker::with_config(chunk_config);
    let chunks = chunker.chunk(&text);

    // Store chunks and create embeddings
    let mut chunk_ids = Vec::new();
    let mut chunk_texts = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_id = Uuid::new_v4();

        sqlx::query(
            r#"
            INSERT INTO sys_chunks (id, document_id, collection_id, content, chunk_index, start_offset, end_offset, token_count, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(chunk_id)
        .bind(doc_id)
        .bind(document.collection_id)
        .bind(&chunk.content)
        .bind(i as i32)
        .bind(chunk.start_offset as i32)
        .bind(chunk.end_offset as i32)
        .bind(crate::rag::count_tokens(&chunk.content) as i32)
        .bind(&chunk.metadata)
        .execute(state.pool.inner())
        .await?;

        chunk_ids.push(chunk_id);
        chunk_texts.push(chunk.content.clone());
    }

    // Generate embeddings one by one with retry logic for token limits
    // Pre-truncate text to max_tokens * 0.5 chars (for multilingual support)
    // CJK and other scripts can have 1-2 tokens per character
    let max_chars = (max_tokens as f64 * 0.5) as usize;
    let mut embeddings = Vec::new();
    for text in &chunk_texts {
        // Truncate to max chars if needed (safety net for long sentences/paragraphs)
        let truncated: String = if text.chars().count() > max_chars {
            tracing::warn!("Pre-truncating chunk from {} to {} chars", text.chars().count(), max_chars);
            text.chars().take(max_chars).collect()
        } else {
            text.clone()
        };
        let embedding = embed_with_retry_provider(embedding_provider.as_ref(), &truncated, 3).await?;
        embeddings.push(embedding);
    }

    // Store vectors (collection already fetched above)
    let vectors: Vec<vector::VectorUpsert> = chunk_ids
        .iter()
        .zip(embeddings.iter())
        .map(|(chunk_id, embedding)| vector::VectorUpsert {
            id: None,
            embedding: embedding.clone(),
            metadata: None,
            chunk_id: Some(*chunk_id),
        })
        .collect();

    let project_id = collection.project_id.ok_or_else(|| crate::Error::Internal("Collection missing project_id".to_string()))?;
    vector::upsert_vectors(&state.pool, project_id, &collection.name, vectors).await?;

    // Update document status
    sqlx::query(
        r#"
        UPDATE sys_documents
        SET status = 'processed', chunk_count = $2, processed_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(doc_id)
    .bind(chunks.len() as i32)
    .execute(state.pool.inner())
    .await?;

    // Update collection vector count
    vector::update_vector_count(&state.pool, document.collection_id, chunks.len() as i64).await?;

    Ok(())
}

/// Embed text with retry logic using dynamic embedding provider
async fn embed_with_retry_provider(provider: &dyn EmbeddingProvider, text: &str, max_retries: usize) -> Result<Vec<f32>> {
    let mut current_text = text.to_string();

    for attempt in 0..=max_retries {
        match provider.embed(&[current_text.clone()]).await {
            Ok(embeddings) => {
                if let Some(embedding) = embeddings.into_iter().next() {
                    return Ok(embedding);
                }
                return Err(Error::Embedding("No embedding returned".to_string()));
            }
            Err(e) => {
                let error_msg = e.to_string().to_lowercase();
                // Check if it's a token limit error
                if error_msg.contains("context length") ||
                   error_msg.contains("too many tokens") ||
                   error_msg.contains("maximum") && error_msg.contains("token") {
                    if attempt < max_retries {
                        // Reduce text size by half
                        let new_len = current_text.len() / 2;
                        if new_len < 10 {
                            return Err(Error::Embedding(
                                "Text too short to embed after truncation".to_string()
                            ));
                        }
                        // Truncate to new length, being careful with char boundaries
                        current_text = current_text.chars().take(new_len).collect();
                        tracing::warn!(
                            "Embedding token limit exceeded, retrying with {} chars (attempt {})",
                            current_text.len(),
                            attempt + 1
                        );
                        continue;
                    }
                }
                return Err(e);
            }
        }
    }

    Err(Error::Embedding("Failed to embed after max retries".to_string()))
}

pub async fn get_document(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<DocumentResponse>> {
    let project_id = auth.require_project()?;

    // Get document and verify it belongs to a collection in this project
    let document: Document = sqlx::query_as(
        r#"
        SELECT d.* FROM sys_documents d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.id = $1 AND c.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Document not found".to_string()))?;

    Ok(Json(DocumentResponse::from(document)))
}

pub async fn delete_document(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get document and verify it belongs to a collection in this project
    let document: Document = sqlx::query_as(
        r#"
        SELECT d.* FROM sys_documents d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.id = $1 AND c.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Document not found".to_string()))?;

    // Delete file if exists
    if let Some(file_path) = &document.file_path {
        let _ = state.storage.delete(file_path).await;
    }

    // Delete document (cascades to chunks and vectors)
    sqlx::query("DELETE FROM sys_documents WHERE id = $1")
        .bind(id)
        .execute(state.pool.inner())
        .await?;

    // Update collection vector count
    vector::update_vector_count(
        &state.pool,
        document.collection_id,
        -(document.chunk_count as i64),
    )
    .await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub async fn get_document_chunks(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<ChunkResponse>>> {
    let project_id = auth.require_project()?;

    // Verify document belongs to this project
    let _document: Document = sqlx::query_as(
        r#"
        SELECT d.* FROM sys_documents d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.id = $1 AND c.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Document not found".to_string()))?;

    let chunks: Vec<Chunk> = sqlx::query_as(
        "SELECT * FROM sys_chunks WHERE document_id = $1 ORDER BY chunk_index ASC",
    )
    .bind(id)
    .fetch_all(state.pool.inner())
    .await?;

    Ok(Json(chunks.into_iter().map(ChunkResponse::from).collect()))
}

pub async fn reprocess_document(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<DocumentResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get document and verify it belongs to this project
    let document: Document = sqlx::query_as(
        r#"
        SELECT d.* FROM sys_documents d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.id = $1 AND c.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Document not found".to_string()))?;

    // Get collection name
    let _collection = vector::get_collection_by_id(&state.pool, document.collection_id).await?;

    // Delete existing chunks and vectors
    sqlx::query("DELETE FROM sys_chunks WHERE document_id = $1")
        .bind(id)
        .execute(state.pool.inner())
        .await?;

    // Reset document status
    sqlx::query("UPDATE sys_documents SET status = 'pending', chunk_count = 0, error_message = NULL WHERE id = $1")
        .bind(id)
        .execute(state.pool.inner())
        .await?;

    // Reprocess asynchronously with error handling
    let doc_id_clone = id;
    let state_clone = state.clone();
    tokio::spawn(async move {
        if let Err(e) = process_document(state_clone.clone(), doc_id_clone).await {
            let _ = sqlx::query(
                "UPDATE sys_documents SET status = 'failed', error_message = $2 WHERE id = $1"
            )
            .bind(doc_id_clone)
            .bind(e.to_string())
            .execute(state_clone.pool.inner())
            .await;
        }
    });

    // Fetch document in pending state - UI will poll for status
    let updated: Document = sqlx::query_as("SELECT * FROM sys_documents WHERE id = $1")
        .bind(id)
        .fetch_one(state.pool.inner())
        .await?;

    Ok(Json(DocumentResponse::from(updated)))
}

/// Extract text from various file formats
fn extract_text(content_type: &str, content: &[u8]) -> Result<String> {
    match content_type {
        "application/pdf" => {
            // Extract text from PDF
            pdf_extract::extract_text_from_mem(content)
                .map_err(|e| Error::Internal(format!("Failed to extract PDF text: {}", e)))
        }
        "text/plain" | "text/markdown" | "text/csv" | "text/html" => {
            // Plain text formats
            Ok(String::from_utf8_lossy(content).to_string())
        }
        "application/json" => {
            // JSON - format nicely
            let value: serde_json::Value = serde_json::from_slice(content)?;
            Ok(serde_json::to_string_pretty(&value)?)
        }
        ct if ct.starts_with("text/") => {
            // Other text types
            Ok(String::from_utf8_lossy(content).to_string())
        }
        _ => {
            // Try as plain text for unknown types
            let text = String::from_utf8_lossy(content).to_string();
            if text.chars().filter(|c| !c.is_ascii_graphic() && !c.is_whitespace()).count() > text.len() / 10 {
                Err(Error::BadRequest(format!("Unsupported file type: {}. Only text-based files and PDFs are supported.", content_type)))
            } else {
                Ok(text)
            }
        }
    }
}
