use crate::db::models::{ApiKey, ApiKeyCreated, ApiKeyResponse, CreateApiKey};
use crate::db::DbPool;
use crate::{Error, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose, Engine as _};
use rand::Rng;
use uuid::Uuid;

/// Simple auth context for API key verification (internal use)
#[derive(Debug, Clone)]
pub struct ApiKeyContext {
    pub api_key_id: Uuid,
    pub project_id: Uuid,
    pub scopes: Vec<String>,
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
    input: CreateApiKey,
    prefix: &str,
) -> Result<ApiKeyCreated> {
    let key = generate_key(prefix);
    let key_hash = hash_key(&key)?;
    let key_prefix = format!("{}...", &key[..12]);

    let id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO sys_api_keys (id, project_id, name, key_hash, key_prefix, scopes, rate_limit, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(id)
    .bind(project_id)
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
    // Get all keys and check against hash (in production, use a prefix index)
    let keys: Vec<ApiKey> = sqlx::query_as(
        r#"
        SELECT * FROM sys_api_keys
        WHERE project_id IS NOT NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        "#,
    )
    .fetch_all(pool.inner())
    .await?;

    for api_key in keys {
        if verify_key_hash(key, &api_key.key_hash) {
            // API key must have a project_id
            let project_id = api_key.project_id.ok_or_else(|| {
                Error::Auth("API key is not associated with a project".to_string())
            })?;

            // Update last_used_at
            sqlx::query("UPDATE sys_api_keys SET last_used_at = NOW() WHERE id = $1")
                .bind(api_key.id)
                .execute(pool.inner())
                .await?;

            return Ok(ApiKeyContext {
                api_key_id: api_key.id,
                project_id,
                scopes: api_key.scopes,
            });
        }
    }

    Err(Error::Auth("Invalid API key".to_string()))
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

pub async fn get_key(pool: &DbPool, project_id: Uuid, id: Uuid) -> Result<ApiKeyResponse> {
    let key: ApiKey = sqlx::query_as("SELECT * FROM sys_api_keys WHERE id = $1 AND project_id = $2")
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
