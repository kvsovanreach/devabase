use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{self, AuthContext};
use crate::db::models::{ApiKeyCreated, ApiKeyResponse, CreateApiKey};
use crate::server::AppState;
use crate::Result;

/// List API keys for the current project
pub async fn list_keys(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<Vec<ApiKeyResponse>>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let keys = auth::list_keys(&state.pool, project_id).await?;
    Ok(Json(keys))
}

/// Create a new API key for the current project
pub async fn create_key(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<CreateApiKey>,
) -> Result<(StatusCode, Json<ApiKeyCreated>)> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    let key = auth::create_key(
        &state.pool,
        project_id,
        input,
        &state.config.auth.api_key_prefix,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(key)))
}

/// Get a specific API key
pub async fn get_key(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiKeyResponse>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let key = auth::get_key(&state.pool, project_id, id).await?;
    Ok(Json(key))
}

/// Delete an API key
pub async fn delete_key(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    auth::delete_key(&state.pool, project_id, id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
