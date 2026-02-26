use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UsageLog {
    pub id: Uuid,
    pub api_key_id: Option<Uuid>,
    pub endpoint: String,
    pub method: String,
    pub status_code: i16,
    pub request_tokens: Option<i32>,
    pub response_tokens: Option<i32>,
    pub latency_ms: i32,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UsageSummary {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub avg_latency_ms: f64,
    pub error_count: i64,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UsageByEndpoint {
    pub endpoint: String,
    pub request_count: i64,
    pub total_tokens: i64,
    pub avg_latency_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageByKey {
    pub api_key_id: Uuid,
    pub key_name: String,
    pub request_count: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsageQuery {
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub api_key_id: Option<Uuid>,
    pub endpoint: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
