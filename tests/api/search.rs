//! Search API tests

use crate::common::{setup, cleanup, fixtures::{setup_authenticated_client, unique_collection_name}};
use axum::http::StatusCode;

/// Test search with empty collection
#[tokio::test]
async fn test_search_empty_collection() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create collection
    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create collection");

    // Search (should return empty results)
    let results: serde_json::Value = client
        .post(&format!("/collections/{}/search", collection_name), &serde_json::json!({
            "query": "test query",
            "top_k": 10
        }))
        .await
        .expect("Search should succeed");

    // Results should be empty array
    let results_array = results.as_array().expect("Should be array");
    assert!(results_array.is_empty(), "Should have no results in empty collection");

    cleanup(&ctx.pool).await;
}

/// Test search with non-existent collection
#[tokio::test]
async fn test_search_nonexistent_collection() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result: Result<serde_json::Value, _> = client
        .post("/collections/nonexistent_collection/search", &serde_json::json!({
            "query": "test",
            "top_k": 10
        }))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

/// Test unified search endpoint
#[tokio::test]
async fn test_unified_search() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create collection
    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create collection");

    // Use unified search
    let results: serde_json::Value = client
        .post("/search", &serde_json::json!({
            "query": "test query",
            "collections": [collection_name],
            "top_k": 10
        }))
        .await
        .expect("Unified search should succeed");

    assert!(results.as_array().is_some(), "Should return array");

    cleanup(&ctx.pool).await;
}

/// Test hybrid search
#[tokio::test]
async fn test_hybrid_search() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create collection
    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create collection");

    // Hybrid search
    let results: serde_json::Value = client
        .post(&format!("/collections/{}/vectors/hybrid-search", collection_name), &serde_json::json!({
            "query": "test query",
            "top_k": 10,
            "vector_weight": 0.7,
            "keyword_weight": 0.3
        }))
        .await
        .expect("Hybrid search should succeed");

    assert!(results.as_array().is_some(), "Should return array");

    cleanup(&ctx.pool).await;
}

/// Test search with filter
#[tokio::test]
async fn test_search_with_filter() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create collection
    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create collection");

    // Search with metadata filter
    let results: serde_json::Value = client
        .post(&format!("/collections/{}/search", collection_name), &serde_json::json!({
            "query": "test",
            "top_k": 10,
            "filter": {
                "category": "test"
            }
        }))
        .await
        .expect("Search with filter should succeed");

    assert!(results.as_array().is_some());

    cleanup(&ctx.pool).await;
}

/// Test search with invalid top_k
#[tokio::test]
async fn test_search_invalid_top_k() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create collection
    let collection_name = unique_collection_name();
    client.post::<serde_json::Value, _>("/collections", &serde_json::json!({
        "name": collection_name
    })).await.expect("Create collection");

    // Search with negative top_k
    let result: Result<serde_json::Value, _> = client
        .post(&format!("/collections/{}/search", collection_name), &serde_json::json!({
            "query": "test",
            "top_k": -1
        }))
        .await;

    // Should either fail validation or clamp to minimum
    // Implementation dependent
    if result.is_err() {
        assert_eq!(result.unwrap_err().status(), StatusCode::BAD_REQUEST);
    }

    cleanup(&ctx.pool).await;
}
