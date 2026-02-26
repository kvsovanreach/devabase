use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;

use crate::auth::AuthContext;
use crate::db::models::{Collection, CollectionStats, CreateCollection, UpdateRagConfig};
use crate::server::AppState;
use crate::vector;
use crate::{Error, Result};

pub async fn list_collections(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<Vec<Collection>>> {
    // Require project context for multi-tenant isolation
    let project_id = auth.require_project()?;

    let collections = vector::list_collections(&state.pool, Some(project_id)).await?;
    Ok(Json(collections))
}

pub async fn create_collection(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<CreateCollection>,
) -> Result<Json<Collection>> {
    // Require project context and write access
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let collection = vector::create_collection(&state.pool, input, &state.config, Some(project_id)).await?;
    Ok(Json(collection))
}

pub async fn get_collection(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
) -> Result<Json<Collection>> {
    let project_id = auth.require_project()?;

    let collection = vector::get_collection(&state.pool, &name, Some(project_id)).await?;
    Ok(Json(collection))
}

pub async fn delete_collection(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    vector::delete_collection(&state.pool, &name, Some(project_id)).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub async fn get_collection_stats(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
) -> Result<Json<CollectionStats>> {
    let project_id = auth.require_project()?;

    let stats = vector::get_collection_stats(&state.pool, &name, Some(project_id)).await?;
    Ok(Json(stats))
}

/// Update collection metadata, RAG settings, etc.
/// PATCH /collections/:name
pub async fn update_collection(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
    Json(input): Json<serde_json::Value>,
) -> Result<Json<Collection>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get the existing collection
    let collection = vector::get_collection(&state.pool, &name, Some(project_id)).await?;

    // Check if RAG fields are being updated
    let has_rag_update = input.get("rag_enabled").is_some() || input.get("rag_config").is_some();

    if has_rag_update {
        // Handle RAG update
        let rag_enabled = input.get("rag_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(collection.rag_enabled);

        let rag_config = if let Some(config) = input.get("rag_config") {
            if config.is_null() {
                None
            } else {
                Some(config.clone())
            }
        } else {
            collection.rag_config.clone()
        };

        sqlx::query(
            "UPDATE sys_collections SET rag_enabled = $1, rag_config = $2, updated_at = NOW() WHERE id = $3"
        )
        .bind(rag_enabled)
        .bind(&rag_config)
        .bind(collection.id)
        .execute(state.pool.inner())
        .await?;

        // Fetch and return the updated collection
        let updated = vector::get_collection(&state.pool, &name, Some(project_id)).await?;
        return Ok(Json(updated));
    }

    // Build update query for other fields dynamically
    let mut updates = Vec::new();
    let mut param_idx = 1;

    if input.get("description").is_some() {
        param_idx += 1;
        updates.push(format!("description = ${}", param_idx));
    }
    if input.get("metadata").is_some() {
        param_idx += 1;
        updates.push(format!("metadata = ${}", param_idx));
    }

    if updates.is_empty() {
        // No fields to update, just return the collection
        return Ok(Json(collection));
    }

    let query = format!(
        "UPDATE sys_collections SET {}, updated_at = NOW() WHERE id = $1 RETURNING *",
        updates.join(", ")
    );

    let mut query_builder = sqlx::query_as::<_, Collection>(&query)
        .bind(collection.id);

    if let Some(description) = input.get("description").and_then(|v| v.as_str()) {
        query_builder = query_builder.bind(description);
    }
    if let Some(metadata) = input.get("metadata") {
        query_builder = query_builder.bind(metadata);
    }

    let updated: Collection = query_builder
        .fetch_one(state.pool.inner())
        .await?;

    Ok(Json(updated))
}

/// Update RAG configuration for a collection
pub async fn update_rag_config(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
    Json(input): Json<UpdateRagConfig>,
) -> Result<Json<Collection>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get the existing collection
    let collection = vector::get_collection(&state.pool, &name, Some(project_id)).await?;

    // Build the new RAG config
    let existing_config: serde_json::Value = collection.rag_config.clone().unwrap_or_default();
    let mut new_config = existing_config.as_object().cloned().unwrap_or_default();

    if let Some(enabled) = input.enabled {
        new_config.insert("enabled".to_string(), serde_json::json!(enabled));
    }
    if let Some(llm_provider_id) = &input.llm_provider_id {
        new_config.insert("llm_provider_id".to_string(), serde_json::json!(llm_provider_id));
    }
    if let Some(model) = &input.model {
        new_config.insert("model".to_string(), serde_json::json!(model));
    }
    if let Some(system_prompt) = &input.system_prompt {
        new_config.insert("system_prompt".to_string(), serde_json::json!(system_prompt));
    }
    if let Some(temperature) = input.temperature {
        new_config.insert("temperature".to_string(), serde_json::json!(temperature));
    }
    if let Some(max_tokens) = input.max_tokens {
        new_config.insert("max_tokens".to_string(), serde_json::json!(max_tokens));
    }
    if let Some(top_k) = input.top_k {
        new_config.insert("top_k".to_string(), serde_json::json!(top_k));
    }

    let rag_enabled = new_config.get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Update the collection
    sqlx::query(
        "UPDATE sys_collections SET rag_enabled = $1, rag_config = $2, updated_at = NOW() WHERE id = $3"
    )
    .bind(rag_enabled)
    .bind(serde_json::json!(new_config))
    .bind(collection.id)
    .execute(state.pool.inner())
    .await?;

    // Fetch and return the updated collection
    let updated = vector::get_collection(&state.pool, &name, Some(project_id)).await?;
    Ok(Json(updated))
}
