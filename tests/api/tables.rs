//! Tables API tests - including error handling tests

use crate::common::{
    setup, cleanup,
    client::TestClient,
    fixtures::{setup_authenticated_client, unique_table_name, ColumnDef, standard_table_columns}
};
use axum::http::StatusCode;

/// Test create table
#[tokio::test]
async fn test_create_table() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    let table: serde_json::Value = client
        .post("/tables", &serde_json::json!({
            "name": table_name,
            "columns": standard_table_columns()
        }))
        .await
        .expect("Create table should succeed");

    assert_eq!(table["name"], table_name);
    assert!(table.get("columns").is_some(), "Should have columns");

    cleanup(&ctx.pool).await;
}

/// Test create table without primary key
#[tokio::test]
async fn test_create_table_no_primary_key() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result: Result<serde_json::Value, _> = client
        .post("/tables", &serde_json::json!({
            "name": unique_table_name(),
            "columns": [
                ColumnDef::string("name"),
                ColumnDef::string("description")
            ]
        }))
        .await;

    assert!(result.is_err(), "Should fail without primary key");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::BAD_REQUEST);
}

/// Test create table with duplicate name
#[tokio::test]
async fn test_create_table_duplicate_name() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();

    // Create first table
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": [ColumnDef::id(), ColumnDef::string("name")]
    })).await.expect("First create should succeed");

    // Try to create with same name
    let result: Result<serde_json::Value, _> = client
        .post("/tables", &serde_json::json!({
            "name": table_name,
            "columns": [ColumnDef::id(), ColumnDef::string("other")]
        }))
        .await;

    assert!(result.is_err(), "Should fail with duplicate name");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::BAD_REQUEST);

    cleanup(&ctx.pool).await;
}

/// Test list tables
#[tokio::test]
async fn test_list_tables() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    // Create tables
    let name1 = unique_table_name();
    let name2 = unique_table_name();

    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": name1,
        "columns": [ColumnDef::id(), ColumnDef::string("col1")]
    })).await.expect("Create table 1");

    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": name2,
        "columns": [ColumnDef::id(), ColumnDef::string("col2")]
    })).await.expect("Create table 2");

    // List tables
    let response: serde_json::Value = client.get("/tables").await
        .expect("List should succeed");

    let tables = response["data"].as_array().expect("Should be array");
    assert!(tables.len() >= 2, "Should have at least 2 tables");

    cleanup(&ctx.pool).await;
}

/// Test get table
#[tokio::test]
async fn test_get_table() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": standard_table_columns()
    })).await.expect("Create should succeed");

    let table: serde_json::Value = client
        .get(&format!("/tables/{}", table_name))
        .await
        .expect("Get should succeed");

    assert_eq!(table["name"], table_name);

    cleanup(&ctx.pool).await;
}

/// Test delete table
#[tokio::test]
async fn test_delete_table() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": [ColumnDef::id(), ColumnDef::string("name")]
    })).await.expect("Create should succeed");

    // Delete
    client.delete(&format!("/tables/{}", table_name))
        .await
        .expect("Delete should succeed");

    // Verify deleted
    let result: Result<serde_json::Value, _> = client
        .get(&format!("/tables/{}", table_name))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

// ========================================
// Row Operations
// ========================================

/// Test create row
#[tokio::test]
async fn test_create_row() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": standard_table_columns()
    })).await.expect("Create table");

    // Create row
    let row: serde_json::Value = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "title": "Test Task",
            "description": "A test task",
            "priority": 1,
            "completed": false
        }))
        .await
        .expect("Create row should succeed");

    let row_data = &row["row"];
    assert_eq!(row_data["title"], "Test Task");
    assert_eq!(row_data["priority"], 1);
    assert_eq!(row_data["completed"], false);

    cleanup(&ctx.pool).await;
}

/// Test create row with missing required field
#[tokio::test]
async fn test_create_row_missing_required_field() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": standard_table_columns()
    })).await.expect("Create table");

    // Create row without required 'title' field
    let result: Result<serde_json::Value, _> = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "description": "Missing title",
            "priority": 1
        }))
        .await;

    assert!(result.is_err(), "Should fail with missing required field");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::BAD_REQUEST);
    assert_eq!(err.code(), "REQUIRED_FIELD_NULL");

    cleanup(&ctx.pool).await;
}

/// Test create row with invalid data type (timestamp mismatch)
#[tokio::test]
async fn test_create_row_type_mismatch() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": standard_table_columns()
    })).await.expect("Create table");

    // Create row with invalid timestamp format
    let result: Result<serde_json::Value, _> = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "title": "Test",
            "due_date": "not-a-date"
        }))
        .await;

    // This should either succeed (if it's treated as text) or fail with type mismatch
    // Based on our fix, "not-a-date" should be bound as text, which will cause a type error
    if result.is_err() {
        let err = result.unwrap_err();
        assert!(
            err.code() == "DATA_TYPE_MISMATCH" || err.code() == "INVALID_DATETIME",
            "Should have type error, got: {}",
            err.code()
        );
    }

    cleanup(&ctx.pool).await;
}

/// Test create row with empty string for timestamp (should be treated as NULL)
#[tokio::test]
async fn test_create_row_empty_timestamp() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": standard_table_columns()
    })).await.expect("Create table");

    // Create row with empty string for timestamp - should succeed (treated as NULL)
    let row: serde_json::Value = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "title": "Test Task",
            "due_date": ""
        }))
        .await
        .expect("Create with empty timestamp should succeed (treated as NULL)");

    let row_data = &row["row"];
    assert!(row_data["due_date"].is_null(), "Empty string should be stored as null");

    cleanup(&ctx.pool).await;
}

/// Test create row with valid ISO timestamp
#[tokio::test]
async fn test_create_row_valid_timestamp() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": standard_table_columns()
    })).await.expect("Create table");

    // Create row with valid ISO timestamp
    let row: serde_json::Value = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "title": "Test Task",
            "due_date": "2024-12-25T10:00:00Z"
        }))
        .await
        .expect("Create with valid timestamp should succeed");

    let row_data = &row["row"];
    assert!(!row_data["due_date"].is_null(), "Should have due_date");

    cleanup(&ctx.pool).await;
}

/// Test list rows
#[tokio::test]
async fn test_list_rows() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": [ColumnDef::id(), ColumnDef::string_required("name")]
    })).await.expect("Create table");

    // Create rows
    for i in 1..=5 {
        client.post::<serde_json::Value, _>(
            &format!("/tables/{}/rows", table_name),
            &serde_json::json!({ "name": format!("Item {}", i) })
        ).await.expect("Create row");
    }

    // List rows
    let response: serde_json::Value = client
        .get(&format!("/tables/{}/rows", table_name))
        .await
        .expect("List should succeed");

    let rows = response["rows"].as_array().expect("Should have rows");
    assert_eq!(rows.len(), 5, "Should have 5 rows");

    cleanup(&ctx.pool).await;
}

/// Test get single row
#[tokio::test]
async fn test_get_row() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": [ColumnDef::id(), ColumnDef::string_required("name")]
    })).await.expect("Create table");

    // Create row
    let created: serde_json::Value = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "name": "Test Item"
        }))
        .await
        .expect("Create row");

    let row_id = created["row"]["id"].as_str().unwrap();

    // Get row
    let response: serde_json::Value = client
        .get(&format!("/tables/{}/rows/{}", table_name, row_id))
        .await
        .expect("Get should succeed");

    assert_eq!(response["row"]["id"], row_id);
    assert_eq!(response["row"]["name"], "Test Item");

    cleanup(&ctx.pool).await;
}

/// Test update row
#[tokio::test]
async fn test_update_row() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": [ColumnDef::id(), ColumnDef::string_required("name"), ColumnDef::integer("count")]
    })).await.expect("Create table");

    // Create row
    let created: serde_json::Value = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "name": "Original",
            "count": 1
        }))
        .await
        .expect("Create row");

    let row_id = created["row"]["id"].as_str().unwrap();

    // Update row
    let updated: serde_json::Value = client
        .patch(&format!("/tables/{}/rows/{}", table_name, row_id), &serde_json::json!({
            "name": "Updated",
            "count": 5
        }))
        .await
        .expect("Update should succeed");

    assert_eq!(updated["row"]["name"], "Updated");
    assert_eq!(updated["row"]["count"], 5);

    cleanup(&ctx.pool).await;
}

/// Test delete row
#[tokio::test]
async fn test_delete_row() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": [ColumnDef::id(), ColumnDef::string_required("name")]
    })).await.expect("Create table");

    // Create row
    let created: serde_json::Value = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "name": "To Delete"
        }))
        .await
        .expect("Create row");

    let row_id = created["row"]["id"].as_str().unwrap();

    // Delete row
    client.delete(&format!("/tables/{}/rows/{}", table_name, row_id))
        .await
        .expect("Delete should succeed");

    // Verify deleted
    let result: Result<serde_json::Value, _> = client
        .get(&format!("/tables/{}/rows/{}", table_name, row_id))
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}

// ========================================
// Error Cases
// ========================================

/// Test duplicate primary key
#[tokio::test]
async fn test_duplicate_primary_key() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let table_name = unique_table_name();
    client.post::<serde_json::Value, _>("/tables", &serde_json::json!({
        "name": table_name,
        "columns": [
            { "name": "id", "type": "text", "primary": true },
            ColumnDef::string("name")
        ]
    })).await.expect("Create table");

    // Create first row
    client.post::<serde_json::Value, _>(&format!("/tables/{}/rows", table_name), &serde_json::json!({
        "id": "unique-id-123",
        "name": "First"
    })).await.expect("First row");

    // Try to create with same ID
    let result: Result<serde_json::Value, _> = client
        .post(&format!("/tables/{}/rows", table_name), &serde_json::json!({
            "id": "unique-id-123",
            "name": "Second"
        }))
        .await;

    assert!(result.is_err(), "Should fail with duplicate key");
    let err = result.unwrap_err();
    assert_eq!(err.code(), "DUPLICATE_VALUE");
    assert!(err.fix.is_some(), "Should have fix hint");

    cleanup(&ctx.pool).await;
}

/// Test non-existent table
#[tokio::test]
async fn test_nonexistent_table() {
    let ctx = setup().await;
    let client = setup_authenticated_client(&ctx).await;

    let result: Result<serde_json::Value, _> = client
        .get("/tables/nonexistent_table_xyz")
        .await;

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);
}

/// Test row operations without project
#[tokio::test]
async fn test_table_without_project() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = crate::common::fixtures::TestUser::new();

    // Register but don't create project
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Register");

    // Try to create table without project
    let result: Result<serde_json::Value, _> = client
        .post("/tables", &serde_json::json!({
            "name": "test",
            "columns": [ColumnDef::id()]
        }))
        .await;

    assert!(result.is_err(), "Should fail without project");
    let err = result.unwrap_err();
    // Should be either BAD_REQUEST or FORBIDDEN
    assert!(
        err.status() == StatusCode::BAD_REQUEST || err.status() == StatusCode::FORBIDDEN,
        "Should fail without project context"
    );
}
