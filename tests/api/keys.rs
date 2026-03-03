//! API Keys tests

use crate::common::{setup, cleanup, test_id, fixtures::setup_authenticated_client};
use axum::http::StatusCode;

fn unique_key_name() -> String {
    format!("test_key_{}", test_id())
}

/// Test create API key
#[tokio::test]
async fn test_create_api_key() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let key_name = unique_key_name();
    let response: serde_json::Value = client
        .post("/keys", &serde_json::json!({
            "name": key_name,
            "scopes": ["read", "write"]
        }))
        .await
        .expect("Create should succeed");

    // Should return the full key only on creation
    assert!(response.get("key").is_some(), "Should return full key");
    assert!(response["key"].as_str().unwrap().starts_with("dvb_"), "Key should start with dvb_");

    let api_key = &response["api_key"];
    assert_eq!(api_key["name"], key_name);
    assert!(api_key.get("key_preview").is_some(), "Should have preview");

    cleanup(&ctx.pool).await;
}

/// Test create API key with expiration
#[tokio::test]
async fn test_create_api_key_with_expiration() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let response: serde_json::Value = client
        .post("/keys", &serde_json::json!({
            "name": unique_key_name(),
            "scopes": ["read"],
            "expires_in_days": 30
        }))
        .await
        .expect("Create should succeed");

    let api_key = &response["api_key"];
    assert!(api_key.get("expires_at").is_some(), "Should have expiration");

    cleanup(&ctx.pool).await;
}

/// Test list API keys
#[tokio::test]
async fn test_list_api_keys() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create keys
    client.post::<serde_json::Value, _>("/keys", &serde_json::json!({
        "name": unique_key_name(),
        "scopes": ["read"]
    })).await.expect("Create 1");

    client.post::<serde_json::Value, _>("/keys", &serde_json::json!({
        "name": unique_key_name(),
        "scopes": ["write"]
    })).await.expect("Create 2");

    // List
    let response: serde_json::Value = client.get("/keys").await
        .expect("List should succeed");

    let keys = response["data"].as_array().expect("Should be array");
    assert!(keys.len() >= 2);

    // Full keys should NOT be returned in list
    for key in keys {
        assert!(key.get("key").is_none(), "Should not return full key in list");
        assert!(key.get("key_preview").is_some(), "Should have preview");
    }

    cleanup(&ctx.pool).await;
}

/// Test get API key
#[tokio::test]
async fn test_get_api_key() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let created: serde_json::Value = client
        .post("/keys", &serde_json::json!({
            "name": unique_key_name(),
            "scopes": ["read"]
        }))
        .await
        .expect("Create");

    let key_id = created["api_key"]["id"].as_str().unwrap();

    let key: serde_json::Value = client
        .get(&format!("/keys/{}", key_id))
        .await
        .expect("Get should succeed");

    assert_eq!(key["id"], key_id);
    assert!(key.get("key").is_none(), "Should not return full key");

    cleanup(&ctx.pool).await;
}

/// Test delete API key
#[tokio::test]
async fn test_delete_api_key() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let created: serde_json::Value = client
        .post("/keys", &serde_json::json!({
            "name": unique_key_name(),
            "scopes": ["read"]
        }))
        .await
        .expect("Create");

    let key_id = created["api_key"]["id"].as_str().unwrap();

    // Delete
    client.delete(&format!("/keys/{}", key_id))
        .await
        .expect("Delete should succeed");

    // Verify deleted
    let result: Result<serde_json::Value, _> = client
        .get(&format!("/keys/{}", key_id))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

/// Test use API key for authentication
#[tokio::test]
async fn test_use_api_key_auth() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create API key with read scope
    let created: serde_json::Value = client
        .post("/keys", &serde_json::json!({
            "name": unique_key_name(),
            "scopes": ["read", "write"]
        }))
        .await
        .expect("Create");

    let api_key = created["key"].as_str().unwrap();
    let project_id = client.project_id().unwrap();

    // Use API key for a new request
    use crate::common::client::TestClient;
    let api_client = TestClient::new(ctx.router.clone())
        .with_token(api_key)
        .with_project(project_id);

    // Should be able to access resources
    let collections: serde_json::Value = api_client
        .get("/collections")
        .await
        .expect("Should authenticate with API key");

    assert!(collections.get("data").is_some());

    cleanup(&ctx.pool).await;
}

/// Test API key without required scope
#[tokio::test]
async fn test_api_key_insufficient_scope() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create API key with only read scope
    let created: serde_json::Value = client
        .post("/keys", &serde_json::json!({
            "name": unique_key_name(),
            "scopes": ["read"]  // No write scope
        }))
        .await
        .expect("Create");

    let api_key = created["key"].as_str().unwrap();
    let project_id = client.project_id().unwrap();

    // Use API key for write operation
    use crate::common::client::TestClient;
    let api_client = TestClient::new(ctx.router.clone())
        .with_token(api_key)
        .with_project(project_id);

    // Try to create collection (requires write)
    let result: Result<serde_json::Value, _> = api_client
        .post("/collections", &serde_json::json!({
            "name": "test_collection"
        }))
        .await;

    // Should fail with forbidden
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::FORBIDDEN);

    cleanup(&ctx.pool).await;
}
