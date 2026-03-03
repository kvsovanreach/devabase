//! Collections API tests

use crate::common::{setup, cleanup, fixtures::{setup_authenticated_client, unique_collection_name}};
use axum::http::StatusCode;

/// Test create collection
#[tokio::test]
async fn test_create_collection() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let collection_name = unique_collection_name();
    let collection: serde_json::Value = client
        .post("/collections", &serde_json::json!({
            "name": collection_name,
            "description": "Test collection"
        }))
        .await
        .expect("Create should succeed");

    assert_eq!(collection["name"], collection_name);
    assert_eq!(collection["description"], "Test collection");
    assert!(collection.get("id").is_some());
    assert!(collection.get("dimensions").is_some());

    cleanup(&ctx.pool).await;
}

/// Test create collection with custom dimensions
#[tokio::test]
async fn test_create_collection_custom_dimensions() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let collection: serde_json::Value = client
        .post("/collections", &serde_json::json!({
            "name": unique_collection_name(),
            "dimensions": 512
        }))
        .await
        .expect("Create should succeed");

    assert_eq!(collection["dimensions"], 512);

    cleanup(&ctx.pool).await;
}

/// Test create collection with invalid name
#[tokio::test]
async fn test_create_collection_invalid_name() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Name with spaces (invalid)
    let result: Result<serde_json::Value, _> = client
        .post("/collections", &serde_json::json!({
            "name": "invalid name with spaces"
        }))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::BAD_REQUEST);

    cleanup(&ctx.pool).await;
}

/// Test list collections
#[tokio::test]
async fn test_list_collections() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create collections
    let name1 = unique_collection_name();
    let name2 = unique_collection_name();

    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": name1
    })).await.expect("Create 1");

    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": name2
    })).await.expect("Create 2");

    // List
    let response: serde_json::Value = client.get("/collections").await
        .expect("List should succeed");

    let collections = response["data"].as_array().expect("Should be array");
    assert!(collections.len() >= 2);

    cleanup(&ctx.pool).await;
}

/// Test get collection
#[tokio::test]
async fn test_get_collection() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create");

    let collection: serde_json::Value = client
        .get(&format!("/collections/{}", collection_name))
        .await
        .expect("Get should succeed");

    assert_eq!(collection["name"], collection_name);

    cleanup(&ctx.pool).await;
}

/// Test get non-existent collection
#[tokio::test]
async fn test_get_collection_not_found() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result: Result<serde_json::Value, _> = client
        .get("/collections/nonexistent_collection")
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

/// Test update collection
#[tokio::test]
async fn test_update_collection() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create");

    let updated: serde_json::Value = client
        .patch(&format!("/collections/{}", collection_name), &serde_json::json!({
            "description": "Updated description",
            "metadata": { "key": "value" }
        }))
        .await
        .expect("Update should succeed");

    assert_eq!(updated["description"], "Updated description");

    cleanup(&ctx.pool).await;
}

/// Test delete collection
#[tokio::test]
async fn test_delete_collection() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create");

    // Delete
    client.delete(&format!("/collections/{}", collection_name))
        .await
        .expect("Delete should succeed");

    // Verify deleted
    let result: Result<serde_json::Value, _> = client
        .get(&format!("/collections/{}", collection_name))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

/// Test get collection stats
#[tokio::test]
async fn test_get_collection_stats() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create");

    let stats: serde_json::Value = client
        .get(&format!("/collections/{}/stats", collection_name))
        .await
        .expect("Get stats should succeed");

    assert!(stats.get("document_count").is_some());
    assert!(stats.get("chunk_count").is_some());

    cleanup(&ctx.pool).await;
}
