pub mod middleware;
mod router;
pub mod websocket;

pub use router::*;

use crate::auth::ApiKeyCache;
use crate::cache::CacheService;
use crate::db::DbPool;
use crate::db::models::user_table::TableInfo;
use crate::events::{EventPublisher, SharedEventPublisher};
use crate::rag::EmbeddingService;
use crate::storage::StorageService;
use crate::Config;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Cached table schema with expiration
struct CachedSchema {
    info: TableInfo,
    expires_at: std::time::Instant,
}

/// In-memory table schema cache to avoid repeated information_schema lookups.
/// Each entry has a 60-second TTL.
pub struct TableSchemaCache {
    entries: RwLock<HashMap<(Uuid, String), CachedSchema>>,
    ttl: std::time::Duration,
}

impl TableSchemaCache {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            ttl: std::time::Duration::from_secs(ttl_secs),
        }
    }

    pub async fn get(&self, project_id: Uuid, table_name: &str) -> Option<TableInfo> {
        let entries = self.entries.read().await;
        let key = (project_id, table_name.to_string());
        if let Some(cached) = entries.get(&key) {
            if cached.expires_at > std::time::Instant::now() {
                return Some(cached.info.clone());
            }
        }
        None
    }

    pub async fn set(&self, project_id: Uuid, table_name: &str, info: TableInfo) {
        let mut entries = self.entries.write().await;
        let key = (project_id, table_name.to_string());
        entries.insert(key, CachedSchema {
            info,
            expires_at: std::time::Instant::now() + self.ttl,
        });
    }

    pub async fn invalidate(&self, project_id: Uuid, table_name: &str) {
        let mut entries = self.entries.write().await;
        entries.remove(&(project_id, table_name.to_string()));
    }
}

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub config: Arc<Config>,
    pub storage: Arc<StorageService>,
    pub embedding: Arc<EmbeddingService>,
    pub cache: Arc<CacheService>,
    pub events: SharedEventPublisher,
    pub table_schema_cache: Arc<TableSchemaCache>,
    pub api_key_cache: Arc<ApiKeyCache>,
}

impl AppState {
    pub fn new(
        pool: DbPool,
        config: Config,
        storage: StorageService,
        embedding: EmbeddingService,
    ) -> Self {
        let cache = CacheService::new(pool.clone(), &config);
        let events = Arc::new(EventPublisher::with_capacity(config.events.channel_capacity));

        Self {
            pool: pool.clone(),
            config: Arc::new(config),
            storage: Arc::new(storage),
            embedding: Arc::new(embedding),
            cache: Arc::new(cache),
            events,
            table_schema_cache: Arc::new(TableSchemaCache::new(60)),
            api_key_cache: Arc::new(ApiKeyCache::new(300)), // 5 minute TTL
        }
    }
}
