use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;

use crate::server::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

#[derive(Serialize)]
pub struct ReadyResponse {
    pub status: String,
    pub checks: HealthChecks,
    pub latency_ms: u64,
}

#[derive(Serialize)]
pub struct HealthChecks {
    pub database: ComponentHealth,
    pub storage: ComponentHealth,
    pub embedding: ComponentHealth,
    pub cache: ComponentHealth,
}

#[derive(Serialize)]
pub struct ComponentHealth {
    pub healthy: bool,
    pub message: Option<String>,
    pub latency_ms: Option<u64>,
}

impl ComponentHealth {
    fn healthy() -> Self {
        Self {
            healthy: true,
            message: None,
            latency_ms: None,
        }
    }

    fn healthy_with_latency(latency_ms: u64) -> Self {
        Self {
            healthy: true,
            message: None,
            latency_ms: Some(latency_ms),
        }
    }

    fn unhealthy(message: &str) -> Self {
        Self {
            healthy: false,
            message: Some(message.to_string()),
            latency_ms: None,
        }
    }
}

/// Liveness probe - just confirms the service is running
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// Readiness probe - checks all dependencies are available
pub async fn ready_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ReadyResponse>, (StatusCode, Json<ReadyResponse>)> {
    let start = Instant::now();

    // Check database connection
    let db_health = check_database(&state).await;

    // Check storage
    let storage_health = check_storage(&state);

    // Check embedding service
    let embedding_health = check_embedding(&state).await;

    // Check cache service
    let cache_health = check_cache(&state).await;

    let all_healthy = db_health.healthy
        && storage_health.healthy
        && embedding_health.healthy
        && cache_health.healthy;

    let total_latency = start.elapsed().as_millis() as u64;

    let response = ReadyResponse {
        status: if all_healthy { "ready" } else { "not ready" }.to_string(),
        checks: HealthChecks {
            database: db_health,
            storage: storage_health,
            embedding: embedding_health,
            cache: cache_health,
        },
        latency_ms: total_latency,
    };

    if all_healthy {
        Ok(Json(response))
    } else {
        Err((StatusCode::SERVICE_UNAVAILABLE, Json(response)))
    }
}

/// Check database connectivity
async fn check_database(state: &AppState) -> ComponentHealth {
    let start = Instant::now();

    match sqlx::query("SELECT 1").execute(state.pool.inner()).await {
        Ok(_) => ComponentHealth::healthy_with_latency(start.elapsed().as_millis() as u64),
        Err(e) => ComponentHealth::unhealthy(&format!("Database error: {}", e)),
    }
}

/// Check storage accessibility
fn check_storage(state: &AppState) -> ComponentHealth {
    let path = &state.config.storage.path;

    if !path.exists() {
        return ComponentHealth::unhealthy(&format!(
            "Storage path does not exist: {}",
            path.display()
        ));
    }

    // Check if we can write to the storage path
    let test_file = path.join(".health_check");
    match std::fs::write(&test_file, "ok") {
        Ok(_) => {
            // Clean up test file
            let _ = std::fs::remove_file(&test_file);
            ComponentHealth::healthy()
        }
        Err(e) => ComponentHealth::unhealthy(&format!("Storage not writable: {}", e)),
    }
}

/// Check embedding service availability
async fn check_embedding(state: &AppState) -> ComponentHealth {
    let provider = &state.config.embedding.provider;

    // If embedding is disabled, that's fine
    if provider == "none" || provider == "disabled" {
        return ComponentHealth {
            healthy: true,
            message: Some("Embedding disabled".to_string()),
            latency_ms: None,
        };
    }

    // For configured providers, check connectivity based on provider type
    match provider.as_str() {
        "openai" => {
            // Check OpenAI connectivity by making a simple request
            // We don't want to actually embed text (costs money), so just check API reachability
            let base_url = state
                .config
                .embedding
                .base_url
                .as_deref()
                .unwrap_or("https://api.openai.com/v1");

            let start = Instant::now();
            let client = match reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
            {
                Ok(c) => c,
                Err(e) => return ComponentHealth::unhealthy(&format!("Failed to create HTTP client: {}", e)),
            };

            // Just check if we can reach the API (will get 401 without auth, but that's OK)
            match client.get(format!("{}/models", base_url)).send().await {
                Ok(resp) => {
                    let latency = start.elapsed().as_millis() as u64;
                    // 401 means API is reachable but we need auth - that's fine for a health check
                    // We're checking connectivity, not authentication
                    if resp.status().is_success()
                        || resp.status() == reqwest::StatusCode::UNAUTHORIZED
                    {
                        ComponentHealth::healthy_with_latency(latency)
                    } else {
                        ComponentHealth::unhealthy(&format!(
                            "OpenAI API returned unexpected status: {}",
                            resp.status()
                        ))
                    }
                }
                Err(e) => ComponentHealth::unhealthy(&format!("Cannot reach OpenAI API: {}", e)),
            }
        }
        "ollama" => {
            let default_ollama_url = "http://localhost:11434";
            let base_url = state
                .config
                .embedding
                .base_url
                .as_deref()
                .unwrap_or(default_ollama_url);

            let start = Instant::now();
            let client = match reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
            {
                Ok(c) => c,
                Err(e) => return ComponentHealth::unhealthy(&format!("Failed to create HTTP client: {}", e)),
            };

            match client.get(format!("{}/api/tags", base_url)).send().await {
                Ok(resp) => {
                    let latency = start.elapsed().as_millis() as u64;
                    if resp.status().is_success() {
                        ComponentHealth::healthy_with_latency(latency)
                    } else {
                        ComponentHealth::unhealthy(&format!(
                            "Ollama API returned status: {}",
                            resp.status()
                        ))
                    }
                }
                Err(e) => ComponentHealth::unhealthy(&format!("Cannot reach Ollama: {}", e)),
            }
        }
        "custom" => {
            let base_url = state.config.embedding.base_url.as_deref();

            match base_url {
                Some(url) => {
                    let start = Instant::now();
                    let client = match reqwest::Client::builder()
                        .timeout(std::time::Duration::from_secs(5))
                        .build()
                    {
                        Ok(c) => c,
                        Err(e) => return ComponentHealth::unhealthy(&format!("Failed to create HTTP client: {}", e)),
                    };

                    // Just check if the base URL is reachable
                    match client.get(url).send().await {
                        Ok(_) => {
                            let latency = start.elapsed().as_millis() as u64;
                            ComponentHealth::healthy_with_latency(latency)
                        }
                        Err(e) => ComponentHealth::unhealthy(&format!(
                            "Cannot reach custom embedding API: {}",
                            e
                        )),
                    }
                }
                None => ComponentHealth::unhealthy("Custom embedding provider requires base_url"),
            }
        }
        _ => ComponentHealth {
            healthy: true,
            message: Some(format!("Unknown provider: {}", provider)),
            latency_ms: None,
        },
    }
}

/// Check cache service
async fn check_cache(state: &AppState) -> ComponentHealth {
    if !state.config.cache.enabled {
        return ComponentHealth {
            healthy: true,
            message: Some("Cache disabled".to_string()),
            latency_ms: None,
        };
    }

    let start = Instant::now();

    // Check if we can get cache stats (tests cache table access)
    match state.cache.stats().await {
        Ok(stats) => {
            let latency = start.elapsed().as_millis() as u64;
            ComponentHealth {
                healthy: true,
                message: Some(format!(
                    "{} entries, {:.1}% hit rate",
                    stats.total_entries,
                    stats.hit_rate * 100.0
                )),
                latency_ms: Some(latency),
            }
        }
        Err(e) => ComponentHealth::unhealthy(&format!("Cache error: {}", e)),
    }
}
