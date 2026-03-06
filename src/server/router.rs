use super::middleware::rate_limit::RateLimitLayer;
use super::middleware::usage::log_usage;
use super::AppState;
use crate::api;
use axum::{
    extract::DefaultBodyLimit,
    http::{header, Method},
    middleware,
    routing::{delete, get, patch, post},
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

pub fn create_router(state: Arc<AppState>) -> Router {
    // Build CORS layer based on configuration
    let cors = build_cors_layer(&state.config.cors);

    // Build rate limit layer based on configuration
    let rate_limit = if state.config.rate_limit.enabled {
        Some(RateLimitLayer::new(
            state.config.rate_limit.requests_per_window,
            state.config.rate_limit.window_seconds,
        ))
    } else {
        None
    };

    // ===========================================
    // API ROUTES (v1)
    // ===========================================
    //
    // Endpoint Design Principles:
    // 1. Resources are nouns, actions are HTTP methods
    // 2. Consistent path parameter naming (:name for business keys, :id for UUIDs)
    // 3. Nested resources under parent when tightly coupled
    // 4. PATCH for partial updates (not PUT)
    //
    // Quick Reference:
    // - /rag                       → Unified RAG chat (single or multi-collection)
    // - /search                    → Cross-collection search
    // - /collections/:name/search  → Single collection search
    // - /collections/:name/chat    → Single collection RAG chat
    // - /collections/:name/vectors → Low-level vector operations
    // ===========================================

    let api_routes = Router::new()
        // ─────────────────────────────────────────
        // Health & Status
        // ─────────────────────────────────────────
        .route("/health", get(api::health::health_check))
        .route("/ready", get(api::health::ready_check))
        // API metadata for AI coding agents
        .route("/vibe-metadata", get(api::metadata::get_metadata))

        // ─────────────────────────────────────────
        // Authentication (Admin/Developer)
        // ─────────────────────────────────────────
        .route("/auth/register", post(api::auth::register))
        .route("/auth/login", post(api::auth::login))
        .route("/auth/logout", post(api::auth::logout))
        .route("/auth/refresh", post(api::auth::refresh))
        .route("/auth/me", get(api::auth::me))
        .route("/auth/me", patch(api::auth::update_me))

        // ─────────────────────────────────────────
        // App Authentication (End-users of apps built with Devabase)
        // SDK users can use this to add auth to their own applications
        // ─────────────────────────────────────────
        .route("/auth/app/register", post(api::app_auth::register))
        .route("/auth/app/login", post(api::app_auth::login))
        .route("/auth/app/refresh", post(api::app_auth::refresh_token))
        .route("/auth/app/logout", post(api::app_auth::logout))
        .route("/auth/app/me", get(api::app_auth::get_me))
        .route("/auth/app/me", patch(api::app_auth::update_me))
        .route("/auth/app/me", delete(api::app_auth::delete_account))
        .route("/auth/app/password", post(api::app_auth::change_password))
        .route("/auth/app/forgot-password", post(api::app_auth::forgot_password))
        .route("/auth/app/reset-password", post(api::app_auth::reset_password))
        .route("/auth/app/verify-email", post(api::app_auth::verify_email))
        .route("/auth/app/resend-verification", post(api::app_auth::resend_verification))
        // Stateless token introspection (OAuth2-style, for server-side validation)
        .route("/auth/app/introspect", post(api::app_auth::introspect_token))
        // Admin endpoints for managing app users
        .route("/auth/app/users", get(api::app_auth::list_users))
        .route("/auth/app/users/:id", get(api::app_auth::get_user))
        .route("/auth/app/users/:id", patch(api::app_auth::update_user))
        .route("/auth/app/users/:id", delete(api::app_auth::delete_user))

        // ─────────────────────────────────────────
        // Projects (Multi-tenancy)
        // ─────────────────────────────────────────
        .route("/projects", get(api::projects::list_projects))
        .route("/projects", post(api::projects::create_project))
        .route("/projects/:id", get(api::projects::get_project))
        .route("/projects/:id", patch(api::projects::update_project))
        .route("/projects/:id", delete(api::projects::delete_project))
        // Project members
        .route("/projects/:id/members", get(api::projects::list_members))
        .route("/projects/:id/members", post(api::projects::add_member))
        .route("/projects/:id/members/:uid", patch(api::projects::update_member))
        .route("/projects/:id/members/:uid", delete(api::projects::remove_member))
        // Project invitations
        .route("/projects/:id/invitations", get(api::projects::list_invitations))
        .route("/projects/:id/invitations", post(api::projects::create_invitation))
        .route("/projects/:id/invitations/:iid", delete(api::projects::revoke_invitation))
        .route("/invitations/:token/accept", post(api::projects::accept_invitation))

        // ─────────────────────────────────────────
        // Collections (Vector Database)
        // ─────────────────────────────────────────
        .route("/collections", get(api::collections::list_collections))
        .route("/collections", post(api::collections::create_collection))
        .route("/collections/:name", get(api::collections::get_collection))
        .route("/collections/:name", patch(api::collections::update_collection))
        .route("/collections/:name", delete(api::collections::delete_collection))
        .route("/collections/:name/stats", get(api::collections::get_collection_stats))
        // Collection RAG config
        .route("/collections/:name/config", patch(api::collections::update_rag_config))
        // Collection search & chat (HIGH-LEVEL - recommended for most users)
        .route("/collections/:name/search", post(api::retrieve::collection_search))
        .route("/collections/:name/chat", post(api::rag::collection_chat))
        .route("/collections/:name/chat/stream", post(api::rag::collection_chat_stream))
        // Collection vectors (LOW-LEVEL - for advanced users)
        .route("/collections/:name/vectors", post(api::vectors::collection_upsert))
        .route("/collections/:name/vectors/search", post(api::vectors::collection_search))
        .route("/collections/:name/vectors/hybrid-search", post(api::vectors::collection_hybrid_search))
        .route("/collections/:name/vectors/:vid", delete(api::vectors::collection_delete_vector))
        // Collection documents
        .route("/collections/:name/documents", get(api::documents::collection_documents))
        .route("/collections/:name/documents", post(api::documents::collection_upload))

        // ─────────────────────────────────────────
        // Cross-Collection Operations
        // ─────────────────────────────────────────
        // Unified search across multiple collections
        .route("/search", post(api::retrieve::unified_search))
        // Unified RAG endpoint (single or multi-collection, streaming or non-streaming)
        .route("/rag", post(api::rag::rag_chat))

        // ─────────────────────────────────────────
        // Documents (All documents across collections)
        // ─────────────────────────────────────────
        .route("/documents", get(api::documents::list_documents))
        .route("/documents/:id", get(api::documents::get_document))
        .route("/documents/:id", delete(api::documents::delete_document))
        .route("/documents/:id/chunks", get(api::documents::get_document_chunks))
        .route("/documents/:id/reprocess", post(api::documents::reprocess_document))

        // ─────────────────────────────────────────
        // Chunks (Chunk Management)
        // ─────────────────────────────────────────
        .route("/chunks/:id", get(api::chunks::get_chunk))
        .route("/chunks/:id", patch(api::chunks::update_chunk))
        .route("/chunks/:id", delete(api::chunks::delete_chunk))
        .route("/chunks/:id/split", post(api::chunks::split_chunk))
        .route("/chunks/merge", post(api::chunks::merge_chunks))

        // ─────────────────────────────────────────
        // Evaluation (RAG Quality Metrics)
        // ─────────────────────────────────────────
        .route("/evaluation/datasets", get(api::evaluation::list_datasets))
        .route("/evaluation/datasets", post(api::evaluation::create_dataset))
        .route("/evaluation/datasets/:id", get(api::evaluation::get_dataset))
        .route("/evaluation/datasets/:id", patch(api::evaluation::update_dataset))
        .route("/evaluation/datasets/:id", delete(api::evaluation::delete_dataset))
        .route("/evaluation/datasets/:id/cases", post(api::evaluation::create_case))
        .route("/evaluation/datasets/:id/run", post(api::evaluation::run_evaluation))
        .route("/evaluation/datasets/:id/runs", get(api::evaluation::list_runs))
        .route("/evaluation/cases/:id", patch(api::evaluation::update_case))
        .route("/evaluation/cases/:id", delete(api::evaluation::delete_case))
        .route("/evaluation/runs/:id", get(api::evaluation::get_run))

        // ─────────────────────────────────────────
        // Knowledge Graph
        // ─────────────────────────────────────────
        .route("/knowledge/entities", get(api::knowledge_graph::list_entities))
        .route("/knowledge/entities", post(api::knowledge_graph::create_entity))
        .route("/knowledge/entities/search", post(api::knowledge_graph::search_entities))
        .route("/knowledge/entities/merge", post(api::knowledge_graph::merge_entities))
        .route("/knowledge/entities/:id", get(api::knowledge_graph::get_entity))
        .route("/knowledge/entities/:id", patch(api::knowledge_graph::update_entity))
        .route("/knowledge/entities/:id", delete(api::knowledge_graph::delete_entity))
        .route("/knowledge/relationships", get(api::knowledge_graph::list_relationships))
        .route("/knowledge/relationships", post(api::knowledge_graph::create_relationship))
        .route("/knowledge/relationships/:id", delete(api::knowledge_graph::delete_relationship))
        .route("/knowledge/graph/:entity_id", get(api::knowledge_graph::get_entity_graph))
        .route("/knowledge/stats", get(api::knowledge_graph::get_stats))
        .route("/knowledge/extract/:document_id", post(api::knowledge_graph::extract_from_document))

        // ─────────────────────────────────────────
        // Benchmarks (Academic Evaluation)
        // ─────────────────────────────────────────
        .route("/benchmarks/run", post(api::benchmarks::run_benchmark))
        .route("/benchmarks", get(api::benchmarks::list_benchmarks))
        .route("/benchmarks/datasets", get(api::benchmarks::list_datasets))
        .route("/benchmarks/datasets/download", post(api::benchmarks::download_dataset))
        .route("/benchmarks/configs", get(api::benchmarks::get_preset_configs))
        .route("/benchmarks/compare", post(api::benchmarks::compare_benchmarks))
        .route("/benchmarks/:id", get(api::benchmarks::get_benchmark))
        .route("/benchmarks/:id", delete(api::benchmarks::delete_benchmark))
        .route("/benchmarks/:id/export", get(api::benchmarks::export_benchmark))

        // ─────────────────────────────────────────
        // Conversations (Chat History)
        // ─────────────────────────────────────────
        .route("/conversations", get(api::conversations::list_conversations))
        .route("/conversations", post(api::conversations::create_conversation))
        .route("/conversations/:id", get(api::conversations::get_conversation))
        .route("/conversations/:id", patch(api::conversations::update_conversation))
        .route("/conversations/:id", delete(api::conversations::delete_conversation))

        // ─────────────────────────────────────────
        // Prompts (Template Management)
        // ─────────────────────────────────────────
        .route("/prompts", get(api::prompts::list_prompts))
        .route("/prompts", post(api::prompts::create_prompt))
        .route("/prompts/:name", get(api::prompts::get_prompt))
        .route("/prompts/:name", patch(api::prompts::update_prompt))
        .route("/prompts/:name", delete(api::prompts::delete_prompt))
        .route("/prompts/:name/render", post(api::prompts::render_prompt))

        // ─────────────────────────────────────────
        // Tables (Relational Data)
        // ─────────────────────────────────────────
        .route("/tables", get(api::tables::list_tables))
        .route("/tables", post(api::tables::create_table))
        .route("/tables/:table", get(api::tables::get_table))
        .route("/tables/:table", delete(api::tables::delete_table))
        .route("/tables/:table/rows", get(api::tables::list_rows))
        .route("/tables/:table/rows", post(api::tables::create_row))
        .route("/tables/:table/rows/batch", post(api::tables::create_rows_batch))
        .route("/tables/:table/rows/:id", get(api::tables::get_row))
        .route("/tables/:table/rows/:id", patch(api::tables::update_row))
        .route("/tables/:table/rows/:id", delete(api::tables::delete_row))
        .route("/tables/:table/export", get(api::tables::export_table))
        .route("/tables/:table/import", post(api::tables::import_table))

        // ─────────────────────────────────────────
        // SQL (Direct Query Interface)
        // ─────────────────────────────────────────
        .route("/sql/execute", post(api::sql::execute_sql))
        .route("/sql/history", get(api::sql::get_query_history))
        .route("/sql/schema", get(api::sql::get_schema))

        // ─────────────────────────────────────────
        // Provider Testing
        // ─────────────────────────────────────────
        .route("/providers/test-llm", post(api::providers::test_llm))
        .route("/providers/test-embedding", post(api::providers::test_embedding))
        .route("/providers/test-rerank", post(api::providers::test_rerank))

        // ─────────────────────────────────────────
        // Storage (Generic File Storage)
        // ─────────────────────────────────────────
        .route("/storage", post(api::files::upload_file))
        .route("/storage/:path", get(api::files::get_file))
        .route("/storage/:path", delete(api::files::delete_file))

        // ─────────────────────────────────────────
        // API Keys
        // ─────────────────────────────────────────
        .route("/keys", get(api::keys::list_keys))
        .route("/keys", post(api::keys::create_key))
        .route("/keys/:id", get(api::keys::get_key))
        .route("/keys/:id", patch(api::keys::toggle_key))
        .route("/keys/:id", delete(api::keys::delete_key))

        // ─────────────────────────────────────────
        // Webhooks
        // ─────────────────────────────────────────
        .route("/webhooks", get(api::webhooks::list_webhooks))
        .route("/webhooks", post(api::webhooks::create_webhook))
        .route("/webhooks/:id", get(api::webhooks::get_webhook))
        .route("/webhooks/:id", patch(api::webhooks::update_webhook))
        .route("/webhooks/:id", delete(api::webhooks::delete_webhook))
        .route("/webhooks/:id/test", post(api::webhooks::test_webhook))
        .route("/webhooks/:id/logs", get(api::webhooks::get_webhook_logs))

        // ─────────────────────────────────────────
        // Admin (System Management)
        // ─────────────────────────────────────────
        // Cache management
        .route("/admin/cache", get(api::cache::get_stats))
        .route("/admin/cache", delete(api::cache::clear_cache))
        .route("/admin/cache/:key", delete(api::cache::delete_entry))
        // Usage analytics
        .route("/admin/usage", get(api::usage::get_usage))
        .route("/admin/usage/export", get(api::usage::export_usage))
        // Provider testing
        .route("/admin/providers/test-llm", post(api::providers::test_llm))
        .route("/admin/providers/test-embedding", post(api::providers::test_embedding))
        .route("/admin/providers/test-rerank", post(api::providers::test_rerank))

        // ─────────────────────────────────────────
        // Real-time (WebSocket)
        // ─────────────────────────────────────────
        .route("/realtime", get(api::realtime::ws_upgrade));

    // Calculate upload size limit from config (MB to bytes)
    let upload_limit = state.config.server.max_upload_size_mb * 1024 * 1024;

    let mut router = Router::new()
        .nest("/v1", api_routes)
        .layer(DefaultBodyLimit::max(upload_limit))
        .layer(middleware::from_fn_with_state(state.clone(), log_usage))
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    // Apply rate limiting if enabled
    if let Some(rl) = rate_limit {
        router = router.layer(rl);
    }

    router.with_state(state)
}

/// Build CORS layer based on configuration
fn build_cors_layer(config: &crate::config::CorsConfig) -> CorsLayer {
    use tower_http::cors::AllowOrigin;

    let mut cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::HeaderName::from_static("x-api-key"),
            header::HeaderName::from_static("x-project-id"),
            header::HeaderName::from_static("x-request-time"),
            header::HeaderName::from_static("x-request-id"),
            header::HeaderName::from_static("x-app-user-token"),
        ])
        .max_age(std::time::Duration::from_secs(config.max_age_secs));

    // Set allowed origins
    cors = if config.allowed_origins.is_empty() {
        cors.allow_origin(AllowOrigin::any())
    } else {
        let origins: Vec<header::HeaderValue> = config
            .allowed_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();

        if origins.is_empty() {
            cors.allow_origin(AllowOrigin::any())
        } else {
            cors.allow_origin(origins)
        }
    };

    if config.allow_credentials && !config.allowed_origins.is_empty() {
        cors = cors.allow_credentials(true);
    }

    cors
}
