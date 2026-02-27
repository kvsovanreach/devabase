use crate::db::DbPool;
use crate::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Entity {
    pub id: Uuid,
    pub project_id: Uuid,
    pub collection_id: Option<Uuid>,
    pub document_id: Option<Uuid>,
    pub chunk_id: Option<Uuid>,
    pub name: String,
    pub entity_type: String,
    pub description: Option<String>,
    pub aliases: Vec<String>,
    pub confidence: f64,
    pub metadata: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Relationship {
    pub id: Uuid,
    pub project_id: Uuid,
    pub source_entity_id: Uuid,
    pub target_entity_id: Uuid,
    pub relationship_type: String,
    pub description: Option<String>,
    pub confidence: f64,
    pub metadata: serde_json::Value,
    pub document_id: Option<Uuid>,
    pub chunk_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityWithRelationships {
    #[serde(flatten)]
    pub entity: Entity,
    pub outgoing_relationships: Vec<RelationshipWithEntity>,
    pub incoming_relationships: Vec<RelationshipWithEntity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipWithEntity {
    pub relationship: Relationship,
    pub related_entity: EntitySummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EntitySummary {
    pub id: Uuid,
    pub name: String,
    pub entity_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: Uuid,
    pub name: String,
    pub entity_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: Uuid,
    pub source: Uuid,
    pub target: Uuid,
    pub relationship_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphResponse {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub name: String,
    pub entity_type: String,
    pub description: Option<String>,
    pub aliases: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedRelationship {
    pub source: String,
    pub target: String,
    pub relationship_type: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedKnowledge {
    pub entities: Vec<ExtractedEntity>,
    pub relationships: Vec<ExtractedRelationship>,
}

// ============================================================================
// ENTITY CRUD
// ============================================================================

pub async fn create_entity(
    pool: &DbPool,
    project_id: Uuid,
    collection_id: Option<Uuid>,
    document_id: Option<Uuid>,
    chunk_id: Option<Uuid>,
    name: &str,
    entity_type: &str,
    description: Option<&str>,
    aliases: Vec<String>,
    confidence: f64,
    metadata: serde_json::Value,
) -> Result<Entity> {
    // First, try to find existing entity with case-insensitive match
    let existing: Option<Entity> = sqlx::query_as(
        r#"
        SELECT * FROM sys_entities
        WHERE project_id = $1 AND LOWER(name) = LOWER($2) AND entity_type = $3
        "#,
    )
    .bind(project_id)
    .bind(name)
    .bind(entity_type)
    .fetch_optional(pool.inner())
    .await?;

    if let Some(mut entity) = existing {
        // Update existing entity
        entity = sqlx::query_as(
            r#"
            UPDATE sys_entities SET
                description = COALESCE($3, description),
                aliases = ARRAY(SELECT DISTINCT unnest(aliases || $4)),
                updated_at = NOW()
            WHERE id = $1 AND project_id = $2
            RETURNING *
            "#,
        )
        .bind(entity.id)
        .bind(project_id)
        .bind(description)
        .bind(&aliases)
        .fetch_one(pool.inner())
        .await?;

        Ok(entity)
    } else {
        // Insert new entity
        let entity: Entity = sqlx::query_as(
            r#"
            INSERT INTO sys_entities (
                project_id, collection_id, document_id, chunk_id,
                name, entity_type, description, aliases, confidence, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            "#,
        )
        .bind(project_id)
        .bind(collection_id)
        .bind(document_id)
        .bind(chunk_id)
        .bind(name)
        .bind(entity_type)
        .bind(description)
        .bind(&aliases)
        .bind(confidence)
        .bind(metadata)
        .fetch_one(pool.inner())
        .await?;

        Ok(entity)
    }
}

pub async fn get_entity(pool: &DbPool, entity_id: Uuid, project_id: Uuid) -> Result<Entity> {
    let entity: Entity = sqlx::query_as(
        "SELECT * FROM sys_entities WHERE id = $1 AND project_id = $2",
    )
    .bind(entity_id)
    .bind(project_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|_| crate::Error::NotFound("Entity not found".to_string()))?;

    Ok(entity)
}

pub async fn list_entities(
    pool: &DbPool,
    project_id: Uuid,
    entity_type: Option<&str>,
    collection_id: Option<Uuid>,
    limit: i32,
    offset: i32,
) -> Result<Vec<Entity>> {
    let entities: Vec<Entity> = sqlx::query_as(
        r#"
        SELECT * FROM sys_entities
        WHERE project_id = $1
          AND ($2::VARCHAR IS NULL OR entity_type = $2)
          AND ($3::UUID IS NULL OR collection_id = $3)
        ORDER BY name
        LIMIT $4 OFFSET $5
        "#,
    )
    .bind(project_id)
    .bind(entity_type)
    .bind(collection_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool.inner())
    .await?;

    Ok(entities)
}

pub async fn search_entities(
    pool: &DbPool,
    project_id: Uuid,
    query: &str,
    entity_type: Option<&str>,
    limit: i32,
) -> Result<Vec<Entity>> {
    let entities: Vec<Entity> = sqlx::query_as(
        r#"
        SELECT *, similarity(name, $2) AS sim
        FROM sys_entities
        WHERE project_id = $1
          AND (
            name ILIKE '%' || $2 || '%'
            OR $2 % ANY(aliases)
            OR similarity(name, $2) > 0.3
          )
          AND ($3::VARCHAR IS NULL OR entity_type = $3)
        ORDER BY sim DESC, name
        LIMIT $4
        "#,
    )
    .bind(project_id)
    .bind(query)
    .bind(entity_type)
    .bind(limit)
    .fetch_all(pool.inner())
    .await?;

    Ok(entities)
}

pub async fn update_entity(
    pool: &DbPool,
    entity_id: Uuid,
    project_id: Uuid,
    name: Option<&str>,
    description: Option<&str>,
    aliases: Option<Vec<String>>,
) -> Result<Entity> {
    let entity: Entity = sqlx::query_as(
        r#"
        UPDATE sys_entities SET
            name = COALESCE($3, name),
            description = COALESCE($4, description),
            aliases = COALESCE($5, aliases),
            updated_at = NOW()
        WHERE id = $1 AND project_id = $2
        RETURNING *
        "#,
    )
    .bind(entity_id)
    .bind(project_id)
    .bind(name)
    .bind(description)
    .bind(aliases)
    .fetch_one(pool.inner())
    .await
    .map_err(|_| crate::Error::NotFound("Entity not found".to_string()))?;

    Ok(entity)
}

pub async fn delete_entity(pool: &DbPool, entity_id: Uuid, project_id: Uuid) -> Result<()> {
    let result = sqlx::query("DELETE FROM sys_entities WHERE id = $1 AND project_id = $2")
        .bind(entity_id)
        .bind(project_id)
        .execute(pool.inner())
        .await?;

    if result.rows_affected() == 0 {
        return Err(crate::Error::NotFound("Entity not found".to_string()));
    }

    Ok(())
}

pub async fn merge_entities(
    pool: &DbPool,
    project_id: Uuid,
    source_id: Uuid,
    target_id: Uuid,
) -> Result<Entity> {
    // Merge source into target, combining aliases and transferring relationships
    let mut tx = pool.inner().begin().await?;

    // Get source entity
    let source: Entity = sqlx::query_as(
        "SELECT * FROM sys_entities WHERE id = $1 AND project_id = $2",
    )
    .bind(source_id)
    .bind(project_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| crate::Error::NotFound("Source entity not found".to_string()))?;

    // Update target with merged aliases
    let target: Entity = sqlx::query_as(
        r#"
        UPDATE sys_entities SET
            aliases = ARRAY(
                SELECT DISTINCT unnest(aliases || $3 || ARRAY[$4::TEXT])
            ),
            updated_at = NOW()
        WHERE id = $1 AND project_id = $2
        RETURNING *
        "#,
    )
    .bind(target_id)
    .bind(project_id)
    .bind(&source.aliases)
    .bind(&source.name)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| crate::Error::NotFound("Target entity not found".to_string()))?;

    // Update relationships to point to target instead of source
    sqlx::query(
        "UPDATE sys_relationships SET source_entity_id = $1 WHERE source_entity_id = $2",
    )
    .bind(target_id)
    .bind(source_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE sys_relationships SET target_entity_id = $1 WHERE target_entity_id = $2",
    )
    .bind(target_id)
    .bind(source_id)
    .execute(&mut *tx)
    .await?;

    // Delete source entity
    sqlx::query("DELETE FROM sys_entities WHERE id = $1")
        .bind(source_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(target)
}

// ============================================================================
// RELATIONSHIP CRUD
// ============================================================================

pub async fn create_relationship(
    pool: &DbPool,
    project_id: Uuid,
    source_entity_id: Uuid,
    target_entity_id: Uuid,
    relationship_type: &str,
    description: Option<&str>,
    confidence: f64,
    metadata: serde_json::Value,
    document_id: Option<Uuid>,
    chunk_id: Option<Uuid>,
) -> Result<Relationship> {
    let relationship: Relationship = sqlx::query_as(
        r#"
        INSERT INTO sys_relationships (
            project_id, source_entity_id, target_entity_id,
            relationship_type, description, confidence, metadata,
            document_id, chunk_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO UPDATE SET
            description = COALESCE(EXCLUDED.description, sys_relationships.description),
            confidence = GREATEST(sys_relationships.confidence, EXCLUDED.confidence),
            updated_at = NOW()
        RETURNING *
        "#,
    )
    .bind(project_id)
    .bind(source_entity_id)
    .bind(target_entity_id)
    .bind(relationship_type)
    .bind(description)
    .bind(confidence)
    .bind(metadata)
    .bind(document_id)
    .bind(chunk_id)
    .fetch_one(pool.inner())
    .await?;

    Ok(relationship)
}

pub async fn list_relationships(
    pool: &DbPool,
    project_id: Uuid,
    entity_id: Option<Uuid>,
    relationship_type: Option<&str>,
    limit: i32,
    offset: i32,
) -> Result<Vec<Relationship>> {
    let relationships: Vec<Relationship> = sqlx::query_as(
        r#"
        SELECT * FROM sys_relationships
        WHERE project_id = $1
          AND ($2::UUID IS NULL OR source_entity_id = $2 OR target_entity_id = $2)
          AND ($3::VARCHAR IS NULL OR relationship_type = $3)
        ORDER BY created_at DESC
        LIMIT $4 OFFSET $5
        "#,
    )
    .bind(project_id)
    .bind(entity_id)
    .bind(relationship_type)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool.inner())
    .await?;

    Ok(relationships)
}

pub async fn delete_relationship(
    pool: &DbPool,
    relationship_id: Uuid,
    project_id: Uuid,
) -> Result<()> {
    let result = sqlx::query("DELETE FROM sys_relationships WHERE id = $1 AND project_id = $2")
        .bind(relationship_id)
        .bind(project_id)
        .execute(pool.inner())
        .await?;

    if result.rows_affected() == 0 {
        return Err(crate::Error::NotFound("Relationship not found".to_string()));
    }

    Ok(())
}

// ============================================================================
// GRAPH QUERIES
// ============================================================================

pub async fn get_entity_graph(
    pool: &DbPool,
    project_id: Uuid,
    entity_id: Uuid,
    depth: i32,
) -> Result<GraphResponse> {
    // Get all connected entities and relationships using the helper function
    let rows: Vec<(
        Uuid,
        String,
        String,
        Option<Uuid>,
        Option<String>,
        Option<Uuid>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = sqlx::query_as(
        r#"
        SELECT
            entity_id, entity_name, entity_type,
            relationship_id, relationship_type,
            related_entity_id, related_entity_name, related_entity_type,
            direction
        FROM fn_get_entity_graph($1, $2)
        "#,
    )
    .bind(entity_id)
    .bind(depth)
    .fetch_all(pool.inner())
    .await?;

    // Get the center entity
    let center: Entity = get_entity(pool, entity_id, project_id).await?;

    let mut nodes: Vec<GraphNode> = vec![GraphNode {
        id: center.id,
        name: center.name,
        entity_type: center.entity_type,
    }];
    let mut edges: Vec<GraphEdge> = vec![];
    let mut seen_nodes: std::collections::HashSet<Uuid> = std::collections::HashSet::new();
    seen_nodes.insert(center.id);

    for row in rows {
        let (
            _entity_id,
            _entity_name,
            _entity_type,
            rel_id,
            rel_type,
            related_id,
            related_name,
            related_type,
            direction,
        ) = row;

        if let (Some(rel_id), Some(rel_type), Some(related_id), Some(related_name), Some(related_type), Some(dir)) =
            (rel_id, rel_type, related_id, related_name, related_type, direction)
        {
            if !seen_nodes.contains(&related_id) {
                nodes.push(GraphNode {
                    id: related_id,
                    name: related_name,
                    entity_type: related_type,
                });
                seen_nodes.insert(related_id);
            }

            let (source, target) = if dir == "outgoing" {
                (entity_id, related_id)
            } else {
                (related_id, entity_id)
            };

            edges.push(GraphEdge {
                id: rel_id,
                source,
                target,
                relationship_type: rel_type,
            });
        }
    }

    Ok(GraphResponse { nodes, edges })
}

// Helper struct for relationship queries with joined entity data
#[derive(Debug, Clone, FromRow)]
struct RelationshipWithEntityRow {
    // Relationship fields
    id: Uuid,
    project_id: Uuid,
    source_entity_id: Uuid,
    target_entity_id: Uuid,
    relationship_type: String,
    description: Option<String>,
    confidence: f64,
    metadata: serde_json::Value,
    document_id: Option<Uuid>,
    chunk_id: Option<Uuid>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    // Related entity fields (prefixed)
    related_id: Uuid,
    related_name: String,
    related_type: String,
}

pub async fn get_entity_with_relationships(
    pool: &DbPool,
    entity_id: Uuid,
    project_id: Uuid,
) -> Result<EntityWithRelationships> {
    let entity = get_entity(pool, entity_id, project_id).await?;

    // Get outgoing relationships
    let outgoing: Vec<RelationshipWithEntityRow> = sqlx::query_as(
        r#"
        SELECT
            r.id, r.project_id, r.source_entity_id, r.target_entity_id,
            r.relationship_type, r.description, r.confidence, r.metadata,
            r.document_id, r.chunk_id, r.created_at, r.updated_at,
            e.id AS related_id, e.name AS related_name, e.entity_type AS related_type
        FROM sys_relationships r
        JOIN sys_entities e ON e.id = r.target_entity_id
        WHERE r.source_entity_id = $1
        "#,
    )
    .bind(entity_id)
    .fetch_all(pool.inner())
    .await?;

    // Get incoming relationships
    let incoming: Vec<RelationshipWithEntityRow> = sqlx::query_as(
        r#"
        SELECT
            r.id, r.project_id, r.source_entity_id, r.target_entity_id,
            r.relationship_type, r.description, r.confidence, r.metadata,
            r.document_id, r.chunk_id, r.created_at, r.updated_at,
            e.id AS related_id, e.name AS related_name, e.entity_type AS related_type
        FROM sys_relationships r
        JOIN sys_entities e ON e.id = r.source_entity_id
        WHERE r.target_entity_id = $1
        "#,
    )
    .bind(entity_id)
    .fetch_all(pool.inner())
    .await?;

    let outgoing_relationships: Vec<RelationshipWithEntity> = outgoing
        .into_iter()
        .map(|row| RelationshipWithEntity {
            relationship: Relationship {
                id: row.id,
                project_id: row.project_id,
                source_entity_id: row.source_entity_id,
                target_entity_id: row.target_entity_id,
                relationship_type: row.relationship_type,
                description: row.description,
                confidence: row.confidence,
                metadata: row.metadata,
                document_id: row.document_id,
                chunk_id: row.chunk_id,
                created_at: row.created_at,
                updated_at: row.updated_at,
            },
            related_entity: EntitySummary {
                id: row.related_id,
                name: row.related_name,
                entity_type: row.related_type,
            },
        })
        .collect();

    let incoming_relationships: Vec<RelationshipWithEntity> = incoming
        .into_iter()
        .map(|row| RelationshipWithEntity {
            relationship: Relationship {
                id: row.id,
                project_id: row.project_id,
                source_entity_id: row.source_entity_id,
                target_entity_id: row.target_entity_id,
                relationship_type: row.relationship_type,
                description: row.description,
                confidence: row.confidence,
                metadata: row.metadata,
                document_id: row.document_id,
                chunk_id: row.chunk_id,
                created_at: row.created_at,
                updated_at: row.updated_at,
            },
            related_entity: EntitySummary {
                id: row.related_id,
                name: row.related_name,
                entity_type: row.related_type,
            },
        })
        .collect();

    Ok(EntityWithRelationships {
        entity,
        outgoing_relationships,
        incoming_relationships,
    })
}

// ============================================================================
// ENTITY COUNTS
// ============================================================================

pub async fn count_entities(
    pool: &DbPool,
    project_id: Uuid,
    entity_type: Option<&str>,
) -> Result<i64> {
    let (count,): (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*) FROM sys_entities
        WHERE project_id = $1
          AND ($2::VARCHAR IS NULL OR entity_type = $2)
        "#,
    )
    .bind(project_id)
    .bind(entity_type)
    .fetch_one(pool.inner())
    .await?;

    Ok(count)
}

pub async fn count_relationships(
    pool: &DbPool,
    project_id: Uuid,
    relationship_type: Option<&str>,
) -> Result<i64> {
    let (count,): (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*) FROM sys_relationships
        WHERE project_id = $1
          AND ($2::VARCHAR IS NULL OR relationship_type = $2)
        "#,
    )
    .bind(project_id)
    .bind(relationship_type)
    .fetch_one(pool.inner())
    .await?;

    Ok(count)
}

// ============================================================================
// KNOWLEDGE EXTRACTION (to be integrated with LLM)
// ============================================================================

pub async fn store_extracted_knowledge(
    pool: &DbPool,
    project_id: Uuid,
    collection_id: Option<Uuid>,
    document_id: Uuid,
    chunk_id: Option<Uuid>,
    knowledge: ExtractedKnowledge,
) -> Result<(Vec<Entity>, Vec<Relationship>)> {
    let mut created_entities: Vec<Entity> = vec![];
    let mut created_relationships: Vec<Relationship> = vec![];

    // First, create all entities
    for extracted in knowledge.entities {
        let entity = create_entity(
            pool,
            project_id,
            collection_id,
            Some(document_id),
            chunk_id,
            &extracted.name,
            &extracted.entity_type,
            extracted.description.as_deref(),
            extracted.aliases.unwrap_or_default(),
            1.0,
            serde_json::json!({}),
        )
        .await?;
        created_entities.push(entity);
    }

    // Then create relationships
    for extracted in knowledge.relationships {
        // Find source and target entities by name
        let source_entities = search_entities(pool, project_id, &extracted.source, None, 1).await?;
        let target_entities = search_entities(pool, project_id, &extracted.target, None, 1).await?;

        if let (Some(source), Some(target)) = (source_entities.first(), target_entities.first()) {
            let relationship = create_relationship(
                pool,
                project_id,
                source.id,
                target.id,
                &extracted.relationship_type,
                extracted.description.as_deref(),
                1.0,
                serde_json::json!({}),
                Some(document_id),
                chunk_id,
            )
            .await?;
            created_relationships.push(relationship);
        }
    }

    Ok((created_entities, created_relationships))
}

// ============================================================================
// LLM-BASED KNOWLEDGE EXTRACTION
// ============================================================================

/// LLM provider configuration for extraction
pub struct LLMConfig {
    pub provider_type: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
}

/// Extract entities and relationships from text using an LLM
pub async fn extract_knowledge_from_text(
    llm_config: &LLMConfig,
    text: &str,
) -> Result<ExtractedKnowledge> {
    let client = Client::new();

    // Truncate text if too long (keep under ~3000 chars for context)
    let truncated_text: String = if text.chars().count() > 3000 {
        text.chars().take(3000).collect::<String>() + "..."
    } else {
        text.to_string()
    };

    let prompt = format!(
        r#"Extract entities and relationships from the text below. Output ONLY valid JSON, nothing else.

Text:
{}

Output JSON with this structure (no explanation, no markdown):
{{"entities":[{{"name":"...","type":"person|organization|location|concept|product|event|technology","description":"..."}}],"relationships":[{{"source":"entity name","target":"entity name","type":"relationship_type","description":"..."}}]}}

If no entities found, return: {{"entities":[],"relationships":[]}}"#,
        truncated_text
    );

    let response = call_llm_for_extraction(
        &client,
        &llm_config.provider_type,
        &llm_config.api_key,
        llm_config.base_url.as_deref(),
        &llm_config.model,
        &prompt,
    )
    .await?;

    // Parse the JSON response
    parse_extraction_response(&response)
}

/// Call LLM API and get response text
async fn call_llm_for_extraction(
    client: &Client,
    provider_type: &str,
    api_key: &str,
    base_url: Option<&str>,
    model: &str,
    prompt: &str,
) -> Result<String> {
    let url = match provider_type {
        "openai" => format!("{}/chat/completions", base_url.unwrap_or("https://api.openai.com/v1")),
        "anthropic" => format!("{}/messages", base_url.unwrap_or("https://api.anthropic.com/v1")),
        "google" => format!(
            "{}/models/{}:generateContent",
            base_url.unwrap_or("https://generativelanguage.googleapis.com/v1beta"),
            model
        ),
        "custom" => format!(
            "{}/chat/completions",
            base_url.ok_or_else(|| crate::Error::BadRequest("Base URL required for custom provider".to_string()))?
        ),
        _ => return Err(crate::Error::BadRequest(format!("Unsupported provider: {}", provider_type))),
    };

    let response = match provider_type {
        "anthropic" => {
            client
                .post(&url)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": model,
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": prompt}]
                }))
                .send()
                .await
                .map_err(|e| crate::Error::Internal(format!("LLM request failed: {}", e)))?
        }
        "google" => {
            client
                .post(format!("{}?key={}", url, api_key))
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096}
                }))
                .send()
                .await
                .map_err(|e| crate::Error::Internal(format!("LLM request failed: {}", e)))?
        }
        _ => {
            // OpenAI-compatible
            client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 4096
                }))
                .send()
                .await
                .map_err(|e| crate::Error::Internal(format!("LLM request failed: {}", e)))?
        }
    };

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(crate::Error::Internal(format!("LLM API error: {}", error_text)));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| crate::Error::Internal(format!("Failed to parse LLM response: {}", e)))?;

    // Extract text based on provider
    let text = match provider_type {
        "anthropic" => json["content"][0]["text"].as_str(),
        "google" => json["candidates"][0]["content"]["parts"][0]["text"].as_str(),
        _ => json["choices"][0]["message"]["content"].as_str(),
    }
    .unwrap_or("")
    .to_string();

    Ok(text)
}

/// Find and extract a valid JSON object from text that may contain thinking/explanation
fn find_json_object(text: &str) -> Option<&str> {
    // Try to find JSON that starts with {"entities" (our expected format)
    if let Some(start) = text.find(r#"{"entities""#) {
        // Find the matching closing brace by counting braces
        let text_from_start = &text[start..];
        let mut depth = 0;
        let mut end_pos = None;

        for (i, c) in text_from_start.char_indices() {
            match c {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end_pos = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }

        if let Some(end) = end_pos {
            return Some(&text[start..start + end + 1]);
        }
    }

    // Fallback: try to find any JSON object starting with {
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            if end > start {
                // Validate it's actually valid JSON before returning
                let candidate = &text[start..=end];
                if serde_json::from_str::<serde_json::Value>(candidate).is_ok() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

/// Strip reasoning/thinking tags from LLM response
/// Handles various formats: <think>, <thinking>, <reasoning>, <thought>, etc.
fn strip_thinking_tags(text: &str) -> String {
    let mut result = text.to_string();

    // Common reasoning tag patterns used by different models
    let tag_patterns = [
        "think",
        "thinking",
        "reasoning",
        "thought",
        "reflection",
    ];

    for tag in tag_patterns {
        let open = format!("<{}>", tag);
        let close = format!("</{}>", tag);

        // Remove complete tag blocks (loop handles nested/multiple)
        loop {
            if let Some(start) = result.find(&open) {
                if let Some(end_rel) = result[start..].find(&close) {
                    // Found both open and close - remove the block
                    let end_pos = start + end_rel + close.len();
                    result = format!("{}{}", &result[..start], &result[end_pos..]);
                } else {
                    // Open tag without close - try to find JSON after the open tag
                    // Look for {"entities" after the open tag
                    let after_open = start + open.len();
                    if let Some(json_start) = result[after_open..].find(r#"{"entities""#) {
                        // JSON found after thinking - extract from there
                        result = result[after_open + json_start..].to_string();
                    }
                    // If no JSON found, leave as-is and let find_json_object handle it
                    break;
                }
            } else {
                break;
            }
        }

        // Handle case where response starts with just the closing tag (thinking done before output)
        if let Some(pos) = result.find(&close) {
            // Keep everything after the closing tag
            result = result[pos + close.len()..].to_string();
        }
    }

    result.trim().to_string()
}

/// Parse LLM response into ExtractedKnowledge
fn parse_extraction_response(response: &str) -> Result<ExtractedKnowledge> {
    // First, strip out any thinking tags that some LLMs emit
    let cleaned_response = strip_thinking_tags(response);

    // Try to find the actual JSON object (LLM might add thinking/explanation text)
    // Look for the JSON object that contains "entities" key
    let json_str = match find_json_object(&cleaned_response) {
        Some(json) => json,
        None => {
            // No JSON found - the LLM may have only output thinking/reasoning
            // This can happen with reasoning models that don't complete their response
            tracing::warn!(
                "No JSON object found in LLM response. Response length: {}, starts with: {}",
                response.len(),
                &response[..response.len().min(300)]
            );
            // Return empty result - extraction will continue with other chunks
            return Ok(ExtractedKnowledge {
                entities: vec![],
                relationships: vec![],
            });
        }
    };

    // Parse JSON
    let parsed: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
        tracing::warn!(
            "Failed to parse JSON: {}. JSON (len={}): {}",
            e,
            json_str.len(),
            &json_str[..json_str.len().min(500)]
        );
        crate::Error::Internal(format!("Failed to parse extraction JSON: {}", e))
    })?;

    let mut entities = Vec::new();
    let mut relationships = Vec::new();

    // Parse entities
    if let Some(entity_arr) = parsed.get("entities").and_then(|v| v.as_array()) {
        for e in entity_arr {
            if let (Some(name), Some(entity_type)) = (
                e.get("name").and_then(|v| v.as_str()),
                e.get("type").and_then(|v| v.as_str()),
            ) {
                entities.push(ExtractedEntity {
                    name: name.to_string(),
                    entity_type: entity_type.to_string(),
                    description: e.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    aliases: None,
                });
            }
        }
    }

    // Parse relationships
    if let Some(rel_arr) = parsed.get("relationships").and_then(|v| v.as_array()) {
        for r in rel_arr {
            if let (Some(source), Some(target), Some(rel_type)) = (
                r.get("source").and_then(|v| v.as_str()),
                r.get("target").and_then(|v| v.as_str()),
                r.get("type").and_then(|v| v.as_str()),
            ) {
                relationships.push(ExtractedRelationship {
                    source: source.to_string(),
                    target: target.to_string(),
                    relationship_type: rel_type.to_string(),
                    description: r.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
        }
    }

    Ok(ExtractedKnowledge {
        entities,
        relationships,
    })
}

/// Extract knowledge from all chunks of a document
pub async fn extract_knowledge_from_document(
    pool: &DbPool,
    llm_config: &LLMConfig,
    project_id: Uuid,
    collection_id: Option<Uuid>,
    document_id: Uuid,
) -> Result<(usize, usize)> {
    // Get all chunks for this document
    let chunks: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, content FROM sys_chunks WHERE document_id = $1 ORDER BY chunk_index"
    )
    .bind(document_id)
    .fetch_all(pool.inner())
    .await?;

    let mut total_entities = 0;
    let mut total_relationships = 0;

    // Process chunks in batches to avoid too many LLM calls
    // Combine up to 3 chunks at a time
    for chunk_batch in chunks.chunks(3) {
        let combined_text: String = chunk_batch
            .iter()
            .map(|(_, content)| content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");

        let first_chunk_id = chunk_batch.first().map(|(id, _)| *id);

        // Extract knowledge from combined text
        match extract_knowledge_from_text(llm_config, &combined_text).await {
            Ok(knowledge) => {
                if !knowledge.entities.is_empty() || !knowledge.relationships.is_empty() {
                    let (entities, relationships) = store_extracted_knowledge(
                        pool,
                        project_id,
                        collection_id,
                        document_id,
                        first_chunk_id,
                        knowledge,
                    )
                    .await?;

                    total_entities += entities.len();
                    total_relationships += relationships.len();
                }
            }
            Err(e) => {
                tracing::warn!("Failed to extract knowledge from chunk: {}", e);
                // Continue with other chunks
            }
        }
    }

    Ok((total_entities, total_relationships))
}
