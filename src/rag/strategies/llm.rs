//! LLM Provider abstraction for retrieval strategies
//!
//! Provides a trait-based interface for LLM calls used by strategies like
//! HyDE, Multi-Query, Self-Query, and Compression.

use crate::{Error, Result};
use async_trait::async_trait;
use reqwest::Client;

// ============================================================================
// LLM Options
// ============================================================================

/// Options for LLM completion calls
#[derive(Debug, Clone, Default)]
pub struct LlmOptions {
    /// Temperature for generation (0.0 - 2.0)
    pub temperature: f32,
    /// Maximum tokens to generate
    pub max_tokens: i32,
}

// ============================================================================
// LLM Provider Trait
// ============================================================================

/// Trait for LLM providers used by retrieval strategies
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Generate a text completion
    async fn complete(&self, prompt: &str, options: LlmOptions) -> Result<String>;

    /// Provider name for logging
    fn provider_name(&self) -> &str;

    /// Model name being used
    fn model_name(&self) -> &str;
}

// ============================================================================
// Project LLM Provider
// ============================================================================

/// LLM provider that uses project settings configuration
pub struct ProjectLlmProvider {
    client: Client,
    provider_type: String,
    api_key: String,
    base_url: Option<String>,
    model: String,
}

impl ProjectLlmProvider {
    /// Create a new project LLM provider
    pub fn new(
        provider_type: impl Into<String>,
        api_key: impl Into<String>,
        base_url: Option<String>,
        model: impl Into<String>,
    ) -> Self {
        Self {
            client: Client::new(),
            provider_type: provider_type.into(),
            api_key: api_key.into(),
            base_url,
            model: model.into(),
        }
    }

    /// Create from project settings JSON
    pub fn from_settings(
        settings: &serde_json::Value,
        llm_provider_id: Option<&str>,
    ) -> Result<Self> {
        let llm_providers = settings
            .get("llm_providers")
            .and_then(|v| v.as_array())
            .ok_or_else(|| Error::Config("No LLM providers configured".to_string()))?;

        // Find the specified provider or use the first one
        let provider = if let Some(id) = llm_provider_id {
            llm_providers
                .iter()
                .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
                .ok_or_else(|| Error::Config(format!("LLM provider '{}' not found", id)))?
        } else {
            llm_providers
                .first()
                .ok_or_else(|| Error::Config("No LLM providers configured".to_string()))?
        };

        let provider_type = provider
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("openai")
            .to_string();

        let api_key = provider
            .get("api_key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::Config("LLM provider missing api_key".to_string()))?
            .to_string();

        let base_url = provider
            .get("base_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let model = provider
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("gpt-4o-mini")
            .to_string();

        Ok(Self::new(provider_type, api_key, base_url, model))
    }
}

#[async_trait]
impl LlmProvider for ProjectLlmProvider {
    async fn complete(&self, prompt: &str, options: LlmOptions) -> Result<String> {
        let temperature = if options.temperature == 0.0 {
            0.7
        } else {
            options.temperature
        };
        let max_tokens = if options.max_tokens == 0 {
            500
        } else {
            options.max_tokens
        };

        match self.provider_type.as_str() {
            "anthropic" => self.call_anthropic(prompt, temperature, max_tokens).await,
            "google" => self.call_google(prompt, temperature, max_tokens).await,
            _ => self.call_openai_compatible(prompt, temperature, max_tokens).await,
        }
    }

    fn provider_name(&self) -> &str {
        &self.provider_type
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}

impl ProjectLlmProvider {
    /// Call OpenAI-compatible API (OpenAI, Azure, Custom)
    async fn call_openai_compatible(
        &self,
        prompt: &str,
        temperature: f32,
        max_tokens: i32,
    ) -> Result<String> {
        let base_url = self
            .base_url
            .as_deref()
            .unwrap_or("https://api.openai.com/v1");
        let url = format!("{}/chat/completions", base_url);

        let request_body = serde_json::json!({
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| Error::Internal(format!("LLM request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!(
                "LLM API error ({}): {}",
                status, body
            )));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| Error::Internal(format!("Failed to parse LLM response: {}", e)))?;

        let content = json
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        Ok(content)
    }

    /// Call Anthropic API
    async fn call_anthropic(
        &self,
        prompt: &str,
        _temperature: f32,
        max_tokens: i32,
    ) -> Result<String> {
        let url = "https://api.anthropic.com/v1/messages";

        let request_body = serde_json::json!({
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}]
        });

        let response = self
            .client
            .post(url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Anthropic request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!(
                "Anthropic API error ({}): {}",
                status, body
            )));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| Error::Internal(format!("Failed to parse Anthropic response: {}", e)))?;

        let content = json
            .get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();

        Ok(content)
    }

    /// Call Google Generative AI API
    async fn call_google(
        &self,
        prompt: &str,
        temperature: f32,
        max_tokens: i32,
    ) -> Result<String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            self.model, self.api_key
        );

        let request_body = serde_json::json!({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        });

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Google AI request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!(
                "Google AI API error ({}): {}",
                status, body
            )));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| Error::Internal(format!("Failed to parse Google AI response: {}", e)))?;

        let content = json
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
            .and_then(|arr| arr.first())
            .and_then(|part| part.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();

        Ok(content)
    }
}

