use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

use crate::server::AppState;

/// Legacy middleware-based authentication.
/// Note: This is kept for reference but we now use the `AuthContext` extractor
/// which provides more flexibility (per-endpoint auth, optional auth, etc.)
/// This function can be removed in a future cleanup if not needed.
#[allow(dead_code)]
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Skip auth for health endpoints
    let path = request.uri().path();
    if path == "/v1/health" || path == "/v1/ready" {
        return Ok(next.run(request).await);
    }

    // Get API key from header
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    let api_key = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            // Try X-API-Key header
            request
                .headers()
                .get("X-API-Key")
                .and_then(|h| h.to_str().ok())
                .ok_or(StatusCode::UNAUTHORIZED)?
        }
    };

    // Validate API key
    crate::auth::validate_api_key(&state.pool, api_key)
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    Ok(next.run(request).await)
}
