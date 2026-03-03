//! Common test utilities and setup/teardown helpers

pub mod client;
pub mod fixtures;

use axum::{body::Body, http::Request, Router};
use devabase::Config;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::OnceCell;
use tower::ServiceExt;

/// Global test state - initialized once per test run
static TEST_STATE: OnceCell<TestContext> = OnceCell::const_new();

/// Test context containing shared resources
pub struct TestContext {
    pub pool: PgPool,
    pub config: Config,
    pub router: Router,
}

impl TestContext {
    /// Make a request to the test router
    pub async fn request(&self, request: Request<Body>) -> axum::response::Response {
        self.router
            .clone()
            .oneshot(request)
            .await
            .expect("Failed to execute request")
    }
}

/// Initialize the test environment
pub async fn setup() -> &'static TestContext {
    TEST_STATE
        .get_or_init(|| async {
            // Load test configuration
            dotenvy::dotenv().ok();

            let database_url = std::env::var("TEST_DATABASE_URL")
                .unwrap_or_else(|_| std::env::var("DATABASE_URL")
                    .expect("DATABASE_URL or TEST_DATABASE_URL must be set"));

            // Create test database pool
            let pool = PgPool::connect(&database_url)
                .await
                .expect("Failed to connect to test database");

            // Run migrations
            sqlx::migrate!("./migrations")
                .run(&pool)
                .await
                .expect("Failed to run migrations");

            // Create test config with disabled embedding
            let mut config = Config::from_env().expect("Failed to load config");
            config.database.url = database_url;
            config.embedding.provider = "none".to_string();

            // Create app state
            let db_pool = devabase::db::DbPool::new(pool.clone());
            let storage = devabase::storage::StorageService::new(&config)
                .expect("Failed to create storage service");
            let embedding = devabase::rag::EmbeddingService::new(&config)
                .expect("Failed to create embedding service");

            let state = Arc::new(devabase::server::AppState::new(
                db_pool,
                config.clone(),
                storage,
                embedding,
            ));

            // Create router (without starting server)
            let router = devabase::server::create_router(state);

            TestContext {
                pool,
                config,
                router,
            }
        })
        .await
}

/// Clean up test data after each test
pub async fn cleanup(pool: &PgPool) {
    // Clean up in reverse dependency order (respecting foreign key constraints)
    let tables = [
        "sys_webhook_logs",
        "sys_webhooks",
        "sys_usage_logs",
        "sys_api_keys",
        "sys_messages",
        "sys_conversations",
        "sys_prompt_history",
        "sys_prompts",
        "sys_benchmark_results",
        "sys_benchmarks",
        "sys_evaluation_results",
        "sys_evaluation_runs",
        "sys_evaluation_cases",
        "sys_evaluation_datasets",
        "sys_relationships",
        "sys_entities",
        "sys_chunks",
        "sys_documents",
        "sys_collections",
        "sys_user_tables",
        "sys_query_history",
        "sys_project_invitations",
        "sys_project_members",
        "sys_app_user_sessions",
        "sys_app_users",
        "sys_projects",
        "sys_sessions",
        "sys_users",
    ];

    for table in tables {
        let _ = sqlx::query(&format!("DELETE FROM {} WHERE 1=1", table))
            .execute(pool)
            .await;
    }
}

/// Create a unique test identifier for isolation
pub fn test_id() -> String {
    uuid::Uuid::new_v4().to_string()[..8].to_string()
}
