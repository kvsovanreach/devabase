//! Reranking providers for improving search result relevance.
//!
//! Reranking uses cross-encoder models to score document relevance more accurately
//! than bi-encoder embedding similarity. It's slower but more accurate.

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::Result;

/// Result of reranking a single document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RerankResult {
    /// Original index in the input document list
    pub index: usize,
    /// Relevance score (0-1, higher is better)
    pub score: f64,
    /// Original document text
    pub document: String,
}

/// Configuration for a reranking provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RerankProviderConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    #[serde(default)]
    pub is_active: bool,
}

/// Trait for reranking providers
#[async_trait]
pub trait Reranker: Send + Sync {
    /// Rerank documents based on relevance to query
    async fn rerank(
        &self,
        query: &str,
        documents: Vec<String>,
        top_n: Option<usize>,
    ) -> Result<Vec<RerankResult>>;

    /// Get the provider name
    fn provider_name(&self) -> &str;

    /// Get the model name
    fn model_name(&self) -> &str;
}

// =============================================================================
// Cohere Reranker
// =============================================================================

/// Cohere Rerank API implementation
pub struct CohereReranker {
    client: Client,
    api_key: String,
    model: String,
}

impl CohereReranker {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "rerank-english-v3.0".to_string()),
        }
    }
}

#[derive(Serialize)]
struct CohereRerankRequest {
    query: String,
    documents: Vec<String>,
    model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_n: Option<usize>,
}

#[derive(Deserialize)]
struct CohereRerankResponse {
    results: Vec<CohereRerankResult>,
}

#[derive(Deserialize)]
struct CohereRerankResult {
    index: usize,
    relevance_score: f64,
}

#[async_trait]
impl Reranker for CohereReranker {
    async fn rerank(
        &self,
        query: &str,
        documents: Vec<String>,
        top_n: Option<usize>,
    ) -> Result<Vec<RerankResult>> {
        if documents.is_empty() {
            return Ok(vec![]);
        }

        let docs_clone = documents.clone();
        let request = CohereRerankRequest {
            query: query.to_string(),
            documents,
            model: self.model.clone(),
            top_n,
        };

        let response = self
            .client
            .post("https://api.cohere.ai/v1/rerank")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| crate::Error::Rerank(format!("Cohere request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(crate::Error::Rerank(format!(
                "Cohere API error {}: {}",
                status, text
            )));
        }

        let result: CohereRerankResponse = response
            .json()
            .await
            .map_err(|e| crate::Error::Rerank(format!("Failed to parse Cohere response: {}", e)))?;

        Ok(result
            .results
            .into_iter()
            .map(|r| RerankResult {
                index: r.index,
                score: r.relevance_score,
                document: docs_clone[r.index].clone(),
            })
            .collect())
    }

    fn provider_name(&self) -> &str {
        "cohere"
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

// =============================================================================
// Jina Reranker
// =============================================================================

/// Jina Rerank API implementation
pub struct JinaReranker {
    client: Client,
    api_key: String,
    model: String,
}

impl JinaReranker {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "jina-reranker-v2-base-multilingual".to_string()),
        }
    }
}

#[derive(Serialize)]
struct JinaRerankRequest {
    query: String,
    documents: Vec<String>,
    model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_n: Option<usize>,
}

#[derive(Deserialize)]
struct JinaRerankResponse {
    results: Vec<JinaRerankResult>,
}

#[derive(Deserialize)]
struct JinaRerankResult {
    index: usize,
    relevance_score: f64,
}

#[async_trait]
impl Reranker for JinaReranker {
    async fn rerank(
        &self,
        query: &str,
        documents: Vec<String>,
        top_n: Option<usize>,
    ) -> Result<Vec<RerankResult>> {
        if documents.is_empty() {
            return Ok(vec![]);
        }

        let docs_clone = documents.clone();
        let request = JinaRerankRequest {
            query: query.to_string(),
            documents,
            model: self.model.clone(),
            top_n,
        };

        let response = self
            .client
            .post("https://api.jina.ai/v1/rerank")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| crate::Error::Rerank(format!("Jina request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(crate::Error::Rerank(format!(
                "Jina API error {}: {}",
                status, text
            )));
        }

        let result: JinaRerankResponse = response
            .json()
            .await
            .map_err(|e| crate::Error::Rerank(format!("Failed to parse Jina response: {}", e)))?;

        Ok(result
            .results
            .into_iter()
            .map(|r| RerankResult {
                index: r.index,
                score: r.relevance_score,
                document: docs_clone[r.index].clone(),
            })
            .collect())
    }

    fn provider_name(&self) -> &str {
        "jina"
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

// =============================================================================
// Custom Reranker (OpenAI-compatible or custom API)
// =============================================================================

/// Custom reranker for OpenAI-compatible or custom APIs
pub struct CustomReranker {
    client: Client,
    base_url: String,
    api_key: Option<String>,
    model: String,
}

impl CustomReranker {
    pub fn new(base_url: String, api_key: Option<String>, model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            model: model.unwrap_or_else(|| "rerank".to_string()),
        }
    }
}

#[derive(Serialize)]
struct CustomRerankRequest {
    query: String,
    documents: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_n: Option<usize>,
}

#[derive(Deserialize)]
struct CustomRerankResponse {
    results: Vec<CustomRerankResult>,
}

#[derive(Deserialize)]
struct CustomRerankResult {
    index: usize,
    #[serde(alias = "relevance_score", alias = "score")]
    relevance_score: f64,
}

#[async_trait]
impl Reranker for CustomReranker {
    async fn rerank(
        &self,
        query: &str,
        documents: Vec<String>,
        top_n: Option<usize>,
    ) -> Result<Vec<RerankResult>> {
        if documents.is_empty() {
            return Ok(vec![]);
        }

        let docs_clone = documents.clone();
        let request = CustomRerankRequest {
            query: query.to_string(),
            documents,
            model: Some(self.model.clone()),
            top_n,
        };

        let endpoint = format!("{}/rerank", self.base_url);
        let mut req = self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json");

        if let Some(ref api_key) = self.api_key {
            req = req
                .header("Authorization", format!("Bearer {}", api_key))
                .header("X-API-Key", api_key);
        }

        let response = req
            .json(&request)
            .send()
            .await
            .map_err(|e| crate::Error::Rerank(format!("Custom rerank request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(crate::Error::Rerank(format!(
                "Custom rerank API error {}: {}",
                status, text
            )));
        }

        let result: CustomRerankResponse = response.json().await.map_err(|e| {
            crate::Error::Rerank(format!("Failed to parse custom rerank response: {}", e))
        })?;

        Ok(result
            .results
            .into_iter()
            .map(|r| RerankResult {
                index: r.index,
                score: r.relevance_score,
                document: docs_clone[r.index].clone(),
            })
            .collect())
    }

    fn provider_name(&self) -> &str {
        "custom"
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

// =============================================================================
// Factory function
// =============================================================================

/// Create a reranker from configuration
pub fn create_reranker_from_config(config: &RerankProviderConfig) -> Result<Box<dyn Reranker>> {
    match config.provider_type.as_str() {
        "cohere" => {
            let api_key = config.api_key.clone().ok_or_else(|| {
                crate::Error::Config("Cohere reranker requires api_key".to_string())
            })?;
            Ok(Box::new(CohereReranker::new(api_key, config.model.clone())))
        }
        "jina" => {
            let api_key = config.api_key.clone().ok_or_else(|| {
                crate::Error::Config("Jina reranker requires api_key".to_string())
            })?;
            Ok(Box::new(JinaReranker::new(api_key, config.model.clone())))
        }
        "custom" => {
            let base_url = config.base_url.clone().ok_or_else(|| {
                crate::Error::Config("Custom reranker requires base_url".to_string())
            })?;
            Ok(Box::new(CustomReranker::new(
                base_url,
                config.api_key.clone(),
                config.model.clone(),
            )))
        }
        other => Err(crate::Error::Config(format!(
            "Unknown reranker type: {}",
            other
        ))),
    }
}

/// Get a reranker from project settings
pub fn get_project_reranker(settings: &serde_json::Value) -> Result<Box<dyn Reranker>> {
    // Get reranking providers array
    let providers = settings
        .get("reranking_providers")
        .and_then(|v| v.as_array())
        .ok_or_else(|| crate::Error::Config("No reranking_providers in project settings".to_string()))?;

    // Get default provider ID
    let default_id = settings
        .get("default_reranking_provider")
        .and_then(|v| v.as_str());

    // Find the provider to use
    let config = if let Some(id) = default_id {
        providers
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
    } else {
        // Use first active provider
        providers.iter().find(|p| {
            p.get("is_active")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
    };

    let config = config.ok_or_else(|| {
        crate::Error::Config("No active reranking provider found in project settings".to_string())
    })?;

    let provider_config: RerankProviderConfig = serde_json::from_value(config.clone())
        .map_err(|e| crate::Error::Config(format!("Invalid reranking provider config: {}", e)))?;

    create_reranker_from_config(&provider_config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_cohere_reranker() {
        let config = RerankProviderConfig {
            id: "test".to_string(),
            name: "Cohere".to_string(),
            provider_type: "cohere".to_string(),
            model: Some("rerank-english-v3.0".to_string()),
            api_key: Some("test-key".to_string()),
            base_url: None,
            is_active: true,
        };

        let reranker = create_reranker_from_config(&config).unwrap();
        assert_eq!(reranker.provider_name(), "cohere");
    }

    #[test]
    fn test_create_custom_reranker() {
        let config = RerankProviderConfig {
            id: "test".to_string(),
            name: "Custom".to_string(),
            provider_type: "custom".to_string(),
            model: Some("my-model".to_string()),
            api_key: Some("test-key".to_string()),
            base_url: Some("http://localhost:8000".to_string()),
            is_active: true,
        };

        let reranker = create_reranker_from_config(&config).unwrap();
        assert_eq!(reranker.provider_name(), "custom");
    }
}
