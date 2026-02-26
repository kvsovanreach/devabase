use crate::{config::DatabaseConfig, Result};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::sync::Arc;

#[derive(Clone)]
pub struct DbPool {
    inner: Arc<PgPool>,
}

impl DbPool {
    pub fn new(pool: PgPool) -> Self {
        Self {
            inner: Arc::new(pool),
        }
    }

    pub fn inner(&self) -> &PgPool {
        &self.inner
    }
}

impl std::ops::Deref for DbPool {
    type Target = PgPool;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

pub async fn create_pool(config: &DatabaseConfig) -> Result<PgPool> {
    tracing::info!("Connecting to database...");

    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .connect(&config.url)
        .await?;

    // Verify connection and check for pgvector
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await?;

    tracing::info!("Database connection established");

    // Check if pgvector extension exists
    let pgvector_check: Option<(bool,)> = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
    )
    .fetch_optional(&pool)
    .await?;

    if pgvector_check.map(|r| r.0).unwrap_or(false) {
        tracing::info!("pgvector extension is available");
    } else {
        tracing::warn!("pgvector extension not found - vector features will be limited");
    }

    Ok(pool)
}
