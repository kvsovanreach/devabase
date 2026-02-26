use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use std::sync::Arc;

use crate::server::AppState;
use crate::storage::StoredFile;
use crate::{Error, Result};

pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<StoredFile>> {
    let mut filename: Option<String> = None;
    let mut content: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        Error::BadRequest(format!("Failed to read multipart field: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();

        if name == "file" {
            filename = field.file_name().map(|s| s.to_string());
            content = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| Error::BadRequest(format!("Failed to read file: {}", e)))?
                    .to_vec(),
            );
        }
    }

    let filename = filename.ok_or_else(|| Error::BadRequest("File is required".to_string()))?;
    let content = content.ok_or_else(|| Error::BadRequest("File content is required".to_string()))?;

    let stored = state.storage.store(&filename, content.into()).await?;

    // Store metadata in database
    sqlx::query(
        r#"
        INSERT INTO sys_files (id, filename, content_type, file_path, file_size, checksum)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(stored.id)
    .bind(&stored.filename)
    .bind(&stored.content_type)
    .bind(&stored.file_path)
    .bind(stored.file_size)
    .bind(&stored.checksum)
    .execute(state.pool.inner())
    .await?;

    Ok(Json(stored))
}

pub async fn get_file(
    State(state): State<Arc<AppState>>,
    Path(path): Path<String>,
) -> Result<Response> {
    // Look up file in database
    let file: Option<(String, String)> = sqlx::query_as(
        "SELECT content_type, file_path FROM sys_files WHERE file_path = $1 OR id::text = $1",
    )
    .bind(&path)
    .fetch_optional(state.pool.inner())
    .await?;

    let (content_type, file_path) = file
        .ok_or_else(|| Error::NotFound("File not found".to_string()))?;

    // Read file content
    let content = state.storage.retrieve(&file_path).await?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, content.len())
        .body(Body::from(content))
        .map_err(|e| Error::Internal(format!("Failed to build response: {}", e)))
}

pub async fn delete_file(
    State(state): State<Arc<AppState>>,
    Path(path): Path<String>,
) -> Result<Json<serde_json::Value>> {
    // Look up file in database
    let file: Option<(String,)> = sqlx::query_as(
        "SELECT file_path FROM sys_files WHERE file_path = $1 OR id::text = $1",
    )
    .bind(&path)
    .fetch_optional(state.pool.inner())
    .await?;

    let (file_path,) = file
        .ok_or_else(|| Error::NotFound("File not found".to_string()))?;

    // Delete from storage
    state.storage.delete(&file_path).await?;

    // Delete from database
    sqlx::query("DELETE FROM sys_files WHERE file_path = $1")
        .bind(&file_path)
        .execute(state.pool.inner())
        .await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}
