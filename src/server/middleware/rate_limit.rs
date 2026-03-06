use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, Response, StatusCode},
};
use futures::future::BoxFuture;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tower::{Layer, Service};

/// Rate limiter that tracks requests per client IP
#[derive(Clone)]
pub struct RateLimiter {
    requests: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    window: Duration,
    max_requests: usize,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window_seconds: u64) -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
            window: Duration::from_secs(window_seconds),
            max_requests,
        }
    }

    pub async fn check(&self, key: &str) -> bool {
        let mut requests = self.requests.write().await;
        let now = Instant::now();
        let cutoff = now - self.window;

        let entry = requests.entry(key.to_string()).or_insert_with(Vec::new);

        // Remove old requests
        entry.retain(|&t| t > cutoff);

        if entry.len() >= self.max_requests {
            return false;
        }

        entry.push(now);
        true
    }

    /// Clean up expired rate limit entries to prevent unbounded memory growth.
    pub async fn cleanup(&self) {
        let mut requests = self.requests.write().await;
        let now = Instant::now();
        let cutoff = now - self.window;

        requests.retain(|_, times| {
            times.retain(|&t| t > cutoff);
            !times.is_empty()
        });
    }

    /// Start a background task that periodically cleans up expired entries.
    /// Prevents memory growth from unique IPs that never return.
    pub fn start_cleanup_task(&self) {
        let limiter = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                limiter.cleanup().await;
            }
        });
    }

    /// Get remaining requests for a key
    pub async fn remaining(&self, key: &str) -> usize {
        let requests = self.requests.read().await;
        let now = Instant::now();
        let cutoff = now - self.window;

        if let Some(times) = requests.get(key) {
            let valid_count = times.iter().filter(|&&t| t > cutoff).count();
            self.max_requests.saturating_sub(valid_count)
        } else {
            self.max_requests
        }
    }
}

/// Layer for applying rate limiting to requests
#[derive(Clone)]
pub struct RateLimitLayer {
    limiter: RateLimiter,
}

impl RateLimitLayer {
    pub fn new(max_requests: usize, window_seconds: u64) -> Self {
        let limiter = RateLimiter::new(max_requests, window_seconds);
        // Start background cleanup to prevent unbounded memory growth
        limiter.start_cleanup_task();
        Self { limiter }
    }
}

impl<S> Layer<S> for RateLimitLayer {
    type Service = RateLimitService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RateLimitService {
            inner,
            limiter: self.limiter.clone(),
        }
    }
}

/// Service that applies rate limiting
#[derive(Clone)]
pub struct RateLimitService<S> {
    inner: S,
    limiter: RateLimiter,
}

impl<S> Service<Request<Body>> for RateLimitService<S>
where
    S: Service<Request<Body>, Response = Response<Body>> + Clone + Send + 'static,
    S::Future: Send,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let limiter = self.limiter.clone();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            // Skip rate limiting for health endpoints
            let path = req.uri().path();
            if path == "/v1/health" || path == "/v1/ready" {
                return inner.call(req).await;
            }

            // Get client identifier: prefer auth token (per-user), fallback to IP
            let client_key = get_client_key(&req);

            // Check rate limit
            if !limiter.check(&client_key).await {
                let remaining = limiter.remaining(&client_key).await;
                // Build rate limit response - this should never fail with valid inputs
                let response = Response::builder()
                    .status(StatusCode::TOO_MANY_REQUESTS)
                    .header("X-RateLimit-Remaining", remaining.to_string())
                    .header("Retry-After", "60")
                    .body(Body::from(r#"{"error":"Rate limit exceeded","code":"RATE_LIMIT_EXCEEDED"}"#))
                    .unwrap_or_else(|_| {
                        // Fallback response if builder fails (should never happen)
                        Response::new(Body::from("Too Many Requests"))
                    });
                return Ok(response);
            }

            let response = inner.call(req).await?;

            // Note: We can't easily modify the response headers here without
            // consuming and rebuilding the response, which would be expensive.
            // For full header support, consider using a middleware that wraps
            // the response builder.

            Ok(response)
        })
    }
}

/// Extract client key for rate limiting.
/// Uses auth token (per-user granularity) when available, falls back to IP.
fn get_client_key<B>(req: &Request<B>) -> String {
    // Prefer auth token for per-user rate limiting
    if let Some(auth) = req.headers().get("authorization") {
        if let Ok(value) = auth.to_str() {
            // Use a hash-like prefix to keep the key short but unique
            let token = value.strip_prefix("Bearer ").unwrap_or(value);
            if !token.is_empty() {
                // Use last 16 chars of token as key (unique enough, avoids storing full token)
                let suffix = if token.len() > 16 { &token[token.len()-16..] } else { token };
                return format!("auth:{}", suffix);
            }
        }
    }

    // Check API key header
    if let Some(api_key) = req.headers().get("x-api-key") {
        if let Ok(value) = api_key.to_str() {
            if !value.is_empty() {
                let suffix = if value.len() > 16 { &value[value.len()-16..] } else { value };
                return format!("key:{}", suffix);
            }
        }
    }

    // Fallback to IP-based rate limiting
    get_client_ip(req)
}

/// Extract client IP from request headers or connection info
fn get_client_ip<B>(req: &Request<B>) -> String {
    // Check X-Forwarded-For header (for proxied requests)
    if let Some(forwarded) = req.headers().get("x-forwarded-for") {
        if let Ok(value) = forwarded.to_str() {
            if let Some(first_ip) = value.split(',').next() {
                return first_ip.trim().to_string();
            }
        }
    }

    // Check X-Real-IP header (nginx default)
    if let Some(real_ip) = req.headers().get("x-real-ip") {
        if let Ok(value) = real_ip.to_str() {
            return value.trim().to_string();
        }
    }

    // Fallback to connection address if available
    if let Some(addr) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
        return addr.0.ip().to_string();
    }

    "unknown".to_string()
}
