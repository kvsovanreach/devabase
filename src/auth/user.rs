use crate::db::models::{
    AuthResponse, CreateUser, LoginUser, UpdateUser, User, UserResponse, UserSession, UserStatus,
};
use crate::db::DbPool;
use crate::{Error, Result};
use base64::{engine::general_purpose, Engine as _};
use chrono::{Duration, Utc};
use rand::Rng;
use uuid::Uuid;

use super::password::{hash_password, validate_email, validate_password, verify_password};
use super::{create_token, hash_key};

const REFRESH_TOKEN_LENGTH: usize = 32;
const REFRESH_TOKEN_EXPIRY_DAYS: i64 = 30;

/// Generate a refresh token
fn generate_refresh_token() -> String {
    let random_bytes: Vec<u8> = (0..REFRESH_TOKEN_LENGTH)
        .map(|_| rand::thread_rng().gen())
        .collect();
    general_purpose::URL_SAFE_NO_PAD.encode(&random_bytes)
}

/// Register a new user
pub async fn register(
    pool: &DbPool,
    input: CreateUser,
    jwt_secret: &str,
    token_expiry_hours: u64,
) -> Result<AuthResponse> {
    // Validate input
    validate_email(&input.email)?;
    validate_password(&input.password)?;

    if input.name.trim().is_empty() {
        return Err(Error::BadRequest("Name is required".to_string()));
    }

    // Check if email already exists
    let existing: Option<User> = sqlx::query_as(
        "SELECT * FROM sys_users WHERE LOWER(email) = LOWER($1)"
    )
    .bind(&input.email)
    .fetch_optional(pool.inner())
    .await?;

    if existing.is_some() {
        return Err(Error::BadRequest("Email already registered".to_string()));
    }

    // Hash password
    let password_hash = hash_password(&input.password)?;

    // Create user
    let user_id = Uuid::new_v4();
    let user: User = sqlx::query_as(
        r#"
        INSERT INTO sys_users (id, email, password_hash, name, status)
        VALUES ($1, LOWER($2), $3, $4, 'active')
        RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(&input.email)
    .bind(&password_hash)
    .bind(input.name.trim())
    .fetch_one(pool.inner())
    .await?;

    // Create session
    let (token, refresh_token) = create_session(pool, &user, jwt_secret, token_expiry_hours).await?;

    Ok(AuthResponse {
        user: UserResponse::from(user),
        token,
        refresh_token,
    })
}

/// Login a user
pub async fn login(
    pool: &DbPool,
    input: LoginUser,
    jwt_secret: &str,
    token_expiry_hours: u64,
) -> Result<AuthResponse> {
    // Find user by email
    let user: User = sqlx::query_as(
        "SELECT * FROM sys_users WHERE LOWER(email) = LOWER($1)"
    )
    .bind(&input.email)
    .fetch_optional(pool.inner())
    .await?
    .ok_or_else(|| Error::Auth("Invalid email or password".to_string()))?;

    // Check status
    if user.status != UserStatus::Active {
        return Err(Error::Auth("Account is not active".to_string()));
    }

    // Verify password
    if !verify_password(&input.password, &user.password_hash) {
        return Err(Error::Auth("Invalid email or password".to_string()));
    }

    // Update last login
    sqlx::query("UPDATE sys_users SET last_login_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(pool.inner())
        .await?;

    // Create session
    let (token, refresh_token) = create_session(pool, &user, jwt_secret, token_expiry_hours).await?;

    Ok(AuthResponse {
        user: UserResponse::from(user),
        token,
        refresh_token,
    })
}

/// Create a new session for user
async fn create_session(
    pool: &DbPool,
    user: &User,
    jwt_secret: &str,
    token_expiry_hours: u64,
) -> Result<(String, String)> {
    // Generate tokens
    let token = create_token(
        jwt_secret,
        user.id,
        vec!["user".to_string()],
        token_expiry_hours,
    )?;

    let refresh_token = generate_refresh_token();
    let refresh_token_hash = hash_key(&refresh_token)?;

    let expires_at = Utc::now() + Duration::days(REFRESH_TOKEN_EXPIRY_DAYS);

    // Store session
    sqlx::query(
        r#"
        INSERT INTO sys_sessions (user_id, refresh_token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(user.id)
    .bind(&refresh_token_hash)
    .bind(expires_at)
    .execute(pool.inner())
    .await?;

    Ok((token, refresh_token))
}

/// Refresh access token using refresh token
pub async fn refresh_token(
    pool: &DbPool,
    refresh_token: &str,
    jwt_secret: &str,
    token_expiry_hours: u64,
) -> Result<AuthResponse> {
    // Find all sessions and verify
    let sessions: Vec<UserSession> = sqlx::query_as(
        r#"
        SELECT * FROM sys_sessions
        WHERE expires_at > NOW() AND revoked_at IS NULL
        "#,
    )
    .fetch_all(pool.inner())
    .await?;

    let mut valid_session: Option<UserSession> = None;
    for session in sessions {
        if super::verify_key_hash(refresh_token, &session.refresh_token_hash) {
            valid_session = Some(session);
            break;
        }
    }

    let session = valid_session.ok_or_else(|| Error::Auth("Invalid refresh token".to_string()))?;

    // Get user
    let user: User = sqlx::query_as("SELECT * FROM sys_users WHERE id = $1")
        .bind(session.user_id)
        .fetch_optional(pool.inner())
        .await?
        .ok_or_else(|| Error::Auth("User not found".to_string()))?;

    if user.status != UserStatus::Active {
        return Err(Error::Auth("Account is not active".to_string()));
    }

    // Revoke old session
    sqlx::query("UPDATE sys_sessions SET revoked_at = NOW() WHERE id = $1")
        .bind(session.id)
        .execute(pool.inner())
        .await?;

    // Create new session
    let (token, new_refresh_token) = create_session(pool, &user, jwt_secret, token_expiry_hours).await?;

    Ok(AuthResponse {
        user: UserResponse::from(user),
        token,
        refresh_token: new_refresh_token,
    })
}

/// Logout user (revoke session)
pub async fn logout(pool: &DbPool, user_id: Uuid) -> Result<()> {
    // Revoke all sessions for user
    sqlx::query("UPDATE sys_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL")
        .bind(user_id)
        .execute(pool.inner())
        .await?;

    Ok(())
}

/// Get user by ID
pub async fn get_user(pool: &DbPool, user_id: Uuid) -> Result<UserResponse> {
    let user: User = sqlx::query_as("SELECT * FROM sys_users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool.inner())
        .await?
        .ok_or_else(|| Error::NotFound("User not found".to_string()))?;

    Ok(UserResponse::from(user))
}

/// Update user profile
pub async fn update_user(pool: &DbPool, user_id: Uuid, input: UpdateUser) -> Result<UserResponse> {
    let mut updates = Vec::new();
    let mut values: Vec<String> = Vec::new();

    if let Some(name) = &input.name {
        if name.trim().is_empty() {
            return Err(Error::BadRequest("Name cannot be empty".to_string()));
        }
        updates.push(format!("name = ${}", updates.len() + 2));
        values.push(name.trim().to_string());
    }

    if let Some(avatar_url) = &input.avatar_url {
        updates.push(format!("avatar_url = ${}", updates.len() + 2));
        values.push(avatar_url.clone());
    }

    if updates.is_empty() {
        return get_user(pool, user_id).await;
    }

    let query = format!(
        "UPDATE sys_users SET {}, updated_at = NOW() WHERE id = $1 RETURNING *",
        updates.join(", ")
    );

    let mut query_builder = sqlx::query_as::<_, User>(&query).bind(user_id);
    for value in &values {
        query_builder = query_builder.bind(value);
    }

    let user = query_builder
        .fetch_one(pool.inner())
        .await?;

    Ok(UserResponse::from(user))
}
