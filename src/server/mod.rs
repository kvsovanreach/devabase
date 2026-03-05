pub mod middleware;
mod router;
pub mod websocket;

pub use router::*;

use crate::cache::CacheService;
use crate::db::DbPool;
use crate::events::{EventPublisher, SharedEventPublisher};
use crate::rag::EmbeddingService;
use crate::storage::StorageService;
use crate::Config;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub config: Arc<Config>,
    pub storage: Arc<StorageService>,
    pub embedding: Arc<EmbeddingService>,
    pub cache: Arc<CacheService>,
    pub events: SharedEventPublisher,
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
        }
    }
}
