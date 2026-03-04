//! HTTP client for making API requests

use crate::config::Config;
use reqwest::{Client, Response, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

pub struct ApiClient {
    client: Client,
    base_url: String,
    token: Option<String>,
    project_id: Option<String>,
}

impl ApiClient {
    pub fn new(config: &Config) -> Self {
        Self {
            client: Client::new(),
            base_url: config.api_base(),
            token: config.token.clone(),
            project_id: config.current_project.clone(),
        }
    }

    /// Make a GET request
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, ApiError> {
        let response = self.request(reqwest::Method::GET, path, None::<()>).await?;
        self.handle_response(response).await
    }

    /// Make a GET request with query parameters
    pub async fn get_with_params<T: DeserializeOwned>(
        &self,
        path: &str,
        params: &[(&str, &str)],
    ) -> Result<T, ApiError> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.get(&url);

        if let Some(ref token) = self.token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }
        if let Some(ref project_id) = self.project_id {
            req = req.header("X-Project-ID", project_id);
        }

        req = req.query(params);

        let response = req.send().await.map_err(|e| ApiError::Request(e.to_string()))?;
        self.handle_response(response).await
    }

    /// Make a POST request
    pub async fn post<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: B,
    ) -> Result<T, ApiError> {
        let response = self.request(reqwest::Method::POST, path, Some(body)).await?;
        self.handle_response(response).await
    }

    /// Make a POST request without expecting a response body
    #[allow(dead_code)]
    pub async fn post_empty<B: Serialize>(&self, path: &str, body: B) -> Result<(), ApiError> {
        let response = self.request(reqwest::Method::POST, path, Some(body)).await?;
        self.handle_empty_response(response).await
    }

    /// Make a DELETE request
    pub async fn delete(&self, path: &str) -> Result<(), ApiError> {
        let response = self.request(reqwest::Method::DELETE, path, None::<()>).await?;
        self.handle_empty_response(response).await
    }

    /// Make a PATCH request
    #[allow(dead_code)]
    pub async fn patch<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: B,
    ) -> Result<T, ApiError> {
        let response = self.request(reqwest::Method::PATCH, path, Some(body)).await?;
        self.handle_response(response).await
    }

    /// Upload a file
    pub async fn upload_file<T: DeserializeOwned>(
        &self,
        path: &str,
        file_path: &Path,
        collection: &str,
    ) -> Result<T, ApiError> {
        let url = format!("{}{}", self.base_url, path);

        // Read file
        let mut file = File::open(file_path)
            .await
            .map_err(|e| ApiError::File(e.to_string()))?;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .await
            .map_err(|e| ApiError::File(e.to_string()))?;

        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");

        // Guess content type
        let content_type = mime_guess::from_path(file_path)
            .first_or_octet_stream()
            .to_string();

        let file_part = reqwest::multipart::Part::bytes(buffer)
            .file_name(file_name.to_string())
            .mime_str(&content_type)
            .map_err(|e| ApiError::Request(e.to_string()))?;

        let form = reqwest::multipart::Form::new()
            .text("collection", collection.to_string())
            .part("file", file_part);

        let mut req = self.client.post(&url).multipart(form);

        if let Some(ref token) = self.token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }
        if let Some(ref project_id) = self.project_id {
            req = req.header("X-Project-ID", project_id);
        }

        let response = req.send().await.map_err(|e| ApiError::Request(e.to_string()))?;
        self.handle_response(response).await
    }

    /// Download raw content (for export)
    pub async fn download(&self, path: &str) -> Result<String, ApiError> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.get(&url);

        if let Some(ref token) = self.token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }
        if let Some(ref project_id) = self.project_id {
            req = req.header("X-Project-ID", project_id);
        }

        let response = req.send().await.map_err(|e| ApiError::Request(e.to_string()))?;

        if !response.status().is_success() {
            return Err(self.parse_error(response).await);
        }

        response.text().await.map_err(|e| ApiError::Response(e.to_string()))
    }

    /// Internal request builder
    async fn request<B: Serialize>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<B>,
    ) -> Result<Response, ApiError> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.request(method, &url);

        if let Some(ref token) = self.token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }
        if let Some(ref project_id) = self.project_id {
            req = req.header("X-Project-ID", project_id);
        }

        if let Some(b) = body {
            req = req.json(&b);
        }

        req.send().await.map_err(|e| ApiError::Request(e.to_string()))
    }

    /// Handle JSON response
    async fn handle_response<T: DeserializeOwned>(&self, response: Response) -> Result<T, ApiError> {
        if !response.status().is_success() {
            return Err(self.parse_error(response).await);
        }

        response
            .json()
            .await
            .map_err(|e| ApiError::Response(e.to_string()))
    }

    /// Handle empty response
    async fn handle_empty_response(&self, response: Response) -> Result<(), ApiError> {
        if !response.status().is_success() {
            return Err(self.parse_error(response).await);
        }
        Ok(())
    }

    /// Parse error response
    async fn parse_error(&self, response: Response) -> ApiError {
        let status = response.status();

        // Try to get error message from body
        if let Ok(body) = response.json::<HashMap<String, serde_json::Value>>().await {
            if let Some(msg) = body.get("error").or(body.get("message")) {
                return ApiError::Api(status, msg.to_string().trim_matches('"').to_string());
            }
        }

        match status {
            StatusCode::UNAUTHORIZED => ApiError::Unauthorized,
            StatusCode::FORBIDDEN => ApiError::Forbidden,
            StatusCode::NOT_FOUND => ApiError::NotFound,
            _ => ApiError::Api(status, format!("Request failed with status {}", status)),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Request failed: {0}")]
    Request(String),

    #[error("Failed to parse response: {0}")]
    Response(String),

    #[error("File error: {0}")]
    File(String),

    #[error("API error ({0}): {1}")]
    Api(StatusCode, String),

    #[error("Not authenticated. Run 'deva login' first.")]
    Unauthorized,

    #[error("Access denied")]
    Forbidden,

    #[error("Not found")]
    NotFound,

    #[error("No project selected. Run 'deva project use <id>' first.")]
    #[allow(dead_code)]
    NoProject,
}
