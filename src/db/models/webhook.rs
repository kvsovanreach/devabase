use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Webhook status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "webhook_status", rename_all = "lowercase")]
pub enum WebhookStatus {
    Active,
    Paused,
    Disabled,
}

impl Default for WebhookStatus {
    fn default() -> Self {
        Self::Active
    }
}

/// Webhook configuration
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Webhook {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing)]
    pub secret: String,
    pub events: Vec<String>,
    pub status: WebhookStatus,
    pub headers: Option<serde_json::Value>,
    pub retry_count: i32,
    pub timeout_ms: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Response format for webhook (hides secret)
#[derive(Debug, Clone, Serialize)]
pub struct WebhookResponse {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub url: String,
    pub events: Vec<String>,
    pub status: WebhookStatus,
    pub headers: Option<serde_json::Value>,
    pub retry_count: i32,
    pub timeout_ms: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Webhook> for WebhookResponse {
    fn from(w: Webhook) -> Self {
        Self {
            id: w.id,
            project_id: w.project_id,
            name: w.name,
            url: w.url,
            events: w.events,
            status: w.status,
            headers: w.headers,
            retry_count: w.retry_count,
            timeout_ms: w.timeout_ms,
            created_at: w.created_at,
            updated_at: w.updated_at,
        }
    }
}

/// Create webhook request
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWebhook {
    pub name: String,
    pub url: String,
    pub events: Vec<String>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(default = "default_retry_count")]
    pub retry_count: i32,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: i32,
}

fn default_retry_count() -> i32 {
    3
}

fn default_timeout_ms() -> i32 {
    30000
}

/// Update webhook request
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWebhook {
    pub name: Option<String>,
    pub url: Option<String>,
    pub events: Option<Vec<String>>,
    pub status: Option<WebhookStatus>,
    pub headers: Option<serde_json::Value>,
    pub retry_count: Option<i32>,
    pub timeout_ms: Option<i32>,
}

/// Webhook delivery log
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct WebhookLog {
    pub id: Uuid,
    pub webhook_id: Uuid,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub request_headers: Option<serde_json::Value>,
    pub response_status: Option<i32>,
    pub response_body: Option<String>,
    pub response_headers: Option<serde_json::Value>,
    pub latency_ms: Option<i32>,
    pub attempt: i32,
    pub success: bool,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Webhook log response (for API)
#[derive(Debug, Clone, Serialize)]
pub struct WebhookLogResponse {
    pub id: Uuid,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub response_status: Option<i32>,
    pub latency_ms: Option<i32>,
    pub attempt: i32,
    pub success: bool,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<WebhookLog> for WebhookLogResponse {
    fn from(log: WebhookLog) -> Self {
        Self {
            id: log.id,
            event_type: log.event_type,
            payload: log.payload,
            response_status: log.response_status,
            latency_ms: log.latency_ms,
            attempt: log.attempt,
            success: log.success,
            error_message: log.error_message,
            created_at: log.created_at,
        }
    }
}

/// Supported webhook event types
pub const WEBHOOK_EVENTS: &[&str] = &[
    "document.uploaded",
    "document.processing",
    "document.processed",
    "document.failed",
    "document.deleted",
    "collection.created",
    "collection.deleted",
    "vector.upserted",
    "vector.deleted",
    "table.created",
    "table.deleted",
    "table.row.created",
    "table.row.updated",
    "table.row.deleted",
];

/// Validate that all events in the list are supported
pub fn validate_events(events: &[String]) -> Result<(), String> {
    for event in events {
        if !WEBHOOK_EVENTS.contains(&event.as_str()) {
            return Err(format!(
                "Invalid event type: '{}'. Supported events: {}",
                event,
                WEBHOOK_EVENTS.join(", ")
            ));
        }
    }
    Ok(())
}
