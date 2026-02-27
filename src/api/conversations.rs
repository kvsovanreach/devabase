use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::api::pagination::PaginatedResponse;
use crate::auth::AuthContext;
use crate::server::AppState;
use crate::{Error, Result};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Conversation {
    pub id: Uuid,
    pub project_id: Uuid,
    pub collection_id: Uuid,
    pub user_id: Option<Uuid>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub message_count: i32,
    pub total_tokens: i32,
    pub metadata: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ConversationWithCollection {
    #[serde(flatten)]
    pub conversation: Conversation,
    pub collection_name: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Message {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub role: String,
    pub content: String,
    pub tokens: i32,
    pub sources: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ListConversationsQuery {
    pub collection_id: Option<Uuid>,
    // Pagination fields (supports standard PaginationQuery fields)
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub cursor: Option<String>,
}

fn default_limit() -> i64 {
    50
}

impl ListConversationsQuery {
    pub fn get_pagination(&self) -> (i64, i64) {
        // If page/per_page are provided, use them
        if let (Some(page), Some(per_page)) = (self.page, self.per_page) {
            let page = page.max(1);
            let per_page = per_page.min(1000).max(1);
            let offset = (page - 1) * per_page;
            return (per_page, offset);
        }

        // Otherwise use limit/offset
        let limit = self.per_page.unwrap_or(self.limit).min(1000).max(1);
        (limit, self.offset.max(0))
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateConversationRequest {
    pub collection_id: Uuid,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConversationRequest {
    pub title: Option<String>,
    pub summary: Option<String>,
}

// ============================================================================
// Conversation Handlers
// ============================================================================

/// List all conversations with pagination
pub async fn list_conversations(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<ListConversationsQuery>,
) -> Result<Json<PaginatedResponse<ConversationWithCollection>>> {
    let project_id = auth.require_project()?;

    let (limit, offset) = query.get_pagination();

    // Get total count
    let total: (i64,) = if let Some(collection_id) = query.collection_id {
        sqlx::query_as(
            "SELECT COUNT(*) FROM sys_conversations WHERE project_id = $1 AND collection_id = $2"
        )
        .bind(project_id)
        .bind(collection_id)
        .fetch_one(state.pool.inner())
        .await?
    } else {
        sqlx::query_as(
            "SELECT COUNT(*) FROM sys_conversations WHERE project_id = $1"
        )
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await?
    };

    let rows: Vec<(Uuid, Uuid, Uuid, Option<Uuid>, Option<String>, Option<String>, i32, i32, Option<serde_json::Value>, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>, String)> = if let Some(collection_id) = query.collection_id {
        sqlx::query_as(
            r#"
            SELECT c.id, c.project_id, c.collection_id, c.user_id, c.title, c.summary,
                   c.message_count, c.total_tokens, c.metadata, c.created_at, c.updated_at,
                   col.name as collection_name
            FROM sys_conversations c
            JOIN sys_collections col ON col.id = c.collection_id
            WHERE c.project_id = $1 AND c.collection_id = $2
            ORDER BY c.updated_at DESC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(project_id)
        .bind(collection_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(state.pool.inner())
        .await?
    } else {
        sqlx::query_as(
            r#"
            SELECT c.id, c.project_id, c.collection_id, c.user_id, c.title, c.summary,
                   c.message_count, c.total_tokens, c.metadata, c.created_at, c.updated_at,
                   col.name as collection_name
            FROM sys_conversations c
            JOIN sys_collections col ON col.id = c.collection_id
            WHERE c.project_id = $1
            ORDER BY c.updated_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(project_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(state.pool.inner())
        .await?
    };

    let conversations: Vec<ConversationWithCollection> = rows
        .into_iter()
        .map(|(id, project_id, collection_id, user_id, title, summary, message_count, total_tokens, metadata, created_at, updated_at, collection_name)| {
            ConversationWithCollection {
                conversation: Conversation {
                    id,
                    project_id,
                    collection_id,
                    user_id,
                    title,
                    summary,
                    message_count,
                    total_tokens,
                    metadata,
                    created_at,
                    updated_at,
                },
                collection_name,
            }
        })
        .collect();

    Ok(Json(PaginatedResponse::new(conversations, total.0, limit, offset)))
}

/// Get a single conversation with its messages
pub async fn get_conversation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    // Get conversation
    let row: Option<(Uuid, Uuid, Uuid, Option<Uuid>, Option<String>, Option<String>, i32, i32, Option<serde_json::Value>, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>, String)> = sqlx::query_as(
        r#"
        SELECT c.id, c.project_id, c.collection_id, c.user_id, c.title, c.summary,
               c.message_count, c.total_tokens, c.metadata, c.created_at, c.updated_at,
               col.name as collection_name
        FROM sys_conversations c
        JOIN sys_collections col ON col.id = c.collection_id
        WHERE c.id = $1 AND c.project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?;

    let (id, project_id, collection_id, user_id, title, summary, message_count, total_tokens, metadata, created_at, updated_at, collection_name) = row
        .ok_or_else(|| Error::NotFound("Conversation not found".to_string()))?;

    // Get messages
    let messages: Vec<Message> = sqlx::query_as(
        r#"
        SELECT id, conversation_id, role, content, tokens, sources, metadata, created_at
        FROM sys_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        "#,
    )
    .bind(id)
    .fetch_all(state.pool.inner())
    .await?;

    Ok(Json(serde_json::json!({
        "id": id,
        "project_id": project_id,
        "collection_id": collection_id,
        "collection_name": collection_name,
        "user_id": user_id,
        "title": title,
        "summary": summary,
        "message_count": message_count,
        "total_tokens": total_tokens,
        "metadata": metadata,
        "created_at": created_at,
        "updated_at": updated_at,
        "messages": messages
    })))
}

/// Create a new conversation
pub async fn create_conversation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<CreateConversationRequest>,
) -> Result<Json<Conversation>> {
    let project_id = auth.require_project()?;

    // Verify collection exists and belongs to project
    let _: (Uuid,) = sqlx::query_as("SELECT id FROM sys_collections WHERE id = $1 AND project_id = $2")
        .bind(req.collection_id)
        .bind(project_id)
        .fetch_optional(state.pool.inner())
        .await?
        .ok_or_else(|| Error::NotFound("Collection not found".to_string()))?;

    let conversation: Conversation = sqlx::query_as(
        r#"
        INSERT INTO sys_conversations (project_id, collection_id, user_id, title)
        VALUES ($1, $2, $3, $4)
        RETURNING id, project_id, collection_id, user_id, title, summary, message_count, total_tokens, metadata, created_at, updated_at
        "#,
    )
    .bind(project_id)
    .bind(req.collection_id)
    .bind(auth.user_id)
    .bind(req.title)
    .fetch_one(state.pool.inner())
    .await?;

    Ok(Json(conversation))
}

/// Update a conversation
pub async fn update_conversation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateConversationRequest>,
) -> Result<Json<Conversation>> {
    let project_id = auth.require_project()?;

    let conversation: Conversation = sqlx::query_as(
        r#"
        UPDATE sys_conversations
        SET title = COALESCE($3, title),
            summary = COALESCE($4, summary),
            updated_at = NOW()
        WHERE id = $1 AND project_id = $2
        RETURNING id, project_id, collection_id, user_id, title, summary, message_count, total_tokens, metadata, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(project_id)
    .bind(req.title)
    .bind(req.summary)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Conversation not found".to_string()))?;

    Ok(Json(conversation))
}

/// Delete a conversation
pub async fn delete_conversation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    let result = sqlx::query("DELETE FROM sys_conversations WHERE id = $1 AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .execute(state.pool.inner())
        .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("Conversation not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ============================================================================
// Message Helpers (used by rag.rs)
// ============================================================================

/// Get or create a conversation for a chat session
pub async fn get_or_create_conversation(
    pool: &crate::db::DbPool,
    project_id: Uuid,
    collection_id: Uuid,
    user_id: Option<Uuid>,
    conversation_id: Option<String>,
) -> Result<Uuid> {
    // If conversation_id is provided, try to use it
    if let Some(conv_id_str) = conversation_id {
        if let Ok(conv_id) = Uuid::parse_str(&conv_id_str) {
            // Verify the conversation exists
            let exists: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM sys_conversations WHERE id = $1 AND project_id = $2"
            )
            .bind(conv_id)
            .bind(project_id)
            .fetch_optional(pool.inner())
            .await?;

            if exists.is_some() {
                return Ok(conv_id);
            }
        }
    }

    // Create a new conversation
    let (id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO sys_conversations (project_id, collection_id, user_id)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(collection_id)
    .bind(user_id)
    .fetch_one(pool.inner())
    .await?;

    Ok(id)
}

/// Save a message to a conversation
pub async fn save_message(
    pool: &crate::db::DbPool,
    conversation_id: Uuid,
    role: &str,
    content: &str,
    tokens: i32,
    sources: Option<serde_json::Value>,
) -> Result<Uuid> {
    let (id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO sys_messages (conversation_id, role, content, tokens, sources)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        "#,
    )
    .bind(conversation_id)
    .bind(role)
    .bind(content)
    .bind(tokens)
    .bind(sources)
    .fetch_one(pool.inner())
    .await?;

    // Update conversation title if this is the first user message
    sqlx::query(
        r#"
        UPDATE sys_conversations
        SET title = COALESCE(title, LEFT($2, 100) || CASE WHEN LENGTH($2) > 100 THEN '...' ELSE '' END)
        WHERE id = $1 AND title IS NULL
        "#,
    )
    .bind(conversation_id)
    .bind(content)
    .execute(pool.inner())
    .await?;

    Ok(id)
}
