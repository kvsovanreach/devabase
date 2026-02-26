use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Prompt {
    pub id: Uuid,
    pub name: String,
    pub version: i32,
    pub content: String,
    pub description: Option<String>,
    pub variables: Vec<String>,
    pub metadata: Option<serde_json::Value>,
    pub is_active: bool,
    pub project_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePrompt {
    pub name: String,
    pub content: String,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePrompt {
    pub content: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RenderPrompt {
    pub variables: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct PromptResponse {
    pub id: Uuid,
    pub name: String,
    pub version: i32,
    pub content: String,
    pub description: Option<String>,
    pub variables: Vec<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<Prompt> for PromptResponse {
    fn from(prompt: Prompt) -> Self {
        Self {
            id: prompt.id,
            name: prompt.name,
            version: prompt.version,
            content: prompt.content,
            description: prompt.description,
            variables: prompt.variables,
            is_active: prompt.is_active,
            created_at: prompt.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RenderedPrompt {
    pub name: String,
    pub version: i32,
    pub content: String,
    pub token_count: i32,
}
