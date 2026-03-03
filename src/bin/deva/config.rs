//! Configuration management for the CLI
//! Stores credentials and settings in ~/.devabase/config.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// API base URL
    #[serde(default = "default_api_url")]
    pub api_url: String,

    /// Authentication token
    pub token: Option<String>,

    /// Refresh token
    pub refresh_token: Option<String>,

    /// Current project ID
    pub current_project: Option<String>,

    /// Current project name (for display)
    pub current_project_name: Option<String>,

    /// User email (for display)
    pub user_email: Option<String>,
}

fn default_api_url() -> String {
    "http://localhost:9002".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            api_url: default_api_url(),
            token: None,
            refresh_token: None,
            current_project: None,
            current_project_name: None,
            user_email: None,
        }
    }
}

impl Config {
    /// Get the config directory path
    pub fn config_dir() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".devabase")
    }

    /// Get the config file path
    pub fn config_path() -> PathBuf {
        Self::config_dir().join("config.json")
    }

    /// Load config from disk
    pub fn load() -> Result<Self, ConfigError> {
        let path = Self::config_path();

        if !path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| ConfigError::Read(e.to_string()))?;

        serde_json::from_str(&content)
            .map_err(|e| ConfigError::Parse(e.to_string()))
    }

    /// Save config to disk
    pub fn save(&self) -> Result<(), ConfigError> {
        let dir = Self::config_dir();

        // Create directory if it doesn't exist
        if !dir.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| ConfigError::Write(e.to_string()))?;
        }

        let content = serde_json::to_string_pretty(self)
            .map_err(|e| ConfigError::Serialize(e.to_string()))?;

        fs::write(Self::config_path(), content)
            .map_err(|e| ConfigError::Write(e.to_string()))?;

        Ok(())
    }

    /// Clear authentication data
    pub fn clear_auth(&mut self) {
        self.token = None;
        self.refresh_token = None;
        self.user_email = None;
    }

    /// Check if authenticated
    pub fn is_authenticated(&self) -> bool {
        self.token.is_some()
    }

    /// Get API URL with /v1 suffix
    pub fn api_base(&self) -> String {
        format!("{}/v1", self.api_url.trim_end_matches('/'))
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Failed to read config: {0}")]
    Read(String),

    #[error("Failed to parse config: {0}")]
    Parse(String),

    #[error("Failed to write config: {0}")]
    Write(String),

    #[error("Failed to serialize config: {0}")]
    Serialize(String),
}
