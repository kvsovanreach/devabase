//! Application User Authentication API
//!
//! Provides authentication endpoints for end-users of applications built with Devabase.
//! Developers can use these endpoints to implement auth in their apps without building
//! their own auth system.

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap},
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::db::DbPool;
use crate::server::AppState;
use crate::{Error, Result};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AppUser {
    pub id: Uuid,
    pub project_id: Uuid,
    pub email: String,
    pub email_verified: bool,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub phone: Option<String>,
    pub status: String,
    pub metadata: serde_json::Value,
    pub last_login_at: Option<chrono::DateTime<chrono::Utc>>,
    pub failed_login_attempts: i32,
    pub locked_until: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct AppUserResponse {
    pub id: String,
    pub email: String,
    pub email_verified: bool,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub phone: Option<String>,
    pub status: String,
    pub metadata: serde_json::Value,
    pub created_at: String,
}

impl From<AppUser> for AppUserResponse {
    fn from(user: AppUser) -> Self {
        Self {
            id: user.id.to_string(),
            email: user.email,
            email_verified: user.email_verified,
            name: user.name,
            avatar_url: user.avatar_url,
            phone: user.phone,
            status: user.status,
            metadata: user.metadata,
            created_at: user.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

#[derive(Debug, Serialize)]
pub struct AppAuthResponse {
    pub user: AppUserResponse,
    #[serde(flatten)]
    pub tokens: AuthTokens,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub name: Option<String>,
    pub phone: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub phone: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

#[derive(Debug, sqlx::FromRow)]
struct AppAuthSettings {
    allow_registration: bool,
    require_email_verification: bool,
    min_password_length: i32,
    require_uppercase: bool,
    require_lowercase: bool,
    require_numbers: bool,
    require_special_chars: bool,
    access_token_ttl_seconds: i32,
    refresh_token_ttl_seconds: i32,
    max_sessions_per_user: i32,
    max_failed_attempts: i32,
    lockout_duration_seconds: i32,
}

impl Default for AppAuthSettings {
    fn default() -> Self {
        Self {
            allow_registration: true,
            require_email_verification: false,
            min_password_length: 8,
            require_uppercase: false,
            require_lowercase: false,
            require_numbers: false,
            require_special_chars: false,
            access_token_ttl_seconds: 3600,
            refresh_token_ttl_seconds: 2592000,
            max_sessions_per_user: 10,
            max_failed_attempts: 5,
            lockout_duration_seconds: 900,
        }
    }
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /v1/auth/app/register - Register a new application user
pub async fn register(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
    Json(input): Json<RegisterRequest>,
) -> Result<Json<AppAuthResponse>> {
    let project_id = auth.require_project()?;

    // Get auth settings
    let settings = get_auth_settings(&state.pool, project_id).await?;

    if !settings.allow_registration {
        return Err(Error::Forbidden("Registration is disabled".to_string()));
    }

    // Validate email
    if !is_valid_email(&input.email) {
        return Err(Error::Validation("Invalid email format".to_string()));
    }

    // Validate password
    validate_password(&input.password, &settings)?;

    // Check if email already exists
    let existing: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM sys_app_users WHERE project_id = $1 AND LOWER(email) = LOWER($2)"
    )
    .bind(project_id)
    .bind(&input.email)
    .fetch_optional(state.pool.inner())
    .await?;

    if existing.is_some() {
        return Err(Error::Validation("Email already registered".to_string()));
    }

    // Hash password
    let password_hash = hash_password(&input.password)?;

    // Generate email verification token if required
    let (email_token, status) = if settings.require_email_verification {
        (Some(generate_token()), "pending")
    } else {
        (None, "active")
    };

    // Create user
    let user: AppUser = sqlx::query_as(
        r#"
        INSERT INTO sys_app_users (
            project_id, email, password_hash, name, phone, status,
            metadata, email_verification_token, email_verification_sent_at
        )
        VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        "#
    )
    .bind(project_id)
    .bind(&input.email)
    .bind(&password_hash)
    .bind(&input.name)
    .bind(&input.phone)
    .bind(status)
    .bind(input.metadata.unwrap_or(serde_json::json!({})))
    .bind(&email_token)
    .bind(if email_token.is_some() { Some(Utc::now()) } else { None })
    .fetch_one(state.pool.inner())
    .await?;

    // Generate tokens
    let tokens = generate_auth_tokens(
        &state,
        &user,
        &settings,
        get_client_info(&headers),
    ).await?;

    // Emit registration event
    let event = crate::events::Event::new(
        crate::events::EventType::AppUserRegistered,
        project_id,
        &user.id.to_string(),
        serde_json::json!({
            "user_id": user.id.to_string(),
            "email": user.email,
        }),
    );
    let _ = state.events.publish(event);

    // Send verification email if required
    if settings.require_email_verification {
        if let Some(token) = &email_token {
            // Log verification token for now - email infrastructure not yet implemented
            // In production, this should send an actual email via SMTP/SendGrid/etc.
            tracing::warn!(
                user_id = %user.id,
                email = %user.email,
                "Email verification required but email sending not configured. \
                 Verification token generated - implement email provider to send verification emails."
            );
            tracing::debug!(
                user_id = %user.id,
                verification_token = %token,
                "Email verification token (for testing/development)"
            );
        }
    }

    Ok(Json(AppAuthResponse {
        user: user.into(),
        tokens,
    }))
}

/// POST /v1/auth/app/login - Login an application user
pub async fn login(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
    Json(input): Json<LoginRequest>,
) -> Result<Json<AppAuthResponse>> {
    let project_id = auth.require_project()?;

    // Get auth settings
    let settings = get_auth_settings(&state.pool, project_id).await?;

    // Find user
    let user: Option<AppUser> = sqlx::query_as(
        "SELECT * FROM sys_app_users WHERE project_id = $1 AND LOWER(email) = LOWER($2)"
    )
    .bind(project_id)
    .bind(&input.email)
    .fetch_optional(state.pool.inner())
    .await?;

    let user = match user {
        Some(u) => u,
        None => {
            // Don't reveal if email exists
            return Err(Error::Auth("Invalid email or password".to_string()));
        }
    };

    // Check if account is locked
    if let Some(locked_until) = user.locked_until {
        if locked_until > Utc::now() {
            return Err(Error::Auth(format!(
                "Account locked. Try again after {}",
                locked_until.format("%Y-%m-%d %H:%M:%S UTC")
            )));
        }
    }

    // Check status
    if user.status == "suspended" {
        return Err(Error::Auth("Account suspended".to_string()));
    }
    if user.status == "deleted" {
        return Err(Error::Auth("Account not found".to_string()));
    }

    // Get password hash
    let password_hash: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT password_hash FROM sys_app_users WHERE id = $1"
    )
    .bind(user.id)
    .fetch_optional(state.pool.inner())
    .await?;

    let password_hash = password_hash
        .and_then(|p| p.0)
        .ok_or_else(|| Error::Auth("Password login not available for this account".to_string()))?;

    // Verify password
    if !verify_password(&input.password, &password_hash) {
        // Increment failed attempts
        let failed_attempts = user.failed_login_attempts + 1;
        let locked_until = if failed_attempts >= settings.max_failed_attempts {
            Some(Utc::now() + Duration::seconds(settings.lockout_duration_seconds as i64))
        } else {
            None
        };

        sqlx::query(
            "UPDATE sys_app_users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3"
        )
        .bind(failed_attempts)
        .bind(locked_until)
        .bind(user.id)
        .execute(state.pool.inner())
        .await?;

        return Err(Error::Auth("Invalid email or password".to_string()));
    }

    // Reset failed attempts and update last login
    let client_info = get_client_info(&headers);
    sqlx::query(
        r#"
        UPDATE sys_app_users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login_at = NOW(),
            last_login_ip = $2
        WHERE id = $1
        "#
    )
    .bind(user.id)
    .bind(&client_info.ip_address)
    .execute(state.pool.inner())
    .await?;

    // Generate tokens
    let tokens = generate_auth_tokens(&state, &user, &settings, client_info).await?;

    // Emit login event
    let event = crate::events::Event::new(
        crate::events::EventType::AppUserLoggedIn,
        project_id,
        &user.id.to_string(),
        serde_json::json!({
            "user_id": user.id.to_string(),
            "email": user.email,
        }),
    );
    let _ = state.events.publish(event);

    // Refresh user data
    let user: AppUser = sqlx::query_as("SELECT * FROM sys_app_users WHERE id = $1")
        .bind(user.id)
        .fetch_one(state.pool.inner())
        .await?;

    Ok(Json(AppAuthResponse {
        user: user.into(),
        tokens,
    }))
}

/// POST /v1/auth/app/refresh - Refresh access token
pub async fn refresh_token(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<RefreshTokenRequest>,
) -> Result<Json<AuthTokens>> {
    let project_id = auth.require_project()?;

    // Hash the refresh token for lookup
    let token_hash = hash_token(&input.refresh_token);

    // Find the session
    let session: Option<(Uuid, Uuid, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        r#"
        SELECT id, user_id, expires_at
        FROM sys_app_sessions
        WHERE project_id = $1 AND refresh_token_hash = $2 AND NOT revoked
        "#
    )
    .bind(project_id)
    .bind(&token_hash)
    .fetch_optional(state.pool.inner())
    .await?;

    let (session_id, user_id, expires_at) = session
        .ok_or_else(|| Error::Auth("Invalid refresh token".to_string()))?;

    // Check expiration
    if expires_at < Utc::now() {
        // Revoke expired session
        sqlx::query("UPDATE sys_app_sessions SET revoked = true, revoked_at = NOW() WHERE id = $1")
            .bind(session_id)
            .execute(state.pool.inner())
            .await?;
        return Err(Error::Auth("Refresh token expired".to_string()));
    }

    // Get user
    let user: AppUser = sqlx::query_as(
        "SELECT * FROM sys_app_users WHERE id = $1 AND status = 'active'"
    )
    .bind(user_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::Auth("User not found or inactive".to_string()))?;

    // Get settings
    let settings = get_auth_settings(&state.pool, project_id).await?;

    // Generate new access token (keep same refresh token)
    let access_token = generate_access_token(&state, &user, &settings)?;

    Ok(Json(AuthTokens {
        access_token,
        refresh_token: input.refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: settings.access_token_ttl_seconds as i64,
    }))
}

/// POST /v1/auth/app/logout - Logout (revoke session)
pub async fn logout(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    // Get token from Authorization header
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or_else(|| Error::Auth("Missing authorization token".to_string()))?;

    // Decode token to get session info
    if let Ok(claims) = decode_app_token(&state, token) {
        if let Some(session_id) = claims.session_id {
            // Revoke the session
            sqlx::query(
                "UPDATE sys_app_sessions SET revoked = true, revoked_at = NOW() WHERE id = $1 AND project_id = $2"
            )
            .bind(session_id)
            .bind(project_id)
            .execute(state.pool.inner())
            .await?;
        }
    }

    Ok(Json(serde_json::json!({ "logged_out": true })))
}

/// GET /v1/auth/app/me - Get current user
pub async fn get_me(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
) -> Result<Json<AppUserResponse>> {
    let project_id = auth.require_project()?;

    let user = get_user_from_token(&state, project_id, &headers).await?;

    Ok(Json(user.into()))
}

/// PATCH /v1/auth/app/me - Update current user profile
pub async fn update_me(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
    Json(input): Json<UpdateProfileRequest>,
) -> Result<Json<AppUserResponse>> {
    let project_id = auth.require_project()?;

    let user = get_user_from_token(&state, project_id, &headers).await?;

    // Build update query dynamically
    let mut updates = Vec::new();
    let mut param_idx = 1;

    if input.name.is_some() {
        param_idx += 1;
        updates.push(format!("name = ${}", param_idx));
    }
    if input.avatar_url.is_some() {
        param_idx += 1;
        updates.push(format!("avatar_url = ${}", param_idx));
    }
    if input.phone.is_some() {
        param_idx += 1;
        updates.push(format!("phone = ${}", param_idx));
    }
    if input.metadata.is_some() {
        param_idx += 1;
        updates.push(format!("metadata = ${}", param_idx));
    }

    if updates.is_empty() {
        return Ok(Json(user.into()));
    }

    let query = format!(
        "UPDATE sys_app_users SET {}, updated_at = NOW() WHERE id = $1 RETURNING *",
        updates.join(", ")
    );

    let mut query_builder = sqlx::query_as::<_, AppUser>(&query).bind(user.id);

    if let Some(name) = &input.name {
        query_builder = query_builder.bind(name);
    }
    if let Some(avatar_url) = &input.avatar_url {
        query_builder = query_builder.bind(avatar_url);
    }
    if let Some(phone) = &input.phone {
        query_builder = query_builder.bind(phone);
    }
    if let Some(metadata) = &input.metadata {
        query_builder = query_builder.bind(metadata);
    }

    let updated: AppUser = query_builder
        .fetch_one(state.pool.inner())
        .await?;

    Ok(Json(updated.into()))
}

/// POST /v1/auth/app/password - Change password
pub async fn change_password(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
    Json(input): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    let user = get_user_from_token(&state, project_id, &headers).await?;
    let settings = get_auth_settings(&state.pool, project_id).await?;

    // Validate new password
    validate_password(&input.new_password, &settings)?;

    // Get current password hash
    let current_hash: (Option<String>,) = sqlx::query_as(
        "SELECT password_hash FROM sys_app_users WHERE id = $1"
    )
    .bind(user.id)
    .fetch_one(state.pool.inner())
    .await?;

    let current_hash = current_hash.0
        .ok_or_else(|| Error::BadRequest("Cannot change password for OAuth-only accounts".to_string()))?;

    // Verify current password
    if !verify_password(&input.current_password, &current_hash) {
        return Err(Error::Auth("Current password is incorrect".to_string()));
    }

    // Hash new password
    let new_hash = hash_password(&input.new_password)?;

    // Update password
    sqlx::query(
        "UPDATE sys_app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2"
    )
    .bind(&new_hash)
    .bind(user.id)
    .execute(state.pool.inner())
    .await?;

    // Revoke all other sessions (force re-login)
    sqlx::query(
        "UPDATE sys_app_sessions SET revoked = true, revoked_at = NOW() WHERE user_id = $1"
    )
    .bind(user.id)
    .execute(state.pool.inner())
    .await?;

    Ok(Json(serde_json::json!({ "password_changed": true })))
}

/// POST /v1/auth/app/forgot-password - Request password reset
pub async fn forgot_password(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<ForgotPasswordRequest>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    // Find user (but don't reveal if email exists)
    let user: Option<AppUser> = sqlx::query_as(
        "SELECT * FROM sys_app_users WHERE project_id = $1 AND LOWER(email) = LOWER($2)"
    )
    .bind(project_id)
    .bind(&input.email)
    .fetch_optional(state.pool.inner())
    .await?;

    if let Some(user) = user {
        // Generate reset token
        let token = generate_token();
        let expires_at = Utc::now() + Duration::hours(1);

        sqlx::query(
            r#"
            UPDATE sys_app_users
            SET password_reset_token = $1,
                password_reset_sent_at = NOW(),
                password_reset_expires_at = $2
            WHERE id = $3
            "#
        )
        .bind(&token)
        .bind(expires_at)
        .bind(user.id)
        .execute(state.pool.inner())
        .await?;

        // Emit event for webhook (email sending)
        let event = crate::events::Event::new(
            crate::events::EventType::AppPasswordResetRequested,
            project_id,
            &user.id.to_string(),
            serde_json::json!({
                "user_id": user.id.to_string(),
                "email": user.email,
                "reset_token": token,
                "expires_at": expires_at.to_rfc3339(),
            }),
        );
        let _ = state.events.publish(event);
    }

    // Always return success (don't reveal if email exists)
    Ok(Json(serde_json::json!({
        "message": "If the email exists, a password reset link has been sent"
    })))
}

/// POST /v1/auth/app/reset-password - Reset password with token
pub async fn reset_password(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;
    let settings = get_auth_settings(&state.pool, project_id).await?;

    // Validate new password
    validate_password(&input.new_password, &settings)?;

    // Find user by reset token
    let user: Option<AppUser> = sqlx::query_as(
        r#"
        SELECT * FROM sys_app_users
        WHERE project_id = $1
          AND password_reset_token = $2
          AND password_reset_expires_at > NOW()
        "#
    )
    .bind(project_id)
    .bind(&input.token)
    .fetch_optional(state.pool.inner())
    .await?;

    let user = user.ok_or_else(|| Error::Auth("Invalid or expired reset token".to_string()))?;

    // Hash new password
    let new_hash = hash_password(&input.new_password)?;

    // Update password and clear reset token
    sqlx::query(
        r#"
        UPDATE sys_app_users
        SET password_hash = $1,
            password_reset_token = NULL,
            password_reset_sent_at = NULL,
            password_reset_expires_at = NULL,
            updated_at = NOW()
        WHERE id = $2
        "#
    )
    .bind(&new_hash)
    .bind(user.id)
    .execute(state.pool.inner())
    .await?;

    // Revoke all sessions
    sqlx::query(
        "UPDATE sys_app_sessions SET revoked = true, revoked_at = NOW() WHERE user_id = $1"
    )
    .bind(user.id)
    .execute(state.pool.inner())
    .await?;

    Ok(Json(serde_json::json!({ "password_reset": true })))
}

/// POST /v1/auth/app/verify-email - Verify email with token
pub async fn verify_email(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<VerifyEmailRequest>,
) -> Result<Json<AppUserResponse>> {
    let project_id = auth.require_project()?;

    // Find user by verification token
    let user: Option<AppUser> = sqlx::query_as(
        r#"
        SELECT * FROM sys_app_users
        WHERE project_id = $1 AND email_verification_token = $2
        "#
    )
    .bind(project_id)
    .bind(&input.token)
    .fetch_optional(state.pool.inner())
    .await?;

    let user = user.ok_or_else(|| Error::Auth("Invalid verification token".to_string()))?;

    if user.email_verified {
        return Ok(Json(user.into()));
    }

    // Mark email as verified
    let updated: AppUser = sqlx::query_as(
        r#"
        UPDATE sys_app_users
        SET email_verified = true,
            email_verification_token = NULL,
            status = 'active',
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        "#
    )
    .bind(user.id)
    .fetch_one(state.pool.inner())
    .await?;

    Ok(Json(updated.into()))
}

/// POST /v1/auth/app/resend-verification - Resend verification email
pub async fn resend_verification(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    let user = get_user_from_token(&state, project_id, &headers).await?;

    if user.email_verified {
        return Ok(Json(serde_json::json!({ "message": "Email already verified" })));
    }

    // Generate new token
    let token = generate_token();

    sqlx::query(
        r#"
        UPDATE sys_app_users
        SET email_verification_token = $1,
            email_verification_sent_at = NOW()
        WHERE id = $2
        "#
    )
    .bind(&token)
    .bind(user.id)
    .execute(state.pool.inner())
    .await?;

    // Emit event for webhook
    let event = crate::events::Event::new(
        crate::events::EventType::AppEmailVerificationRequested,
        project_id,
        &user.id.to_string(),
        serde_json::json!({
            "user_id": user.id.to_string(),
            "email": user.email,
            "verification_token": token,
        }),
    );
    let _ = state.events.publish(event);

    Ok(Json(serde_json::json!({ "message": "Verification email sent" })))
}

/// DELETE /v1/auth/app/me - Delete account
pub async fn delete_account(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    let user = get_user_from_token(&state, project_id, &headers).await?;

    // Soft delete - mark as deleted
    sqlx::query(
        "UPDATE sys_app_users SET status = 'deleted', updated_at = NOW() WHERE id = $1"
    )
    .bind(user.id)
    .execute(state.pool.inner())
    .await?;

    // Revoke all sessions
    sqlx::query(
        "UPDATE sys_app_sessions SET revoked = true, revoked_at = NOW() WHERE user_id = $1"
    )
    .bind(user.id)
    .execute(state.pool.inner())
    .await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ============================================================================
// Admin Endpoints (for project owners)
// ============================================================================

/// GET /v1/auth/app/users - List app users (admin)
pub async fn list_users(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<crate::api::pagination::PaginationQuery>,
) -> Result<Json<crate::api::pagination::PaginatedResponse<AppUserResponse>>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let (limit, offset) = query.get_pagination();

    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sys_app_users WHERE project_id = $1 AND status != 'deleted'"
    )
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await?;

    let users: Vec<AppUser> = sqlx::query_as(
        r#"
        SELECT * FROM sys_app_users
        WHERE project_id = $1 AND status != 'deleted'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        "#
    )
    .bind(project_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(state.pool.inner())
    .await?;

    let responses: Vec<AppUserResponse> = users.into_iter().map(Into::into).collect();

    Ok(Json(crate::api::pagination::PaginatedResponse::new(
        responses, total.0, limit, offset
    )))
}

/// GET /v1/auth/app/users/:id - Get app user by ID (admin)
pub async fn get_user(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<AppUserResponse>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let user: AppUser = sqlx::query_as(
        "SELECT * FROM sys_app_users WHERE id = $1 AND project_id = $2"
    )
    .bind(user_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("User not found".to_string()))?;

    Ok(Json(user.into()))
}

/// PATCH /v1/auth/app/users/:id - Update app user (admin)
pub async fn update_user(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
    Json(input): Json<serde_json::Value>,
) -> Result<Json<AppUserResponse>> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    // Build update query dynamically
    let mut updates = Vec::new();
    let mut param_idx = 2;

    if input.get("name").is_some() {
        param_idx += 1;
        updates.push(format!("name = ${}", param_idx));
    }
    if input.get("status").is_some() {
        param_idx += 1;
        updates.push(format!("status = ${}", param_idx));
    }
    if input.get("email_verified").is_some() {
        param_idx += 1;
        updates.push(format!("email_verified = ${}", param_idx));
    }
    if input.get("metadata").is_some() {
        param_idx += 1;
        updates.push(format!("metadata = ${}", param_idx));
    }

    if updates.is_empty() {
        let user: AppUser = sqlx::query_as(
            "SELECT * FROM sys_app_users WHERE id = $1 AND project_id = $2"
        )
        .bind(user_id)
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await?;
        return Ok(Json(user.into()));
    }

    let query = format!(
        "UPDATE sys_app_users SET {}, updated_at = NOW() WHERE id = $1 AND project_id = $2 RETURNING *",
        updates.join(", ")
    );

    let mut query_builder = sqlx::query_as::<_, AppUser>(&query)
        .bind(user_id)
        .bind(project_id);

    if let Some(name) = input.get("name").and_then(|v| v.as_str()) {
        query_builder = query_builder.bind(name);
    }
    if let Some(status) = input.get("status").and_then(|v| v.as_str()) {
        query_builder = query_builder.bind(status);
    }
    if let Some(email_verified) = input.get("email_verified").and_then(|v| v.as_bool()) {
        query_builder = query_builder.bind(email_verified);
    }
    if let Some(metadata) = input.get("metadata") {
        query_builder = query_builder.bind(metadata);
    }

    let user: AppUser = query_builder
        .fetch_optional(state.pool.inner())
        .await?
        .ok_or_else(|| Error::NotFound("User not found".to_string()))?;

    Ok(Json(user.into()))
}

/// DELETE /v1/auth/app/users/:id - Delete app user (admin)
pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    let result = sqlx::query(
        "UPDATE sys_app_users SET status = 'deleted', updated_at = NOW() WHERE id = $1 AND project_id = $2"
    )
    .bind(user_id)
    .bind(project_id)
    .execute(state.pool.inner())
    .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("User not found".to_string()));
    }

    // Revoke all sessions
    sqlx::query(
        "UPDATE sys_app_sessions SET revoked = true, revoked_at = NOW() WHERE user_id = $1"
    )
    .bind(user_id)
    .execute(state.pool.inner())
    .await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ============================================================================
// Helper Functions
// ============================================================================

async fn get_auth_settings(pool: &DbPool, project_id: Uuid) -> Result<AppAuthSettings> {
    let settings: Option<AppAuthSettings> = sqlx::query_as(
        "SELECT * FROM sys_app_auth_settings WHERE project_id = $1"
    )
    .bind(project_id)
    .fetch_optional(pool.inner())
    .await?;

    match settings {
        Some(s) => Ok(s),
        None => {
            // Create default settings
            sqlx::query(
                "INSERT INTO sys_app_auth_settings (project_id) VALUES ($1) ON CONFLICT DO NOTHING"
            )
            .bind(project_id)
            .execute(pool.inner())
            .await?;

            Ok(AppAuthSettings::default())
        }
    }
}

fn validate_password(password: &str, settings: &AppAuthSettings) -> Result<()> {
    if password.len() < settings.min_password_length as usize {
        return Err(Error::Validation(format!(
            "Password must be at least {} characters",
            settings.min_password_length
        )));
    }

    if settings.require_uppercase && !password.chars().any(|c| c.is_uppercase()) {
        return Err(Error::Validation("Password must contain at least one uppercase letter".to_string()));
    }

    if settings.require_lowercase && !password.chars().any(|c| c.is_lowercase()) {
        return Err(Error::Validation("Password must contain at least one lowercase letter".to_string()));
    }

    if settings.require_numbers && !password.chars().any(|c| c.is_numeric()) {
        return Err(Error::Validation("Password must contain at least one number".to_string()));
    }

    if settings.require_special_chars && !password.chars().any(|c| !c.is_alphanumeric()) {
        return Err(Error::Validation("Password must contain at least one special character".to_string()));
    }

    Ok(())
}

fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() >= 5
}

fn hash_password(password: &str) -> Result<String> {
    crate::auth::hash_password(password)
}

fn verify_password(password: &str, hash: &str) -> bool {
    crate::auth::verify_password(password, hash)
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 32] = rng.gen();
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes)
}

fn hash_token(token: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[derive(Debug)]
struct ClientInfo {
    user_agent: Option<String>,
    ip_address: Option<String>,
}

fn get_client_info(headers: &HeaderMap) -> ClientInfo {
    ClientInfo {
        user_agent: headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string()),
        ip_address: headers
            .get("X-Forwarded-For")
            .or_else(|| headers.get("X-Real-IP"))
            .and_then(|v| v.to_str().ok())
            .map(|s| s.split(',').next().unwrap_or(s).trim().to_string()),
    }
}

async fn generate_auth_tokens(
    state: &AppState,
    user: &AppUser,
    settings: &AppAuthSettings,
    client_info: ClientInfo,
) -> Result<AuthTokens> {
    // Generate refresh token
    let refresh_token = generate_token();
    let refresh_token_hash = hash_token(&refresh_token);
    let refresh_expires = Utc::now() + Duration::seconds(settings.refresh_token_ttl_seconds as i64);

    // Create session
    let session_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO sys_app_sessions (
            user_id, project_id, refresh_token_hash, user_agent, ip_address, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        "#
    )
    .bind(user.id)
    .bind(user.project_id)
    .bind(&refresh_token_hash)
    .bind(&client_info.user_agent)
    .bind(&client_info.ip_address)
    .bind(refresh_expires)
    .fetch_one(state.pool.inner())
    .await?;

    // Cleanup old sessions (keep max_sessions_per_user most recent)
    sqlx::query(
        r#"
        UPDATE sys_app_sessions SET revoked = true, revoked_at = NOW()
        WHERE user_id = $1 AND id NOT IN (
            SELECT id FROM sys_app_sessions
            WHERE user_id = $1 AND NOT revoked
            ORDER BY created_at DESC
            LIMIT $2
        )
        "#
    )
    .bind(user.id)
    .bind(settings.max_sessions_per_user)
    .execute(state.pool.inner())
    .await?;

    // Generate access token
    let access_token = generate_access_token_with_session(state, user, settings, session_id.0)?;

    Ok(AuthTokens {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: settings.access_token_ttl_seconds as i64,
    })
}

#[derive(Debug, Serialize, Deserialize)]
struct AppTokenClaims {
    sub: String,       // user_id
    project_id: String,
    email: String,
    session_id: Option<Uuid>,
    exp: i64,
    iat: i64,
    token_type: String,
}

fn generate_access_token(
    state: &AppState,
    user: &AppUser,
    settings: &AppAuthSettings,
) -> Result<String> {
    generate_access_token_with_session(state, user, settings, Uuid::nil())
}

fn generate_access_token_with_session(
    state: &AppState,
    user: &AppUser,
    settings: &AppAuthSettings,
    session_id: Uuid,
) -> Result<String> {
    use jsonwebtoken::{encode, EncodingKey, Header};

    let now = Utc::now();
    let claims = AppTokenClaims {
        sub: user.id.to_string(),
        project_id: user.project_id.to_string(),
        email: user.email.clone(),
        session_id: if session_id == Uuid::nil() { None } else { Some(session_id) },
        exp: (now + Duration::seconds(settings.access_token_ttl_seconds as i64)).timestamp(),
        iat: now.timestamp(),
        token_type: "app_access".to_string(),
    };

    let secret = state
        .config
        .auth
        .jwt_secret
        .as_ref()
        .ok_or_else(|| Error::Config("JWT secret not configured".to_string()))?;

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| Error::Internal(format!("Token generation failed: {}", e)))
}

fn decode_app_token(state: &AppState, token: &str) -> Result<AppTokenClaims> {
    use jsonwebtoken::{decode, DecodingKey, Validation};

    let secret = state
        .config
        .auth
        .jwt_secret
        .as_ref()
        .ok_or_else(|| Error::Config("JWT secret not configured".to_string()))?;

    let token_data = decode::<AppTokenClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| Error::Auth(format!("Invalid token: {}", e)))?;

    if token_data.claims.token_type != "app_access" {
        return Err(Error::Auth("Invalid token type".to_string()));
    }

    Ok(token_data.claims)
}

async fn get_user_from_token(
    state: &AppState,
    project_id: Uuid,
    headers: &HeaderMap,
) -> Result<AppUser> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or_else(|| Error::Auth("Missing authorization token".to_string()))?;

    let claims = decode_app_token(state, token)?;

    // Verify project matches
    if claims.project_id != project_id.to_string() {
        return Err(Error::Auth("Token project mismatch".to_string()));
    }

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| Error::Auth("Invalid token".to_string()))?;

    // Verify session is still valid
    if let Some(session_id) = claims.session_id {
        let session_valid: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM sys_app_sessions WHERE id = $1 AND NOT revoked AND expires_at > NOW())"
        )
        .bind(session_id)
        .fetch_one(state.pool.inner())
        .await?;

        if !session_valid {
            return Err(Error::Auth("Session expired or revoked".to_string()));
        }
    }

    let user: AppUser = sqlx::query_as(
        "SELECT * FROM sys_app_users WHERE id = $1 AND project_id = $2 AND status = 'active'"
    )
    .bind(user_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::Auth("User not found or inactive".to_string()))?;

    Ok(user)
}
