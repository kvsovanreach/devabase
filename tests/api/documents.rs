//! Documents API tests

use crate::common::{setup, cleanup, fixtures::{setup_authenticated_client, unique_collection_name}};
use axum::http::StatusCode;

/// Test list documents
#[tokio::test]
async fn test_list_documents() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create a collection first
    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create collection");

    // List documents (should be empty)
    let response: serde_json::Value = client
        .get(&format!("/documents?collection={}", collection_name))
        .await
        .expect("List should succeed");

    let docs = response["data"].as_array().expect("Should be array");
    assert_eq!(docs.len(), 0, "Should have no documents initially");

    cleanup(&ctx.pool).await;
}

/// Test list documents without collection filter
#[tokio::test]
async fn test_list_all_documents() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // List all documents
    let response: serde_json::Value = client
        .get("/documents")
        .await
        .expect("List should succeed");

    assert!(response.get("data").is_some(), "Should have data field");
    assert!(response.get("pagination").is_some(), "Should have pagination");

    cleanup(&ctx.pool).await;
}

/// Test get non-existent document
#[tokio::test]
async fn test_get_document_not_found() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result: Result<serde_json::Value, _> = client
        .get("/documents/00000000-0000-0000-0000-000000000000")
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

/// Test delete non-existent document
#[tokio::test]
async fn test_delete_document_not_found() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result = client
        .delete("/documents/00000000-0000-0000-0000-000000000000")
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

/// Test get document chunks for non-existent document
#[tokio::test]
async fn test_get_chunks_not_found() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result: Result<serde_json::Value, _> = client
        .get("/documents/00000000-0000-0000-0000-000000000000/chunks")
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

// Note: Document upload tests require multipart form handling
// which is more complex. These tests focus on error cases.
// Full upload tests should use the actual reqwest multipart API.
