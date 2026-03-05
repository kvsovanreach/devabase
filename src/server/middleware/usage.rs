use axum::{
    body::Body,
    extract::State,
    http::{header, Request, Response},
    middleware::Next,
};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

use crate::server::AppState;

/// Log usage with token counts (call this from handlers that track tokens)
pub async fn log_usage_with_tokens(
    pool: &PgPool,
    project_id: Option<Uuid>,
    endpoint: &str,
    method: &str,
    status_code: i16,
    latency_ms: i32,
    request_tokens: Option<i32>,
    response_tokens: Option<i32>,
) {
    if let Err(e) = sqlx::query(
        r#"
        INSERT INTO sys_usage_logs (project_id, endpoint, method, status_code, latency_ms, request_tokens, response_tokens)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(project_id)
    .bind(endpoint)
    .bind(method)
    .bind(status_code)
    .bind(latency_ms)
    .bind(request_tokens)
    .bind(response_tokens)
    .execute(pool)
    .await
    {
        tracing::error!("Failed to log usage with tokens: {} for endpoint {}", e, endpoint);
    }
}

/// Middleware to log API usage to sys_usage_logs table.
/// Only logs requests authenticated via API key (not session/cookie auth).
pub async fn log_usage(
    State(state): State<Arc<AppState>>,
    request: Request<Body>,
    next: Next,
) -> Response<Body> {
    let start = Instant::now();
    let method = request.method().to_string();
    let path = request.uri().path().to_string();

    // Check if request is using API key authentication
    let has_api_key = has_api_key_auth(&request);

    // Skip logging if not using API key or if it's a system endpoint
    if !has_api_key || should_skip_logging(&path) {
        return next.run(request).await;
    }

    // Extract project_id: try header first (sync), then API key cache (async)
    let project_id = resolve_project_id_from_header(&request)
        .or_else(|| extract_api_key(&request));
    // If we got a raw API key string (not a UUID), resolve via cache
    let project_id = match project_id {
        Some(ProjectIdOrKey::ProjectId(id)) => Some(id),
        Some(ProjectIdOrKey::ApiKey(key)) => state.api_key_cache.get_project_id(&key).await,
        None => None,
    };

    // Run the request
    let response = next.run(request).await;

    let latency_ms = start.elapsed().as_millis() as i32;
    let status_code = response.status().as_u16() as i16;

    // Log asynchronously to not block the response
    let pool = state.pool.clone();
    tokio::spawn(async move {
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO sys_usage_logs (project_id, endpoint, method, status_code, latency_ms)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(project_id)
        .bind(&path)
        .bind(&method)
        .bind(status_code)
        .bind(latency_ms)
        .execute(pool.inner())
        .await
        {
            tracing::error!("Failed to log usage: {} for endpoint {}", e, path);
        }
    });

    response
}

/// Check if the request is authenticated via API key (not session cookie)
fn has_api_key_auth(request: &Request<Body>) -> bool {
    // Check X-API-Key header
    if request.headers().contains_key("x-api-key") {
        return true;
    }

    // Check Authorization header for Bearer token that looks like an API key
    // API keys typically start with "deva_" or similar prefix
    // Session tokens are JWTs which start with "eyJ"
    if let Some(auth) = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            // If it doesn't look like a JWT, it's probably an API key
            return !token.starts_with("eyJ");
        }
    }

    false
}

enum ProjectIdOrKey {
    ProjectId(Uuid),
    ApiKey(String),
}

/// Try to get project_id directly from the X-Project-ID header
fn resolve_project_id_from_header(request: &Request<Body>) -> Option<ProjectIdOrKey> {
    request
        .headers()
        .get("x-project-id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .map(ProjectIdOrKey::ProjectId)
}

/// Extract the raw API key string from request headers
fn extract_api_key(request: &Request<Body>) -> Option<ProjectIdOrKey> {
    // Check X-API-Key header
    if let Some(key) = request.headers().get("x-api-key").and_then(|h| h.to_str().ok()) {
        return Some(ProjectIdOrKey::ApiKey(key.to_string()));
    }

    // Check Authorization: Bearer <key> (non-JWT tokens)
    if let Some(auth) = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            if !token.starts_with("eyJ") {
                return Some(ProjectIdOrKey::ApiKey(token.to_string()));
            }
        }
    }

    None
}

/// Determine if we should skip logging for this path
fn should_skip_logging(path: &str) -> bool {
    // Skip health checks and static files
    path == "/health"
        || path == "/v1/health"
        || path == "/ready"
        || path == "/v1/ready"
        || path == "/metrics"
        || path.starts_with("/static/")
        || path.starts_with("/assets/")
        || path == "/favicon.ico"
        // Skip admin/analytics endpoints
        || path.contains("/admin/")
        || path.contains("/usage")
        // Skip WebSocket connections
        || path.contains("/ws")
        || path.contains("/realtime")
}
