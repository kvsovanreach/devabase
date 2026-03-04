//! API Metadata endpoint for AI coding agents
//! Returns compact API documentation with examples

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::auth;
use crate::server::AppState;

#[derive(Debug, Deserialize)]
pub struct MetadataQuery {
    pub api_key: String,
}

#[derive(Debug, Serialize)]
pub struct ApiMetadata {
    pub base_url: String,
    pub project_id: String,
    pub auth: AuthInfo,
    pub endpoints: Vec<EndpointInfo>,
    pub sdk: &'static str,
    pub examples: Examples,
}

#[derive(Debug, Serialize)]
pub struct AuthInfo {
    pub headers: Headers,
}

#[derive(Debug, Serialize)]
pub struct Headers {
    #[serde(rename = "Authorization")]
    pub authorization: &'static str,
    #[serde(rename = "X-Project-ID")]
    pub project_id: &'static str,
    #[serde(rename = "Content-Type")]
    pub content_type: &'static str,
}

#[derive(Debug, Serialize)]
pub struct EndpointInfo {
    pub method: &'static str,
    pub path: &'static str,
    pub desc: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct Examples {
    pub collection_create: &'static str,
    pub document_upload: &'static str,
    pub search: &'static str,
    pub rag: &'static str,
    pub rag_stream: &'static str,
    pub table_create: &'static str,
    pub table_insert: &'static str,
}

/// GET /v1/vibe-metadata?api_key=xxx
pub async fn get_metadata(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MetadataQuery>,
) -> Result<Json<ApiMetadata>, (StatusCode, Json<serde_json::Value>)> {
    let key_context = auth::verify_key(&state.pool, &query.api_key)
        .await
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Invalid or expired API key" })),
            )
        })?;

    let host = &state.config.server.host;
    let port = state.config.server.port;
    let base_url = if host == "0.0.0.0" {
        format!("http://localhost:{}/v1", port)
    } else {
        format!("http://{}:{}/v1", host, port)
    };

    let metadata = ApiMetadata {
        base_url,
        project_id: key_context.project_id.to_string(),
        auth: AuthInfo {
            headers: Headers {
                authorization: "Bearer <API_KEY>",
                project_id: "<PROJECT_ID>",
                content_type: "application/json",
            },
        },
        endpoints: build_endpoints(),
        sdk: "npm install @devabase/sdk",
        examples: Examples {
            collection_create: r#"{"name":"docs","dimensions":768,"metric":"cosine"}"#,
            document_upload: "multipart/form-data: collection=docs, file=@doc.pdf",
            search: r#"{"collections":["docs"],"query":"search text","top_k":5,"mode":"hybrid","rerank":true}"#,
            rag: r#"{"collection":"docs","message":"Question?","include_sources":true}"#,
            rag_stream: r#"{"collection":["docs","faq"],"message":"Question?","stream":true}"#,
            table_create: r#"{"name":"users","columns":[{"name":"id","type":"uuid","primary":true},{"name":"email","type":"varchar(255)"}]}"#,
            table_insert: r#"{"email":"user@example.com","name":"John"}"#,
        },
    };

    Ok(Json(metadata))
}

fn build_endpoints() -> Vec<EndpointInfo> {
    vec![
        // Collections
        EndpointInfo { method: "GET", path: "/collections", desc: "List collections", body: None },
        EndpointInfo { method: "POST", path: "/collections", desc: "Create collection", body: Some(serde_json::json!({"name":"str","dimensions":768,"metric":"cosine"})) },
        EndpointInfo { method: "GET", path: "/collections/:name", desc: "Get collection", body: None },
        EndpointInfo { method: "PATCH", path: "/collections/:name", desc: "Update collection", body: None },
        EndpointInfo { method: "DELETE", path: "/collections/:name", desc: "Delete collection", body: None },
        // Documents
        EndpointInfo { method: "POST", path: "/collections/:name/documents", desc: "Upload document (multipart)", body: None },
        EndpointInfo { method: "GET", path: "/documents", desc: "List documents (?collection=)", body: None },
        EndpointInfo { method: "GET", path: "/documents/:id", desc: "Get document", body: None },
        EndpointInfo { method: "DELETE", path: "/documents/:id", desc: "Delete document", body: None },
        // Search
        EndpointInfo { method: "POST", path: "/search", desc: "Search collections", body: Some(serde_json::json!({"collections":["arr"],"query":"str","top_k":5,"mode":"hybrid","rerank":true})) },
        EndpointInfo { method: "POST", path: "/collections/:name/search", desc: "Search single collection", body: Some(serde_json::json!({"query":"str","top_k":10})) },
        // RAG
        EndpointInfo { method: "POST", path: "/rag", desc: "RAG chat (stream:true for SSE)", body: Some(serde_json::json!({"collection":"str|arr","message":"str","include_sources":true,"stream":false})) },
        // Tables
        EndpointInfo { method: "GET", path: "/tables", desc: "List tables", body: None },
        EndpointInfo { method: "POST", path: "/tables", desc: "Create table", body: Some(serde_json::json!({"name":"str","columns":[{"name":"str","type":"str"}]})) },
        EndpointInfo { method: "GET", path: "/tables/:table/rows", desc: "List rows (?limit=&offset=)", body: None },
        EndpointInfo { method: "POST", path: "/tables/:table/rows", desc: "Insert row", body: Some(serde_json::json!({"field":"value"})) },
        EndpointInfo { method: "PATCH", path: "/tables/:table/rows/:id", desc: "Update row", body: Some(serde_json::json!({"field":"value"})) },
        EndpointInfo { method: "DELETE", path: "/tables/:table/rows/:id", desc: "Delete row", body: None },
    ]
}
