use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::db::models::{Document, DocumentStatus, Project};
use crate::rag::knowledge_graph::{self, LLMConfig};
use crate::server::AppState;
use crate::vector;
use crate::{Error, Result};

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ListEntitiesQuery {
    pub entity_type: Option<String>,
    pub collection_id: Option<Uuid>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SearchEntitiesRequest {
    pub query: String,
    pub entity_type: Option<String>,
    pub limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEntityRequest {
    pub name: String,
    pub entity_type: String,
    pub description: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub collection_id: Option<Uuid>,
    pub document_id: Option<Uuid>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEntityRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub aliases: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct MergeEntitiesRequest {
    pub source_id: Uuid,
    pub target_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct ListRelationshipsQuery {
    pub entity_id: Option<Uuid>,
    pub relationship_type: Option<String>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRelationshipRequest {
    pub source_entity_id: Uuid,
    pub target_entity_id: Uuid,
    pub relationship_type: String,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct GetGraphQuery {
    pub depth: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeStatsResponse {
    pub total_entities: i64,
    pub total_relationships: i64,
    pub entities_by_type: Vec<EntityTypeCount>,
}

#[derive(Debug, Serialize)]
pub struct EntityTypeCount {
    pub entity_type: String,
    pub count: i64,
}

// ============================================================================
// ENTITY ENDPOINTS
// ============================================================================

/// GET /v1/knowledge/entities - List entities
pub async fn list_entities(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<ListEntitiesQuery>,
) -> Result<Json<Vec<knowledge_graph::Entity>>> {
    let project_id = auth.require_project()?;

    let entities = knowledge_graph::list_entities(
        &state.pool,
        project_id,
        query.entity_type.as_deref(),
        query.collection_id,
        query.limit.unwrap_or(50),
        query.offset.unwrap_or(0),
    )
    .await?;

    Ok(Json(entities))
}

/// POST /v1/knowledge/entities - Create entity
pub async fn create_entity(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<CreateEntityRequest>,
) -> Result<Json<knowledge_graph::Entity>> {
    let project_id = auth.require_project()?;

    let entity = knowledge_graph::create_entity(
        &state.pool,
        project_id,
        req.collection_id,
        req.document_id,
        None,
        &req.name,
        &req.entity_type,
        req.description.as_deref(),
        req.aliases.unwrap_or_default(),
        1.0,
        req.metadata.unwrap_or(serde_json::json!({})),
    )
    .await?;

    Ok(Json(entity))
}

/// GET /v1/knowledge/entities/:id - Get entity with relationships
pub async fn get_entity(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(entity_id): Path<Uuid>,
) -> Result<Json<knowledge_graph::EntityWithRelationships>> {
    let project_id = auth.require_project()?;

    let entity = knowledge_graph::get_entity_with_relationships(
        &state.pool,
        entity_id,
        project_id,
    )
    .await?;

    Ok(Json(entity))
}

/// PATCH /v1/knowledge/entities/:id - Update entity
pub async fn update_entity(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(entity_id): Path<Uuid>,
    Json(req): Json<UpdateEntityRequest>,
) -> Result<Json<knowledge_graph::Entity>> {
    let project_id = auth.require_project()?;

    let entity = knowledge_graph::update_entity(
        &state.pool,
        entity_id,
        project_id,
        req.name.as_deref(),
        req.description.as_deref(),
        req.aliases,
    )
    .await?;

    Ok(Json(entity))
}

/// DELETE /v1/knowledge/entities/:id - Delete entity
pub async fn delete_entity(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(entity_id): Path<Uuid>,
) -> Result<()> {
    let project_id = auth.require_project()?;

    knowledge_graph::delete_entity(&state.pool, entity_id, project_id).await?;

    Ok(())
}

/// POST /v1/knowledge/entities/search - Search entities by name
pub async fn search_entities(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<SearchEntitiesRequest>,
) -> Result<Json<Vec<knowledge_graph::Entity>>> {
    let project_id = auth.require_project()?;

    let entities = knowledge_graph::search_entities(
        &state.pool,
        project_id,
        &req.query,
        req.entity_type.as_deref(),
        req.limit.unwrap_or(20),
    )
    .await?;

    Ok(Json(entities))
}

/// POST /v1/knowledge/entities/merge - Merge two entities
pub async fn merge_entities(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<MergeEntitiesRequest>,
) -> Result<Json<knowledge_graph::Entity>> {
    let project_id = auth.require_project()?;

    if req.source_id == req.target_id {
        return Err(Error::BadRequest("Cannot merge entity with itself".to_string()));
    }

    let entity = knowledge_graph::merge_entities(
        &state.pool,
        project_id,
        req.source_id,
        req.target_id,
    )
    .await?;

    Ok(Json(entity))
}

// ============================================================================
// RELATIONSHIP ENDPOINTS
// ============================================================================

/// GET /v1/knowledge/relationships - List relationships
pub async fn list_relationships(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<ListRelationshipsQuery>,
) -> Result<Json<Vec<knowledge_graph::Relationship>>> {
    let project_id = auth.require_project()?;

    let relationships = knowledge_graph::list_relationships(
        &state.pool,
        project_id,
        query.entity_id,
        query.relationship_type.as_deref(),
        query.limit.unwrap_or(50),
        query.offset.unwrap_or(0),
    )
    .await?;

    Ok(Json(relationships))
}

/// POST /v1/knowledge/relationships - Create relationship
pub async fn create_relationship(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<CreateRelationshipRequest>,
) -> Result<Json<knowledge_graph::Relationship>> {
    let project_id = auth.require_project()?;

    if req.source_entity_id == req.target_entity_id {
        return Err(Error::BadRequest("Cannot create self-relationship".to_string()));
    }

    let relationship = knowledge_graph::create_relationship(
        &state.pool,
        project_id,
        req.source_entity_id,
        req.target_entity_id,
        &req.relationship_type,
        req.description.as_deref(),
        1.0,
        req.metadata.unwrap_or(serde_json::json!({})),
        None,
        None,
    )
    .await?;

    Ok(Json(relationship))
}

/// DELETE /v1/knowledge/relationships/:id - Delete relationship
pub async fn delete_relationship(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(relationship_id): Path<Uuid>,
) -> Result<()> {
    let project_id = auth.require_project()?;

    knowledge_graph::delete_relationship(&state.pool, relationship_id, project_id).await?;

    Ok(())
}

// ============================================================================
// GRAPH ENDPOINTS
// ============================================================================

/// GET /v1/knowledge/graph/:entity_id - Get entity subgraph
pub async fn get_entity_graph(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(entity_id): Path<Uuid>,
    Query(query): Query<GetGraphQuery>,
) -> Result<Json<knowledge_graph::GraphResponse>> {
    let project_id = auth.require_project()?;

    let depth = query.depth.unwrap_or(1).min(3); // Max depth of 3

    let graph = knowledge_graph::get_entity_graph(
        &state.pool,
        project_id,
        entity_id,
        depth,
    )
    .await?;

    Ok(Json(graph))
}

/// GET /v1/knowledge/stats - Get knowledge graph statistics
pub async fn get_stats(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<KnowledgeStatsResponse>> {
    let project_id = auth.require_project()?;

    let total_entities = knowledge_graph::count_entities(&state.pool, project_id, None).await?;
    let total_relationships = knowledge_graph::count_relationships(&state.pool, project_id, None).await?;

    // Get counts by entity type
    let type_counts: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT entity_type, COUNT(*) as count
        FROM sys_entities
        WHERE project_id = $1
        GROUP BY entity_type
        ORDER BY count DESC
        "#,
    )
    .bind(project_id)
    .fetch_all(state.pool.inner())
    .await?;

    let entities_by_type: Vec<EntityTypeCount> = type_counts
        .into_iter()
        .map(|(entity_type, count)| EntityTypeCount { entity_type, count })
        .collect();

    Ok(Json(KnowledgeStatsResponse {
        total_entities,
        total_relationships,
        entities_by_type,
    }))
}

// ============================================================================
// EXTRACTION ENDPOINTS
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ExtractionResponse {
    pub document_id: String,
    pub entities_extracted: usize,
    pub relationships_extracted: usize,
    pub message: String,
}

/// POST /v1/knowledge/extract/:document_id - Extract knowledge from a document
pub async fn extract_from_document(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(document_id): Path<Uuid>,
) -> Result<Json<ExtractionResponse>> {
    let project_id = auth.require_project()?;

    // Get document and verify it belongs to this project
    let document: Document = sqlx::query_as(
        r#"
        SELECT d.* FROM sys_documents d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.id = $1 AND c.project_id = $2
        "#,
    )
    .bind(document_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Document not found".to_string()))?;

    // Check document is processed
    if document.status != DocumentStatus::Processed {
        return Err(Error::BadRequest(format!(
            "Document must be processed first. Current status: {}",
            document.status
        )));
    }

    // Get collection for collection_id
    let collection = vector::get_collection_by_id(&state.pool, document.collection_id).await?;

    // Get project settings for LLM provider
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await
        .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings: serde_json::Value = project.settings.unwrap_or_default();

    // Get default LLM provider from settings
    let llm_providers = settings
        .get("llm_providers")
        .and_then(|v| v.as_array())
        .ok_or_else(|| Error::BadRequest("No LLM providers configured. Configure one in project settings.".to_string()))?;

    // Use first active provider or default
    let default_llm_id = settings.get("default_llm_provider").and_then(|v| v.as_str());

    let provider = if let Some(id) = default_llm_id {
        llm_providers.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
    } else {
        llm_providers.iter().find(|p| p.get("is_active").and_then(|v| v.as_bool()).unwrap_or(false))
    }
    .or_else(|| llm_providers.first())
    .ok_or_else(|| Error::BadRequest("No LLM provider available".to_string()))?;

    let llm_config = LLMConfig {
        provider_type: provider.get("type").and_then(|v| v.as_str()).unwrap_or("openai").to_string(),
        api_key: provider.get("api_key").and_then(|v| v.as_str())
            .ok_or_else(|| Error::BadRequest("LLM provider API key not configured".to_string()))?
            .to_string(),
        base_url: provider.get("base_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
        model: provider.get("default_model").and_then(|v| v.as_str())
            .or_else(|| provider.get("models").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|v| v.as_str()))
            .unwrap_or("gpt-4o-mini")
            .to_string(),
    };

    // Extract knowledge
    let (entities, relationships) = knowledge_graph::extract_knowledge_from_document(
        &state.pool,
        &llm_config,
        project_id,
        Some(collection.id),
        document_id,
    )
    .await?;

    Ok(Json(ExtractionResponse {
        document_id: document_id.to_string(),
        entities_extracted: entities,
        relationships_extracted: relationships,
        message: format!(
            "Extracted {} entities and {} relationships from document",
            entities, relationships
        ),
    }))
}
