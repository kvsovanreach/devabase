mod api_key;
mod jwt;
mod password;
mod user;

pub use api_key::*;
pub use jwt::*;
pub use password::*;
pub use user::*;

use crate::db::models::ProjectRole;
use crate::db::DbPool;
use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
};
use std::sync::Arc;
use uuid::Uuid;

/// Authentication context extracted from request
#[derive(Debug, Clone)]
pub struct AuthContext {
    // API key auth (legacy support)
    pub api_key_id: Option<Uuid>,
    pub scopes: Vec<String>,

    // User auth (new)
    pub user_id: Option<Uuid>,

    // Project context
    pub project_id: Option<Uuid>,
    pub project_role: Option<ProjectRole>,

    // App user context (for dual-auth: API key + user token)
    // When both API key and app_user_id are present:
    // - API key authorizes the request (project access)
    // - app_user_id identifies WHO is making the request (for RLS, audit logs)
    pub app_user_id: Option<Uuid>,
    pub app_user_email: Option<String>,
}

impl AuthContext {
    /// Create a new auth context from API key (project-scoped)
    pub fn from_api_key(api_key_id: Uuid, project_id: Uuid, scopes: Vec<String>) -> Self {
        // API keys have full read/write access to their project
        Self {
            api_key_id: Some(api_key_id),
            scopes,
            user_id: None,
            project_id: Some(project_id),
            project_role: Some(ProjectRole::Admin), // API keys have admin access to their project
            app_user_id: None,
            app_user_email: None,
        }
    }

    /// Create a new auth context from user
    pub fn from_user(user_id: Uuid) -> Self {
        Self {
            api_key_id: None,
            scopes: vec!["user".to_string()],
            user_id: Some(user_id),
            project_id: None,
            project_role: None,
            app_user_id: None,
            app_user_email: None,
        }
    }

    /// Set app user context (for dual-auth scenarios)
    pub fn with_app_user(mut self, user_id: Uuid, email: Option<String>) -> Self {
        self.app_user_id = Some(user_id);
        self.app_user_email = email;
        self
    }

    /// Get the effective user ID for RLS/audit purposes
    /// Returns app_user_id if set (dual-auth), otherwise user_id (JWT auth)
    pub fn effective_user_id(&self) -> Option<Uuid> {
        self.app_user_id.or(self.user_id)
    }

    /// Check if user has a specific scope
    pub fn has_scope(&self, scope: &str) -> bool {
        self.scopes.contains(&scope.to_string()) || self.scopes.contains(&"admin".to_string())
    }

    /// Check if authenticated (either API key or user)
    pub fn is_authenticated(&self) -> bool {
        self.api_key_id.is_some() || self.user_id.is_some()
    }

    /// Check if user has read access to current project
    pub fn can_read(&self) -> bool {
        self.project_role.map(|r| r.can_read()).unwrap_or(false)
    }

    /// Check if user has write access to current project
    pub fn can_write(&self) -> bool {
        self.project_role.map(|r| r.can_write()).unwrap_or(false)
    }

    /// Check if user has admin access to current project
    pub fn can_admin(&self) -> bool {
        self.project_role.map(|r| r.can_admin()).unwrap_or(false)
    }

    /// Require project context, return error if not set
    pub fn require_project(&self) -> crate::Result<Uuid> {
        self.project_id.ok_or_else(|| {
            crate::Error::BadRequest("X-Project-ID header required".to_string())
        })
    }

    /// Require read access, return error if not authorized
    pub fn require_read(&self) -> crate::Result<()> {
        if !self.can_read() {
            return Err(crate::Error::Forbidden("Read access denied".to_string()));
        }
        Ok(())
    }

    /// Require write access, return error if not authorized
    pub fn require_write(&self) -> crate::Result<()> {
        if !self.can_write() {
            return Err(crate::Error::Forbidden("Write access denied".to_string()));
        }
        Ok(())
    }

    /// Require admin access, return error if not authorized
    pub fn require_admin(&self) -> crate::Result<()> {
        if !self.can_admin() {
            return Err(crate::Error::Forbidden("Admin access denied".to_string()));
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct AuthState {
    pub pool: DbPool,
    pub jwt_secret: Option<String>,
    pub api_key_prefix: String,
}

#[axum::async_trait]
impl FromRequestParts<Arc<crate::server::AppState>> for AuthContext {
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<crate::server::AppState>,
    ) -> Result<Self, Self::Rejection> {
        // Track if credentials were provided (to give better error messages)
        let mut credentials_provided = false;
        let mut is_jwt_attempt = false;
        let mut is_api_key_attempt = false;

        // Try to get Authorization header
        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok());

        // Try Bearer token (JWT or API key)
        if let Some(header) = auth_header {
            if header.starts_with("Bearer ") {
                credentials_provided = true;
                let token = &header[7..];

                // Detect token type by prefix
                if token.starts_with("dvb_") || token.starts_with("deva_") {
                    is_api_key_attempt = true;
                } else {
                    is_jwt_attempt = true;
                }

                // Try JWT first
                if let Some(jwt_secret) = &state.config.auth.jwt_secret {
                    if let Ok(claims) = verify_token(jwt_secret, token) {
                        if let Ok(user_id) = Uuid::parse_str(&claims.sub) {
                            let mut ctx = AuthContext::from_user(user_id);

                            // Check for project context
                            if let Some(project_id_str) = parts.headers.get("X-Project-ID").and_then(|h| h.to_str().ok()) {
                                if let Ok(project_id) = Uuid::parse_str(project_id_str) {
                                    // Get user's role in project
                                    if let Ok(role) = get_user_project_role(&state.pool, user_id, project_id).await {
                                        ctx.project_id = Some(project_id);
                                        ctx.project_role = Some(role);
                                    }
                                }
                            }

                            return Ok(ctx);
                        }
                    }
                }

                // Try API key (with cache to avoid repeated Argon2 hashing)
                if let Ok(mut ctx) = validate_api_key_cached(&state.pool, token, &state.api_key_cache).await {
                    // Check for X-App-User-Token header (dual-auth)
                    ctx = try_set_app_user_context(ctx, parts, state).await;
                    return Ok(ctx);
                }
            }
        }

        // Try X-API-Key header
        if let Some(api_key) = parts.headers.get("X-API-Key").and_then(|h| h.to_str().ok()) {
            credentials_provided = true;
            is_api_key_attempt = true;
            if let Ok(mut ctx) = validate_api_key_cached(&state.pool, api_key, &state.api_key_cache).await {
                // Check for X-App-User-Token header (dual-auth)
                ctx = try_set_app_user_context(ctx, parts, state).await;
                return Ok(ctx);
            }
        }

        // Return appropriate error message
        if credentials_provided {
            if is_api_key_attempt {
                Err((StatusCode::UNAUTHORIZED, "Invalid API key"))
            } else if is_jwt_attempt {
                Err((StatusCode::UNAUTHORIZED, "Invalid or expired token"))
            } else {
                Err((StatusCode::UNAUTHORIZED, "Invalid credentials"))
            }
        } else {
            Err((StatusCode::UNAUTHORIZED, "Authentication required"))
        }
    }
}

pub async fn validate_api_key(pool: &DbPool, key: &str) -> crate::Result<AuthContext> {
    let api_ctx = api_key::verify_key(pool, key).await?;
    Ok(AuthContext::from_api_key(
        api_ctx.api_key_id,
        api_ctx.project_id,
        api_ctx.scopes,
    ))
}

pub async fn validate_api_key_cached(pool: &DbPool, key: &str, cache: &ApiKeyCache) -> crate::Result<AuthContext> {
    let api_ctx = api_key::verify_key_with_cache(pool, key, Some(cache)).await?;
    Ok(AuthContext::from_api_key(
        api_ctx.api_key_id,
        api_ctx.project_id,
        api_ctx.scopes,
    ))
}

/// Get user's role in a project
async fn get_user_project_role(pool: &DbPool, user_id: Uuid, project_id: Uuid) -> crate::Result<ProjectRole> {
    let role: (ProjectRole,) = sqlx::query_as(
        "SELECT role FROM sys_project_members WHERE user_id = $1 AND project_id = $2"
    )
    .bind(user_id)
    .bind(project_id)
    .fetch_optional(pool.inner())
    .await?
    .ok_or_else(|| crate::Error::Auth("Not a member of this project".to_string()))?;

    Ok(role.0)
}

/// Try to set app user context from X-App-User-Token header
/// This enables dual-auth: API key for project access + user token for identity
async fn try_set_app_user_context(
    mut ctx: AuthContext,
    parts: &Parts,
    state: &Arc<crate::server::AppState>,
) -> AuthContext {
    // Only process if we have a project (from API key)
    let project_id = match ctx.project_id {
        Some(id) => id,
        None => return ctx,
    };

    // Check for X-App-User-Token header
    let app_user_token = match parts
        .headers
        .get("X-App-User-Token")
        .and_then(|h| h.to_str().ok())
    {
        Some(token) => token,
        None => return ctx,
    };

    // Decode the app user token
    let jwt_secret = match &state.config.auth.jwt_secret {
        Some(secret) => secret,
        None => return ctx,
    };

    // Decode the token (we have our own decoder for app tokens)
    let claims = match decode_app_user_token(jwt_secret, app_user_token) {
        Ok(claims) => claims,
        Err(_) => return ctx, // Invalid token, ignore silently
    };

    // Verify project matches
    if claims.project_id != project_id.to_string() {
        return ctx; // Wrong project, ignore
    }

    // Parse user ID
    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(id) => id,
        Err(_) => return ctx,
    };

    // Set app user context
    ctx.app_user_id = Some(user_id);
    ctx.app_user_email = Some(claims.email);
    ctx
}

#[derive(Debug, serde::Deserialize)]
struct AppUserTokenClaims {
    sub: String,
    project_id: String,
    email: String,
    exp: i64,
    token_type: String,
}

fn decode_app_user_token(secret: &str, token: &str) -> crate::Result<AppUserTokenClaims> {
    use jsonwebtoken::{decode, DecodingKey, Validation};

    let token_data = decode::<AppUserTokenClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| crate::Error::Auth(format!("Invalid app user token: {}", e)))?;

    // Verify token type
    if token_data.claims.token_type != "app_access" {
        return Err(crate::Error::Auth("Invalid token type".to_string()));
    }

    Ok(token_data.claims)
}

/// Optional auth context (for endpoints that work with or without auth)
pub struct OptionalAuthContext(pub Option<AuthContext>);

#[axum::async_trait]
impl FromRequestParts<Arc<crate::server::AppState>> for OptionalAuthContext {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<crate::server::AppState>,
    ) -> Result<Self, Self::Rejection> {
        Ok(OptionalAuthContext(
            AuthContext::from_request_parts(parts, state).await.ok()
        ))
    }
}
