use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Collection {
    pub id: Uuid,
    pub name: String,
    pub dimensions: i32,
    pub metric: String,
    pub index_type: String,
    pub metadata: Option<serde_json::Value>,
    pub vector_count: i64,
    pub document_count: i64,
    pub project_id: Option<Uuid>,
    pub rag_enabled: bool,
    pub rag_config: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RagConfig {
    pub enabled: bool,
    pub llm_provider_id: String,
    pub model: String,
    pub system_prompt: String,
    pub temperature: f32,
    pub max_tokens: i32,
    pub top_k: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateRagConfig {
    pub enabled: Option<bool>,
    pub llm_provider_id: Option<String>,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_k: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCollection {
    pub name: String,
    pub dimensions: Option<i32>,
    pub metric: Option<String>,
    pub index_type: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCollection {
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CollectionStats {
    pub name: String,
    pub dimensions: i32,
    pub metric: String,
    pub vector_count: i64,
    pub index_type: String,
    pub storage_bytes: i64,
}
