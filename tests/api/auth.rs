//! Authentication API tests

use crate::common::{setup, cleanup, client::TestClient, fixtures::TestUser};
use axum::http::StatusCode;

/// Test user registration
#[tokio::test]
async fn test_register_success() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    let response = client.register(&user.email, &user.password, &user.name).await;
    assert!(response.is_ok(), "Registration should succeed: {:?}", response.err());

    let auth = response.unwrap();
    assert!(!auth.token.is_empty(), "Should return token");
    assert_eq!(auth.user.email, user.email);
    assert_eq!(auth.user.name, user.name);

    cleanup(&ctx.pool).await;
}

/// Test registration with invalid email
#[tokio::test]
async fn test_register_invalid_email() {
    let ctx = setup().await;
    let client = TestClient::new(ctx.router.clone());

    let result: Result<serde_json::Value, _> = client
        .post("/auth/register", &serde_json::json!({
            "email": "not-an-email",
            "password": "TestPass123!",
            "name": "Test User"
        }))
        .await;

    assert!(result.is_err(), "Should fail with invalid email");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::BAD_REQUEST);

    cleanup(&ctx.pool).await;
}

/// Test registration with weak password
#[tokio::test]
async fn test_register_weak_password() {
    let ctx = setup().await;
    let client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    let result: Result<serde_json::Value, _> = client
        .post("/auth/register", &serde_json::json!({
            "email": user.email,
            "password": "123",
            "name": user.name
        }))
        .await;

    assert!(result.is_err(), "Should fail with weak password");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::BAD_REQUEST);

    cleanup(&ctx.pool).await;
}

/// Test registration with duplicate email
#[tokio::test]
async fn test_register_duplicate_email() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register first user
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("First registration should succeed");

    // Try to register again with same email
    let client2 = TestClient::new(ctx.router.clone());
    let result: Result<serde_json::Value, _> = client2
        .post("/auth/register", &serde_json::json!({
            "email": user.email,
            "password": "DifferentPass123!",
            "name": "Different Name"
        }))
        .await;

    assert!(result.is_err(), "Should fail with duplicate email");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::CONFLICT);

    cleanup(&ctx.pool).await;
}

/// Test login with valid credentials
#[tokio::test]
async fn test_login_success() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register user first
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    // Login with new client
    let mut client2 = TestClient::new(ctx.router.clone());
    let response = client2.login(&user.email, &user.password).await;

    assert!(response.is_ok(), "Login should succeed: {:?}", response.err());
    let auth = response.unwrap();
    assert!(!auth.token.is_empty());

    cleanup(&ctx.pool).await;
}

/// Test login with invalid credentials
#[tokio::test]
async fn test_login_invalid_credentials() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register user first
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    // Try login with wrong password
    let mut client2 = TestClient::new(ctx.router.clone());
    let result = client2.login(&user.email, "WrongPassword123!").await;

    assert!(result.is_err(), "Should fail with wrong password");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::UNAUTHORIZED);

    cleanup(&ctx.pool).await;
}

/// Test login with non-existent user
#[tokio::test]
async fn test_login_nonexistent_user() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());

    let result = client.login("nonexistent@example.com", "SomePassword123!").await;

    assert!(result.is_err(), "Should fail with non-existent user");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::UNAUTHORIZED);

    cleanup(&ctx.pool).await;
}

/// Test get current user (me)
#[tokio::test]
async fn test_get_me() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register and get token
    let auth = client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    // Get current user
    let me: serde_json::Value = client.get("/auth/me").await
        .expect("Should get current user");

    assert_eq!(me["email"], user.email);
    assert_eq!(me["name"], user.name);
    assert_eq!(me["id"], auth.user.id);

    cleanup(&ctx.pool).await;
}

/// Test get me without authentication
#[tokio::test]
async fn test_get_me_unauthenticated() {
    let ctx = setup().await;
    let client = TestClient::new(ctx.router.clone());

    let result: Result<serde_json::Value, _> = client.get("/auth/me").await;

    assert!(result.is_err(), "Should fail without authentication");
    let err = result.unwrap_err();
    assert_eq!(err.status(), StatusCode::UNAUTHORIZED);

    cleanup(&ctx.pool).await;
}

/// Test update user profile
#[tokio::test]
async fn test_update_me() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    // Update name
    let updated: serde_json::Value = client
        .patch("/auth/me", &serde_json::json!({
            "name": "Updated Name"
        }))
        .await
        .expect("Update should succeed");

    assert_eq!(updated["name"], "Updated Name");

    cleanup(&ctx.pool).await;
}

/// Test token refresh
#[tokio::test]
async fn test_refresh_token() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register
    let auth = client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    // Refresh token
    let refreshed: serde_json::Value = client
        .post("/auth/refresh", &serde_json::json!({
            "refresh_token": auth.refresh_token
        }))
        .await
        .expect("Refresh should succeed");

    assert!(refreshed.get("token").is_some(), "Should return new token");
    assert!(refreshed.get("refresh_token").is_some(), "Should return new refresh token");

    cleanup(&ctx.pool).await;
}

/// Test logout
#[tokio::test]
async fn test_logout() {
    let ctx = setup().await;
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Registration should succeed");

    // Logout
    let result = client.post_empty("/auth/logout", &serde_json::json!({})).await;
    assert!(result.is_ok(), "Logout should succeed: {:?}", result.err());

    cleanup(&ctx.pool).await;
}
