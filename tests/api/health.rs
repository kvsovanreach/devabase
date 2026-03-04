//! Health check API tests

use crate::common::{setup, client::TestClient};

/// Test health check endpoint
#[tokio::test]
async fn test_health_check() {
    let ctx = setup().await;
    let client = TestClient::new(ctx.router.clone());

    // Health check should work without authentication
    let health: serde_json::Value = client
        .get("/health")
        .await
        .expect("Health check should succeed");

    assert_eq!(health["status"], "ok");
}

/// Test ready check endpoint
#[tokio::test]
async fn test_ready_check() {
    let ctx = setup().await;
    let client = TestClient::new(ctx.router.clone());

    // Ready check should work without authentication
    let ready: serde_json::Value = client
        .get("/ready")
        .await
        .expect("Ready check should succeed");

    assert_eq!(ready["status"], "ready");
    assert!(ready.get("database").is_some(), "Should report database status");
}

/// Test API metadata endpoint
#[tokio::test]
async fn test_api_metadata() {
    let ctx = setup().await;
    let client = TestClient::new(ctx.router.clone());

    // Metadata should work without authentication
    let metadata: serde_json::Value = client
        .get("/vibe-metadata")
        .await
        .expect("Metadata should succeed");

    assert!(metadata.get("endpoints").is_some(), "Should list endpoints");
    assert!(metadata.get("version").is_some() || metadata.get("name").is_some(),
            "Should have version or name");
}
