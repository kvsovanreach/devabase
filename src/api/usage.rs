use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::auth::AuthContext;
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
    pub method: String,
    pub endpoint: String,
    pub request_count: i64,
    pub total_tokens: i64,
    pub avg_latency_ms: f64,
}

#[derive(Debug, Serialize)]
pub struct UsageResponse {
    pub summary: UsageSummary,
    pub by_endpoint: Vec<UsageByEndpoint>,
    pub total_endpoints: i64,
    pub page: i64,
    pub per_page: i64,
}

pub async fn get_usage(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<UsageQuery>,
) -> Result<Json<UsageResponse>> {
    let project_id = auth.require_project()?;
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
        WHERE project_id = $1 AND created_at BETWEEN $2 AND $3
        "#,
    )
    .bind(project_id)
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

    let per_page = query.limit.unwrap_or(10).min(100);
    let page = (query.offset.unwrap_or(0) / per_page).max(0) + 1;
    let offset = query.offset.unwrap_or(0).max(0);

    // Get total distinct endpoints and paginated endpoint data in parallel
    let pool = state.pool.inner();

    // Normalize endpoints by replacing UUIDs with :id so that
    // e.g. /v1/tables/notes/rows/abc-123 and /v1/tables/notes/rows/def-456
    // are grouped together as /v1/tables/notes/rows/:id
    let normalize_expr = "regexp_replace(endpoint, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi')";

    let count_sql = format!(
        r#"
        SELECT COUNT(*)::bigint FROM (
            SELECT 1 FROM sys_usage_logs
            WHERE project_id = $1 AND created_at BETWEEN $2 AND $3
            GROUP BY method, {normalize_expr}
        ) sub
        "#
    );
    let rows_sql = format!(
        r#"
        SELECT
            method,
            {normalize_expr} as endpoint,
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(request_tokens, 0) + COALESCE(response_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(AVG(latency_ms), 0)::float8 as avg_latency_ms
        FROM sys_usage_logs
        WHERE project_id = $1 AND created_at BETWEEN $2 AND $3
        GROUP BY method, {normalize_expr}
        ORDER BY COUNT(*) DESC
        LIMIT $4 OFFSET $5
        "#
    );

    let count_fut = sqlx::query_scalar::<_, i64>(&count_sql)
        .bind(project_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(pool);

    let rows_fut = sqlx::query_as::<_, (String, String, i64, i64, f64)>(&rows_sql)
        .bind(project_id)
        .bind(start_date)
        .bind(end_date)
        .bind(per_page)
        .bind(offset)
        .fetch_all(pool);

    let (total_endpoints, endpoint_rows) = tokio::try_join!(count_fut, rows_fut)?;

    let by_endpoint: Vec<UsageByEndpoint> = endpoint_rows
        .into_iter()
        .map(|(method, endpoint, request_count, total_tokens, avg_latency_ms)| UsageByEndpoint {
            method,
            endpoint,
            request_count,
            total_tokens,
            avg_latency_ms,
        })
        .collect();

    Ok(Json(UsageResponse {
        summary,
        by_endpoint,
        total_endpoints,
        page,
        per_page,
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
    auth: AuthContext,
    Query(query): Query<ExportQuery>,
) -> Result<Json<Vec<serde_json::Value>>> {
    let project_id = auth.require_project()?;
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
        WHERE project_id = $1 AND created_at BETWEEN $2 AND $3
        ORDER BY created_at DESC
        LIMIT 10000
        "#,
    )
    .bind(project_id)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(state.pool.inner())
    .await
    .unwrap_or_default();

    Ok(Json(logs))
}
