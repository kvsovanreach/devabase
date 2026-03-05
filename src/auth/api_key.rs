use crate::db::models::{ApiKey, ApiKeyCreated, ApiKeyResponse, CreateApiKey};
use crate::db::DbPool;
use crate::{Error, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose, Engine as _};
use rand::Rng;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Simple auth context for API key verification (internal use)
#[derive(Debug, Clone)]
pub struct ApiKeyContext {
    pub api_key_id: Uuid,
    pub project_id: Uuid,
    pub scopes: Vec<String>,
}

/// Cached API key verification result with TTL
struct CachedApiKey {
    context: ApiKeyContext,
    expires_at: std::time::Instant,
}

/// In-memory cache for verified API keys to avoid repeated Argon2 hashing.
/// Cache keys are SHA-256 hashes of the raw API key — never stores plaintext keys in memory.
/// Entries have a configurable TTL (default 5 minutes).
pub struct ApiKeyCache {
    entries: RwLock<HashMap<String, CachedApiKey>>,
    ttl: std::time::Duration,
}

/// Hash the raw API key with SHA-256 for use as a cache key.
/// This ensures plaintext keys are never stored in the cache.
fn cache_key(raw_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw_key.as_bytes());
    let hash = hasher.finalize();
    // Encode as base64 to avoid adding hex crate dependency
    general_purpose::STANDARD.encode(hash)
}

impl ApiKeyCache {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            ttl: std::time::Duration::from_secs(ttl_secs),
        }
    }

    async fn get(&self, raw_key: &str) -> Option<ApiKeyContext> {
        let hash = cache_key(raw_key);
        let entries = self.entries.read().await;
        if let Some(cached) = entries.get(&hash) {
            if cached.expires_at > std::time::Instant::now() {
                return Some(cached.context.clone());
            }
        }
        None
    }

    async fn set(&self, raw_key: &str, context: ApiKeyContext) {
        let hash = cache_key(raw_key);
        let mut entries = self.entries.write().await;
        entries.insert(hash, CachedApiKey {
            context,
            expires_at: std::time::Instant::now() + self.ttl,
        });
    }

    /// Invalidate cache entries for a specific API key ID (used when a key is deleted/revoked)
    pub async fn invalidate_by_key_id(&self, key_id: Uuid) {
        let mut entries = self.entries.write().await;
        entries.retain(|_, cached| cached.context.api_key_id != key_id);
    }

    pub async fn invalidate_all(&self) {
        let mut entries = self.entries.write().await;
        entries.clear();
    }

    /// Look up project_id for a raw API key from cache (no DB hit).
    /// Returns None if the key is not cached or expired.
    pub async fn get_project_id(&self, raw_key: &str) -> Option<Uuid> {
        self.get(raw_key).await.map(|ctx| ctx.project_id)
    }
}

const KEY_LENGTH: usize = 32;

pub fn generate_key(prefix: &str) -> String {
    let random_bytes: Vec<u8> = (0..KEY_LENGTH).map(|_| rand::thread_rng().gen()).collect();
    let encoded = general_purpose::URL_SAFE_NO_PAD.encode(&random_bytes);
    format!("{}{}", prefix, encoded)
}

pub fn hash_key(key: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(key.as_bytes(), &salt)
        .map_err(|e| Error::Internal(format!("Failed to hash key: {}", e)))?;
    Ok(hash.to_string())
}

pub fn verify_key_hash(key: &str, hash: &str) -> bool {
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(key.as_bytes(), &parsed_hash)
        .is_ok()
}

pub async fn create_key(
    pool: &DbPool,
    project_id: Uuid,
    user_id: Option<Uuid>,
    input: CreateApiKey,
    prefix: &str,
) -> Result<ApiKeyCreated> {
    let key = generate_key(prefix);
    let key_hash = hash_key(&key)?;
    let key_prefix = format!("{}...", &key[..12]);

    let id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO sys_api_keys (id, project_id, user_id, name, key_hash, key_prefix, scopes, rate_limit, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(id)
    .bind(project_id)
    .bind(user_id)
    .bind(&input.name)
    .bind(&key_hash)
    .bind(&key_prefix)
    .bind(&input.scopes)
    .bind(input.rate_limit)
    .bind(input.expires_at)
    .execute(pool.inner())
    .await?;

    Ok(ApiKeyCreated {
        id,
        key,
        name: input.name,
        scopes: input.scopes,
    })
}

pub async fn verify_key(pool: &DbPool, key: &str) -> Result<ApiKeyContext> {
    verify_key_with_cache(pool, key, None).await
}

/// Verify an API key with optional in-memory cache.
/// Uses the stored key_prefix to fetch only the matching row (O(1) instead of O(N)),
/// then verifies with Argon2 only once.
pub async fn verify_key_with_cache(
    pool: &DbPool,
    key: &str,
    cache: Option<&ApiKeyCache>,
) -> Result<ApiKeyContext> {
    // Check cache first — avoids Argon2 entirely on cache hit
    if let Some(cache) = cache {
        if let Some(ctx) = cache.get(key).await {
            return Ok(ctx);
        }
    }

    // Use the key prefix to narrow down to a single candidate
    // key_prefix is stored as "dvb_XXXXXXXX..." (first 12 chars + "...")
    let prefix_hint = if key.len() >= 12 {
        format!("{}...", &key[..12])
    } else {
        return Err(Error::Auth("Invalid API key format".to_string()));
    };

    let api_key: Option<ApiKey> = sqlx::query_as(
        r#"
        SELECT * FROM sys_api_keys
        WHERE key_prefix = $1
          AND project_id IS NOT NULL
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())
        "#,
    )
    .bind(&prefix_hint)
    .fetch_optional(pool.inner())
    .await?;

    let api_key = api_key.ok_or_else(|| Error::Auth("Invalid API key".to_string()))?;

    // Verify the full key against the hash (single Argon2 check)
    if !verify_key_hash(key, &api_key.key_hash) {
        return Err(Error::Auth("Invalid API key".to_string()));
    }

    let project_id = api_key.project_id.ok_or_else(|| {
        Error::Auth("API key is not associated with a project".to_string())
    })?;

    let ctx = ApiKeyContext {
        api_key_id: api_key.id,
        project_id,
        scopes: api_key.scopes,
    };

    // Cache the verified key
    if let Some(cache) = cache {
        cache.set(key, ctx.clone()).await;
    }

    // Update last_used_at in background (don't block the response)
    let pool_clone = pool.clone();
    let key_id = api_key.id;
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE sys_api_keys SET last_used_at = NOW() WHERE id = $1")
            .bind(key_id)
            .execute(pool_clone.inner())
            .await;
    });

    Ok(ctx)
}

pub async fn list_keys(pool: &DbPool, project_id: Uuid) -> Result<Vec<ApiKeyResponse>> {
    let keys: Vec<ApiKey> = sqlx::query_as(
        "SELECT * FROM sys_api_keys WHERE project_id = $1 ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(pool.inner())
    .await?;

    Ok(keys.into_iter().map(ApiKeyResponse::from).collect())
}

pub async fn list_keys_paginated(pool: &DbPool, project_id: Uuid, limit: i64, offset: i64) -> Result<(Vec<ApiKeyResponse>, i64)> {
    // Get total count
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sys_api_keys WHERE project_id = $1"
    )
    .bind(project_id)
    .fetch_one(pool.inner())
    .await?;

    // Get paginated keys
    let keys: Vec<ApiKey> = sqlx::query_as(
        "SELECT * FROM sys_api_keys WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
    )
    .bind(project_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool.inner())
    .await?;

    Ok((keys.into_iter().map(ApiKeyResponse::from).collect(), total.0))
}

pub async fn get_key(pool: &DbPool, project_id: Uuid, id: Uuid) -> Result<ApiKeyResponse> {
    let key: ApiKey = sqlx::query_as("SELECT * FROM sys_api_keys WHERE id = $1 AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .fetch_optional(pool.inner())
        .await?
        .ok_or_else(|| Error::NotFound("API key not found".to_string()))?;

    Ok(ApiKeyResponse::from(key))
}

pub async fn toggle_key_active(pool: &DbPool, project_id: Uuid, id: Uuid, is_active: bool) -> Result<ApiKeyResponse> {
    let key: ApiKey = sqlx::query_as(
        "UPDATE sys_api_keys SET is_active = $1 WHERE id = $2 AND project_id = $3 RETURNING *"
    )
    .bind(is_active)
    .bind(id)
    .bind(project_id)
    .fetch_optional(pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("API key not found".to_string()))?;

    Ok(ApiKeyResponse::from(key))
}

pub async fn delete_key(pool: &DbPool, project_id: Uuid, id: Uuid) -> Result<()> {
    let result = sqlx::query("DELETE FROM sys_api_keys WHERE id = $1 AND project_id = $2")
        .bind(id)
        .bind(project_id)
        .execute(pool.inner())
        .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("API key not found".to_string()));
    }

    Ok(())
}
