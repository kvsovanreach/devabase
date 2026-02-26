use crate::db::DbPool;
use crate::{Config, Result};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub id: Uuid,
    pub cache_key: String,
    pub cache_type: String,
    pub response: String,
    pub token_count: Option<i32>,
    pub hit_count: i32,
    pub expires_at: chrono::DateTime<Utc>,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total_entries: i64,
    pub total_hits: i64,
    pub total_size_bytes: i64,
    pub hit_rate: f64,
}

pub struct CacheService {
    pool: DbPool,
    enabled: bool,
    ttl_seconds: u64,
}

impl CacheService {
    pub fn new(pool: DbPool, config: &Config) -> Self {
        Self {
            pool,
            enabled: config.cache.enabled,
            ttl_seconds: config.cache.ttl_seconds,
        }
    }

    pub fn compute_key(input: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        if !self.enabled {
            return Ok(None);
        }

        let entry: Option<(String, Uuid)> = sqlx::query_as(
            r#"
            SELECT response, id FROM sys_cache
            WHERE cache_key = $1 AND expires_at > NOW()
            "#,
        )
        .bind(key)
        .fetch_optional(self.pool.inner())
        .await?;

        if let Some((response, id)) = entry {
            // Update hit count and last accessed
            sqlx::query(
                r#"
                UPDATE sys_cache
                SET hit_count = hit_count + 1, last_accessed_at = NOW()
                WHERE id = $1
                "#,
            )
            .bind(id)
            .execute(self.pool.inner())
            .await?;

            return Ok(Some(response));
        }

        Ok(None)
    }

    pub async fn set(
        &self,
        key: &str,
        response: &str,
        cache_type: &str,
        token_count: Option<i32>,
    ) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        let id = Uuid::new_v4();
        let expires_at = Utc::now() + Duration::seconds(self.ttl_seconds as i64);

        sqlx::query(
            r#"
            INSERT INTO sys_cache (id, cache_key, cache_type, request_hash, response, token_count, expires_at)
            VALUES ($1, $2, $3, $2, $4, $5, $6)
            ON CONFLICT (cache_key) DO UPDATE SET
                response = EXCLUDED.response,
                token_count = EXCLUDED.token_count,
                expires_at = EXCLUDED.expires_at,
                last_accessed_at = NOW()
            "#,
        )
        .bind(id)
        .bind(key)
        .bind(cache_type)
        .bind(response)
        .bind(token_count)
        .bind(expires_at)
        .execute(self.pool.inner())
        .await?;

        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM sys_cache WHERE cache_key = $1")
            .bind(key)
            .execute(self.pool.inner())
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn clear(&self) -> Result<i64> {
        let result = sqlx::query("DELETE FROM sys_cache")
            .execute(self.pool.inner())
            .await?;

        Ok(result.rows_affected() as i64)
    }

    pub async fn cleanup_expired(&self) -> Result<i64> {
        let result = sqlx::query("DELETE FROM sys_cache WHERE expires_at < NOW()")
            .execute(self.pool.inner())
            .await?;

        Ok(result.rows_affected() as i64)
    }

    pub async fn stats(&self) -> Result<CacheStats> {
        let (total_entries,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM sys_cache WHERE expires_at > NOW()")
                .fetch_one(self.pool.inner())
                .await?;

        let (total_hits,): (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(hit_count), 0) FROM sys_cache WHERE expires_at > NOW()",
        )
        .fetch_one(self.pool.inner())
        .await?;

        let (total_size_bytes,): (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(LENGTH(response)), 0) FROM sys_cache WHERE expires_at > NOW()",
        )
        .fetch_one(self.pool.inner())
        .await?;

        // Calculate hit rate (hits / (hits + entries)) as a rough approximation
        let hit_rate = if total_entries > 0 {
            total_hits as f64 / (total_hits + total_entries) as f64
        } else {
            0.0
        };

        Ok(CacheStats {
            total_entries,
            total_hits,
            total_size_bytes,
            hit_rate,
        })
    }
}
