use axum::{extract::State, Json};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::auth::AuthContext;
use crate::server::AppState;
use crate::{Error, Result};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LLMProviderType {
    OpenAI,
    Anthropic,
    Google,
    Custom,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmbeddingProviderType {
    OpenAI,
    Cohere,
    Voyage,
    Custom,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RerankProviderType {
    Cohere,
    Jina,
    Custom,
}

#[derive(Debug, Deserialize)]
pub struct TestRerankRequest {
    pub provider_type: RerankProviderType,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
}

#[derive(Debug, Deserialize)]
pub struct TestLLMRequest {
    pub provider_type: LLMProviderType,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
}

#[derive(Debug, Deserialize)]
pub struct TestEmbeddingRequest {
    pub provider_type: EmbeddingProviderType,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
}

#[derive(Debug, Serialize)]
pub struct TestResponse {
    pub success: bool,
    pub message: String,
    pub response: Option<String>,
}

/// POST /v1/providers/test-llm - Test LLM provider connection
pub async fn test_llm(
    State(_state): State<Arc<AppState>>,
    _auth: AuthContext,
    Json(input): Json<TestLLMRequest>,
) -> Result<Json<TestResponse>> {
    let client = Client::new();

    let result = match input.provider_type {
        LLMProviderType::OpenAI => {
            test_openai_llm(&client, &input.api_key, &input.model).await
        }
        LLMProviderType::Anthropic => {
            test_anthropic_llm(&client, &input.api_key, &input.model).await
        }
        LLMProviderType::Google => {
            test_google_llm(&client, &input.api_key, &input.model).await
        }
        LLMProviderType::Custom => {
            let base_url = input.base_url.ok_or_else(|| {
                Error::BadRequest("Base URL is required for custom providers".to_string())
            })?;
            test_custom_llm(&client, &input.api_key, &base_url, &input.model).await
        }
    };

    match result {
        Ok(response) => Ok(Json(TestResponse {
            success: true,
            message: "Connection successful!".to_string(),
            response: Some(response),
        })),
        Err(e) => Ok(Json(TestResponse {
            success: false,
            message: e.to_string(),
            response: None,
        })),
    }
}

/// POST /v1/providers/test-embedding - Test embedding provider connection
pub async fn test_embedding(
    State(_state): State<Arc<AppState>>,
    _auth: AuthContext,
    Json(input): Json<TestEmbeddingRequest>,
) -> Result<Json<TestResponse>> {
    let client = Client::new();

    let result = match input.provider_type {
        EmbeddingProviderType::OpenAI => {
            test_openai_embedding(&client, &input.api_key, &input.model).await
        }
        EmbeddingProviderType::Cohere => {
            test_cohere_embedding(&client, &input.api_key, &input.model).await
        }
        EmbeddingProviderType::Voyage => {
            test_voyage_embedding(&client, &input.api_key, &input.model).await
        }
        EmbeddingProviderType::Custom => {
            let base_url = input.base_url.ok_or_else(|| {
                Error::BadRequest("Base URL is required for custom providers".to_string())
            })?;
            test_custom_embedding(&client, &input.api_key, &base_url, &input.model).await
        }
    };

    match result {
        Ok(response) => Ok(Json(TestResponse {
            success: true,
            message: "Connection successful!".to_string(),
            response: Some(response),
        })),
        Err(e) => Ok(Json(TestResponse {
            success: false,
            message: e.to_string(),
            response: None,
        })),
    }
}

/// POST /v1/providers/test-rerank - Test reranker provider connection
pub async fn test_rerank(
    State(_state): State<Arc<AppState>>,
    _auth: AuthContext,
    Json(input): Json<TestRerankRequest>,
) -> Result<Json<TestResponse>> {
    let client = Client::new();

    let result = match input.provider_type {
        RerankProviderType::Cohere => {
            test_cohere_rerank(&client, &input.api_key, &input.model).await
        }
        RerankProviderType::Jina => {
            test_jina_rerank(&client, &input.api_key, &input.model).await
        }
        RerankProviderType::Custom => {
            let base_url = input.base_url.ok_or_else(|| {
                Error::BadRequest("Base URL is required for custom providers".to_string())
            })?;
            test_custom_rerank(&client, &input.api_key, &base_url, &input.model).await
        }
    };

    match result {
        Ok(response) => Ok(Json(TestResponse {
            success: true,
            message: "Connection successful!".to_string(),
            response: Some(response),
        })),
        Err(e) => Ok(Json(TestResponse {
            success: false,
            message: e.to_string(),
            response: None,
        })),
    }
}

// ============================================================================
// LLM TEST IMPLEMENTATIONS
// ============================================================================

async fn test_openai_llm(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Hello! Reply with just 'Connection successful!'"}],
            "max_tokens": 50
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let content = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("Response received")
        .to_string();

    Ok(content)
}

async fn test_anthropic_llm(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Hello! Reply with just 'Connection successful!'"}],
            "max_tokens": 50
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let content = data["content"][0]["text"]
        .as_str()
        .unwrap_or("Response received")
        .to_string();

    Ok(content)
}

async fn test_google_llm(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "contents": [{"parts": [{"text": "Hello! Reply with just 'Connection successful!'"}]}]
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let content = data["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("Response received")
        .to_string();

    Ok(content)
}

async fn test_custom_llm(
    client: &Client,
    api_key: &str,
    base_url: &str,
    model: &str,
) -> anyhow::Result<String> {
    // Check if URL already contains a path, otherwise append /chat/completions
    let url = if base_url.contains("/chat") || base_url.contains("/completions") || base_url.contains("/generate") {
        base_url.trim_end_matches('/').to_string()
    } else {
        format!("{}/chat/completions", base_url.trim_end_matches('/'))
    };

    // Build request with both auth header styles for compatibility
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("X-API-Key", api_key)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Hello! Reply with just 'Connection successful!'"}],
            "max_tokens": 50
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        anyhow::bail!("HTTP {}: {}", status, error_text);
    }

    let data: serde_json::Value = response.json().await?;
    let content = data["choices"][0]["message"]["content"]
        .as_str()
        .or_else(|| data["content"][0]["text"].as_str())
        .or_else(|| data["response"].as_str())
        .unwrap_or("Response received")
        .to_string();

    Ok(content)
}

// ============================================================================
// EMBEDDING TEST IMPLEMENTATIONS
// ============================================================================

async fn test_openai_embedding(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let response = client
        .post("https://api.openai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "input": "Hello, this is a test message."
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let dimensions = data["data"][0]["embedding"]
        .as_array()
        .map(|arr| arr.len())
        .unwrap_or(0);

    Ok(format!("Embedding generated with {} dimensions", dimensions))
}

async fn test_cohere_embedding(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let response = client
        .post("https://api.cohere.ai/v1/embed")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "texts": ["Hello, this is a test message."],
            "input_type": "search_document"
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["message"]
            .as_str()
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let dimensions = data["embeddings"][0]
        .as_array()
        .map(|arr| arr.len())
        .unwrap_or(0);

    Ok(format!("Embedding generated with {} dimensions", dimensions))
}

async fn test_voyage_embedding(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let response = client
        .post("https://api.voyageai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "input": ["Hello, this is a test message."]
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["detail"]
            .as_str()
            .or_else(|| error["message"].as_str())
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let dimensions = data["data"][0]["embedding"]
        .as_array()
        .map(|arr| arr.len())
        .unwrap_or(0);

    Ok(format!("Embedding generated with {} dimensions", dimensions))
}

async fn test_custom_embedding(
    client: &Client,
    api_key: &str,
    base_url: &str,
    model: &str,
) -> anyhow::Result<String> {
    // Use the URL as-is (user provides full endpoint URL)
    let url = base_url.trim_end_matches('/');

    // Build request with both auth header styles for compatibility
    let request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("X-API-Key", api_key)
        .header("Authorization", format!("Bearer {}", api_key));

    // Build body - include model only if provided
    let body = if model.is_empty() {
        serde_json::json!({
            "input": "Hello, this is a test message."
        })
    } else {
        serde_json::json!({
            "model": model,
            "input": "Hello, this is a test message."
        })
    };

    let response = request.json(&body).send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        anyhow::bail!("HTTP {}: {}", status, error_text);
    }

    let data: serde_json::Value = response.json().await?;

    // Try different response formats (OpenAI style, VLLM style, etc.)
    let dimensions = data["data"][0]["embedding"]
        .as_array()
        .or_else(|| data["embedding"].as_array())
        .or_else(|| data["embeddings"][0].as_array())
        .map(|arr| arr.len())
        .unwrap_or(0);

    if dimensions == 0 {
        // Return raw response for debugging if no embedding found
        Ok(format!("Response received: {}", data.to_string().chars().take(200).collect::<String>()))
    } else {
        Ok(format!("Embedding generated with {} dimensions", dimensions))
    }
}

// ============================================================================
// RERANK TEST IMPLEMENTATIONS
// ============================================================================

async fn test_cohere_rerank(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let response = client
        .post("https://api.cohere.ai/v1/rerank")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "query": "What is the capital of France?",
            "documents": [
                "Paris is the capital of France.",
                "Berlin is the capital of Germany.",
                "London is the capital of England."
            ],
            "top_n": 3
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["message"]
            .as_str()
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let results = data["results"]
        .as_array()
        .map(|arr| arr.len())
        .unwrap_or(0);

    let top_score = data["results"][0]["relevance_score"]
        .as_f64()
        .unwrap_or(0.0);

    Ok(format!("Reranked {} documents. Top score: {:.4}", results, top_score))
}

async fn test_jina_rerank(client: &Client, api_key: &str, model: &str) -> anyhow::Result<String> {
    let response = client
        .post("https://api.jina.ai/v1/rerank")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "query": "What is the capital of France?",
            "documents": [
                "Paris is the capital of France.",
                "Berlin is the capital of Germany.",
                "London is the capital of England."
            ],
            "top_n": 3
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let message = error["detail"]
            .as_str()
            .or_else(|| error["message"].as_str())
            .unwrap_or("Unknown error");
        anyhow::bail!("{}", message);
    }

    let data: serde_json::Value = response.json().await?;
    let results = data["results"]
        .as_array()
        .map(|arr| arr.len())
        .unwrap_or(0);

    let top_score = data["results"][0]["relevance_score"]
        .as_f64()
        .or_else(|| data["results"][0]["score"].as_f64())
        .unwrap_or(0.0);

    Ok(format!("Reranked {} documents. Top score: {:.4}", results, top_score))
}

async fn test_custom_rerank(
    client: &Client,
    api_key: &str,
    base_url: &str,
    model: &str,
) -> anyhow::Result<String> {
    let url = base_url.trim_end_matches('/');

    let mut body = serde_json::json!({
        "query": "What is the capital of France?",
        "documents": [
            "Paris is the capital of France.",
            "Berlin is the capital of Germany.",
            "London is the capital of England."
        ],
        "top_n": 3
    });

    if !model.is_empty() {
        body["model"] = serde_json::json!(model);
    }

    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("X-API-Key", api_key)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        anyhow::bail!("HTTP {}: {}", status, error_text);
    }

    let data: serde_json::Value = response.json().await?;

    // Try different response formats
    let results = data["results"]
        .as_array()
        .or_else(|| data["data"].as_array())
        .map(|arr| arr.len())
        .unwrap_or(0);

    if results == 0 {
        Ok(format!("Response received: {}", data.to_string().chars().take(200).collect::<String>()))
    } else {
        let top_score = data["results"][0]["relevance_score"]
            .as_f64()
            .or_else(|| data["results"][0]["score"].as_f64())
            .or_else(|| data["data"][0]["score"].as_f64())
            .unwrap_or(0.0);

        Ok(format!("Reranked {} documents. Top score: {:.4}", results, top_score))
    }
}
