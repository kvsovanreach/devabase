mod local;

pub use local::*;

use crate::{Config, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredFile {
    pub id: Uuid,
    pub filename: String,
    pub content_type: String,
    pub file_path: String,
    pub file_size: i64,
    pub checksum: Option<String>,
}

#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn store(&self, filename: &str, data: bytes::Bytes) -> Result<StoredFile>;
    async fn retrieve(&self, file_path: &str) -> Result<bytes::Bytes>;
    async fn delete(&self, file_path: &str) -> Result<()>;
    async fn exists(&self, file_path: &str) -> Result<bool>;
    fn get_url(&self, file_path: &str) -> String;
}

pub struct StorageService {
    backend: Box<dyn StorageBackend>,
}

impl StorageService {
    pub fn new(config: &Config) -> Result<Self> {
        let backend: Box<dyn StorageBackend> = match config.storage.driver.as_str() {
            "local" => Box::new(LocalStorage::new(&config.storage)?),
            _ => Box::new(LocalStorage::new(&config.storage)?),
        };

        Ok(Self { backend })
    }

    pub async fn store(&self, filename: &str, data: bytes::Bytes) -> Result<StoredFile> {
        self.backend.store(filename, data).await
    }

    pub async fn retrieve(&self, file_path: &str) -> Result<bytes::Bytes> {
        self.backend.retrieve(file_path).await
    }

    pub async fn delete(&self, file_path: &str) -> Result<()> {
        self.backend.delete(file_path).await
    }

    pub async fn exists(&self, file_path: &str) -> Result<bool> {
        self.backend.exists(file_path).await
    }

    pub fn get_url(&self, file_path: &str) -> String {
        self.backend.get_url(file_path)
    }
}
