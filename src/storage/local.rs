use super::{StorageBackend, StoredFile};
use crate::config::StorageConfig;
use crate::{Error, Result};
use async_trait::async_trait;
use bytes::Bytes;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

pub struct LocalStorage {
    base_path: PathBuf,
}

impl LocalStorage {
    pub fn new(config: &StorageConfig) -> Result<Self> {
        let base_path = config.path.clone();

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&base_path)
            .map_err(|e| Error::Storage(format!("Failed to create storage directory: {}", e)))?;

        Ok(Self { base_path })
    }

    fn get_file_path(&self, filename: &str) -> PathBuf {
        // Organize files by date and UUID prefix for scalability
        let id = Uuid::new_v4();
        let date = chrono::Utc::now().format("%Y/%m/%d");
        let prefix = &id.to_string()[..2];

        self.base_path
            .join(date.to_string())
            .join(prefix)
            .join(format!("{}_{}", id, filename))
    }

    fn compute_checksum(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }
}

#[async_trait]
impl StorageBackend for LocalStorage {
    async fn store(&self, filename: &str, data: Bytes) -> Result<StoredFile> {
        let file_path = self.get_file_path(filename);

        // Create parent directories
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| Error::Storage(format!("Failed to create directory: {}", e)))?;
        }

        // Compute checksum
        let checksum = Self::compute_checksum(&data);

        // Write file
        let mut file = fs::File::create(&file_path)
            .await
            .map_err(|e| Error::Storage(format!("Failed to create file: {}", e)))?;

        file.write_all(&data)
            .await
            .map_err(|e| Error::Storage(format!("Failed to write file: {}", e)))?;

        file.flush()
            .await
            .map_err(|e| Error::Storage(format!("Failed to flush file: {}", e)))?;

        // Detect content type
        let content_type = mime_guess::from_path(filename)
            .first_or_octet_stream()
            .to_string();

        let relative_path = file_path
            .strip_prefix(&self.base_path)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .to_string();

        Ok(StoredFile {
            id: Uuid::new_v4(),
            filename: filename.to_string(),
            content_type,
            file_path: relative_path,
            file_size: data.len() as i64,
            checksum: Some(checksum),
        })
    }

    async fn retrieve(&self, file_path: &str) -> Result<Bytes> {
        let full_path = self.base_path.join(file_path);

        let data = fs::read(&full_path)
            .await
            .map_err(|e| Error::Storage(format!("Failed to read file: {}", e)))?;

        Ok(Bytes::from(data))
    }

    async fn delete(&self, file_path: &str) -> Result<()> {
        let full_path = self.base_path.join(file_path);

        fs::remove_file(&full_path)
            .await
            .map_err(|e| Error::Storage(format!("Failed to delete file: {}", e)))?;

        Ok(())
    }

    async fn exists(&self, file_path: &str) -> Result<bool> {
        let full_path = self.base_path.join(file_path);
        Ok(full_path.exists())
    }

    fn get_url(&self, file_path: &str) -> String {
        format!("/v1/files/{}", file_path)
    }
}
