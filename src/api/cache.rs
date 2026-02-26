use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;

use crate::cache::CacheStats;
use crate::server::AppState;
use crate::Result;

pub async fn get_stats(State(state): State<Arc<AppState>>) -> Result<Json<CacheStats>> {
    let stats = state.cache.stats().await?;
    Ok(Json(stats))
}

pub async fn clear_cache(State(state): State<Arc<AppState>>) -> Result<Json<serde_json::Value>> {
    let deleted = state.cache.clear().await?;
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

pub async fn delete_entry(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let deleted = state.cache.delete(&key).await?;
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}
