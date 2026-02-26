use crate::db::models::Webhook;
use crate::db::DbPool;
use crate::events::{Event, EventSubscriber};
use crate::Result;
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::Client;
use sha2::Sha256;
use std::net::IpAddr;
use std::time::Duration;
use tokio::sync::broadcast;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

/// Webhook dispatcher that listens for events and delivers them to configured webhooks
pub struct WebhookDispatcher {
    pool: DbPool,
    client: Client,
    shutdown: broadcast::Receiver<()>,
}

impl WebhookDispatcher {
    pub fn new(pool: DbPool, shutdown: broadcast::Receiver<()>) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| crate::Error::Internal(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            pool,
            client,
            shutdown,
        })
    }

    /// Start the dispatcher, processing events from the subscriber
    pub async fn run(mut self, mut subscriber: EventSubscriber) {
        info!("Webhook dispatcher started");

        loop {
            tokio::select! {
                _ = self.shutdown.recv() => {
                    info!("Webhook dispatcher shutting down");
                    break;
                }
                event = subscriber.recv() => {
                    if let Some(event) = event {
                        if let Err(e) = self.process_event(&event).await {
                            error!("Failed to process event for webhooks: {}", e);
                        }
                    }
                }
            }
        }
    }

    async fn process_event(&self, event: &Event) -> Result<()> {
        // Find all active webhooks for this project that subscribe to this event type
        let event_type_str = event.event_type.as_str();

        let webhooks: Vec<Webhook> = sqlx::query_as(
            r#"
            SELECT * FROM sys_webhooks
            WHERE project_id = $1
              AND status = 'active'
              AND $2 = ANY(events)
            "#,
        )
        .bind(event.project_id)
        .bind(event_type_str)
        .fetch_all(self.pool.inner())
        .await?;

        if webhooks.is_empty() {
            debug!(
                "No webhooks configured for event {} in project {}",
                event_type_str, event.project_id
            );
            return Ok(());
        }

        // Deliver to each webhook
        for webhook in webhooks {
            let pool = self.pool.clone();
            let client = self.client.clone();
            let event = event.clone();

            // Spawn delivery task
            tokio::spawn(async move {
                if let Err(e) = deliver_webhook(&pool, &client, &webhook, &event).await {
                    error!("Webhook delivery failed: {}", e);
                }
            });
        }

        Ok(())
    }
}

/// Deliver a webhook with retries
async fn deliver_webhook(
    pool: &DbPool,
    client: &Client,
    webhook: &Webhook,
    event: &Event,
) -> Result<()> {
    // Validate URL (block private IPs)
    if let Err(e) = validate_webhook_url(&webhook.url) {
        warn!("Webhook URL validation failed: {}", e);
        // Log the failure
        log_delivery(
            pool,
            webhook.id,
            &event.event_type.to_string(),
            &serde_json::json!({}),
            1,
            false,
            Some(e),
            None,
            None,
        )
        .await?;
        return Ok(());
    }

    // Build payload
    let payload = serde_json::json!({
        "id": event.id.to_string(),
        "type": event.event_type.as_str(),
        "project_id": event.project_id.to_string(),
        "timestamp": event.timestamp.to_rfc3339(),
        "data": event.data,
    });

    let payload_str = serde_json::to_string(&payload)?;

    // Generate signature
    let timestamp = Utc::now().timestamp();
    let signature = generate_signature(&webhook.secret, timestamp, &payload_str);

    // Retry loop
    let mut attempt = 0;
    let max_attempts = webhook.retry_count.max(1) as usize;
    let timeout = Duration::from_millis(webhook.timeout_ms as u64);

    while attempt < max_attempts {
        attempt += 1;

        let start = std::time::Instant::now();

        let mut request = client
            .post(&webhook.url)
            .timeout(timeout)
            .header("Content-Type", "application/json")
            .header("X-Devabase-Signature", &signature)
            .header("X-Devabase-Timestamp", timestamp.to_string())
            .header("X-Devabase-Event", event.event_type.as_str())
            .header("X-Devabase-Delivery", event.id.to_string());

        // Add custom headers if configured
        if let Some(headers) = &webhook.headers {
            if let Some(obj) = headers.as_object() {
                for (key, value) in obj {
                    if let Some(v) = value.as_str() {
                        request = request.header(key, v);
                    }
                }
            }
        }

        let result = request.body(payload_str.clone()).send().await;
        let latency_ms = start.elapsed().as_millis() as i32;

        match result {
            Ok(response) => {
                let status = response.status().as_u16() as i32;
                let success = response.status().is_success();
                let body = response.text().await.ok();

                log_delivery(
                    pool,
                    webhook.id,
                    &event.event_type.to_string(),
                    &payload,
                    attempt as i32,
                    success,
                    if success { None } else { body.clone() },
                    Some(status),
                    Some(latency_ms),
                )
                .await?;

                if success {
                    info!(
                        webhook_id = %webhook.id,
                        event_type = %event.event_type,
                        status = status,
                        latency_ms = latency_ms,
                        "Webhook delivered successfully"
                    );
                    return Ok(());
                }

                warn!(
                    webhook_id = %webhook.id,
                    event_type = %event.event_type,
                    status = status,
                    attempt = attempt,
                    "Webhook delivery failed with status {}",
                    status
                );
            }
            Err(e) => {
                let error_msg = e.to_string();
                log_delivery(
                    pool,
                    webhook.id,
                    &event.event_type.to_string(),
                    &payload,
                    attempt as i32,
                    false,
                    Some(error_msg.clone()),
                    None,
                    Some(latency_ms),
                )
                .await?;

                warn!(
                    webhook_id = %webhook.id,
                    event_type = %event.event_type,
                    attempt = attempt,
                    error = %error_msg,
                    "Webhook delivery error"
                );
            }
        }

        // Exponential backoff before retry
        if attempt < max_attempts {
            let delay = Duration::from_secs(1 << (attempt - 1)); // 1s, 2s, 4s, 8s...
            tokio::time::sleep(delay).await;
        }
    }

    error!(
        webhook_id = %webhook.id,
        event_type = %event.event_type,
        "Webhook delivery failed after {} attempts",
        max_attempts
    );

    Ok(())
}

/// Generate HMAC-SHA256 signature
fn generate_signature(secret: &str, timestamp: i64, payload: &str) -> String {
    let message = format!("{}:{}", timestamp, payload);

    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC can take key of any size");
    mac.update(message.as_bytes());

    let result = mac.finalize();
    let code_bytes = result.into_bytes();

    format!("sha256={}", hex::encode(code_bytes))
}

/// Validate webhook URL (block private IPs)
fn validate_webhook_url(url: &str) -> std::result::Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

    // Must be HTTPS in production (allow HTTP for localhost in dev)
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL must have a host".to_string())?;

    // Block localhost
    if host == "localhost" || host == "127.0.0.1" || host == "::1" {
        return Err("Localhost URLs are not allowed".to_string());
    }

    // Try to parse as IP and check if private
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_ip(&ip) {
            return Err(format!("Private IP addresses are not allowed: {}", ip));
        }
    }

    Ok(())
}

/// Check if an IP address is private
fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            ipv4.is_private()
                || ipv4.is_loopback()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_documentation()
        }
        IpAddr::V6(ipv6) => ipv6.is_loopback() || ipv6.is_unspecified(),
    }
}

/// Log a webhook delivery attempt
async fn log_delivery(
    pool: &DbPool,
    webhook_id: Uuid,
    event_type: &str,
    payload: &serde_json::Value,
    attempt: i32,
    success: bool,
    error_message: Option<String>,
    response_status: Option<i32>,
    latency_ms: Option<i32>,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO sys_webhook_logs
            (webhook_id, event_type, payload, attempt, success, error_message, response_status, latency_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(webhook_id)
    .bind(event_type)
    .bind(payload)
    .bind(attempt)
    .bind(success)
    .bind(error_message)
    .bind(response_status)
    .bind(latency_ms)
    .execute(pool.inner())
    .await?;

    Ok(())
}

// Add hex encoding for the signature
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes.as_ref().iter().map(|b| format!("{:02x}", b)).collect()
    }
}
