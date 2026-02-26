use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::auth::AuthContext;
use crate::db::models::{CreatePrompt, PromptResponse, RenderedPrompt, UpdatePrompt};
use crate::rag;
use crate::server::AppState;
use crate::{Error, Result};

pub async fn list_prompts(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<Vec<PromptResponse>>> {
    let project_id = auth.require_project()?;

    let prompts = rag::list_prompts(&state.pool, Some(project_id)).await?;
    Ok(Json(prompts.into_iter().map(PromptResponse::from).collect()))
}

pub async fn create_prompt(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<CreatePrompt>,
) -> Result<Json<PromptResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let prompt = rag::create_prompt(
        &state.pool,
        &input.name,
        &input.content,
        input.description.as_deref(),
        input.metadata,
        Some(project_id),
    )
    .await?;
    Ok(Json(PromptResponse::from(prompt)))
}

pub async fn get_prompt(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
) -> Result<Json<PromptResponse>> {
    let project_id = auth.require_project()?;

    let prompt = rag::get_prompt(&state.pool, &name, Some(project_id)).await?;
    Ok(Json(PromptResponse::from(prompt)))
}

pub async fn update_prompt(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
    Json(input): Json<UpdatePrompt>,
) -> Result<Json<PromptResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let content = input.content.as_ref()
        .ok_or_else(|| Error::BadRequest("Content is required".to_string()))?;

    let prompt = rag::update_prompt(
        &state.pool,
        &name,
        content,
        input.description.as_deref(),
        Some(project_id),
    )
    .await?;
    Ok(Json(PromptResponse::from(prompt)))
}

pub async fn delete_prompt(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    rag::delete_prompt(&state.pool, &name, Some(project_id)).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

#[derive(Debug, Deserialize)]
pub struct RenderRequest {
    pub variables: serde_json::Value,
}

pub async fn render_prompt(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(name): Path<String>,
    Json(request): Json<RenderRequest>,
) -> Result<Json<RenderedPrompt>> {
    let project_id = auth.require_project()?;

    let prompt = rag::get_prompt(&state.pool, &name, Some(project_id)).await?;
    let rendered = rag::render_template(&prompt.content, &request.variables)?;
    let token_count = rag::count_tokens(&rendered);

    Ok(Json(RenderedPrompt {
        name: prompt.name,
        version: prompt.version,
        content: rendered,
        token_count: token_count as i32,
    }))
}
