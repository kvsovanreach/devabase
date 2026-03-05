use crate::{Config, Error, ErrorInfo, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────
// Project Embedding Provider Settings
// ─────────────────────────────────────────

/// Embedding provider configuration from project settings
#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingProviderConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub is_active: bool,
    pub dimensions: Option<usize>,
    pub max_tokens: Option<usize>,
}

/// Create an embedding provider from project settings
pub fn create_embedding_provider_from_config(
    config: &EmbeddingProviderConfig,
) -> Result<Box<dyn EmbeddingProvider>> {
    if !config.is_active {
        return Err(Error::Config(format!(
            "Embedding provider '{}' is not active",
            config.name
        )));
    }

    let provider: Box<dyn EmbeddingProvider> = match config.provider_type.as_str() {
        "openai" => Box::new(ProjectOpenAIEmbedding::new(config)?),
        "cohere" => Box::new(ProjectCohereEmbedding::new(config)?),
        "voyage" => Box::new(ProjectVoyageEmbedding::new(config)?),
        "ollama" => Box::new(ProjectOllamaEmbedding::new(config)?),
        "custom" => Box::new(ProjectCustomEmbedding::new(config)?),
        _ => {
            return Err(Error::Config(format!(
                "Unknown embedding provider type: '{}'. Supported: openai, cohere, voyage, ollama, custom",
                config.provider_type
            )))
        }
    };

    Ok(provider)
}

/// Get the default embedding provider from project settings
pub fn get_project_embedding_provider(
    settings: &serde_json::Value,
) -> Result<Box<dyn EmbeddingProvider>> {
    let embedding_providers = settings
        .get("embedding_providers")
        .and_then(|v| v.as_array())
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "No embedding providers configured",
                "EMBEDDING_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an embedding provider in Project Settings > Embedding Providers. Supported types: openai, ollama, custom.")
        ))?;

    if embedding_providers.is_empty() {
        return Err(Error::ConfigDetailed(
            ErrorInfo::new(
                "No embedding providers configured",
                "EMBEDDING_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an embedding provider in Project Settings > Embedding Providers. Supported types: openai, ollama, custom.")
        ));
    }

    // Get the default provider ID
    let default_provider_id = settings
        .get("default_embedding_provider")
        .and_then(|v| v.as_str());

    // Find the provider config
    let provider_config = if let Some(id) = default_provider_id {
        embedding_providers
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
            .ok_or_else(|| Error::ConfigDetailed(
                ErrorInfo::new(
                    format!("Default embedding provider '{}' not found", id),
                    "EMBEDDING_PROVIDER_NOT_FOUND"
                ).with_fix(format!("Either add an embedding provider with id '{}' in Project Settings, or change the default_embedding_provider setting.", id))
            ))?
    } else {
        // Use the first active provider
        embedding_providers
            .iter()
            .find(|p| p.get("is_active").and_then(|v| v.as_bool()).unwrap_or(false))
            .ok_or_else(|| Error::ConfigDetailed(
                ErrorInfo::new(
                    "No active embedding providers found",
                    "EMBEDDING_PROVIDER_INACTIVE"
                ).with_fix("Enable at least one embedding provider by setting is_active: true in Project Settings > Embedding Providers.")
            ))?
    };

    let config: EmbeddingProviderConfig = serde_json::from_value(provider_config.clone())
        .map_err(|e| Error::Config(format!("Invalid embedding provider config: {}", e)))?;

    create_embedding_provider_from_config(&config)
}

// ─────────────────────────────────────────
// Project-based Embedding Providers
// ─────────────────────────────────────────

/// OpenAI embedding provider from project settings
pub struct ProjectOpenAIEmbedding {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
    model: String,
    dimensions: usize,
}

impl ProjectOpenAIEmbedding {
    pub fn new(config: &EmbeddingProviderConfig) -> Result<Self> {
        let api_key = config.api_key.clone().ok_or_else(|| {
            Error::ConfigDetailed(
                ErrorInfo::new(
                    format!("OpenAI API key required for embedding provider '{}'", config.name),
                    "EMBEDDING_API_KEY_MISSING"
                ).with_fix("Add api_key to the embedding provider configuration in Project Settings. Get your API key from https://platform.openai.com/api-keys")
            )
        })?;

        let base_url = config
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

        let dimensions = config.dimensions.unwrap_or_else(|| {
            match config.model.as_str() {
                "text-embedding-3-small" => 1536,
                "text-embedding-3-large" => 3072,
                "text-embedding-ada-002" => 1536,
                _ => 1536,
            }
        });

        Ok(Self {
            client: reqwest::Client::new(),
            api_key,
            base_url,
            model: config.model.clone(),
            dimensions,
        })
    }
}

#[async_trait]
impl EmbeddingProvider for ProjectOpenAIEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let request = serde_json::json!({
            "input": texts,
            "model": self.model
        });

        let response = self
            .client
            .post(format!("{}/embeddings", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();

            // Parse error for actionable message
            let fix = if status.as_u16() == 401 {
                "Check that api_key is correct in Project Settings > Embedding Providers. Get a valid key from https://platform.openai.com/api-keys"
            } else if status.as_u16() == 429 {
                "Rate limit exceeded. Wait and retry, or upgrade your OpenAI plan."
            } else if status.as_u16() == 404 {
                "Model not found. Check that the model name is correct (e.g., text-embedding-3-small)."
            } else {
                "Check OpenAI API status at https://status.openai.com"
            };

            return Err(Error::EmbeddingDetailed(
                ErrorInfo::new(
                    format!("OpenAI embedding API error ({}): {}", status, error_text),
                    "OPENAI_EMBEDDING_API_ERROR"
                ).with_fix(fix)
            ));
        }

        let data: OpenAIResponse = response.json().await?;
        Ok(data.data.into_iter().map(|d| d.embedding).collect())
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

/// Cohere embedding provider from project settings
pub struct ProjectCohereEmbedding {
    client: reqwest::Client,
    api_key: String,
    model: String,
    dimensions: usize,
}

impl ProjectCohereEmbedding {
    pub fn new(config: &EmbeddingProviderConfig) -> Result<Self> {
        let api_key = config.api_key.clone().ok_or_else(|| {
            Error::ConfigDetailed(
                ErrorInfo::new(
                    format!("Cohere API key required for embedding provider '{}'", config.name),
                    "EMBEDDING_API_KEY_MISSING"
                ).with_fix("Add api_key to the embedding provider configuration in Project Settings. Get your API key from https://dashboard.cohere.com/api-keys")
            )
        })?;

        let dimensions = config.dimensions.unwrap_or_else(|| {
            match config.model.as_str() {
                "embed-english-v3.0" => 1024,
                "embed-multilingual-v3.0" => 1024,
                "embed-english-light-v3.0" => 384,
                "embed-multilingual-light-v3.0" => 384,
                _ => 1024,
            }
        });

        Ok(Self {
            client: reqwest::Client::new(),
            api_key,
            model: config.model.clone(),
            dimensions,
        })
    }
}

#[derive(Deserialize)]
struct CohereEmbeddingResponse {
    embeddings: Vec<Vec<f32>>,
}

#[async_trait]
impl EmbeddingProvider for ProjectCohereEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let request = serde_json::json!({
            "texts": texts,
            "model": self.model,
            "input_type": "search_document",
            "embedding_types": ["float"]
        });

        let response = self
            .client
            .post("https://api.cohere.ai/v1/embed")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();

            let fix = if status.as_u16() == 401 {
                "Check that api_key is correct in Project Settings > Embedding Providers. Get a valid key from https://dashboard.cohere.com/api-keys"
            } else if status.as_u16() == 429 {
                "Rate limit exceeded. Wait and retry, or upgrade your Cohere plan."
            } else {
                "Check Cohere API status at https://status.cohere.com"
            };

            return Err(Error::EmbeddingDetailed(
                ErrorInfo::new(
                    format!("Cohere embedding API error ({}): {}", status, error_text),
                    "COHERE_EMBEDDING_API_ERROR"
                ).with_fix(fix)
            ));
        }

        // Cohere v1 returns { embeddings: [[...], [...]] } for float type
        // Cohere v2 with embedding_types returns { embeddings: { float: [[...]] } }
        let json: serde_json::Value = response.json().await?;

        // Try v2 format first (embedding_types response)
        if let Some(embeddings) = json.get("embeddings")
            .and_then(|e| e.get("float"))
            .and_then(|f| f.as_array())
        {
            let result: Vec<Vec<f32>> = embeddings
                .iter()
                .filter_map(|arr| {
                    arr.as_array().map(|a| {
                        a.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect()
                    })
                })
                .collect();
            return Ok(result);
        }

        // Fall back to v1 format
        let data: CohereEmbeddingResponse = serde_json::from_value(json)
            .map_err(|e| Error::Embedding(format!("Failed to parse Cohere response: {}", e)))?;
        Ok(data.embeddings)
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

/// Voyage AI embedding provider from project settings
pub struct ProjectVoyageEmbedding {
    client: reqwest::Client,
    api_key: String,
    model: String,
    dimensions: usize,
}

impl ProjectVoyageEmbedding {
    pub fn new(config: &EmbeddingProviderConfig) -> Result<Self> {
        let api_key = config.api_key.clone().ok_or_else(|| {
            Error::ConfigDetailed(
                ErrorInfo::new(
                    format!("Voyage API key required for embedding provider '{}'", config.name),
                    "EMBEDDING_API_KEY_MISSING"
                ).with_fix("Add api_key to the embedding provider configuration in Project Settings. Get your API key from https://dash.voyageai.com/")
            )
        })?;

        let dimensions = config.dimensions.unwrap_or_else(|| {
            match config.model.as_str() {
                "voyage-3" => 1024,
                "voyage-3-lite" => 512,
                "voyage-large-2" => 1536,
                "voyage-code-2" => 1536,
                "voyage-2" => 1024,
                _ => 1024,
            }
        });

        Ok(Self {
            client: reqwest::Client::new(),
            api_key,
            model: config.model.clone(),
            dimensions,
        })
    }
}

#[async_trait]
impl EmbeddingProvider for ProjectVoyageEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let request = serde_json::json!({
            "input": texts,
            "model": self.model,
            "input_type": "document"
        });

        let response = self
            .client
            .post("https://api.voyageai.com/v1/embeddings")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();

            let fix = if status.as_u16() == 401 {
                "Check that api_key is correct in Project Settings > Embedding Providers. Get a valid key from https://dash.voyageai.com/"
            } else if status.as_u16() == 429 {
                "Rate limit exceeded. Wait and retry, or upgrade your Voyage AI plan."
            } else {
                "Check Voyage AI documentation at https://docs.voyageai.com"
            };

            return Err(Error::EmbeddingDetailed(
                ErrorInfo::new(
                    format!("Voyage embedding API error ({}): {}", status, error_text),
                    "VOYAGE_EMBEDDING_API_ERROR"
                ).with_fix(fix)
            ));
        }

        // Voyage uses OpenAI-compatible response format
        let data: OpenAIResponse = response.json().await?;
        Ok(data.data.into_iter().map(|d| d.embedding).collect())
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

/// Ollama embedding provider from project settings
pub struct ProjectOllamaEmbedding {
    client: reqwest::Client,
    base_url: String,
    model: String,
    dimensions: usize,
}

impl ProjectOllamaEmbedding {
    pub fn new(config: &EmbeddingProviderConfig) -> Result<Self> {
        let base_url = config
            .base_url
            .clone()
            .unwrap_or_else(|| "http://localhost:11434".to_string());

        Ok(Self {
            client: reqwest::Client::new(),
            base_url,
            model: config.model.clone(),
            dimensions: config.dimensions.unwrap_or(1536),
        })
    }
}

#[async_trait]
impl EmbeddingProvider for ProjectOllamaEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let mut embeddings = Vec::new();

        for text in texts {
            let request = serde_json::json!({
                "model": self.model,
                "prompt": text
            });

            let response = self
                .client
                .post(format!("{}/api/embeddings", self.base_url))
                .json(&request)
                .send()
                .await?;

            if !response.status().is_success() {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();

                let fix = if status.as_u16() == 404 || error_text.contains("model") {
                    format!("Model '{}' not found. Run: ollama pull {}", self.model, self.model)
                } else if error_text.contains("connection refused") || status.as_u16() == 0 {
                    format!("Cannot connect to Ollama at {}. Ensure Ollama is running: ollama serve", self.base_url)
                } else {
                    "Check Ollama logs for details: ollama logs".to_string()
                };

                return Err(Error::EmbeddingDetailed(
                    ErrorInfo::new(
                        format!("Ollama embedding API error ({}): {}", status, error_text),
                        "OLLAMA_EMBEDDING_API_ERROR"
                    ).with_fix(fix)
                ));
            }

            let data: OllamaResponse = response.json().await?;
            embeddings.push(data.embedding);
        }

        Ok(embeddings)
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

/// Custom embedding provider from project settings
pub struct ProjectCustomEmbedding {
    client: reqwest::Client,
    base_url: String,
    api_key: Option<String>,
    model: String,
    dimensions: usize,
}

impl ProjectCustomEmbedding {
    pub fn new(config: &EmbeddingProviderConfig) -> Result<Self> {
        let base_url = config.base_url.clone().ok_or_else(|| {
            Error::ConfigDetailed(
                ErrorInfo::new(
                    format!("Base URL required for custom embedding provider '{}'", config.name),
                    "EMBEDDING_BASE_URL_MISSING"
                ).with_fix("Add base_url to the custom embedding provider in Project Settings (e.g., http://localhost:8000/v1/embeddings)")
            )
        })?;

        Ok(Self {
            client: reqwest::Client::new(),
            base_url,
            api_key: config.api_key.clone(),
            model: config.model.clone(),
            dimensions: config.dimensions.unwrap_or(1536),
        })
    }
}

#[async_trait]
impl EmbeddingProvider for ProjectCustomEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let request = serde_json::json!({
            "input": texts,
            "model": self.model
        });

        let mut req_builder = self
            .client
            .post(&self.base_url)
            .header("Content-Type", "application/json")
            .json(&request);

        // Add API key header if configured
        if let Some(ref api_key) = self.api_key {
            req_builder = req_builder.header("X-API-KEY", api_key);
            req_builder = req_builder.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = req_builder.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Embedding(format!(
                "Custom embedding API error ({}): {}",
                status, error_text
            )));
        }

        let data: CustomEmbeddingResponse = response.json().await.map_err(|e| {
            Error::Embedding(format!(
                "Failed to parse embedding response: {}. Expected format: {{ \"data\": [{{ \"embedding\": [...], \"index\": 0 }}] }}",
                e
            ))
        })?;

        // Sort by index and extract embeddings
        let mut embeddings: Vec<(usize, Vec<f32>)> = data
            .data
            .into_iter()
            .map(|d| (d.index, d.embedding))
            .collect();
        embeddings.sort_by_key(|(idx, _)| *idx);

        Ok(embeddings.into_iter().map(|(_, emb)| emb).collect())
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

// ─────────────────────────────────────────
// Original Static Embedding Service
// ─────────────────────────────────────────

#[async_trait]
pub trait EmbeddingProvider: Send + Sync {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>>;
    fn dimensions(&self) -> usize;
    fn model_name(&self) -> &str;
}

pub struct EmbeddingService {
    provider: Box<dyn EmbeddingProvider>,
    batch_size: usize,
}

impl EmbeddingService {
    pub fn new(config: &Config) -> Result<Self> {
        let provider: Box<dyn EmbeddingProvider> = match config.embedding.provider.as_str() {
            "none" | "disabled" => Box::new(DisabledEmbedding::new(config)),
            "openai" => Box::new(OpenAIEmbedding::new(config)?),
            "ollama" => Box::new(OllamaEmbedding::new(config)?),
            "custom" => Box::new(CustomEmbedding::new(config)?),
            _ => {
                return Err(Error::Config(format!(
                    "Unknown embedding provider: '{}'. Supported providers: none, openai, ollama, custom",
                    config.embedding.provider
                )))
            }
        };

        Ok(Self {
            provider,
            batch_size: config.embedding.batch_size,
        })
    }

    pub async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let mut all_embeddings = Vec::new();

        // Process in batches
        for chunk in texts.chunks(self.batch_size) {
            let embeddings = self.provider.embed(chunk).await?;
            all_embeddings.extend(embeddings);
        }

        Ok(all_embeddings)
    }

    pub async fn embed_single(&self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.embed(&[text.to_string()]).await?;
        embeddings
            .into_iter()
            .next()
            .ok_or_else(|| Error::Embedding("No embedding returned".to_string()))
    }

    pub fn dimensions(&self) -> usize {
        self.provider.dimensions()
    }
}

// Disabled Embedding Provider (allows server to start without embedding config)
pub struct DisabledEmbedding {
    dimensions: usize,
}

impl DisabledEmbedding {
    pub fn new(config: &Config) -> Self {
        Self {
            dimensions: config.vector.default_dimensions as usize,
        }
    }
}

#[async_trait]
impl EmbeddingProvider for DisabledEmbedding {
    async fn embed(&self, _texts: &[String]) -> Result<Vec<Vec<f32>>> {
        Err(Error::ConfigDetailed(
            ErrorInfo::new(
                "Embedding provider is disabled",
                "EMBEDDING_PROVIDER_DISABLED"
            ).with_fix("Configure an embedding provider in Project Settings > Embedding Providers. Options: openai (requires API key), ollama (local), or custom (your own endpoint).")
        ))
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        "disabled"
    }
}

// OpenAI Embedding Provider
pub struct OpenAIEmbedding {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
    model: String,
    dimensions: usize,
}

#[derive(Serialize)]
struct OpenAIRequest {
    input: Vec<String>,
    model: String,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    data: Vec<OpenAIEmbeddingData>,
}

#[derive(Deserialize)]
struct OpenAIEmbeddingData {
    embedding: Vec<f32>,
}

impl OpenAIEmbedding {
    pub fn new(config: &Config) -> Result<Self> {
        let api_key = config
            .embedding
            .api_key
            .clone()
            .ok_or_else(|| Error::Config(
                "OpenAI API key required. Set OPENAI_API_KEY environment variable or embedding.api_key in config".to_string()
            ))?;

        let base_url = config
            .embedding
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

        let dimensions = match config.embedding.model.as_str() {
            "text-embedding-3-small" => 1536,
            "text-embedding-3-large" => 3072,
            "text-embedding-ada-002" => 1536,
            _ => config.vector.default_dimensions as usize,
        };

        Ok(Self {
            client: reqwest::Client::new(),
            api_key,
            base_url,
            model: config.embedding.model.clone(),
            dimensions,
        })
    }
}

#[async_trait]
impl EmbeddingProvider for OpenAIEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let request = OpenAIRequest {
            input: texts.to_vec(),
            model: self.model.clone(),
        };

        let response = self
            .client
            .post(format!("{}/embeddings", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Embedding(format!(
                "OpenAI API error ({}): {}",
                status, error_text
            )));
        }

        let data: OpenAIResponse = response.json().await?;
        Ok(data.data.into_iter().map(|d| d.embedding).collect())
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

// Ollama Embedding Provider
pub struct OllamaEmbedding {
    client: reqwest::Client,
    base_url: String,
    model: String,
    dimensions: usize,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
}

#[derive(Deserialize)]
struct OllamaResponse {
    embedding: Vec<f32>,
}

impl OllamaEmbedding {
    pub fn new(config: &Config) -> Result<Self> {
        let base_url = config
            .embedding
            .base_url
            .clone()
            .unwrap_or_else(|| "http://localhost:11434".to_string());

        Ok(Self {
            client: reqwest::Client::new(),
            base_url,
            model: config.embedding.model.clone(),
            dimensions: config.vector.default_dimensions as usize,
        })
    }
}

#[async_trait]
impl EmbeddingProvider for OllamaEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let mut embeddings = Vec::new();

        for text in texts {
            let request = OllamaRequest {
                model: self.model.clone(),
                prompt: text.clone(),
            };

            let response = self
                .client
                .post(format!("{}/api/embeddings", self.base_url))
                .json(&request)
                .send()
                .await?;

            if !response.status().is_success() {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();
                return Err(Error::Embedding(format!(
                    "Ollama API error ({}): {}",
                    status, error_text
                )));
            }

            let data: OllamaResponse = response.json().await?;
            embeddings.push(data.embedding);
        }

        Ok(embeddings)
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

// Custom HTTP Embedding Provider (OpenAI-compatible API format)
// Endpoint format: {base_url}/{model}/embeddings
// Authentication: X-API-KEY header
// Response format: { "data": [{ "embedding": [...], "index": 0 }] }
pub struct CustomEmbedding {
    client: reqwest::Client,
    base_url: String,
    api_key: Option<String>,
    model: String,
    dimensions: usize,
}

#[derive(Serialize)]
struct CustomEmbeddingRequest {
    input: Vec<String>,
    model: String,
}

#[derive(Deserialize)]
struct CustomEmbeddingResponse {
    data: Vec<CustomEmbeddingData>,
}

#[derive(Deserialize)]
struct CustomEmbeddingData {
    embedding: Vec<f32>,
    /// Index field from API response - used for sorting embeddings back to original order
    index: usize,
}

impl CustomEmbedding {
    pub fn new(config: &Config) -> Result<Self> {
        let base_url = config
            .embedding
            .base_url
            .clone()
            .ok_or_else(|| Error::Config(
                "Custom embedding base_url required. Set embedding.base_url in config (e.g., http://host:port/api/v1)".to_string()
            ))?;

        Ok(Self {
            client: reqwest::Client::new(),
            base_url,
            api_key: config.embedding.api_key.clone(),
            model: config.embedding.model.clone(),
            dimensions: config.vector.default_dimensions as usize,
        })
    }
}

#[async_trait]
impl EmbeddingProvider for CustomEmbedding {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        // Build endpoint URL: {base_url}/{model}/embeddings
        let endpoint = format!("{}/{}/embeddings", self.base_url.trim_end_matches('/'), self.model);

        let request = CustomEmbeddingRequest {
            input: texts.to_vec(),
            model: self.model.clone(),
        };

        let mut req_builder = self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&request);

        // Add X-API-KEY header if configured
        if let Some(ref api_key) = self.api_key {
            req_builder = req_builder.header("X-API-KEY", api_key);
        }

        let response = req_builder.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Embedding(format!(
                "Custom embedding API error ({}): {}",
                status, error_text
            )));
        }

        let data: CustomEmbeddingResponse = response.json().await.map_err(|e| {
            Error::Embedding(format!(
                "Failed to parse custom embedding response: {}. Expected format: {{ \"data\": [{{ \"embedding\": [...], \"index\": 0 }}] }}",
                e
            ))
        })?;

        // Sort by index and extract embeddings
        let mut embeddings: Vec<(usize, Vec<f32>)> = data
            .data
            .into_iter()
            .map(|d| (d.index, d.embedding))
            .collect();
        embeddings.sort_by_key(|(idx, _)| *idx);

        Ok(embeddings.into_iter().map(|(_, emb)| emb).collect())
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}
