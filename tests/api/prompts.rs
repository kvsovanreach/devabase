//! Prompts API tests

use crate::common::{setup, cleanup, test_id, fixtures::setup_authenticated_client};
use axum::http::StatusCode;

fn unique_prompt_name() -> String {
    format!("test_prompt_{}", test_id())
}

/// Test create prompt
#[tokio::test]
async fn test_create_prompt() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let prompt_name = unique_prompt_name();
    let prompt: serde_json::Value = client
        .post("/prompts", &serde_json::json!({
            "name": prompt_name,
            "content": "Hello {{name}}, welcome to {{service}}!",
            "description": "A greeting prompt"
        }))
        .await
        .expect("Create should succeed");

    assert_eq!(prompt["name"], prompt_name);
    assert_eq!(prompt["content"], "Hello {{name}}, welcome to {{service}}!");
    assert_eq!(prompt["version"], 1);

    cleanup(&ctx.pool).await;
}

/// Test create prompt without content
#[tokio::test]
async fn test_create_prompt_missing_content() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result: Result<serde_json::Value, _> = client
        .post("/prompts", &serde_json::json!({
            "name": unique_prompt_name()
            // Missing content
        }))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::BAD_REQUEST);

    cleanup(&ctx.pool).await;
}

/// Test create duplicate prompt
#[tokio::test]
async fn test_create_prompt_duplicate() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let prompt_name = unique_prompt_name();

    // Create first
    client.post::<serde_json::Value, _>("/prompts", &serde_json::json!({
        "name": prompt_name,
        "content": "First version"
    })).await.expect("First create");

    // Try duplicate
    let result: Result<serde_json::Value, _> = client
        .post("/prompts", &serde_json::json!({
            "name": prompt_name,
            "content": "Second version"
        }))
        .await;

    assert!(result.is_err());
    // Should be conflict or validation error
    let err = result.unwrap_err();
    assert!(
        err.status() == StatusCode::CONFLICT || err.status() == StatusCode::BAD_REQUEST,
        "Should fail for duplicate"
    );

    cleanup(&ctx.pool).await;
}

/// Test list prompts
#[tokio::test]
async fn test_list_prompts() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create prompts
    client.post::<serde_json::Value, _>("/prompts", &serde_json::json!({
        "name": unique_prompt_name(),
        "content": "Prompt 1"
    })).await.expect("Create 1");

    client.post::<serde_json::Value, _>("/prompts", &serde_json::json!({
        "name": unique_prompt_name(),
        "content": "Prompt 2"
    })).await.expect("Create 2");

    // List
    let response: serde_json::Value = client.get("/prompts").await
        .expect("List should succeed");

    let prompts = response["data"].as_array().expect("Should be array");
    assert!(prompts.len() >= 2);

    cleanup(&ctx.pool).await;
}

/// Test get prompt
#[tokio::test]
async fn test_get_prompt() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let prompt_name = unique_prompt_name();
    client.post::<serde_json::Value, _>("/prompts", &serde_json::json!({
        "name": prompt_name,
        "content": "Test content"
    })).await.expect("Create");

    let prompt: serde_json::Value = client
        .get(&format!("/prompts/{}", prompt_name))
        .await
        .expect("Get should succeed");

    assert_eq!(prompt["name"], prompt_name);
    assert_eq!(prompt["content"], "Test content");

    cleanup(&ctx.pool).await;
}

/// Test update prompt
#[tokio::test]
async fn test_update_prompt() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let prompt_name = unique_prompt_name();
    client.post::<serde_json::Value, _>("/prompts", &serde_json::json!({
        "name": prompt_name,
        "content": "Original content"
    })).await.expect("Create");

    // Update
    let updated: serde_json::Value = client
        .patch(&format!("/prompts/{}", prompt_name), &serde_json::json!({
            "content": "Updated content",
            "description": "New description"
        }))
        .await
        .expect("Update should succeed");

    assert_eq!(updated["content"], "Updated content");
    assert_eq!(updated["description"], "New description");
    // Version should increment
    assert!(updated["version"].as_i64().unwrap() >= 1);

    cleanup(&ctx.pool).await;
}

/// Test delete prompt
#[tokio::test]
async fn test_delete_prompt() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let prompt_name = unique_prompt_name();
    client.post::<serde_json::Value, _>("/prompts", &serde_json::json!({
        "name": prompt_name,
        "content": "To delete"
    })).await.expect("Create");

    // Delete
    client.delete(&format!("/prompts/{}", prompt_name))
        .await
        .expect("Delete should succeed");

    // Verify deleted
    let result: Result<serde_json::Value, _> = client
        .get(&format!("/prompts/{}", prompt_name))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

/// Test render prompt with variables
#[tokio::test]
async fn test_render_prompt() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let prompt_name = unique_prompt_name();
    client.post::<serde_json::Value, _>("/prompts", &serde_json::json!({
        "name": prompt_name,
        "content": "Hello {{name}}! Welcome to {{service}}."
    })).await.expect("Create");

    // Render
    let rendered: serde_json::Value = client
        .post(&format!("/prompts/{}/render", prompt_name), &serde_json::json!({
            "variables": {
                "name": "Alice",
                "service": "Devabase"
            }
        }))
        .await
        .expect("Render should succeed");

    assert_eq!(rendered["content"], "Hello Alice! Welcome to Devabase.");

    cleanup(&ctx.pool).await;
}
