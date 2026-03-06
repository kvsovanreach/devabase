use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "document_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum DocumentStatus {
    Uploaded,
    Pending,
    Processing,
    Processed,
    Failed,
}

impl std::fmt::Display for DocumentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DocumentStatus::Uploaded => write!(f, "uploaded"),
            DocumentStatus::Pending => write!(f, "pending"),
            DocumentStatus::Processing => write!(f, "processing"),
            DocumentStatus::Processed => write!(f, "processed"),
            DocumentStatus::Failed => write!(f, "failed"),
        }
    }
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Document {
    pub id: Uuid,
    pub collection_id: Uuid,
    pub filename: String,
    pub content_type: String,
    pub file_path: Option<String>,
    pub file_size: i64,
    pub status: DocumentStatus,
    pub error_message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub chunk_count: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateDocument {
    pub collection_id: Uuid,
    pub filename: String,
    pub content_type: String,
    pub file_path: Option<String>,
    pub file_size: i64,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocumentResponse {
    pub id: Uuid,
    pub collection_id: Uuid,
    pub filename: String,
    pub content_type: String,
    pub file_size: i64,
    pub status: DocumentStatus,
    pub error_message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub chunk_count: i32,
    pub created_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
}

impl From<Document> for DocumentResponse {
    fn from(doc: Document) -> Self {
        Self {
            id: doc.id,
            collection_id: doc.collection_id,
            filename: doc.filename,
            content_type: doc.content_type,
            file_size: doc.file_size,
            status: doc.status,
            error_message: doc.error_message,
            metadata: doc.metadata,
            chunk_count: doc.chunk_count,
            created_at: doc.created_at,
            processed_at: doc.processed_at,
        }
    }
}
