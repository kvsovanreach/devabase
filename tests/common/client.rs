//! HTTP test client for API testing using Axum's test utilities

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
    response::Response,
    Router,
};
use serde::{de::DeserializeOwned, Serialize};
use tower::ServiceExt;

/// Test HTTP client with authentication support
pub struct TestClient {
    router: Router,
    token: Option<String>,
    project_id: Option<String>,
}

/// Error from test client
#[derive(Debug)]
pub struct TestError {
    pub status: StatusCode,
    pub code: String,
    pub message: String,
    pub fix: Option<String>,
}

impl TestError {
    pub fn status(&self) -> StatusCode {
        self.status
    }

    pub fn code(&self) -> &str {
        &self.code
    }
}

impl std::fmt::Display for TestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}: {}", self.status, self.code, self.message)
    }
}

impl std::error::Error for TestError {}

pub type TestResult<T> = Result<T, TestError>;

impl TestClient {
    /// Create a new test client from router
    pub fn new(router: Router) -> Self {
        Self {
            router,
            token: None,
            project_id: None,
        }
    }

    /// Set authentication token
    pub fn with_token(mut self, token: &str) -> Self {
        self.token = Some(token.to_string());
        self
    }

    /// Set project ID
    pub fn with_project(mut self, project_id: &str) -> Self {
        self.project_id = Some(project_id.to_string());
        self
    }

    /// Build request with common headers
    fn build_request(&self, method: Method, path: &str, body: Option<String>) -> Request<Body> {
        let uri = format!("/v1{}", path);
        let mut builder = Request::builder()
            .method(method)
            .uri(&uri)
            .header(header::CONTENT_TYPE, "application/json");

        if let Some(token) = &self.token {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {}", token));
        }

        if let Some(project_id) = &self.project_id {
            builder = builder.header("X-Project-ID", project_id);
        }

        let body = body.map(Body::from).unwrap_or(Body::empty());
        builder.body(body).expect("Failed to build request")
    }

    /// Execute request and get response
    async fn execute(&self, request: Request<Body>) -> Response {
        self.router
            .clone()
            .oneshot(request)
            .await
            .expect("Failed to execute request")
    }

    /// Parse response body as JSON
    async fn parse_response<T: DeserializeOwned>(&self, response: Response) -> TestResult<T> {
        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("Failed to read body");

        if status.is_success() {
            let value: T = serde_json::from_slice(&body)
                .expect("Failed to parse success response");
            Ok(value)
        } else {
            #[derive(serde::Deserialize, Default)]
            struct ErrorBody {
                error: Option<String>,
                message: Option<String>,
                error_code: Option<String>,
                fix: Option<String>,
            }

            let error_body: ErrorBody = serde_json::from_slice(&body).unwrap_or_default();

            Err(TestError {
                status,
                code: error_body.error_code.unwrap_or_else(|| "UNKNOWN".to_string()),
                message: error_body.error.or(error_body.message).unwrap_or_else(|| "Unknown error".to_string()),
                fix: error_body.fix,
            })
        }
    }

    // ========================================
    // HTTP Methods
    // ========================================

    /// GET request
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> TestResult<T> {
        let request = self.build_request(Method::GET, path, None);
        let response = self.execute(request).await;
        self.parse_response(response).await
    }

    /// POST request
    pub async fn post<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> TestResult<T> {
        let body_str = serde_json::to_string(body).expect("Failed to serialize body");
        let request = self.build_request(Method::POST, path, Some(body_str));
        let response = self.execute(request).await;
        self.parse_response(response).await
    }

    /// POST request without response body
    pub async fn post_empty<B: Serialize>(&self, path: &str, body: &B) -> TestResult<()> {
        let body_str = serde_json::to_string(body).expect("Failed to serialize body");
        let request = self.build_request(Method::POST, path, Some(body_str));
        let response = self.execute(request).await;

        if response.status().is_success() {
            Ok(())
        } else {
            let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .expect("Failed to read body");

            #[derive(serde::Deserialize, Default)]
            struct ErrorBody {
                error: Option<String>,
                message: Option<String>,
                error_code: Option<String>,
                fix: Option<String>,
            }

            let error_body: ErrorBody = serde_json::from_slice(&body).unwrap_or_default();

            Err(TestError {
                status: StatusCode::from_u16(400).unwrap(),
                code: error_body.error_code.unwrap_or_else(|| "UNKNOWN".to_string()),
                message: error_body.error.or(error_body.message).unwrap_or_else(|| "Unknown error".to_string()),
                fix: error_body.fix,
            })
        }
    }

    /// PATCH request
    pub async fn patch<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> TestResult<T> {
        let body_str = serde_json::to_string(body).expect("Failed to serialize body");
        let request = self.build_request(Method::PATCH, path, Some(body_str));
        let response = self.execute(request).await;
        self.parse_response(response).await
    }

    /// DELETE request
    pub async fn delete(&self, path: &str) -> TestResult<()> {
        let request = self.build_request(Method::DELETE, path, None);
        let response = self.execute(request).await;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .expect("Failed to read body");

            #[derive(serde::Deserialize, Default)]
            struct ErrorBody {
                error: Option<String>,
                message: Option<String>,
                error_code: Option<String>,
                fix: Option<String>,
            }

            let error_body: ErrorBody = serde_json::from_slice(&body).unwrap_or_default();

            Err(TestError {
                status,
                code: error_body.error_code.unwrap_or_else(|| "UNKNOWN".to_string()),
                message: error_body.error.or(error_body.message).unwrap_or_else(|| "Unknown error".to_string()),
                fix: error_body.fix,
            })
        }
    }

    // ========================================
    // Auth Helpers
    // ========================================

    /// Register a new user and return the token
    pub async fn register(&mut self, email: &str, password: &str, name: &str) -> TestResult<AuthResponse> {
        let response: AuthResponse = self.post("/auth/register", &serde_json::json!({
            "email": email,
            "password": password,
            "name": name
        })).await?;

        self.token = Some(response.token.clone());
        Ok(response)
    }

    /// Login and return the token
    pub async fn login(&mut self, email: &str, password: &str) -> TestResult<AuthResponse> {
        let response: AuthResponse = self.post("/auth/login", &serde_json::json!({
            "email": email,
            "password": password
        })).await?;

        self.token = Some(response.token.clone());
        Ok(response)
    }

    /// Create a project and set it as current
    pub async fn create_project(&mut self, name: &str) -> TestResult<Project> {
        let project: Project = self.post("/projects", &serde_json::json!({
            "name": name
        })).await?;

        self.project_id = Some(project.id.clone());
        Ok(project)
    }

    /// Get the current token
    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    /// Get the current project ID
    pub fn project_id(&self) -> Option<&str> {
        self.project_id.as_deref()
    }
}

// ========================================
// Response Types
// ========================================

#[derive(Debug, serde::Deserialize)]
pub struct AuthResponse {
    pub user: User,
    pub token: String,
    pub refresh_token: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, serde::Deserialize)]
pub struct Pagination {
    pub total: i64,
    pub limit: i32,
    pub offset: i32,
    pub page: i32,
    pub total_pages: i32,
}
