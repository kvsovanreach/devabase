use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    #[serde(default)]
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    #[serde(default)]
    pub storage: StorageConfig,
    #[serde(default)]
    pub vector: VectorConfig,
    #[serde(default)]
    pub embedding: EmbeddingConfig,
    #[serde(default)]
    pub chunking: ChunkingConfig,
    #[serde(default)]
    pub cache: CacheConfig,
    #[serde(default)]
    pub events: EventsConfig,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub cors: CorsConfig,
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CorsConfig {
    #[serde(default = "default_cors_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub allowed_origins: Vec<String>,
    #[serde(default = "default_cors_allow_credentials")]
    pub allow_credentials: bool,
    #[serde(default = "default_cors_max_age")]
    pub max_age_secs: u64,
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            allowed_origins: vec![], // Empty = allow same-origin only in production
            allow_credentials: true,
            max_age_secs: 3600,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RateLimitConfig {
    #[serde(default = "default_rate_limit_enabled")]
    pub enabled: bool,
    #[serde(default = "default_rate_limit_requests")]
    pub requests_per_window: usize,
    #[serde(default = "default_rate_limit_window")]
    pub window_seconds: u64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            requests_per_window: 500,
            window_seconds: 60,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_true")]
    pub ui_enabled: bool,
    #[serde(default = "default_max_upload_size")]
    pub max_upload_size_mb: usize,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            ui_enabled: true,
            max_upload_size_mb: default_max_upload_size(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DatabaseConfig {
    pub url: String,
    #[serde(default = "default_max_connections")]
    pub max_connections: u32,
    #[serde(default = "default_min_connections")]
    pub min_connections: u32,
    #[serde(default = "default_true")]
    pub run_migrations: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StorageConfig {
    #[serde(default = "default_storage_driver")]
    pub driver: String,
    #[serde(default = "default_storage_path")]
    pub path: PathBuf,
    #[serde(default = "default_max_file_size")]
    pub max_file_size: String,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            driver: default_storage_driver(),
            path: default_storage_path(),
            max_file_size: default_max_file_size(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VectorConfig {
    #[serde(default = "default_dimensions")]
    pub default_dimensions: u32,
    #[serde(default = "default_metric")]
    pub default_metric: String,
    #[serde(default = "default_index_type")]
    pub index_type: String,
}

impl Default for VectorConfig {
    fn default() -> Self {
        Self {
            default_dimensions: default_dimensions(),
            default_metric: default_metric(),
            index_type: default_index_type(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmbeddingConfig {
    #[serde(default = "default_embedding_provider")]
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    #[serde(default = "default_embedding_model")]
    pub model: String,
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            provider: default_embedding_provider(),
            api_key: None,
            base_url: None,
            model: default_embedding_model(),
            batch_size: default_batch_size(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChunkingConfig {
    #[serde(default = "default_chunk_strategy")]
    pub default_strategy: String,
    #[serde(default = "default_chunk_size")]
    pub chunk_size: usize,
    #[serde(default = "default_chunk_overlap")]
    pub chunk_overlap: usize,
}

impl Default for ChunkingConfig {
    fn default() -> Self {
        Self {
            default_strategy: default_chunk_strategy(),
            chunk_size: default_chunk_size(),
            chunk_overlap: default_chunk_overlap(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CacheConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_cache_ttl")]
    pub ttl_seconds: u64,
    #[serde(default = "default_semantic_threshold")]
    pub semantic_threshold: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventsConfig {
    #[serde(default = "default_event_channel_capacity")]
    pub channel_capacity: usize,
}

impl Default for EventsConfig {
    fn default() -> Self {
        Self {
            channel_capacity: default_event_channel_capacity(),
        }
    }
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            ttl_seconds: default_cache_ttl(),
            semantic_threshold: default_semantic_threshold(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuthConfig {
    pub jwt_secret: Option<String>,
    #[serde(default = "default_api_key_prefix")]
    pub api_key_prefix: String,
    #[serde(default = "default_token_expiry")]
    pub token_expiry_hours: u64,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            jwt_secret: None,
            api_key_prefix: default_api_key_prefix(),
            token_expiry_hours: default_token_expiry(),
        }
    }
}

// Default value functions
fn default_host() -> String {
    "0.0.0.0".to_string()
}

fn default_port() -> u16 {
    9002
}

fn default_true() -> bool {
    true
}

fn default_max_connections() -> u32 {
    20
}

fn default_min_connections() -> u32 {
    5
}

fn default_storage_driver() -> String {
    "local".to_string()
}

fn default_storage_path() -> PathBuf {
    PathBuf::from("./data/files")
}

fn default_max_file_size() -> String {
    "100MB".to_string()
}

fn default_dimensions() -> u32 {
    1536
}

fn default_metric() -> String {
    "cosine".to_string()
}

fn default_index_type() -> String {
    "hnsw".to_string()
}

fn default_embedding_provider() -> String {
    // Default to "none" if no API key is configured
    // Users must explicitly set provider when they have an API key
    "none".to_string()
}

fn default_embedding_model() -> String {
    "text-embedding-3-small".to_string()
}

fn default_batch_size() -> usize {
    100
}

fn default_chunk_strategy() -> String {
    "markdown".to_string()
}

fn default_chunk_size() -> usize {
    512
}

fn default_chunk_overlap() -> usize {
    50
}

fn default_cache_ttl() -> u64 {
    86400
}

fn default_semantic_threshold() -> f32 {
    0.95
}

fn default_api_key_prefix() -> String {
    "dvb_".to_string()
}

fn default_token_expiry() -> u64 {
    24
}

fn default_cors_enabled() -> bool {
    true
}

fn default_cors_allow_credentials() -> bool {
    true
}

fn default_cors_max_age() -> u64 {
    3600
}

fn default_rate_limit_enabled() -> bool {
    true
}

fn default_rate_limit_requests() -> usize {
    500
}

fn default_rate_limit_window() -> u64 {
    60
}

fn default_max_upload_size() -> usize {
    50 // 50 MB default
}

fn default_event_channel_capacity() -> usize {
    1024
}

impl Config {
    pub fn from_file(path: &str) -> crate::Result<Self> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| crate::Error::Config(format!("Failed to read config file: {}", e)))?;

        let mut config: Config = toml::from_str(&content)
            .map_err(|e| crate::Error::Config(format!("Failed to parse config: {}", e)))?;

        // Expand environment variables
        config.expand_env_vars();

        Ok(config)
    }

    pub fn from_env() -> crate::Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| crate::Error::Config("DATABASE_URL is required".to_string()))?;

        let jwt_secret = std::env::var("JWT_SECRET").ok();
        let openai_api_key = std::env::var("OPENAI_API_KEY").ok();

        // Auto-select embedding provider based on available API key
        let embedding_provider = std::env::var("EMBEDDING_PROVIDER")
            .unwrap_or_else(|_| {
                if openai_api_key.is_some() {
                    "openai".to_string()
                } else {
                    "none".to_string()
                }
            });

        // Parse CORS_ORIGINS if set (comma-separated)
        let cors_origins: Vec<String> = std::env::var("CORS_ORIGINS")
            .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
            .unwrap_or_default();

        Ok(Config {
            server: ServerConfig::default(),
            database: DatabaseConfig {
                url: database_url,
                max_connections: default_max_connections(),
                min_connections: default_min_connections(),
                run_migrations: true,
            },
            storage: StorageConfig::default(),
            vector: VectorConfig::default(),
            embedding: EmbeddingConfig {
                provider: embedding_provider,
                api_key: openai_api_key,
                ..Default::default()
            },
            chunking: ChunkingConfig::default(),
            cache: CacheConfig::default(),
            events: EventsConfig::default(),
            auth: AuthConfig {
                jwt_secret,
                ..Default::default()
            },
            cors: CorsConfig {
                allowed_origins: cors_origins,
                ..Default::default()
            },
            rate_limit: RateLimitConfig::default(),
        })
    }

    fn expand_env_vars(&mut self) {
        self.database.url = expand_env(&self.database.url);

        if let Some(ref key) = self.embedding.api_key {
            self.embedding.api_key = Some(expand_env(key));
        }

        if let Some(ref secret) = self.auth.jwt_secret {
            self.auth.jwt_secret = Some(expand_env(secret));
        }
    }

    pub fn default_config_toml() -> &'static str {
        r#"# Devabase Configuration

[server]
host = "0.0.0.0"
port = 9002
ui_enabled = true
max_upload_size_mb = 50

[database]
url = "${DATABASE_URL}"
max_connections = 20
run_migrations = true

[storage]
driver = "local"
path = "./data/files"
max_file_size = "100MB"

[vector]
default_dimensions = 1536
default_metric = "cosine"
index_type = "hnsw"

[embedding]
provider = "openai"
api_key = "${OPENAI_API_KEY}"
# base_url = "https://api.openai.com/v1"  # Optional: for OpenAI-compatible APIs
# For Ollama: base_url = "http://localhost:11434"
model = "text-embedding-3-small"
batch_size = 100

[chunking]
default_strategy = "markdown"
chunk_size = 512
chunk_overlap = 50

[cache]
enabled = true
ttl_seconds = 86400

[events]
channel_capacity = 1024

[auth]
jwt_secret = "${JWT_SECRET}"
api_key_prefix = "dvb_"
token_expiry_hours = 24

[cors]
enabled = true
# SECURITY: In production, always specify allowed origins explicitly!
# Empty list allows ANY origin (not recommended for production)
# Example: allowed_origins = ["https://app.example.com", "https://admin.example.com"]
allowed_origins = []
allow_credentials = true
max_age_secs = 3600

[rate_limit]
enabled = true
requests_per_window = 500
window_seconds = 60
"#
    }

    /// Validate configuration and return warnings for production use
    pub fn validate(&self) -> Vec<String> {
        let mut warnings = Vec::new();

        // CORS warnings
        if self.cors.enabled && self.cors.allowed_origins.is_empty() {
            warnings.push(
                "SECURITY: CORS allowed_origins is empty - this allows ANY origin. \
                 Set specific origins in production: cors.allowed_origins = [\"https://your-app.com\"]"
                    .to_string(),
            );
        }

        // Auth warnings
        if self.auth.jwt_secret.is_none() {
            warnings.push(
                "WARNING: JWT secret not configured. User authentication will not work. \
                 Set JWT_SECRET environment variable or auth.jwt_secret in config."
                    .to_string(),
            );
        }

        // Embedding warnings
        if self.embedding.provider == "none" || self.embedding.provider == "disabled" {
            warnings.push(
                "INFO: Embedding provider is disabled. RAG features will not work. \
                 Configure an embedding provider to enable document search and chat."
                    .to_string(),
            );
        }

        // Check for unexpanded environment variables
        if self.database.url.contains("${") {
            warnings.push(format!(
                "ERROR: Database URL contains unexpanded variable: {}. \
                 Ensure environment variables are set.",
                self.database.url
            ));
        }

        warnings
    }
}

fn expand_env(s: &str) -> String {
    let mut result = s.to_string();

    // Find ${VAR} patterns and replace with env values
    while let Some(start) = result.find("${") {
        if let Some(end) = result[start..].find('}') {
            let var_name = &result[start + 2..start + end];
            let value = std::env::var(var_name).unwrap_or_default();
            result = format!("{}{}{}", &result[..start], value, &result[start + end + 1..]);
        } else {
            break;
        }
    }

    result
}
