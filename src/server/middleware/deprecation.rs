use axum::{
    body::Body,
    http::{Request, Response},
};
use futures::future::BoxFuture;
use std::task::{Context, Poll};
use tower::{Layer, Service};

/// List of deprecated endpoint path prefixes and their replacements
const DEPRECATED_ENDPOINTS: &[(&str, &str)] = &[
    ("/v1/retrieve", "/v1/collections/:name/search"),
    ("/v1/rag/", "/v1/collections/:name/chat or /v1/chat"),
    ("/v1/vectors/upsert", "/v1/collections/:name/vectors"),
    ("/v1/vectors/search", "/v1/collections/:name/vectors/search"),
    ("/v1/files/", "/v1/storage/"),
    ("/v1/documents/upload", "/v1/collections/:name/documents"),
    ("/v1/cache/", "/v1/admin/cache/"),
    ("/v1/usage", "/v1/admin/usage"),
    ("/v1/providers/", "/v1/admin/providers/"),
    ("/v1/collections/:name/rag", "/v1/collections/:name/config"),
];

/// Check if a path is deprecated and return the suggested replacement
fn get_deprecation_info(path: &str) -> Option<&'static str> {
    for (deprecated, replacement) in DEPRECATED_ENDPOINTS {
        if path.starts_with(deprecated) || path.contains(deprecated) {
            return Some(replacement);
        }
    }

    // Special case for /v1/vectors/:id DELETE
    if path.starts_with("/v1/vectors/") && !path.contains("upsert") && !path.contains("search") {
        return Some("/v1/collections/:name/vectors/:vid");
    }

    None
}

/// Layer for adding deprecation headers to responses
#[derive(Clone)]
pub struct DeprecationLayer;

impl DeprecationLayer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for DeprecationLayer {
    fn default() -> Self {
        Self::new()
    }
}

impl<S> Layer<S> for DeprecationLayer {
    type Service = DeprecationService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        DeprecationService { inner }
    }
}

/// Service that adds deprecation headers
#[derive(Clone)]
pub struct DeprecationService<S> {
    inner: S,
}

impl<S> Service<Request<Body>> for DeprecationService<S>
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
        let path = req.uri().path().to_string();
        let deprecation_info = get_deprecation_info(&path);
        let mut inner = self.inner.clone();

        Box::pin(async move {
            let mut response = inner.call(req).await?;

            // Add deprecation headers if endpoint is deprecated
            if let Some(replacement) = deprecation_info {
                let headers = response.headers_mut();

                // RFC 8594 Deprecation header
                headers.insert(
                    "Deprecation",
                    "true".parse().unwrap(),
                );

                // Sunset header (optional - indicates when endpoint will be removed)
                // Using a placeholder date - in production, this should be configurable
                headers.insert(
                    "Sunset",
                    "Sat, 01 Jan 2026 00:00:00 GMT".parse().unwrap(),
                );

                // Link header with documentation
                headers.insert(
                    "Link",
                    format!(
                        "<https://docs.devabase.io/api/migration>; rel=\"deprecation\"; title=\"Use {}\"",
                        replacement
                    ).parse().unwrap_or_else(|_| "".parse().unwrap()),
                );

                // Custom header with migration suggestion
                headers.insert(
                    "X-Deprecated-Endpoint",
                    format!("This endpoint is deprecated. Use {} instead.", replacement)
                        .parse()
                        .unwrap_or_else(|_| "Deprecated".parse().unwrap()),
                );
            }

            Ok(response)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deprecation_detection() {
        assert!(get_deprecation_info("/v1/retrieve").is_some());
        assert!(get_deprecation_info("/v1/rag/my-collection/chat").is_some());
        assert!(get_deprecation_info("/v1/vectors/upsert").is_some());
        assert!(get_deprecation_info("/v1/files/somefile.txt").is_some());
        assert!(get_deprecation_info("/v1/cache/stats").is_some());

        // New endpoints should not be deprecated
        assert!(get_deprecation_info("/v1/collections/test/search").is_none());
        assert!(get_deprecation_info("/v1/collections/test/chat").is_none());
        assert!(get_deprecation_info("/v1/admin/cache").is_none());
        assert!(get_deprecation_info("/v1/storage/file.txt").is_none());
    }
}
