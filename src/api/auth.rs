use axum::{extract::State, Json};
use std::sync::Arc;

use crate::auth::{self, AuthContext};
use crate::db::models::{
    AuthResponse, CreateUser, LoginUser, RefreshTokenRequest, UpdateUser, UserResponse,
};
use crate::server::AppState;
use crate::Result;

/// POST /v1/auth/register - Register a new user
pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateUser>,
) -> Result<Json<AuthResponse>> {
    let jwt_secret = state
        .config
        .auth
        .jwt_secret
        .as_ref()
        .ok_or_else(|| crate::Error::Config("JWT secret not configured".to_string()))?;

    let response = auth::register(
        &state.pool,
        input,
        jwt_secret,
        state.config.auth.token_expiry_hours,
    )
    .await?;

    Ok(Json(response))
}

/// POST /v1/auth/login - Login with email/password
pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(input): Json<LoginUser>,
) -> Result<Json<AuthResponse>> {
    let jwt_secret = state
        .config
        .auth
        .jwt_secret
        .as_ref()
        .ok_or_else(|| crate::Error::Config("JWT secret not configured".to_string()))?;

    let response = auth::login(
        &state.pool,
        input,
        jwt_secret,
        state.config.auth.token_expiry_hours,
    )
    .await?;

    Ok(Json(response))
}

/// POST /v1/auth/logout - Logout (revoke session)
pub async fn logout(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<serde_json::Value>> {
    if let Some(user_id) = auth.user_id {
        auth::logout(&state.pool, user_id).await?;
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

/// POST /v1/auth/refresh - Refresh access token
pub async fn refresh(
    State(state): State<Arc<AppState>>,
    Json(input): Json<RefreshTokenRequest>,
) -> Result<Json<AuthResponse>> {
    let jwt_secret = state
        .config
        .auth
        .jwt_secret
        .as_ref()
        .ok_or_else(|| crate::Error::Config("JWT secret not configured".to_string()))?;

    let response = auth::refresh_token(
        &state.pool,
        &input.refresh_token,
        jwt_secret,
        state.config.auth.token_expiry_hours,
    )
    .await?;

    Ok(Json(response))
}

/// GET /v1/auth/me - Get current user
pub async fn me(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<UserResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| crate::Error::Auth("User authentication required".to_string()))?;

    let user = auth::get_user(&state.pool, user_id).await?;

    Ok(Json(user))
}

/// PATCH /v1/auth/me - Update current user
pub async fn update_me(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<UpdateUser>,
) -> Result<Json<UserResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| crate::Error::Auth("User authentication required".to_string()))?;

    let user = auth::update_user(&state.pool, user_id, input).await?;

    Ok(Json(user))
}
