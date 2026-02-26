pub mod models;
pub mod pool;

pub use pool::DbPool;

use crate::{Config, Result};
use sqlx::PgPool;

pub async fn init(config: &Config) -> Result<DbPool> {
    let pool = pool::create_pool(&config.database).await?;

    if config.database.run_migrations {
        run_migrations(&pool).await?;
    }

    Ok(DbPool::new(pool))
}

async fn run_migrations(pool: &PgPool) -> Result<()> {
    tracing::info!("Running database migrations...");

    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|e| crate::Error::Database(sqlx::Error::Migrate(Box::new(e))))?;

    tracing::info!("Migrations completed successfully");
    Ok(())
}
