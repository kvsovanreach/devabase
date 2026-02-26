use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::conversations;
use crate::auth::AuthContext;
use crate::db::models::RagConfig;
use crate::rag::{self, count_tokens, get_project_embedding_provider, RetrievalQuery};
use crate::server::AppState;
use crate::vector;
use crate::{Error, Result};

// ─────────────────────────────────────────
// Unified Chat Request/Response Types
// ─────────────────────────────────────────

/// Chat request for both collection-scoped and unified chat
#[derive(Debug, Deserialize)]
pub struct UnifiedChatRequest {
    /// The user's message
    pub message: String,
    /// Continue an existing conversation
    pub conversation_id: Option<String>,
    /// Include source documents in response
    #[serde(default = "default_true")]
    pub include_sources: bool,
    /// Number of context chunks to retrieve (default: 5)
    #[serde(default = "default_top_k")]
    pub top_k: Option<i32>,
    /// For unified chat: collections to search across
    pub collections: Option<Vec<String>>,
}

fn default_true() -> bool { true }
fn default_top_k() -> Option<i32> { Some(5) }

/// Unified chat response
#[derive(Debug, Serialize)]
pub struct UnifiedChatResponse {
    pub answer: String,
    pub sources: Vec<UnifiedChatSource>,
    pub conversation_id: Option<String>,
    pub tokens_used: i32,
    pub collections_used: Vec<String>,
}

/// Source reference in chat response
#[derive(Debug, Serialize)]
pub struct UnifiedChatSource {
    pub collection: String,
    pub document_id: String,
    pub document_name: String,
    pub content: String,
    pub score: f64,
}

/// POST /collections/:name/chat - Chat with a single collection
pub async fn collection_chat(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    Json(req): Json<UnifiedChatRequest>,
) -> Result<Json<UnifiedChatResponse>> {
    // Convert to legacy request and call existing handler
    let legacy_req = ChatRequest {
        message: req.message,
        conversation_id: req.conversation_id,
        include_sources: Some(req.include_sources),
    };

    let result = chat_internal(&state, &auth, &collection_name, legacy_req).await?;

    // Convert to unified response
    Ok(Json(UnifiedChatResponse {
        answer: result.answer,
        sources: result.sources.into_iter().map(|s| UnifiedChatSource {
            collection: collection_name.to_string(),
            document_id: s.document_id,
            document_name: s.document_name,
            content: s.chunk_content,
            score: s.relevance_score,
        }).collect(),
        conversation_id: Some(result.conversation_id),
        tokens_used: result.tokens_used,
        collections_used: vec![collection_name],
    }))
}

/// POST /chat - Unified chat across multiple collections
pub async fn unified_chat(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<UnifiedChatRequest>,
) -> Result<Json<UnifiedChatResponse>> {
    let collections = req.collections.clone().unwrap_or_default();

    if collections.is_empty() {
        return Err(Error::BadRequest("At least one collection must be specified in 'collections' array".to_string()));
    }

    // Convert to legacy request
    let legacy_req = MultiCollectionChatRequest {
        collections: collections.clone(),
        message: req.message,
        conversation_id: req.conversation_id,
        include_sources: Some(req.include_sources),
        top_k: req.top_k,
    };

    let result = chat_multi_internal(&state, &auth, legacy_req).await?;

    // Convert to unified response
    Ok(Json(UnifiedChatResponse {
        answer: result.answer,
        sources: result.sources.into_iter().map(|s| UnifiedChatSource {
            collection: s.collection_name,
            document_id: s.document_id,
            document_name: s.document_name,
            content: s.chunk_content,
            score: s.relevance_score,
        }).collect(),
        conversation_id: result.conversation_id,
        tokens_used: result.tokens_used,
        collections_used: result.collections_used,
    }))
}

// ─────────────────────────────────────────
// Legacy Types (for backward compatibility)
// ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub conversation_id: Option<String>,
    pub include_sources: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MultiCollectionChatRequest {
    pub collections: Vec<String>,
    pub message: String,
    pub conversation_id: Option<String>,
    pub include_sources: Option<bool>,
    pub top_k: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct ChatSource {
    pub document_id: String,
    pub document_name: String,
    pub chunk_content: String,
    pub relevance_score: f64,
}

#[derive(Debug, Serialize)]
pub struct MultiCollectionChatSource {
    pub collection_name: String,
    pub document_id: String,
    pub document_name: String,
    pub chunk_content: String,
    pub relevance_score: f64,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub answer: String,
    pub sources: Vec<ChatSource>,
    pub conversation_id: String,
    pub tokens_used: i32,
}

#[derive(Debug, Serialize)]
pub struct MultiCollectionChatResponse {
    pub answer: String,
    pub sources: Vec<MultiCollectionChatSource>,
    pub collections_used: Vec<String>,
    pub conversation_id: Option<String>,
    pub tokens_used: i32,
}

/// Chat with a RAG-enabled collection (legacy endpoint)
pub async fn chat(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<ChatResponse>> {
    chat_internal(&state, &auth, &collection_name, req).await.map(Json)
}

/// Internal chat implementation
async fn chat_internal(
    state: &Arc<AppState>,
    auth: &AuthContext,
    collection_name: &str,
    req: ChatRequest,
) -> Result<ChatResponse> {
    let project_id = auth.require_project()?;

    // Get the collection
    let collection = vector::get_collection(&state.pool, &collection_name, Some(project_id)).await?;

    // Check if RAG is enabled
    if !collection.rag_enabled {
        return Err(Error::BadRequest(format!(
            "RAG is not enabled for collection '{}'",
            collection_name
        )));
    }

    // Parse RAG config
    let rag_config: RagConfig = collection.rag_config
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .ok_or_else(|| Error::BadRequest("Invalid RAG configuration".to_string()))?;

    // Get the project to access LLM provider settings
    let project: crate::db::models::Project = sqlx::query_as(
        "SELECT * FROM sys_projects WHERE id = $1"
    )
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    // Get LLM provider from project settings
    let settings: serde_json::Value = project.settings.unwrap_or_default();
    let llm_providers = settings.get("llm_providers")
        .and_then(|v| v.as_array())
        .ok_or_else(|| Error::BadRequest("No LLM providers configured".to_string()))?;

    let provider = llm_providers.iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&rag_config.llm_provider_id))
        .ok_or_else(|| Error::BadRequest("LLM provider not found".to_string()))?;

    let api_key = provider.get("api_key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::BadRequest("LLM provider API key not configured".to_string()))?;

    let provider_type = provider.get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("openai");

    let base_url = provider.get("base_url")
        .and_then(|v| v.as_str());

    // Get project-specific embedding provider
    let embedding_provider = get_project_embedding_provider(&settings)
        .map_err(|e| Error::Config(format!("Embedding error: {}", e)))?;

    // Use existing RAG retrieval
    let retrieval_query = RetrievalQuery {
        collection: collection_name.to_string(),
        query: req.message.clone(),
        top_k: Some(rag_config.top_k),
        filter: None,
        rerank: None,
        include_content: Some(true),
    };

    let search_results = rag::retrieve_with_provider(
        &state.pool,
        embedding_provider.as_ref(),
        retrieval_query,
        Some(project_id),
    ).await?;

    // Build context from search results
    let mut context_parts: Vec<String> = Vec::new();
    let mut sources: Vec<ChatSource> = Vec::new();

    for (idx, result) in search_results.iter().enumerate() {
        context_parts.push(format!("[{}] {}", idx + 1, result.content));

        if req.include_sources.unwrap_or(true) {
            sources.push(ChatSource {
                document_id: result.document_id.to_string(),
                document_name: result.metadata
                    .as_ref()
                    .and_then(|m| m.get("document_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                chunk_content: result.content.chars().take(200).collect(),
                relevance_score: result.score,
            });
        }
    }

    let context = context_parts.join("\n\n");

    // Build the prompt
    let full_prompt = format!(
        "{}\n\nContext:\n{}\n\nUser: {}",
        rag_config.system_prompt,
        context,
        req.message
    );

    // Call the LLM
    let answer = call_llm(
        provider_type,
        api_key,
        base_url,
        &rag_config.model,
        &full_prompt,
        rag_config.temperature,
        rag_config.max_tokens,
    ).await?;

    // Count tokens
    let user_tokens = count_tokens(&req.message) as i32;
    let answer_tokens = count_tokens(&answer) as i32;
    let total_tokens = user_tokens + answer_tokens;

    // Get or create conversation and save messages
    let conversation_uuid = conversations::get_or_create_conversation(
        &state.pool,
        project_id,
        collection.id,
        auth.user_id,
        req.conversation_id.clone(),
    ).await?;

    // Save user message
    let sources_json = serde_json::to_value(&sources).ok();
    conversations::save_message(
        &state.pool,
        conversation_uuid,
        "user",
        &req.message,
        user_tokens,
        None,
    ).await?;

    // Save assistant response
    conversations::save_message(
        &state.pool,
        conversation_uuid,
        "assistant",
        &answer,
        answer_tokens,
        sources_json,
    ).await?;

    Ok(ChatResponse {
        answer,
        sources,
        conversation_id: conversation_uuid.to_string(),
        tokens_used: total_tokens,
    })
}

/// Chat with multiple RAG-enabled collections at once (legacy endpoint)
pub async fn chat_multi(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<MultiCollectionChatRequest>,
) -> Result<Json<MultiCollectionChatResponse>> {
    chat_multi_internal(&state, &auth, req).await.map(Json)
}

/// Internal multi-collection chat implementation
async fn chat_multi_internal(
    state: &Arc<AppState>,
    auth: &AuthContext,
    req: MultiCollectionChatRequest,
) -> Result<MultiCollectionChatResponse> {
    let project_id = auth.require_project()?;

    if req.collections.is_empty() {
        return Err(Error::BadRequest("At least one collection must be specified".to_string()));
    }

    // Get the project to access LLM provider settings
    let project: crate::db::models::Project = sqlx::query_as(
        "SELECT * FROM sys_projects WHERE id = $1"
    )
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|_| Error::NotFound("Project not found".to_string()))?;

    let settings: serde_json::Value = project.settings.unwrap_or_default();
    let llm_providers = settings.get("llm_providers")
        .and_then(|v| v.as_array())
        .ok_or_else(|| Error::BadRequest("No LLM providers configured".to_string()))?;

    // We'll use the RAG config from the first valid collection
    let mut rag_config: Option<RagConfig> = None;
    let mut provider_info: Option<(&serde_json::Value, &str, Option<&str>)> = None;
    let mut collections_used: Vec<String> = Vec::new();

    // Search across all collections and gather results
    let top_k = req.top_k.unwrap_or(5);
    let mut all_results: Vec<(String, rag::RetrievalResult)> = Vec::new();

    for collection_name in &req.collections {
        // Get the collection
        let collection = match vector::get_collection(&state.pool, collection_name, Some(project_id)).await {
            Ok(c) => c,
            Err(_) => continue,
        };

        if !collection.rag_enabled {
            continue;
        }

        if rag_config.is_none() {
            if let Some(config) = collection.rag_config.as_ref().and_then(|v| serde_json::from_value(v.clone()).ok()) {
                let cfg: RagConfig = config;
                if let Some(p) = llm_providers.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&cfg.llm_provider_id)) {
                    let provider_type = p.get("type").and_then(|v| v.as_str()).unwrap_or("openai");
                    let base_url = p.get("base_url").and_then(|v| v.as_str());
                    provider_info = Some((p, provider_type, base_url));
                    rag_config = Some(cfg);
                }
            }
        }

        let retrieval_query = RetrievalQuery {
            collection: collection_name.to_string(),
            query: req.message.clone(),
            top_k: Some(top_k),
            filter: None,
            rerank: None,
            include_content: Some(true),
        };

        // Get project-specific embedding provider for multi-collection search
        let embedding_provider = match get_project_embedding_provider(&settings) {
            Ok(p) => p,
            Err(_) => continue, // Skip if no embedding provider
        };

        if let Ok(results) = rag::retrieve_with_provider(&state.pool, embedding_provider.as_ref(), retrieval_query, Some(project_id)).await {
            collections_used.push(collection_name.clone());
            for result in results {
                all_results.push((collection_name.clone(), result));
            }
        }
    }

    if collections_used.is_empty() {
        return Err(Error::BadRequest("No RAG-enabled collections found".to_string()));
    }

    let rag_config = rag_config.ok_or_else(|| Error::BadRequest("No valid RAG configuration found".to_string()))?;
    let (provider, provider_type, base_url) = provider_info.ok_or_else(|| Error::BadRequest("LLM provider not found".to_string()))?;

    let api_key = provider.get("api_key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::BadRequest("LLM provider API key not configured".to_string()))?;

    all_results.sort_by(|a, b| b.1.score.partial_cmp(&a.1.score).unwrap_or(std::cmp::Ordering::Equal));
    all_results.truncate(top_k as usize);

    let mut context_parts: Vec<String> = Vec::new();
    let mut sources: Vec<MultiCollectionChatSource> = Vec::new();

    for (idx, (collection_name, result)) in all_results.iter().enumerate() {
        context_parts.push(format!("[{} - {}] {}", idx + 1, collection_name, result.content));

        if req.include_sources.unwrap_or(true) {
            sources.push(MultiCollectionChatSource {
                collection_name: collection_name.clone(),
                document_id: result.document_id.to_string(),
                document_name: result.metadata
                    .as_ref()
                    .and_then(|m| m.get("document_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                chunk_content: result.content.chars().take(200).collect(),
                relevance_score: result.score,
            });
        }
    }

    let context = context_parts.join("\n\n");
    let full_prompt = format!(
        "{}\n\nYou are answering based on information from these collections: {}\n\nContext:\n{}\n\nUser: {}",
        rag_config.system_prompt,
        collections_used.join(", "),
        context,
        req.message
    );

    let answer = call_llm(
        provider_type,
        api_key,
        base_url,
        &rag_config.model,
        &full_prompt,
        rag_config.temperature,
        rag_config.max_tokens,
    ).await?;

    let prompt_tokens = count_tokens(&full_prompt) as i32;
    let answer_tokens = count_tokens(&answer) as i32;
    let total_tokens = prompt_tokens + answer_tokens;

    Ok(MultiCollectionChatResponse {
        answer,
        sources,
        collections_used,
        conversation_id: req.conversation_id,
        tokens_used: total_tokens,
    })
}

async fn call_llm(
    provider_type: &str,
    api_key: &str,
    base_url: Option<&str>,
    model: &str,
    prompt: &str,
    temperature: f32,
    max_tokens: i32,
) -> Result<String> {
    let client = reqwest::Client::new();

    let url = match provider_type {
        "openai" => base_url.unwrap_or("https://api.openai.com/v1").to_string() + "/chat/completions",
        "anthropic" => base_url.unwrap_or("https://api.anthropic.com/v1").to_string() + "/messages",
        "google" => base_url.unwrap_or("https://generativelanguage.googleapis.com/v1beta").to_string() + "/models/" + model + ":generateContent",
        "custom" => base_url.ok_or_else(|| Error::BadRequest("Base URL required for custom provider".to_string()))?.to_string() + "/chat/completions",
        _ => return Err(Error::BadRequest(format!("Unsupported provider type: {}", provider_type))),
    };

    let response = match provider_type {
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "user", "content": prompt}
                ]
            });

            client.post(&url)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| Error::Internal(format!("LLM request failed: {}", e)))?
        }
        "google" => {
            let body = serde_json::json!({
                "contents": [
                    {"parts": [{"text": prompt}]}
                ],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens
                }
            });

            client.post(format!("{}?key={}", url, api_key))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| Error::Internal(format!("LLM request failed: {}", e)))?
        }
        _ => {
            // OpenAI-compatible (openai, custom)
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "temperature": temperature,
                "max_tokens": max_tokens
            });

            client.post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| Error::Internal(format!("LLM request failed: {}", e)))?
        }
    };

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(Error::Internal(format!("LLM API error: {}", error_text)));
    }

    let json: serde_json::Value = response.json().await
        .map_err(|e| Error::Internal(format!("Failed to parse LLM response: {}", e)))?;

    // Extract the answer based on provider type
    let answer = match provider_type {
        "anthropic" => {
            json.get("content")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|item| item.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        "google" => {
            json.get("candidates")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|candidate| candidate.get("content"))
                .and_then(|content| content.get("parts"))
                .and_then(|parts| parts.as_array())
                .and_then(|arr| arr.first())
                .and_then(|part| part.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        _ => {
            // OpenAI-compatible
            json.get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string()
        }
    };

    Ok(answer)
}
