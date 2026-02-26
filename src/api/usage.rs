use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::models::UsageQuery;
use crate::server::AppState;
use crate::Result;

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub avg_latency_ms: f64,
    pub error_count: i64,
    pub period_start: chrono::DateTime<chrono::Utc>,
    pub period_end: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct UsageByEndpoint {
    pub endpoint: String,
    pub request_count: i64,
    pub total_tokens: i64,
    pub avg_latency_ms: f64,
}

#[derive(Debug, Serialize)]
pub struct UsageResponse {
    pub summary: UsageSummary,
    pub by_endpoint: Vec<UsageByEndpoint>,
}

pub async fn get_usage(
    State(state): State<Arc<AppState>>,
    Query(query): Query<UsageQuery>,
) -> Result<Json<UsageResponse>> {
    let start_date = query
        .start_date
        .unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::days(30));
    let end_date = query.end_date.unwrap_or_else(chrono::Utc::now);

    // Get summary using tuple query
    let summary_row: Option<(i64, i64, f64, i64)> = sqlx::query_as(
        r#"
        SELECT
            COUNT(*)::bigint as total_requests,
            COALESCE(SUM(COALESCE(request_tokens, 0) + COALESCE(response_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(AVG(latency_ms), 0)::float8 as avg_latency_ms,
            COUNT(*) FILTER (WHERE status_code >= 400)::bigint as error_count
        FROM sys_usage_logs
        WHERE created_at BETWEEN $1 AND $2
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_optional(state.pool.inner())
    .await?;

    let summary = match summary_row {
        Some((total_requests, total_tokens, avg_latency_ms, error_count)) => UsageSummary {
            total_requests,
            total_tokens,
            avg_latency_ms,
            error_count,
            period_start: start_date,
            period_end: end_date,
        },
        None => UsageSummary {
            total_requests: 0,
            total_tokens: 0,
            avg_latency_ms: 0.0,
            error_count: 0,
            period_start: start_date,
            period_end: end_date,
        },
    };

    // Get by endpoint using tuple query
    let endpoint_rows: Vec<(String, i64, i64, f64)> = sqlx::query_as(
        r#"
        SELECT
            endpoint,
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(request_tokens, 0) + COALESCE(response_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(AVG(latency_ms), 0)::float8 as avg_latency_ms
        FROM sys_usage_logs
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY endpoint
        ORDER BY COUNT(*) DESC
        LIMIT 20
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(state.pool.inner())
    .await
    .unwrap_or_default();

    let by_endpoint: Vec<UsageByEndpoint> = endpoint_rows
        .into_iter()
        .map(|(endpoint, request_count, total_tokens, avg_latency_ms)| UsageByEndpoint {
            endpoint,
            request_count,
            total_tokens,
            avg_latency_ms,
        })
        .collect();

    Ok(Json(UsageResponse {
        summary,
        by_endpoint,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub start_date: Option<chrono::DateTime<chrono::Utc>>,
    pub end_date: Option<chrono::DateTime<chrono::Utc>>,
    pub format: Option<String>,
}

pub async fn export_usage(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
) -> Result<Json<Vec<serde_json::Value>>> {
    let start_date = query
        .start_date
        .unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::days(30));
    let end_date = query.end_date.unwrap_or_else(chrono::Utc::now);

    let logs: Vec<serde_json::Value> = sqlx::query_scalar(
        r#"
        SELECT jsonb_build_object(
            'id', id,
            'endpoint', endpoint,
            'method', method,
            'status_code', status_code,
            'request_tokens', request_tokens,
            'response_tokens', response_tokens,
            'latency_ms', latency_ms,
            'created_at', created_at
        )
        FROM sys_usage_logs
        WHERE created_at BETWEEN $1 AND $2
        ORDER BY created_at DESC
        LIMIT 10000
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(state.pool.inner())
    .await
    .unwrap_or_default();

    Ok(Json(logs))
}
