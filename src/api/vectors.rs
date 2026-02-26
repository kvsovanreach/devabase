use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::server::AppState;
use crate::vector::{self, SearchQuery, VectorMatch, VectorUpsert};
use crate::{Error, Result};

// ─────────────────────────────────────────
// New Collection-Scoped Endpoints
// ─────────────────────────────────────────

/// Request for upserting vectors to a collection
#[derive(Debug, Deserialize)]
pub struct CollectionUpsertRequest {
    pub vectors: Vec<VectorUpsert>,
}

/// Request for searching vectors in a collection
#[derive(Debug, Deserialize)]
pub struct CollectionSearchRequest {
    /// The embedding vector to search with
    pub embedding: Vec<f32>,
    /// Number of results to return (default: 10)
    #[serde(default = "default_top_k")]
    pub top_k: i32,
    /// Include vector metadata in results
    #[serde(default)]
    pub include_metadata: bool,
    /// Filter by metadata
    pub filter: Option<serde_json::Value>,
}

fn default_top_k() -> i32 { 10 }

/// Response for vector operations
#[derive(Debug, Serialize)]
pub struct VectorOperationResponse {
    pub success: bool,
    pub count: usize,
}

/// POST /collections/:name/vectors - Upsert vectors to a collection
pub async fn collection_upsert(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    Json(request): Json<CollectionUpsertRequest>,
) -> Result<Json<VectorOperationResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Verify collection exists in this project
    let collection = vector::get_collection(&state.pool, &collection_name, Some(project_id)).await?;

    // Validate vector dimensions
    for v in &request.vectors {
        if v.embedding.len() != collection.dimensions as usize {
            return Err(Error::BadRequest(format!(
                "Vector dimension mismatch: expected {}, got {}",
                collection.dimensions,
                v.embedding.len()
            )));
        }
    }

    let count = vector::upsert_vectors(&state.pool, project_id, &collection_name, request.vectors).await?;
    vector::update_vector_count(&state.pool, collection.id, count as i64).await?;

    Ok(Json(VectorOperationResponse {
        success: true,
        count
    }))
}

/// POST /collections/:name/vectors/search - Search vectors in a collection
pub async fn collection_search(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    Json(request): Json<CollectionSearchRequest>,
) -> Result<Json<Vec<VectorMatch>>> {
    let project_id = auth.require_project()?;

    // Verify collection exists in this project
    let collection = vector::get_collection(&state.pool, &collection_name, Some(project_id)).await?;

    // Validate query vector dimensions
    if request.embedding.len() != collection.dimensions as usize {
        return Err(Error::BadRequest(format!(
            "Query vector dimension mismatch: expected {}, got {}",
            collection.dimensions,
            request.embedding.len()
        )));
    }

    let query = SearchQuery {
        embedding: request.embedding,
        top_k: Some(request.top_k),
        filter: request.filter,
        include_metadata: Some(request.include_metadata),
    };

    let results = vector::search_vectors(&state.pool, project_id, &collection_name, query).await?;
    Ok(Json(results))
}

/// DELETE /collections/:name/vectors/:vid - Delete a vector from a collection
pub async fn collection_delete_vector(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((collection_name, vector_id)): Path<(String, Uuid)>,
) -> Result<Json<VectorOperationResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Verify collection exists in this project
    let collection = vector::get_collection(&state.pool, &collection_name, Some(project_id)).await?;

    vector::delete_vector(&state.pool, project_id, &collection_name, vector_id).await?;
    vector::update_vector_count(&state.pool, collection.id, -1).await?;

    Ok(Json(VectorOperationResponse {
        success: true,
        count: 1
    }))
}

// ─────────────────────────────────────────
// Legacy Endpoints (Backward Compatibility)
// ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpsertRequest {
    pub collection: String,
    pub vectors: Vec<VectorUpsert>,
}

#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub collection: String,
    #[serde(flatten)]
    pub query: SearchQuery,
}

pub async fn upsert_vectors(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(request): Json<UpsertRequest>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Verify collection exists in this project
    let collection = vector::get_collection(&state.pool, &request.collection, Some(project_id)).await?;

    // Validate vector dimensions
    for v in &request.vectors {
        if v.embedding.len() != collection.dimensions as usize {
            return Err(Error::BadRequest(format!(
                "Vector dimension mismatch: expected {}, got {}",
                collection.dimensions,
                v.embedding.len()
            )));
        }
    }

    let count = vector::upsert_vectors(&state.pool, project_id, &request.collection, request.vectors).await?;

    // Update vector count
    vector::update_vector_count(&state.pool, collection.id, count as i64).await?;

    Ok(Json(serde_json::json!({ "upserted": count })))
}

pub async fn search_vectors(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(request): Json<SearchRequest>,
) -> Result<Json<Vec<VectorMatch>>> {
    let project_id = auth.require_project()?;

    // Verify collection exists in this project
    let collection = vector::get_collection(&state.pool, &request.collection, Some(project_id)).await?;

    // Validate query vector dimensions
    if request.query.embedding.len() != collection.dimensions as usize {
        return Err(Error::BadRequest(format!(
            "Query vector dimension mismatch: expected {}, got {}",
            collection.dimensions,
            request.query.embedding.len()
        )));
    }

    let results = vector::search_vectors(&state.pool, project_id, &request.collection, request.query).await?;

    Ok(Json(results))
}

pub async fn delete_vector(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((collection, id)): Path<(String, Uuid)>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Verify collection exists in this project
    let coll = vector::get_collection(&state.pool, &collection, Some(project_id)).await?;

    vector::delete_vector(&state.pool, project_id, &collection, id).await?;

    // Update vector count
    vector::update_vector_count(&state.pool, coll.id, -1).await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}
