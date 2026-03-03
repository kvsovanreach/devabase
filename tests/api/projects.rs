//! Projects API tests

use crate::common::{setup, cleanup, client::TestClient, fixtures::{TestUser, unique_project_name}};
use axum::http::StatusCode;

/// Test create project
#[tokio::test]
async fn test_create_project() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register user
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    // Create project
    let project_name = unique_project_name();
    let project: serde_json::Value = client
        .post("/projects", &serde_json::json!({
            "name": project_name
        }))
        .await
        .expect("Project creation should succeed");

    assert_eq!(project["name"], project_name);
    assert!(project.get("id").is_some(), "Should have project ID");
    assert!(project.get("slug").is_some(), "Should have project slug");

    cleanup(&ctx.pool).await;
}

/// Test create project without authentication
#[tokio::test]
async fn test_create_project_unauthenticated() {
    let ctx = setup().await;
    let client = TestClient::new(ctx.router.clone());

    let result: Result<serde_json::Value, _> = client
        .post("/projects", &serde_json::json!({
            "name": "Test Project"
        }))
        .await;

    assert!(result.is_err(), "Should fail without authentication");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::UNAUTHORIZED);

    cleanup(&ctx.pool).await;
}

/// Test list projects
#[tokio::test]
async fn test_list_projects() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register and create projects
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    let project1_name = unique_project_name();
    let project2_name = unique_project_name();

    client.post::<serde_json::Value, _>("/projects", &serde_json::json!({
        "name": project1_name
    })).await.expect("Create project 1");

    client.post::<serde_json::Value, _>("/projects", &serde_json::json!({
        "name": project2_name
    })).await.expect("Create project 2");

    // List projects
    let response: serde_json::Value = client.get("/projects").await
        .expect("List should succeed");

    let projects = response["data"].as_array().expect("Should be array");
    assert!(projects.len() >= 2, "Should have at least 2 projects");

    cleanup(&ctx.pool).await;
}

/// Test get project by ID
#[tokio::test]
async fn test_get_project() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register and create project
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    let project_name = unique_project_name();
    let created: serde_json::Value = client
        .post("/projects", &serde_json::json!({
            "name": project_name
        }))
        .await
        .expect("Create should succeed");

    let project_id = created["id"].as_str().unwrap();

    // Get project
    let project: serde_json::Value = client
        .get(&format!("/projects/{}", project_id))
        .await
        .expect("Get should succeed");

    assert_eq!(project["id"], project_id);
    assert_eq!(project["name"], project_name);

    cleanup(&ctx.pool).await;
}

/// Test update project
#[tokio::test]
async fn test_update_project() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register and create project
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    let project: serde_json::Value = client
        .post("/projects", &serde_json::json!({
            "name": unique_project_name()
        }))
        .await
        .expect("Create should succeed");

    let project_id = project["id"].as_str().unwrap();

    // Update project
    let new_name = unique_project_name();
    let updated: serde_json::Value = client
        .patch(&format!("/projects/{}", project_id), &serde_json::json!({
            "name": new_name,
            "description": "Updated description"
        }))
        .await
        .expect("Update should succeed");

    assert_eq!(updated["name"], new_name);

    cleanup(&ctx.pool).await;
}

/// Test delete project
#[tokio::test]
async fn test_delete_project() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register and create project
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    let project: serde_json::Value = client
        .post("/projects", &serde_json::json!({
            "name": unique_project_name()
        }))
        .await
        .expect("Create should succeed");

    let project_id = project["id"].as_str().unwrap();

    // Delete project
    client.delete(&format!("/projects/{}", project_id))
        .await
        .expect("Delete should succeed");

    // Verify deleted
    let result: Result<serde_json::Value, _> = client
        .get(&format!("/projects/{}", project_id))
        .await;

    assert!(result.is_err(), "Project should be deleted");
    assert_eq!(result.unwrap_err().status(), StatusCode::NOT_FOUND);

    cleanup(&ctx.pool).await;
}
