use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Chunk {
    pub id: Uuid,
    pub document_id: Uuid,
    pub collection_id: Uuid,
    pub content: String,
    pub chunk_index: i32,
    pub start_offset: i32,
    pub end_offset: i32,
    pub token_count: i32,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct ChunkWithVector {
    pub id: Uuid,
    pub document_id: Uuid,
    pub collection_id: Uuid,
    pub content: String,
    pub chunk_index: i32,
    pub metadata: Option<serde_json::Value>,
    // Vector is stored separately in the vectors table
}

#[derive(Debug, Clone, Serialize)]
pub struct ChunkResponse {
    pub id: Uuid,
    pub document_id: Uuid,
    pub content: String,
    pub chunk_index: i32,
    pub token_count: i32,
    pub metadata: Option<serde_json::Value>,
}

impl From<Chunk> for ChunkResponse {
    fn from(chunk: Chunk) -> Self {
        Self {
            id: chunk.id,
            document_id: chunk.document_id,
            content: chunk.content,
            chunk_index: chunk.chunk_index,
            token_count: chunk.token_count,
            metadata: chunk.metadata,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub id: Uuid,
    pub document_id: Uuid,
    pub content: String,
    pub score: f64,
    pub metadata: Option<serde_json::Value>,
}
