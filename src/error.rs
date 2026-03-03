use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub type Result<T> = std::result::Result<T, Error>;

/// Structured error with machine-readable code and remediation hints
#[derive(Debug, Clone)]
pub struct ErrorInfo {
    pub message: String,
    pub error_code: &'static str,
    pub fix: Option<String>,
}

impl ErrorInfo {
    pub fn new(message: impl Into<String>, code: &'static str) -> Self {
        Self {
            message: message.into(),
            error_code: code,
            fix: None,
        }
    }

    pub fn with_fix(mut self, fix: impl Into<String>) -> Self {
        self.fix = Some(fix.into());
        self
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Configuration error: {0}")]
    Config(String),

    /// Configuration error with structured info for AI agents
    #[error("{}", .0.message)]
    ConfigDetailed(ErrorInfo),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    /// Bad request with structured info for AI agents
    #[error("{}", .0.message)]
    BadRequestDetailed(ErrorInfo),

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

    /// Embedding error with structured info
    #[error("{}", .0.message)]
    EmbeddingDetailed(ErrorInfo),

    #[error("Rerank error: {0}")]
    Rerank(String),

    /// LLM provider error with structured info
    #[error("{}", .0.message)]
    LlmProvider(ErrorInfo),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Request error: {0}")]
    Request(#[from] reqwest::Error),
}

/// Helper to build structured error response
fn build_error_response(
    status: StatusCode,
    message: &str,
    error_code: &str,
    fix: Option<&str>,
) -> Response {
    let mut body = json!({
        "error": message,
        "error_code": error_code,
        "code": status.as_u16()
    });
    if let Some(f) = fix {
        body["fix"] = json!(f);
    }
    (status, Json(body)).into_response()
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        match &self {
            // Detailed errors with structured response for AI agents
            Error::ConfigDetailed(info) | Error::BadRequestDetailed(info) => {
                let status = match &self {
                    Error::ConfigDetailed(_) => StatusCode::UNPROCESSABLE_ENTITY,
                    _ => StatusCode::BAD_REQUEST,
                };
                return build_error_response(status, &info.message, info.error_code, info.fix.as_deref());
            }

            Error::EmbeddingDetailed(info) => {
                return build_error_response(StatusCode::BAD_GATEWAY, &info.message, info.error_code, info.fix.as_deref());
            }

            Error::LlmProvider(info) => {
                return build_error_response(StatusCode::BAD_GATEWAY, &info.message, info.error_code, info.fix.as_deref());
            }

            // Database errors - parse PostgreSQL specific errors with clear messages
            Error::Database(e) => {
                tracing::error!("Database error: {}", e);

                let (message, error_code, fix) = match e {
                    sqlx::Error::Database(db_err) => {
                        let pg_code = db_err.code().map(|c| c.to_string()).unwrap_or_default();
                        let msg = db_err.message();

                        // Extract useful info from error message
                        let extract_field = |s: &str, prefix: &str, suffix: &str| -> Option<String> {
                            s.find(prefix).and_then(|start| {
                                let after = &s[start + prefix.len()..];
                                after.find(suffix).map(|end| after[..end].to_string())
                            })
                        };

                        match pg_code.as_str() {
                            // ==================== INTEGRITY CONSTRAINTS ====================

                            // Unique constraint violation (includes primary key uniqueness)
                            "23505" => {
                                let field = extract_field(msg, "Key (", ")=").unwrap_or_else(|| "field".to_string());
                                let value = extract_field(msg, ")=(", ")").unwrap_or_else(|| "value".to_string());
                                (
                                    format!("Duplicate '{}': value '{}' already exists", field, value),
                                    "DUPLICATE_VALUE",
                                    Some(format!("A record with {}='{}' already exists. Use a different value, or update/delete the existing record first.", field, value))
                                )
                            },

                            // Foreign key violation - insert/update references non-existent record
                            "23503" => {
                                if msg.contains("is not present in table") || msg.contains("insert or update") {
                                    let field = extract_field(msg, "Key (", ")=").unwrap_or_else(|| "field".to_string());
                                    let value = extract_field(msg, ")=(", ")").unwrap_or_else(|| "id".to_string());
                                    let ref_table = extract_field(msg, "table \"", "\"").unwrap_or_else(|| "referenced table".to_string());
                                    (
                                        format!("Invalid reference: {} '{}' does not exist in '{}'", field, value, ref_table),
                                        "FOREIGN_KEY_INVALID_REFERENCE",
                                        Some(format!("Create a record with id='{}' in '{}' first, or use an existing valid ID.", value, ref_table))
                                    )
                                } else if msg.contains("still referenced") || msg.contains("delete") {
                                    let ref_table = extract_field(msg, "table \"", "\"").unwrap_or_else(|| "another table".to_string());
                                    (
                                        format!("Cannot delete: record is referenced by '{}'", ref_table),
                                        "FOREIGN_KEY_REFERENCED",
                                        Some(format!("Delete or update the referencing records in '{}' first, or use CASCADE delete.", ref_table))
                                    )
                                } else {
                                    (
                                        format!("Foreign key constraint violation: {}", msg),
                                        "FOREIGN_KEY_VIOLATION",
                                        Some("The referenced record does not exist or is still being referenced.".to_string())
                                    )
                                }
                            },

                            // NOT NULL violation
                            "23502" => {
                                let field = extract_field(msg, "column \"", "\"").unwrap_or_else(|| "field".to_string());
                                let table = extract_field(msg, "table \"", "\"").unwrap_or_else(|| "table".to_string());
                                (
                                    format!("Missing required field '{}' in '{}'", field, table),
                                    "REQUIRED_FIELD_NULL",
                                    Some(format!("Provide a non-null value for '{}'. This field cannot be empty.", field))
                                )
                            },

                            // Check constraint violation
                            "23514" => {
                                let constraint = extract_field(msg, "constraint \"", "\"").unwrap_or_else(|| "constraint".to_string());
                                (
                                    format!("Validation failed: constraint '{}' not satisfied", constraint),
                                    "CHECK_CONSTRAINT_FAILED",
                                    Some(format!("The value violates the '{}' constraint. Check allowed values/ranges.", constraint))
                                )
                            },

                            // Exclusion constraint violation
                            "23P01" => (
                                format!("Exclusion constraint violation: {}", msg),
                                "EXCLUSION_CONSTRAINT_VIOLATED",
                                Some("The values conflict with an existing record based on the exclusion constraint.".to_string())
                            ),

                            // ==================== DATA TYPES ====================

                            // Invalid text representation (UUID, numeric, etc.)
                            "22P02" => {
                                let type_hint = if msg.contains("uuid") {
                                    "UUID format should be: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 characters with hyphens)".to_string()
                                } else if msg.contains("integer") || msg.contains("numeric") {
                                    "Numeric fields only accept valid numbers".to_string()
                                } else if msg.contains("boolean") {
                                    "Boolean fields only accept true/false".to_string()
                                } else if msg.contains("timestamp") || msg.contains("date") {
                                    "Date/time format should be ISO 8601: YYYY-MM-DDTHH:MM:SSZ".to_string()
                                } else {
                                    "Check the field type and provide a correctly formatted value".to_string()
                                };
                                (
                                    format!("Invalid data format: {}", msg),
                                    "INVALID_DATA_FORMAT",
                                    Some(type_hint)
                                )
                            },

                            // String too long
                            "22001" => {
                                let field = extract_field(msg, "value too long for type character varying(", ")").unwrap_or_default();
                                let max_len = if !field.is_empty() { field } else { "N".to_string() };
                                (
                                    format!("Text too long: maximum {} characters allowed", max_len),
                                    "STRING_TOO_LONG",
                                    Some(format!("Shorten the text to {} characters or less.", max_len))
                                )
                            },

                            // Numeric overflow/underflow
                            "22003" => (
                                format!("Number out of range: {}", msg),
                                "NUMERIC_OVERFLOW",
                                Some("The number is too large or too small for this field type. Use a smaller value or a larger numeric type.".to_string())
                            ),

                            // Division by zero
                            "22012" => (
                                "Division by zero".to_string(),
                                "DIVISION_BY_ZERO",
                                Some("Cannot divide by zero. Check your calculation inputs.".to_string())
                            ),

                            // Invalid datetime
                            "22007" => (
                                format!("Invalid date/time format: {}", msg),
                                "INVALID_DATETIME",
                                Some("Use ISO 8601 format: YYYY-MM-DD for dates, YYYY-MM-DDTHH:MM:SSZ for timestamps.".to_string())
                            ),

                            // ==================== SCHEMA/DDL ERRORS ====================

                            // Table not found
                            "42P01" => {
                                let table = extract_field(msg, "relation \"", "\"").unwrap_or_else(|| "table".to_string());
                                (
                                    format!("Table '{}' does not exist", table),
                                    "TABLE_NOT_FOUND",
                                    Some(format!("Create the table '{}' first using POST /v1/tables.", table))
                                )
                            },

                            // Column not found
                            "42703" => {
                                let column = extract_field(msg, "column \"", "\"").unwrap_or_else(|| "column".to_string());
                                (
                                    format!("Column '{}' does not exist", column),
                                    "COLUMN_NOT_FOUND",
                                    Some(format!("Check spelling of '{}'. Available columns can be found via GET /v1/tables/{{name}}.", column))
                                )
                            },

                            // Table or index already exists
                            "42P07" => {
                                let relation = extract_field(msg, "relation \"", "\"").unwrap_or_else(|| "relation".to_string());
                                if msg.contains("index") {
                                    (
                                        format!("Index '{}' already exists", relation),
                                        "INDEX_ALREADY_EXISTS",
                                        Some("Drop the existing index first or use a different index name.".to_string())
                                    )
                                } else {
                                    (
                                        format!("Table '{}' already exists", relation),
                                        "TABLE_ALREADY_EXISTS",
                                        Some(format!("Delete the existing table first with DELETE /v1/tables/{}, or use a different name.", relation))
                                    )
                                }
                            },

                            // Column already exists
                            "42701" => {
                                let column = extract_field(msg, "column \"", "\"").unwrap_or_else(|| "column".to_string());
                                (
                                    format!("Column '{}' already exists in the table", column),
                                    "COLUMN_ALREADY_EXISTS",
                                    Some(format!("Use a different column name, or modify the existing '{}' column.", column))
                                )
                            },

                            // Cannot drop: dependencies exist
                            "2BP01" => {
                                let obj = extract_field(msg, "cannot drop ", " because").unwrap_or_else(|| "object".to_string());
                                (
                                    format!("Cannot drop {}: other objects depend on it", obj),
                                    "DEPENDENT_OBJECTS_EXIST",
                                    Some("Drop dependent objects first, or use CASCADE to drop them automatically.".to_string())
                                )
                            },

                            // ==================== SYNTAX/QUERY ERRORS ====================

                            // Syntax error
                            "42601" => (
                                format!("SQL syntax error: {}", msg),
                                "SQL_SYNTAX_ERROR",
                                Some("Check for typos in column/table names, missing quotes, or invalid operators.".to_string())
                            ),

                            // Undefined function
                            "42883" => {
                                let func = extract_field(msg, "function ", "(").unwrap_or_else(|| "function".to_string());
                                (
                                    format!("Unknown function '{}'", func),
                                    "FUNCTION_NOT_FOUND",
                                    Some(format!("Function '{}' does not exist or wrong argument types provided.", func))
                                )
                            },

                            // Ambiguous column reference
                            "42702" => {
                                let column = extract_field(msg, "column reference \"", "\"").unwrap_or_else(|| "column".to_string());
                                (
                                    format!("Ambiguous column '{}': exists in multiple tables", column),
                                    "AMBIGUOUS_COLUMN",
                                    Some(format!("Qualify the column with table name: table_name.{}", column))
                                )
                            },

                            // Invalid column reference in GROUP BY
                            "42803" => (
                                format!("Invalid GROUP BY: {}", msg),
                                "INVALID_GROUP_BY",
                                Some("All selected columns must be in GROUP BY or use aggregate functions (COUNT, SUM, etc.).".to_string())
                            ),

                            // ==================== PERMISSIONS ====================

                            // Permission denied
                            "42501" => {
                                let action = if msg.contains("SELECT") { "read from" }
                                    else if msg.contains("INSERT") { "insert into" }
                                    else if msg.contains("UPDATE") { "update" }
                                    else if msg.contains("DELETE") { "delete from" }
                                    else { "access" };
                                let table = extract_field(msg, "relation \"", "\"").unwrap_or_else(|| "table".to_string());
                                (
                                    format!("Permission denied: cannot {} '{}'", action, table),
                                    "PERMISSION_DENIED",
                                    Some("Check database user permissions. Contact your administrator if needed.".to_string())
                                )
                            },

                            // ==================== CONNECTION/TRANSACTION ====================

                            // Deadlock detected
                            "40P01" => (
                                "Deadlock detected: transaction cancelled".to_string(),
                                "DEADLOCK",
                                Some("Concurrent operations conflicted. Retry the operation.".to_string())
                            ),

                            // Serialization failure
                            "40001" => (
                                "Transaction conflict: concurrent update detected".to_string(),
                                "SERIALIZATION_FAILURE",
                                Some("Another transaction modified this data. Refresh and retry.".to_string())
                            ),

                            // Lock timeout
                            "55P03" => (
                                "Lock timeout: could not acquire lock".to_string(),
                                "LOCK_TIMEOUT",
                                Some("The resource is locked by another operation. Wait and retry.".to_string())
                            ),

                            // Statement timeout
                            "57014" => (
                                "Query timeout: operation took too long".to_string(),
                                "QUERY_TIMEOUT",
                                Some("The query exceeded the time limit. Optimize the query or increase timeout.".to_string())
                            ),

                            // ==================== DEFAULT ====================
                            _ => {
                                // For unknown codes, still provide the full message
                                (
                                    msg.to_string(),
                                    "DATABASE_OPERATION_FAILED",
                                    Some(format!("PostgreSQL error code: {}. Check PostgreSQL documentation for details.", pg_code))
                                )
                            },
                        }
                    }
                    sqlx::Error::RowNotFound => (
                        "Record not found: no matching record exists".to_string(),
                        "RECORD_NOT_FOUND",
                        Some("The requested record does not exist. Verify the ID is correct and the record hasn't been deleted.".to_string())
                    ),
                    sqlx::Error::ColumnNotFound(col) => (
                        format!("Column '{}' not found in query result", col),
                        "RESULT_COLUMN_NOT_FOUND",
                        Some(format!("The query did not return a '{}' column. Check the SELECT clause.", col))
                    ),
                    sqlx::Error::ColumnIndexOutOfBounds { index, len } => (
                        format!("Column index {} out of bounds (result has {} columns)", index, len),
                        "COLUMN_INDEX_OUT_OF_BOUNDS",
                        Some("The column index exceeds the number of columns in the result.".to_string())
                    ),
                    sqlx::Error::ColumnDecode { index, source } => (
                        format!("Cannot decode column {}: {}", index, source),
                        "COLUMN_DECODE_FAILED",
                        Some("The column value cannot be converted to the expected type. Check data types.".to_string())
                    ),
                    sqlx::Error::PoolTimedOut => (
                        "Database connection unavailable: connection pool exhausted".to_string(),
                        "CONNECTION_POOL_EXHAUSTED",
                        Some("Too many concurrent database connections. Wait a moment and retry, or increase pool size.".to_string())
                    ),
                    sqlx::Error::PoolClosed => (
                        "Database connection unavailable: connection pool is closed".to_string(),
                        "CONNECTION_POOL_CLOSED",
                        Some("The database connection pool has been shut down. Restart the server.".to_string())
                    ),
                    sqlx::Error::Io(io_err) => {
                        let hint = if io_err.to_string().contains("Connection refused") {
                            "PostgreSQL server is not running. Start it with: sudo systemctl start postgresql".to_string()
                        } else if io_err.to_string().contains("No such host") {
                            "Database host not found. Check DATABASE_URL hostname.".to_string()
                        } else if io_err.to_string().contains("Connection reset") {
                            "Database connection was reset. Check network connectivity and PostgreSQL logs.".to_string()
                        } else {
                            "Check DATABASE_URL and ensure PostgreSQL is running and accessible.".to_string()
                        };
                        (
                            format!("Cannot connect to database: {}", io_err),
                            "DATABASE_CONNECTION_FAILED",
                            Some(hint)
                        )
                    },
                    sqlx::Error::Tls(tls_err) => (
                        format!("Database TLS/SSL error: {}", tls_err),
                        "DATABASE_TLS_ERROR",
                        Some("SSL connection failed. Check SSL certificates or disable SSL with ?sslmode=disable in DATABASE_URL.".to_string())
                    ),
                    sqlx::Error::Protocol(msg) => (
                        format!("Database protocol error: {}", msg),
                        "DATABASE_PROTOCOL_ERROR",
                        Some("Communication error with PostgreSQL. Check database version compatibility.".to_string())
                    ),
                    sqlx::Error::TypeNotFound { type_name } => (
                        format!("PostgreSQL type '{}' not found", type_name),
                        "DATABASE_TYPE_NOT_FOUND",
                        Some(format!("The type '{}' is not available. Install required PostgreSQL extensions.", type_name))
                    ),
                    _ => (
                        format!("Database operation failed: {}", e),
                        "DATABASE_OPERATION_FAILED",
                        Some("An unexpected database error occurred. Check server logs for details.".to_string())
                    ),
                };

                return build_error_response(StatusCode::BAD_REQUEST, &message, error_code, fix.as_deref());
            }

            // JSON parsing errors
            Error::Json(e) => {
                let message = format!("Invalid JSON: {}", e);
                let fix = if e.to_string().contains("expected") {
                    Some("Check JSON syntax: ensure all strings are quoted, objects use {}, arrays use [], and there are no trailing commas.")
                } else if e.to_string().contains("EOF") {
                    Some("JSON is incomplete. Ensure all brackets and braces are properly closed.")
                } else {
                    Some("Validate your JSON using a JSON validator tool.")
                };
                return build_error_response(StatusCode::BAD_REQUEST, &message, "JSON_PARSE_ERROR", fix);
            }

            // IO errors
            Error::Io(e) => {
                tracing::error!("IO error: {}", e);
                let message = format!("File operation failed: {}", e);
                let fix = match e.kind() {
                    std::io::ErrorKind::NotFound => Some("The specified file or directory does not exist."),
                    std::io::ErrorKind::PermissionDenied => Some("Permission denied. Check file permissions."),
                    std::io::ErrorKind::AlreadyExists => Some("The file already exists."),
                    std::io::ErrorKind::OutOfMemory => Some("System is out of memory. Free up memory and retry."),
                    _ => None,
                };
                return build_error_response(StatusCode::INTERNAL_SERVER_ERROR, &message, "FILE_OPERATION_FAILED", fix);
            }

            // External request errors
            Error::Request(e) => {
                tracing::error!("Request error: {}", e);
                let (message, error_code, fix): (String, &str, Option<String>) = if e.is_timeout() {
                    (
                        "External service request timed out".to_string(),
                        "EXTERNAL_REQUEST_TIMEOUT",
                        Some("The external service (LLM/embedding provider) is slow or unreachable. Check provider status or increase timeout.".to_string())
                    )
                } else if e.is_connect() {
                    (
                        format!("Cannot connect to external service: {}", e),
                        "EXTERNAL_SERVICE_UNREACHABLE",
                        Some("Cannot reach the external service. Check the base_url configuration and network connectivity.".to_string())
                    )
                } else {
                    (
                        format!("External request failed: {}", e),
                        "EXTERNAL_REQUEST_FAILED",
                        None
                    )
                };
                return build_error_response(StatusCode::BAD_GATEWAY, &message, error_code, fix.as_deref());
            }

            _ => {}
        }

        // Remaining errors - use specific messages, never generic
        let (status, message, error_code, fix): (StatusCode, String, &str, Option<&str>) = match &self {
            Error::Config(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                msg.clone(),
                "CONFIG_ERROR",
                None
            ),
            Error::Auth(msg) => (
                StatusCode::UNAUTHORIZED,
                msg.clone(),
                "AUTH_ERROR",
                Some("Check your API key or authentication token. API keys start with 'dvb_'.")
            ),
            Error::NotFound(msg) => (
                StatusCode::NOT_FOUND,
                msg.clone(),
                "NOT_FOUND",
                Some("The requested resource does not exist. Verify the ID or name is correct.")
            ),
            Error::BadRequest(msg) => (
                StatusCode::BAD_REQUEST,
                msg.clone(),
                "BAD_REQUEST",
                None
            ),
            Error::Validation(msg) => (
                StatusCode::BAD_REQUEST,
                msg.clone(),
                "VALIDATION_ERROR",
                Some("Check the request body against the API documentation.")
            ),
            Error::Forbidden(msg) => (
                StatusCode::FORBIDDEN,
                msg.clone(),
                "FORBIDDEN",
                Some("You don't have permission for this action. Check your role and API key scopes.")
            ),
            Error::Conflict(msg) => (
                StatusCode::CONFLICT,
                msg.clone(),
                "CONFLICT",
                Some("The resource state conflicts with this operation. Refresh and retry.")
            ),
            Error::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    msg.clone(),
                    "INTERNAL_ERROR",
                    Some("An unexpected error occurred. If this persists, check server logs.")
                )
            }
            Error::Storage(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Storage operation failed: {}", msg),
                "STORAGE_ERROR",
                Some("Check storage configuration and available disk space.")
            ),
            Error::Embedding(msg) => (
                StatusCode::BAD_GATEWAY,
                msg.clone(),
                "EMBEDDING_ERROR",
                Some("Check embedding provider configuration in Project Settings.")
            ),
            Error::Rerank(msg) => (
                StatusCode::BAD_GATEWAY,
                msg.clone(),
                "RERANK_ERROR",
                Some("Check reranker configuration in Project Settings.")
            ),
            Error::RateLimitExceeded => (
                StatusCode::TOO_MANY_REQUESTS,
                "Rate limit exceeded: too many requests".to_string(),
                "RATE_LIMIT_EXCEEDED",
                Some("Wait before retrying. Consider implementing exponential backoff.")
            ),
            // Already handled above
            Error::Database(_) | Error::ConfigDetailed(_) | Error::BadRequestDetailed(_)
            | Error::EmbeddingDetailed(_) | Error::LlmProvider(_) | Error::Json(_)
            | Error::Io(_) | Error::Request(_) => unreachable!(),
        };

        build_error_response(status, &message, error_code, fix)
    }
}
