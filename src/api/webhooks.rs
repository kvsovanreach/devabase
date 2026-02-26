use crate::auth::AuthContext;
use crate::db::models::{
    validate_events, CreateWebhook, UpdateWebhook, Webhook, WebhookLog, WebhookLogResponse,
    WebhookResponse,
};
use crate::server::AppState;
use crate::{Error, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

/// List webhooks for the current project
pub async fn list_webhooks(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<Vec<WebhookResponse>>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let webhooks: Vec<Webhook> = sqlx::query_as(
        r#"
        SELECT * FROM sys_webhooks
        WHERE project_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(project_id)
    .fetch_all(state.pool.inner())
    .await?;

    Ok(Json(webhooks.into_iter().map(Into::into).collect()))
}

/// Create a new webhook
pub async fn create_webhook(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<CreateWebhook>,
) -> Result<(StatusCode, Json<WebhookResponse>)> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    // Validate events
    validate_events(&input.events).map_err(|e| Error::Validation(e))?;

    // Validate URL
    if input.url.is_empty() {
        return Err(Error::Validation("URL is required".to_string()));
    }
    if !input.url.starts_with("http://") && !input.url.starts_with("https://") {
        return Err(Error::Validation(
            "URL must start with http:// or https://".to_string(),
        ));
    }

    // Validate name
    if input.name.trim().is_empty() {
        return Err(Error::Validation("Name is required".to_string()));
    }

    // Generate secret
    let secret = generate_secret();

    let webhook: Webhook = sqlx::query_as(
        r#"
        INSERT INTO sys_webhooks (project_id, name, url, secret, events, headers, retry_count, timeout_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        "#,
    )
    .bind(project_id)
    .bind(input.name.trim())
    .bind(&input.url)
    .bind(&secret)
    .bind(&input.events)
    .bind(&input.headers)
    .bind(input.retry_count)
    .bind(input.timeout_ms)
    .fetch_one(state.pool.inner())
    .await?;

    // Return the webhook with the secret (only time it's visible)
    let response: WebhookResponse = webhook.into();

    Ok((
        StatusCode::CREATED,
        Json(response),
    ))
}

/// Get a webhook by ID
pub async fn get_webhook(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<WebhookResponse>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let webhook: Webhook = sqlx::query_as(
        r#"
        SELECT * FROM sys_webhooks
        WHERE id = $1 AND project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Webhook not found".to_string()))?;

    Ok(Json(webhook.into()))
}

/// Update a webhook
pub async fn update_webhook(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateWebhook>,
) -> Result<Json<WebhookResponse>> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    // Validate events if provided
    if let Some(ref events) = input.events {
        validate_events(events).map_err(|e| Error::Validation(e))?;
    }

    // Build dynamic update query
    let mut updates = Vec::new();
    let mut param_idx = 2; // $1 is id, $2 is project_id

    if input.name.is_some() {
        param_idx += 1;
        updates.push(format!("name = ${}", param_idx));
    }
    if input.url.is_some() {
        param_idx += 1;
        updates.push(format!("url = ${}", param_idx));
    }
    if input.events.is_some() {
        param_idx += 1;
        updates.push(format!("events = ${}", param_idx));
    }
    if input.status.is_some() {
        param_idx += 1;
        updates.push(format!("status = ${}", param_idx));
    }
    if input.headers.is_some() {
        param_idx += 1;
        updates.push(format!("headers = ${}", param_idx));
    }
    if input.retry_count.is_some() {
        param_idx += 1;
        updates.push(format!("retry_count = ${}", param_idx));
    }
    if input.timeout_ms.is_some() {
        param_idx += 1;
        updates.push(format!("timeout_ms = ${}", param_idx));
    }

    if updates.is_empty() {
        return Err(Error::Validation("No fields to update".to_string()));
    }

    let query = format!(
        "UPDATE sys_webhooks SET {}, updated_at = NOW() WHERE id = $1 AND project_id = $2 RETURNING *",
        updates.join(", ")
    );

    let mut query_builder = sqlx::query_as::<_, Webhook>(&query)
        .bind(id)
        .bind(project_id);

    if let Some(ref name) = input.name {
        query_builder = query_builder.bind(name.trim());
    }
    if let Some(ref url) = input.url {
        query_builder = query_builder.bind(url);
    }
    if let Some(ref events) = input.events {
        query_builder = query_builder.bind(events);
    }
    if let Some(ref status) = input.status {
        query_builder = query_builder.bind(status);
    }
    if let Some(ref headers) = input.headers {
        query_builder = query_builder.bind(headers);
    }
    if let Some(retry_count) = input.retry_count {
        query_builder = query_builder.bind(retry_count);
    }
    if let Some(timeout_ms) = input.timeout_ms {
        query_builder = query_builder.bind(timeout_ms);
    }

    let webhook = query_builder
        .fetch_optional(state.pool.inner())
        .await?
        .ok_or_else(|| Error::NotFound("Webhook not found".to_string()))?;

    Ok(Json(webhook.into()))
}

/// Delete a webhook
pub async fn delete_webhook(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    let result = sqlx::query(
        r#"
        DELETE FROM sys_webhooks
        WHERE id = $1 AND project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .execute(state.pool.inner())
    .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("Webhook not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Send a test event to a webhook
pub async fn test_webhook(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<TestWebhookResponse>> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    let webhook: Webhook = sqlx::query_as(
        r#"
        SELECT * FROM sys_webhooks
        WHERE id = $1 AND project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Webhook not found".to_string()))?;

    // Create test payload
    let test_event = crate::events::Event::new(
        crate::events::EventType::DocumentProcessed,
        project_id,
        "test-document-id",
        serde_json::json!({
            "test": true,
            "message": "This is a test webhook delivery",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }),
    );

    // Build payload
    let payload = serde_json::json!({
        "id": test_event.id.to_string(),
        "type": test_event.event_type.as_str(),
        "project_id": project_id.to_string(),
        "timestamp": test_event.timestamp.to_rfc3339(),
        "data": test_event.data,
    });

    let payload_str = serde_json::to_string(&payload)?;

    // Generate signature
    let timestamp = chrono::Utc::now().timestamp();
    let signature = generate_signature(&webhook.secret, timestamp, &payload_str);

    // Send request
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();

    let mut request = client
        .post(&webhook.url)
        .timeout(std::time::Duration::from_millis(webhook.timeout_ms as u64))
        .header("Content-Type", "application/json")
        .header("X-Devabase-Signature", &signature)
        .header("X-Devabase-Timestamp", timestamp.to_string())
        .header("X-Devabase-Event", "test")
        .header("X-Devabase-Delivery", test_event.id.to_string());

    if let Some(headers) = &webhook.headers {
        if let Some(obj) = headers.as_object() {
            for (key, value) in obj {
                if let Some(v) = value.as_str() {
                    request = request.header(key, v);
                }
            }
        }
    }

    let result = request.body(payload_str).send().await;
    let latency_ms = start.elapsed().as_millis() as i32;

    match result {
        Ok(response) => {
            let status = response.status().as_u16() as i32;
            let success = response.status().is_success();
            let body = response.text().await.ok();

            Ok(Json(TestWebhookResponse {
                success,
                status_code: Some(status),
                latency_ms,
                response_body: body,
                error: None,
            }))
        }
        Err(e) => Ok(Json(TestWebhookResponse {
            success: false,
            status_code: None,
            latency_ms,
            response_body: None,
            error: Some(e.to_string()),
        })),
    }
}

#[derive(Serialize)]
pub struct TestWebhookResponse {
    pub success: bool,
    pub status_code: Option<i32>,
    pub latency_ms: i32,
    pub response_body: Option<String>,
    pub error: Option<String>,
}

/// Get webhook delivery logs
#[derive(Deserialize)]
pub struct LogsQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    50
}

pub async fn get_webhook_logs(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
    Query(query): Query<LogsQuery>,
) -> Result<Json<Vec<WebhookLogResponse>>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    // Verify webhook belongs to project
    let exists: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_webhooks WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?;

    if exists.is_none() {
        return Err(Error::NotFound("Webhook not found".to_string()));
    }

    let logs: Vec<WebhookLog> = sqlx::query_as(
        r#"
        SELECT * FROM sys_webhook_logs
        WHERE webhook_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(id)
    .bind(query.limit.min(100))
    .bind(query.offset)
    .fetch_all(state.pool.inner())
    .await?;

    Ok(Json(logs.into_iter().map(Into::into).collect()))
}

/// Generate a random webhook secret
fn generate_secret() -> String {
    let mut rng = rand::thread_rng();
    let bytes: [u8; 32] = rng.gen();
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes)
}

/// Generate HMAC-SHA256 signature
fn generate_signature(secret: &str, timestamp: i64, payload: &str) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let message = format!("{}:{}", timestamp, payload);

    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC can take key of any size");
    mac.update(message.as_bytes());

    let result = mac.finalize();
    let code_bytes = result.into_bytes();

    format!(
        "sha256={}",
        code_bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>()
    )
}
