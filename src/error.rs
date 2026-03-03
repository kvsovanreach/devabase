use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Embedding error: {0}")]
    Embedding(String),

    #[error("Rerank error: {0}")]
    Rerank(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Request error: {0}")]
    Request(#[from] reqwest::Error),
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Error::Database(e) => {
                tracing::error!("Database error: {}", e);
                // Extract meaningful error message for developers
                let msg = match e {
                    sqlx::Error::Database(db_err) => {
                        // Get the actual PostgreSQL error message
                        db_err.message().to_string()
                    }
                    _ => e.to_string(),
                };
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Database error",
                        "details": msg,
                        "code": 400
                    })),
                ).into_response();
            }
            Error::Config(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.as_str()),
            Error::Auth(msg) => (StatusCode::UNAUTHORIZED, msg.as_str()),
            Error::NotFound(msg) => (StatusCode::NOT_FOUND, msg.as_str()),
            Error::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            Error::Validation(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            Error::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.as_str()),
            Error::Conflict(msg) => (StatusCode::CONFLICT, msg.as_str()),
            Error::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            Error::Storage(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.as_str()),
            Error::Embedding(msg) => (StatusCode::BAD_GATEWAY, msg.as_str()),
            Error::Rerank(msg) => (StatusCode::BAD_GATEWAY, msg.as_str()),
            Error::RateLimitExceeded => (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded"),
            Error::Io(e) => {
                tracing::error!("IO error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "IO error")
            }
            Error::Json(_e) => (StatusCode::BAD_REQUEST, "Invalid JSON"),
            Error::Request(e) => {
                tracing::error!("Request error: {}", e);
                (StatusCode::BAD_GATEWAY, "External request failed")
            }
        };

        let body = Json(json!({
            "error": message,
            "code": status.as_u16()
        }));

        (status, body).into_response()
    }
}
