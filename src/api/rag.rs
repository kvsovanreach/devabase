use axum::{
    extract::{Path, State},
    response::{sse::{Event, Sse}, IntoResponse, Response},
    Json,
};
use futures::stream::Stream;
use futures::StreamExt as FuturesStreamExt;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;

use crate::api::conversations;
use crate::auth::AuthContext;
use crate::db::models::RagConfig;
use crate::rag::{self, count_tokens, get_project_embedding_provider, RetrievalQuery};
use crate::server::AppState;
use crate::vector;
use crate::{Error, ErrorInfo, Result};

// ─────────────────────────────────────────
// Unified Chat Request/Response Types
// ─────────────────────────────────────────

/// Helper enum to accept either a single string or array of strings
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum StringOrVec {
    Single(String),
    Multiple(Vec<String>),
}

impl StringOrVec {
    pub fn into_vec(self) -> Vec<String> {
        match self {
            StringOrVec::Single(s) => vec![s],
            StringOrVec::Multiple(v) => v,
        }
    }
}

/// Chat request for both collection-scoped and unified chat
#[derive(Debug, Deserialize)]
pub struct UnifiedChatRequest {
    /// The user's message
    pub message: String,
    /// Collection(s) to search - can be a single name or array of names
    #[serde(alias = "collections")]
    pub collection: Option<StringOrVec>,
    /// Continue an existing conversation
    pub conversation_id: Option<String>,
    /// Include source documents in response
    #[serde(default = "default_true")]
    pub include_sources: bool,
    /// Number of context chunks to retrieve (default: 5)
    #[serde(default = "default_top_k")]
    pub top_k: Option<i32>,
    /// Enable streaming response
    #[serde(default)]
    pub stream: bool,
}

impl UnifiedChatRequest {
    /// Get collections as a vector
    pub fn get_collections(&self) -> Vec<String> {
        self.collection.clone().map(|c| c.into_vec()).unwrap_or_default()
    }
}

fn default_true() -> bool { true }
fn default_top_k() -> Option<i32> { Some(5) }

/// Unified chat response
#[derive(Debug, Serialize)]
pub struct UnifiedChatResponse {
    pub answer: String,
    pub thinking: Option<String>,
    pub sources: Vec<UnifiedChatSource>,
    pub conversation_id: Option<String>,
    pub tokens_used: i32,
    pub collections_used: Vec<String>,
}

/// Streaming event types
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    /// Sources retrieved from vector search
    Sources { sources: Vec<UnifiedChatSource> },
    /// Thinking/reasoning content (collapsible)
    Thinking { content: String },
    /// Main answer content
    Content { content: String },
    /// Stream completed
    Done {
        conversation_id: Option<String>,
        tokens_used: i32,
    },
    /// Error occurred
    Error { message: String },
}

/// Source reference in chat response
#[derive(Debug, Clone, Serialize)]
pub struct UnifiedChatSource {
    pub collection: String,
    pub document_id: String,
    pub document_name: String,
    pub content: String,
    pub score: f64,
}

// ─────────────────────────────────────────
// Unified RAG Endpoint
// ─────────────────────────────────────────

/// POST /v1/rag - Unified RAG chat endpoint
/// Accepts single or multiple collections, with optional streaming
pub async fn rag_chat(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<UnifiedChatRequest>,
) -> Result<Response> {
    let collections = req.get_collections();

    if collections.is_empty() {
        return Err(Error::BadRequest("At least one collection must be specified".to_string()));
    }

    if req.stream {
        // Return SSE stream
        let sse = rag_chat_stream_internal(state, auth, req).await?;
        Ok(sse.into_response())
    } else {
        // Return JSON response
        let json = rag_chat_json_internal(&state, &auth, req).await?;
        Ok(Json(json).into_response())
    }
}

/// Internal JSON response handler
async fn rag_chat_json_internal(
    state: &Arc<AppState>,
    auth: &AuthContext,
    req: UnifiedChatRequest,
) -> Result<UnifiedChatResponse> {
    let project_id = auth.require_project()?;
    let collections = req.get_collections();

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
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "No LLM providers configured",
                "LLM_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an LLM provider in Project Settings > LLM Providers. Supported: openai, anthropic, google, or custom (OpenAI-compatible).")
        ))?;

    // Get RAG config from first valid collection
    let mut rag_config: Option<RagConfig> = None;
    let mut provider_info: Option<(&serde_json::Value, &str, Option<&str>)> = None;
    let mut collections_used: Vec<String> = Vec::new();

    let top_k = req.top_k.unwrap_or(5);
    let mut all_results: Vec<(String, rag::RetrievalResult)> = Vec::new();

    for collection_name in &collections {
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

        let embedding_provider = match get_project_embedding_provider(&settings) {
            Ok(p) => p,
            Err(_) => continue,
        };

        if let Ok(results) = rag::retrieve_with_provider(&state.pool, embedding_provider.as_ref(), retrieval_query, Some(project_id)).await {
            collections_used.push(collection_name.clone());
            for result in results {
                all_results.push((collection_name.clone(), result));
            }
        }
    }

    if collections_used.is_empty() {
        return Err(Error::BadRequestDetailed(
            ErrorInfo::new(
                "No RAG-enabled collections found",
                "RAG_NOT_ENABLED"
            ).with_fix("Enable RAG on at least one collection. Use: PATCH /v1/collections/{name} with {\"rag_enabled\": true, \"rag_config\": {...}}. RAG config requires: llm_provider_id, model, system_prompt.")
        ));
    }

    let rag_config = rag_config.ok_or_else(|| Error::BadRequestDetailed(
            ErrorInfo::new(
                "No valid RAG configuration found",
                "RAG_CONFIG_INVALID"
            ).with_fix("Update collection RAG config with valid settings: {\"llm_provider_id\": \"<provider-id>\", \"model\": \"gpt-4\", \"system_prompt\": \"You are a helpful assistant.\", \"temperature\": 0.7, \"max_tokens\": 1000, \"top_k\": 5}")
        ))?;
    let (provider, provider_type, base_url) = provider_info.ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider specified in RAG config not found",
                "LLM_PROVIDER_NOT_FOUND"
            ).with_fix("The llm_provider_id in the collection's RAG config references a provider that doesn't exist. Add the provider in Project Settings > LLM Providers, or update the collection's RAG configuration.")
        ))?;

    let api_key = provider.get("api_key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider API key not configured",
                "LLM_API_KEY_MISSING"
            ).with_fix("Add api_key to the LLM provider in Project Settings > LLM Providers.")
        ))?;

    // Sort and truncate results
    all_results.sort_by(|a, b| b.1.score.partial_cmp(&a.1.score).unwrap_or(std::cmp::Ordering::Equal));
    all_results.truncate(top_k as usize);

    // Build sources
    let sources: Vec<UnifiedChatSource> = all_results.iter().map(|(collection_name, r)| {
        UnifiedChatSource {
            collection: collection_name.clone(),
            document_id: r.document_id.to_string(),
            document_name: r.metadata
                .as_ref()
                .and_then(|m| m.get("document_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            content: r.content.chars().take(200).collect(),
            score: r.score,
        }
    }).collect();

    // Build context
    let context_parts: Vec<String> = all_results.iter()
        .enumerate()
        .map(|(idx, (collection_name, r))| {
            if collections.len() > 1 {
                format!("[{} - {}] {}", idx + 1, collection_name, r.content)
            } else {
                format!("[{}] {}", idx + 1, r.content)
            }
        })
        .collect();
    let context = context_parts.join("\n\n");

    let full_prompt = if collections.len() > 1 {
        format!(
            "{}\n\nYou are answering based on information from these collections: {}\n\nContext:\n{}\n\nUser: {}",
            rag_config.system_prompt,
            collections_used.join(", "),
            context,
            req.message
        )
    } else {
        format!(
            "{}\n\nContext:\n{}\n\nUser: {}",
            rag_config.system_prompt,
            context,
            req.message
        )
    };

    let answer = call_llm(
        provider_type,
        api_key,
        base_url,
        &rag_config.model,
        &full_prompt,
        rag_config.temperature,
        rag_config.max_tokens,
    ).await?;

    // Extract thinking
    let (thinking, clean_answer) = extract_thinking(&answer);

    let prompt_tokens = count_tokens(&full_prompt) as i32;
    let answer_tokens = count_tokens(&clean_answer) as i32;
    let total_tokens = prompt_tokens + answer_tokens;

    Ok(UnifiedChatResponse {
        answer: clean_answer,
        thinking,
        sources: if req.include_sources { sources } else { vec![] },
        conversation_id: req.conversation_id,
        tokens_used: total_tokens,
        collections_used,
    })
}

/// Internal streaming response handler
async fn rag_chat_stream_internal(
    state: Arc<AppState>,
    auth: AuthContext,
    req: UnifiedChatRequest,
) -> Result<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>> {
    let project_id = auth.require_project()?;
    let collections = req.get_collections();

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
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "No LLM providers configured",
                "LLM_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an LLM provider in Project Settings > LLM Providers. Supported: openai, anthropic, google, or custom (OpenAI-compatible).")
        ))?;

    // Get RAG config from first valid collection
    let mut rag_config: Option<RagConfig> = None;
    let mut provider_type_str: Option<String> = None;
    let mut base_url_str: Option<String> = None;
    let mut api_key_str: Option<String> = None;
    let mut collections_used: Vec<String> = Vec::new();

    let top_k = req.top_k.unwrap_or(5);
    let mut all_results: Vec<(String, rag::RetrievalResult)> = Vec::new();

    for collection_name in &collections {
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
                    provider_type_str = Some(p.get("type").and_then(|v| v.as_str()).unwrap_or("openai").to_string());
                    base_url_str = p.get("base_url").and_then(|v| v.as_str()).map(|s| s.to_string());
                    api_key_str = p.get("api_key").and_then(|v| v.as_str()).map(|s| s.to_string());
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

        let embedding_provider = match get_project_embedding_provider(&settings) {
            Ok(p) => p,
            Err(_) => continue,
        };

        if let Ok(results) = rag::retrieve_with_provider(&state.pool, embedding_provider.as_ref(), retrieval_query, Some(project_id)).await {
            collections_used.push(collection_name.to_string());
            for result in results {
                all_results.push((collection_name.to_string(), result));
            }
        }
    }

    if collections_used.is_empty() {
        return Err(Error::BadRequestDetailed(
            ErrorInfo::new(
                "No RAG-enabled collections found",
                "RAG_NOT_ENABLED"
            ).with_fix("Enable RAG on at least one collection. Use: PATCH /v1/collections/{name} with {\"rag_enabled\": true, \"rag_config\": {...}}. RAG config requires: llm_provider_id, model, system_prompt.")
        ));
    }

    let rag_config = rag_config.ok_or_else(|| Error::BadRequestDetailed(
            ErrorInfo::new(
                "No valid RAG configuration found",
                "RAG_CONFIG_INVALID"
            ).with_fix("Update collection RAG config with valid settings: {\"llm_provider_id\": \"<provider-id>\", \"model\": \"gpt-4\", \"system_prompt\": \"You are a helpful assistant.\", \"temperature\": 0.7, \"max_tokens\": 1000, \"top_k\": 5}")
        ))?;
    let provider_type = provider_type_str.ok_or_else(|| Error::BadRequest("LLM provider type not found".to_string()))?;
    let api_key = api_key_str.ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider API key not configured",
                "LLM_API_KEY_MISSING"
            ).with_fix("Add api_key to the LLM provider in Project Settings > LLM Providers.")
        ))?;

    // Sort and truncate results
    all_results.sort_by(|a, b| b.1.score.partial_cmp(&a.1.score).unwrap_or(std::cmp::Ordering::Equal));
    all_results.truncate(top_k as usize);

    // Build sources
    let sources: Vec<UnifiedChatSource> = all_results.iter().map(|(collection_name, r)| {
        UnifiedChatSource {
            collection: collection_name.clone(),
            document_id: r.document_id.to_string(),
            document_name: r.metadata
                .as_ref()
                .and_then(|m| m.get("document_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            content: r.content.chars().take(200).collect(),
            score: r.score,
        }
    }).collect();

    // Build context
    let context_parts: Vec<String> = all_results.iter()
        .enumerate()
        .map(|(idx, (collection_name, r))| {
            if collections.len() > 1 {
                format!("[{} - {}] {}", idx + 1, collection_name, r.content)
            } else {
                format!("[{}] {}", idx + 1, r.content)
            }
        })
        .collect();
    let context = context_parts.join("\n\n");

    let full_prompt = if collections.len() > 1 {
        format!(
            "{}\n\nYou are answering based on information from these collections: {}\n\nContext:\n{}\n\nUser: {}",
            rag_config.system_prompt,
            collections_used.join(", "),
            context,
            req.message.clone()
        )
    } else {
        format!(
            "{}\n\nContext:\n{}\n\nUser: {}",
            rag_config.system_prompt,
            context,
            req.message.clone()
        )
    };

    let model = rag_config.model.clone();
    let temperature = rag_config.temperature;
    let max_tokens = rag_config.max_tokens;
    let message = req.message.clone();

    // Create channel for streaming chunks
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Result<String>>(100);

    // Spawn the streaming LLM call
    tokio::spawn(async move {
        let _ = call_llm_stream(
            &provider_type,
            &api_key,
            base_url_str.as_deref(),
            &model,
            &full_prompt,
            temperature,
            max_tokens,
            tx,
        ).await;
    });

    // Create the SSE stream
    let stream = async_stream::stream! {
        // First, send sources
        let sources_event = StreamEvent::Sources { sources: sources.clone() };
        yield Ok(Event::default().data(serde_json::to_string(&sources_event).unwrap_or_default()));

        // Process streaming chunks from channel
        let mut full_response = String::new();
        let mut thinking_content = String::new();
        let mut in_thinking = false;
        let mut thinking_sent = false;
        let mut had_error = false;

        while let Some(chunk_result) = rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    full_response.push_str(&chunk);

                    // Check for thinking tags
                    if chunk.contains("<think>") || chunk.contains("<thinking>") {
                        in_thinking = true;
                    }

                    if in_thinking {
                        thinking_content.push_str(&chunk);

                        if chunk.contains("</think>") || chunk.contains("</thinking>") {
                            in_thinking = false;
                            let clean_thinking = thinking_content
                                .replace("<think>", "")
                                .replace("</think>", "")
                                .replace("<thinking>", "")
                                .replace("</thinking>", "")
                                .trim()
                                .to_string();
                            if !clean_thinking.is_empty() {
                                let event = StreamEvent::Thinking { content: clean_thinking };
                                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                                thinking_sent = true;
                            }
                            thinking_content.clear();
                        }
                    } else {
                        let event = StreamEvent::Content { content: chunk };
                        yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                    }
                }
                Err(e) => {
                    let event = StreamEvent::Error { message: e.to_string() };
                    yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                    had_error = true;
                    break;
                }
            }
        }

        if had_error {
            return;
        }

        // Extract final thinking and answer
        let (thinking, answer) = extract_thinking(&full_response);

        // If we have thinking but didn't send it during streaming, send now
        if let Some(ref t) = thinking {
            if !thinking_sent && !t.is_empty() {
                let event = StreamEvent::Thinking { content: t.clone() };
                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
            }
        }

        // Count tokens
        let user_tokens = count_tokens(&message) as i32;
        let answer_tokens = count_tokens(&answer) as i32;
        let total_tokens = user_tokens + answer_tokens;

        // Send done event
        let event = StreamEvent::Done {
            conversation_id: None,
            tokens_used: total_tokens,
        };
        yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
    };

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive")
    ))
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

    // Parse thinking from answer if present
    let (thinking, answer) = extract_thinking(&result.answer);

    // Convert to unified response
    Ok(Json(UnifiedChatResponse {
        answer,
        thinking,
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

/// POST /collections/:name/chat/stream - Streaming chat with a single collection
pub async fn collection_chat_stream(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(collection_name): Path<String>,
    Json(req): Json<UnifiedChatRequest>,
) -> Result<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>> {
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

    // Get the project settings
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
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "No LLM providers configured",
                "LLM_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an LLM provider in Project Settings > LLM Providers. Supported: openai, anthropic, google, or custom (OpenAI-compatible).")
        ))?;

    let provider = llm_providers.iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&rag_config.llm_provider_id))
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider specified in RAG config not found",
                "LLM_PROVIDER_NOT_FOUND"
            ).with_fix("The llm_provider_id in the collection's RAG config references a provider that doesn't exist. Add the provider in Project Settings > LLM Providers, or update the collection's RAG configuration.")
        ))?;

    let api_key = provider.get("api_key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::BadRequest("LLM provider API key not configured".to_string()))?
        .to_string();

    let provider_type = provider.get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("openai")
        .to_string();

    let base_url = provider.get("base_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Get embedding provider and search
    let embedding_provider = get_project_embedding_provider(&settings)
        .map_err(|e| Error::Config(format!("Embedding error: {}", e)))?;

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

    // Build sources
    let sources: Vec<UnifiedChatSource> = search_results.iter().map(|r| {
        UnifiedChatSource {
            collection: collection_name.clone(),
            document_id: r.document_id.to_string(),
            document_name: r.metadata
                .as_ref()
                .and_then(|m| m.get("document_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            content: r.content.chars().take(200).collect(),
            score: r.score,
        }
    }).collect();

    // Build context
    let context_parts: Vec<String> = search_results.iter()
        .enumerate()
        .map(|(idx, r)| format!("[{}] {}", idx + 1, r.content))
        .collect();
    let context = context_parts.join("\n\n");

    let full_prompt = format!(
        "{}\n\nContext:\n{}\n\nUser: {}",
        rag_config.system_prompt,
        context,
        req.message.clone()
    );

    let model = rag_config.model.clone();
    let temperature = rag_config.temperature;
    let max_tokens = rag_config.max_tokens;
    let message = req.message.clone();
    let conversation_id = req.conversation_id.clone();
    let pool = state.pool.clone();
    let collection_id = collection.id;
    let user_id = auth.user_id;

    // Create channel for streaming chunks
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Result<String>>(100);

    // Spawn the streaming LLM call
    tokio::spawn(async move {
        let _ = call_llm_stream(
            &provider_type,
            &api_key,
            base_url.as_deref(),
            &model,
            &full_prompt,
            temperature,
            max_tokens,
            tx,
        ).await;
    });

    // Create the SSE stream
    let stream = async_stream::stream! {
        // First, send sources
        let sources_event = StreamEvent::Sources { sources: sources.clone() };
        yield Ok(Event::default().data(serde_json::to_string(&sources_event).unwrap_or_default()));

        // Process streaming chunks from channel
        let mut full_response = String::new();
        let mut thinking_content = String::new();
        let mut in_thinking = false;
        let mut thinking_sent = false;
        let mut had_error = false;

        while let Some(chunk_result) = rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    full_response.push_str(&chunk);

                    // Check for thinking tags
                    if chunk.contains("<think>") || chunk.contains("<thinking>") {
                        in_thinking = true;
                    }

                    if in_thinking {
                        thinking_content.push_str(&chunk);

                        if chunk.contains("</think>") || chunk.contains("</thinking>") {
                            in_thinking = false;
                            // Send thinking content
                            let clean_thinking = thinking_content
                                .replace("<think>", "")
                                .replace("</think>", "")
                                .replace("<thinking>", "")
                                .replace("</thinking>", "")
                                .trim()
                                .to_string();
                            if !clean_thinking.is_empty() {
                                let event = StreamEvent::Thinking { content: clean_thinking };
                                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                                thinking_sent = true;
                            }
                            thinking_content.clear();
                        }
                    } else {
                        // Send content chunk
                        let event = StreamEvent::Content { content: chunk };
                        yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                    }
                }
                Err(e) => {
                    let event = StreamEvent::Error { message: e.to_string() };
                    yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                    had_error = true;
                    break;
                }
            }
        }

        if had_error {
            return;
        }

        // Extract final thinking and answer
        let (thinking, answer) = extract_thinking(&full_response);

        // If we have thinking but didn't send it during streaming, send now
        if let Some(ref t) = thinking {
            if !thinking_sent && !t.is_empty() {
                let event = StreamEvent::Thinking { content: t.clone() };
                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
            }
        }

        // Count tokens
        let user_tokens = count_tokens(&message) as i32;
        let answer_tokens = count_tokens(&answer) as i32;
        let total_tokens = user_tokens + answer_tokens;

        // Save conversation
        if let Ok(conv_id) = conversations::get_or_create_conversation(
            &pool,
            project_id,
            collection_id,
            user_id,
            conversation_id.clone(),
        ).await {
            let _ = conversations::save_message(&pool, conv_id, "user", &message, user_tokens, None).await;
            let sources_json = serde_json::to_value(&sources).ok();
            let _ = conversations::save_message(&pool, conv_id, "assistant", &answer, answer_tokens, sources_json).await;

            // Send done event
            let event = StreamEvent::Done {
                conversation_id: Some(conv_id.to_string()),
                tokens_used: total_tokens,
            };
            yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
        } else {
            let event = StreamEvent::Done {
                conversation_id: None,
                tokens_used: total_tokens,
            };
            yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
        }
    };

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive")
    ))
}

/// Extract thinking content from response
fn extract_thinking(response: &str) -> (Option<String>, String) {
    // Try <think>...</think> format
    if let Some(start) = response.find("<think>") {
        if let Some(end) = response.find("</think>") {
            let thinking = response[start + 7..end].trim().to_string();
            let answer = format!("{}{}", &response[..start], &response[end + 8..]).trim().to_string();
            return (Some(thinking), answer);
        }
    }

    // Try <thinking>...</thinking> format
    if let Some(start) = response.find("<thinking>") {
        if let Some(end) = response.find("</thinking>") {
            let thinking = response[start + 10..end].trim().to_string();
            let answer = format!("{}{}", &response[..start], &response[end + 11..]).trim().to_string();
            return (Some(thinking), answer);
        }
    }

    (None, response.to_string())
}

/// POST /chat - Unified chat across multiple collections
pub async fn unified_chat(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<UnifiedChatRequest>,
) -> Result<Json<UnifiedChatResponse>> {
    let collections = req.get_collections();

    if collections.is_empty() {
        return Err(Error::BadRequest("At least one collection must be specified in 'collection' field".to_string()));
    }

    // Convert to legacy request
    let legacy_req = MultiCollectionChatRequest {
        collections: collections.clone(),
        message: req.message.clone(),
        conversation_id: req.conversation_id.clone(),
        include_sources: Some(req.include_sources),
        top_k: req.top_k,
    };

    let result = chat_multi_internal(&state, &auth, legacy_req).await?;

    // Convert to unified response
    // Parse thinking from answer
    let (thinking, answer) = extract_thinking(&result.answer);

    Ok(Json(UnifiedChatResponse {
        answer,
        thinking,
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

/// POST /chat/stream - Streaming chat across multiple collections
pub async fn unified_chat_stream(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<UnifiedChatRequest>,
) -> Result<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>> {
    let project_id = auth.require_project()?;
    let collections = req.get_collections();

    if collections.is_empty() {
        return Err(Error::BadRequest("At least one collection must be specified in 'collection' field".to_string()));
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
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "No LLM providers configured",
                "LLM_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an LLM provider in Project Settings > LLM Providers. Supported: openai, anthropic, google, or custom (OpenAI-compatible).")
        ))?;

    // We'll use the RAG config from the first valid collection
    let mut rag_config: Option<RagConfig> = None;
    let mut provider_type_str: Option<String> = None;
    let mut base_url_str: Option<String> = None;
    let mut api_key_str: Option<String> = None;
    let mut collections_used: Vec<String> = Vec::new();

    // Search across all collections and gather results
    let top_k = req.top_k.unwrap_or(5);
    let mut all_results: Vec<(String, rag::RetrievalResult)> = Vec::new();

    for collection_name in &collections {
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
                    provider_type_str = Some(p.get("type").and_then(|v| v.as_str()).unwrap_or("openai").to_string());
                    base_url_str = p.get("base_url").and_then(|v| v.as_str()).map(|s| s.to_string());
                    api_key_str = p.get("api_key").and_then(|v| v.as_str()).map(|s| s.to_string());
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

        let embedding_provider = match get_project_embedding_provider(&settings) {
            Ok(p) => p,
            Err(_) => continue,
        };

        if let Ok(results) = rag::retrieve_with_provider(&state.pool, embedding_provider.as_ref(), retrieval_query, Some(project_id)).await {
            collections_used.push(collection_name.to_string());
            for result in results {
                all_results.push((collection_name.to_string(), result));
            }
        }
    }

    if collections_used.is_empty() {
        return Err(Error::BadRequestDetailed(
            ErrorInfo::new(
                "No RAG-enabled collections found",
                "RAG_NOT_ENABLED"
            ).with_fix("Enable RAG on at least one collection. Use: PATCH /v1/collections/{name} with {\"rag_enabled\": true, \"rag_config\": {...}}. RAG config requires: llm_provider_id, model, system_prompt.")
        ));
    }

    let rag_config = rag_config.ok_or_else(|| Error::BadRequestDetailed(
            ErrorInfo::new(
                "No valid RAG configuration found",
                "RAG_CONFIG_INVALID"
            ).with_fix("Update collection RAG config with valid settings: {\"llm_provider_id\": \"<provider-id>\", \"model\": \"gpt-4\", \"system_prompt\": \"You are a helpful assistant.\", \"temperature\": 0.7, \"max_tokens\": 1000, \"top_k\": 5}")
        ))?;
    let provider_type = provider_type_str.ok_or_else(|| Error::BadRequest("LLM provider type not found".to_string()))?;
    let api_key = api_key_str.ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider API key not configured",
                "LLM_API_KEY_MISSING"
            ).with_fix("Add api_key to the LLM provider in Project Settings > LLM Providers.")
        ))?;

    // Sort and truncate results
    all_results.sort_by(|a, b| b.1.score.partial_cmp(&a.1.score).unwrap_or(std::cmp::Ordering::Equal));
    all_results.truncate(top_k as usize);

    // Build sources
    let sources: Vec<UnifiedChatSource> = all_results.iter().map(|(collection_name, r)| {
        UnifiedChatSource {
            collection: collection_name.clone(),
            document_id: r.document_id.to_string(),
            document_name: r.metadata
                .as_ref()
                .and_then(|m| m.get("document_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            content: r.content.chars().take(200).collect(),
            score: r.score,
        }
    }).collect();

    // Build context
    let context_parts: Vec<String> = all_results.iter()
        .enumerate()
        .map(|(idx, (collection_name, r))| format!("[{} - {}] {}", idx + 1, collection_name, r.content))
        .collect();
    let context = context_parts.join("\n\n");

    let full_prompt = format!(
        "{}\n\nYou are answering based on information from these collections: {}\n\nContext:\n{}\n\nUser: {}",
        rag_config.system_prompt,
        collections_used.join(", "),
        context,
        req.message.clone()
    );

    let model = rag_config.model.clone();
    let temperature = rag_config.temperature;
    let max_tokens = rag_config.max_tokens;
    let message = req.message.clone();

    // Create channel for streaming chunks
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Result<String>>(100);

    // Spawn the streaming LLM call
    tokio::spawn(async move {
        let _ = call_llm_stream(
            &provider_type,
            &api_key,
            base_url_str.as_deref(),
            &model,
            &full_prompt,
            temperature,
            max_tokens,
            tx,
        ).await;
    });

    // Create the SSE stream
    let stream = async_stream::stream! {
        // First, send sources
        let sources_event = StreamEvent::Sources { sources: sources.clone() };
        yield Ok(Event::default().data(serde_json::to_string(&sources_event).unwrap_or_default()));

        // Process streaming chunks from channel
        let mut full_response = String::new();
        let mut thinking_content = String::new();
        let mut in_thinking = false;
        let mut thinking_sent = false;
        let mut had_error = false;

        while let Some(chunk_result) = rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    full_response.push_str(&chunk);

                    // Check for thinking tags
                    if chunk.contains("<think>") || chunk.contains("<thinking>") {
                        in_thinking = true;
                    }

                    if in_thinking {
                        thinking_content.push_str(&chunk);

                        if chunk.contains("</think>") || chunk.contains("</thinking>") {
                            in_thinking = false;
                            let clean_thinking = thinking_content
                                .replace("<think>", "")
                                .replace("</think>", "")
                                .replace("<thinking>", "")
                                .replace("</thinking>", "")
                                .trim()
                                .to_string();
                            if !clean_thinking.is_empty() {
                                let event = StreamEvent::Thinking { content: clean_thinking };
                                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                                thinking_sent = true;
                            }
                            thinking_content.clear();
                        }
                    } else {
                        let event = StreamEvent::Content { content: chunk };
                        yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                    }
                }
                Err(e) => {
                    let event = StreamEvent::Error { message: e.to_string() };
                    yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                    had_error = true;
                    break;
                }
            }
        }

        if had_error {
            return;
        }

        // Extract final thinking and answer
        let (thinking, answer) = extract_thinking(&full_response);

        // If we have thinking but didn't send it during streaming, send now
        if let Some(ref t) = thinking {
            if !thinking_sent && !t.is_empty() {
                let event = StreamEvent::Thinking { content: t.clone() };
                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
            }
        }

        // Count tokens
        let user_tokens = count_tokens(&message) as i32;
        let answer_tokens = count_tokens(&answer) as i32;
        let total_tokens = user_tokens + answer_tokens;

        // Send done event
        let event = StreamEvent::Done {
            conversation_id: None,
            tokens_used: total_tokens,
        };
        yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
    };

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive")
    ))
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
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "No LLM providers configured",
                "LLM_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an LLM provider in Project Settings > LLM Providers. Supported: openai, anthropic, google, or custom (OpenAI-compatible).")
        ))?;

    let provider = llm_providers.iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&rag_config.llm_provider_id))
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider specified in RAG config not found",
                "LLM_PROVIDER_NOT_FOUND"
            ).with_fix("The llm_provider_id in the collection's RAG config references a provider that doesn't exist. Add the provider in Project Settings > LLM Providers, or update the collection's RAG configuration.")
        ))?;

    let api_key = provider.get("api_key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider API key not configured",
                "LLM_API_KEY_MISSING"
            ).with_fix("Add api_key to the LLM provider in Project Settings > LLM Providers.")
        ))?;

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
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "No LLM providers configured",
                "LLM_PROVIDER_NOT_CONFIGURED"
            ).with_fix("Add an LLM provider in Project Settings > LLM Providers. Supported: openai, anthropic, google, or custom (OpenAI-compatible).")
        ))?;

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
        return Err(Error::BadRequestDetailed(
            ErrorInfo::new(
                "No RAG-enabled collections found",
                "RAG_NOT_ENABLED"
            ).with_fix("Enable RAG on at least one collection. Use: PATCH /v1/collections/{name} with {\"rag_enabled\": true, \"rag_config\": {...}}. RAG config requires: llm_provider_id, model, system_prompt.")
        ));
    }

    let rag_config = rag_config.ok_or_else(|| Error::BadRequestDetailed(
            ErrorInfo::new(
                "No valid RAG configuration found",
                "RAG_CONFIG_INVALID"
            ).with_fix("Update collection RAG config with valid settings: {\"llm_provider_id\": \"<provider-id>\", \"model\": \"gpt-4\", \"system_prompt\": \"You are a helpful assistant.\", \"temperature\": 0.7, \"max_tokens\": 1000, \"top_k\": 5}")
        ))?;
    let (provider, provider_type, base_url) = provider_info.ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider specified in RAG config not found",
                "LLM_PROVIDER_NOT_FOUND"
            ).with_fix("The llm_provider_id in the collection's RAG config references a provider that doesn't exist. Add the provider in Project Settings > LLM Providers, or update the collection's RAG configuration.")
        ))?;

    let api_key = provider.get("api_key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::ConfigDetailed(
            ErrorInfo::new(
                "LLM provider API key not configured",
                "LLM_API_KEY_MISSING"
            ).with_fix("Add api_key to the LLM provider in Project Settings > LLM Providers.")
        ))?;

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
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();

        // Parse error for actionable message
        let (error_code, fix) = match status.as_u16() {
            401 => ("LLM_AUTH_FAILED", format!(
                "Authentication failed. Verify api_key is correct for {} provider in Project Settings.",
                provider_type
            )),
            403 => ("LLM_ACCESS_DENIED", format!(
                "Access denied. Check API key permissions for {} provider.",
                provider_type
            )),
            404 => ("LLM_MODEL_NOT_FOUND", format!(
                "Model '{}' not found. Verify model name is correct for {} provider.",
                model, provider_type
            )),
            429 => ("LLM_RATE_LIMIT", "Rate limit exceeded. Wait and retry, or upgrade your API plan.".to_string()),
            500..=599 => ("LLM_PROVIDER_ERROR", format!(
                "{} API is experiencing issues. Check provider status page.",
                provider_type
            )),
            _ => ("LLM_API_ERROR", format!(
                "Check {} provider configuration in Project Settings.",
                provider_type
            )),
        };

        return Err(Error::LlmProvider(
            ErrorInfo::new(
                format!("{} API error ({}): {}", provider_type, status, error_text),
                error_code
            ).with_fix(fix)
        ));
    }

    let json: serde_json::Value = response.json().await
        .map_err(|e| Error::LlmProvider(
            ErrorInfo::new(
                format!("Failed to parse {} response: {}", provider_type, e),
                "LLM_RESPONSE_PARSE_ERROR"
            ).with_fix("The LLM provider returned an unexpected response format. Check provider compatibility.")
        ))?;

    // Log the response for debugging
    tracing::debug!("LLM response for provider {}: {}", provider_type, json);

    // Extract the answer based on provider type
    let answer = match provider_type {
        "anthropic" => {
            json.get("content")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|item| item.get("text"))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    tracing::error!("Failed to parse Anthropic response: {}", json);
                    Error::Internal(format!("Unexpected Anthropic response format: {}", json))
                })?
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
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    tracing::error!("Failed to parse Google response: {}", json);
                    Error::Internal(format!("Unexpected Google response format: {}", json))
                })?
        }
        _ => {
            // OpenAI-compatible (openai, custom)
            // Try standard OpenAI format first: choices[0].message.content
            let content = json.get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .map(|s| s.to_string());

            if let Some(answer) = content {
                answer
            } else {
                // Try alternative formats for custom providers
                // Format: choices[0].text (older completions API)
                let alt_content = json.get("choices")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|choice| choice.get("text"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string());

                if let Some(answer) = alt_content {
                    answer
                } else {
                    // Format: response or output (some custom APIs)
                    let simple_content = json.get("response")
                        .or_else(|| json.get("output"))
                        .or_else(|| json.get("text"))
                        .or_else(|| json.get("content"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    if let Some(answer) = simple_content {
                        answer
                    } else {
                        tracing::error!("Failed to parse OpenAI-compatible response: {}", json);
                        return Err(Error::Internal(format!(
                            "Could not extract content from LLM response. Expected OpenAI-compatible format. Response: {}",
                            json
                        )));
                    }
                }
            }
        }
    };

    if answer.is_empty() {
        tracing::warn!("LLM returned empty response for provider {}", provider_type);
    }

    Ok(answer)
}

/// Streaming LLM call - collects chunks and sends via channel
async fn call_llm_stream(
    provider_type: &str,
    api_key: &str,
    base_url: Option<&str>,
    model: &str,
    prompt: &str,
    temperature: f32,
    max_tokens: i32,
    tx: tokio::sync::mpsc::Sender<Result<String>>,
) -> Result<()> {
    let client = reqwest::Client::new();

    let url = match provider_type {
        "openai" => base_url.unwrap_or("https://api.openai.com/v1").to_string() + "/chat/completions",
        "anthropic" => base_url.unwrap_or("https://api.anthropic.com/v1").to_string() + "/messages",
        "custom" => base_url.ok_or_else(|| Error::BadRequest("Base URL required for custom provider".to_string()))?.to_string() + "/chat/completions",
        _ => return Err(Error::BadRequest(format!("Streaming not supported for provider: {}", provider_type))),
    };

    let response = match provider_type {
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": max_tokens,
                "stream": true,
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
        _ => {
            // OpenAI-compatible (openai, custom)
            let body = serde_json::json!({
                "model": model,
                "stream": true,
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
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();

        let (error_code, fix) = match status.as_u16() {
            401 => ("LLM_AUTH_FAILED", format!(
                "Authentication failed. Verify api_key is correct for {} provider in Project Settings.",
                provider_type
            )),
            404 => ("LLM_MODEL_NOT_FOUND", format!(
                "Model '{}' not found. Verify model name is correct for {} provider.",
                model, provider_type
            )),
            429 => ("LLM_RATE_LIMIT", "Rate limit exceeded. Wait and retry.".to_string()),
            _ => ("LLM_API_ERROR", format!(
                "Check {} provider configuration in Project Settings.",
                provider_type
            )),
        };

        return Err(Error::LlmProvider(
            ErrorInfo::new(
                format!("{} streaming API error ({}): {}", provider_type, status, error_text),
                error_code
            ).with_fix(fix)
        ));
    }

    let provider = provider_type.to_string();
    let mut buffer = String::new();
    let mut byte_stream = response.bytes_stream();

    while let Some(chunk_result) = FuturesStreamExt::next(&mut byte_stream).await {
        match chunk_result {
            Ok(chunk_bytes) => {
                buffer.push_str(&String::from_utf8_lossy(&chunk_bytes));

                // Process complete SSE lines
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() || line == "data: [DONE]" {
                        continue;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            let content = match provider.as_str() {
                                "anthropic" => {
                                    // Anthropic streaming format
                                    if json.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                                        json.get("delta")
                                            .and_then(|d| d.get("text"))
                                            .and_then(|t| t.as_str())
                                            .map(|s| s.to_string())
                                    } else {
                                        None
                                    }
                                }
                                _ => {
                                    // OpenAI-compatible streaming format
                                    json.get("choices")
                                        .and_then(|c| c.as_array())
                                        .and_then(|arr| arr.first())
                                        .and_then(|choice| choice.get("delta"))
                                        .and_then(|delta| delta.get("content"))
                                        .and_then(|c| c.as_str())
                                        .map(|s| s.to_string())
                                }
                            };

                            if let Some(text) = content {
                                if !text.is_empty() {
                                    let _ = tx.send(Ok(text)).await;
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = tx.send(Err(Error::Internal(format!("Stream error: {}", e)))).await;
                return Err(Error::Internal(format!("Stream error: {}", e)));
            }
        }
    }

    Ok(())
}
