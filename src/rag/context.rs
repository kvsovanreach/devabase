use crate::db::models::Prompt;
use crate::db::DbPool;
use crate::{Error, Result};
use serde::Serialize;
use std::sync::OnceLock;
use tiktoken_rs::CoreBPE;
use uuid::Uuid;

/// Global tokenizer instance (lazy-loaded)
static TOKENIZER: OnceLock<CoreBPE> = OnceLock::new();

/// Get or initialize the tokenizer
fn get_tokenizer() -> &'static CoreBPE {
    TOKENIZER.get_or_init(|| {
        // Use cl100k_base encoding (used by GPT-4, GPT-3.5-turbo, text-embedding-ada-002)
        tiktoken_rs::cl100k_base().expect("Failed to load cl100k_base tokenizer")
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct AssembledContext {
    pub prompt: String,
    pub context: String,
    pub full_text: String,
    pub token_count: usize,
    pub sources: Vec<SourceReference>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceReference {
    pub document_id: Uuid,
    pub chunk_ids: Vec<Uuid>,
    pub filename: Option<String>,
}

pub fn render_template(template: &str, variables: &serde_json::Value) -> Result<String> {
    let mut result = template.to_string();

    if let serde_json::Value::Object(map) = variables {
        for (key, value) in map {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Null => String::new(),
                other => other.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
    }

    // Check for any remaining unresolved variables
    if result.contains("{{") && result.contains("}}") {
        // Extract unresolved variable names for error message
        let mut unresolved = Vec::new();
        let mut remaining = result.as_str();
        while let Some(start) = remaining.find("{{") {
            if let Some(end) = remaining[start..].find("}}") {
                let var_name = &remaining[start + 2..start + end];
                unresolved.push(var_name.to_string());
                remaining = &remaining[start + end + 2..];
            } else {
                break;
            }
        }

        if !unresolved.is_empty() {
            return Err(Error::BadRequest(format!(
                "Unresolved template variables: {}",
                unresolved.join(", ")
            )));
        }
    }

    Ok(result)
}

/// Count tokens in text using tiktoken (cl100k_base encoding)
/// This is the same encoding used by GPT-4, GPT-3.5-turbo, and text-embedding models
pub fn count_tokens(text: &str) -> usize {
    let tokenizer = get_tokenizer();
    tokenizer.encode_with_special_tokens(text).len()
}

/// Count tokens for a specific model (falls back to cl100k_base if unknown)
pub fn count_tokens_for_model(text: &str, model: &str) -> usize {
    // Try to get model-specific tokenizer
    match tiktoken_rs::get_bpe_from_model(model) {
        Ok(bpe) => bpe.encode_with_special_tokens(text).len(),
        Err(_) => {
            // Fall back to cl100k_base for unknown models
            count_tokens(text)
        }
    }
}

/// Estimate approximate token count (fast, less accurate)
/// Use this for rough estimates when performance matters more than accuracy
pub fn estimate_tokens(text: &str) -> usize {
    // Approximation: ~4 characters per token for English
    // ~3 for code, ~5 for languages with longer words
    text.len() / 4
}

/// Fit texts into a context window with a token limit
/// Returns the combined text and actual token count
pub fn fit_to_context_window(
    texts: &[String],
    max_tokens: usize,
    separator: &str,
) -> (String, usize) {
    let tokenizer = get_tokenizer();
    let mut result = String::new();
    let mut total_tokens = 0;
    let sep_tokens = tokenizer.encode_with_special_tokens(separator).len();

    for text in texts {
        let text_tokens = tokenizer.encode_with_special_tokens(text).len();

        if total_tokens + text_tokens + sep_tokens > max_tokens {
            break;
        }

        if !result.is_empty() {
            result.push_str(separator);
            total_tokens += sep_tokens;
        }

        result.push_str(text);
        total_tokens += text_tokens;
    }

    (result, total_tokens)
}

/// Fit texts into context window using fast estimation (less accurate but faster)
pub fn fit_to_context_window_fast(
    texts: &[String],
    max_tokens: usize,
    separator: &str,
) -> (String, usize) {
    let mut result = String::new();
    let mut total_tokens = 0;
    let sep_tokens = separator.len() / 4;

    for text in texts {
        let text_tokens = text.len() / 4;

        if total_tokens + text_tokens + sep_tokens > max_tokens {
            break;
        }

        if !result.is_empty() {
            result.push_str(separator);
            total_tokens += sep_tokens;
        }

        result.push_str(text);
        total_tokens += text_tokens;
    }

    (result, total_tokens)
}

// Prompt management functions

pub async fn create_prompt(
    pool: &DbPool,
    name: &str,
    content: &str,
    description: Option<&str>,
    metadata: Option<serde_json::Value>,
    project_id: Option<Uuid>,
) -> Result<Prompt> {
    let id = Uuid::new_v4();

    let prompt: Prompt = sqlx::query_as(
        r#"
        INSERT INTO sys_prompts (id, name, content, description, metadata, project_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(content)
    .bind(description)
    .bind(&metadata)
    .bind(project_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("prompts_name_version_key") {
                return Error::Conflict(format!("Prompt '{}' version 1 already exists", name));
            }
        }
        Error::Database(e)
    })?;

    Ok(prompt)
}

pub async fn get_prompt(pool: &DbPool, name: &str, project_id: Option<Uuid>) -> Result<Prompt> {
    let prompt: Option<Prompt> = if let Some(pid) = project_id {
        sqlx::query_as(
            "SELECT * FROM sys_prompts WHERE name = $1 AND project_id = $2 AND is_active = true ORDER BY version DESC LIMIT 1",
        )
        .bind(name)
        .bind(pid)
        .fetch_optional(pool.inner())
        .await?
    } else {
        sqlx::query_as(
            "SELECT * FROM sys_prompts WHERE name = $1 AND project_id IS NULL AND is_active = true ORDER BY version DESC LIMIT 1",
        )
        .bind(name)
        .fetch_optional(pool.inner())
        .await?
    };

    prompt.ok_or_else(|| Error::NotFound(format!("Prompt '{}' not found", name)))
}

pub async fn get_prompt_version(pool: &DbPool, name: &str, version: i32) -> Result<Prompt> {
    let prompt: Prompt =
        sqlx::query_as("SELECT * FROM sys_prompts WHERE name = $1 AND version = $2")
            .bind(name)
            .bind(version)
            .fetch_optional(pool.inner())
            .await?
            .ok_or_else(|| {
                Error::NotFound(format!("Prompt '{}' version {} not found", name, version))
            })?;

    Ok(prompt)
}

pub async fn update_prompt(
    pool: &DbPool,
    name: &str,
    content: &str,
    description: Option<&str>,
    project_id: Option<Uuid>,
) -> Result<Prompt> {
    // Get current version
    let current = get_prompt(pool, name, project_id).await?;

    // Deactivate current version (scoped to project)
    if let Some(pid) = project_id {
        sqlx::query("UPDATE sys_prompts SET is_active = false WHERE name = $1 AND project_id = $2")
            .bind(name)
            .bind(pid)
            .execute(pool.inner())
            .await?;
    } else {
        sqlx::query("UPDATE sys_prompts SET is_active = false WHERE name = $1 AND project_id IS NULL")
            .bind(name)
            .execute(pool.inner())
            .await?;
    }

    // Create new version
    let id = Uuid::new_v4();
    let new_version = current.version + 1;

    let prompt: Prompt = sqlx::query_as(
        r#"
        INSERT INTO sys_prompts (id, name, version, content, description, metadata, is_active, project_id)
        VALUES ($1, $2, $3, $4, $5, $6, true, $7)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(new_version)
    .bind(content)
    .bind(description.or(current.description.as_deref()))
    .bind(&current.metadata)
    .bind(project_id)
    .fetch_one(pool.inner())
    .await?;

    // Log history
    sqlx::query(
        r#"
        INSERT INTO sys_prompt_history (prompt_id, version, content)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(current.id)
    .bind(current.version)
    .bind(&current.content)
    .execute(pool.inner())
    .await?;

    Ok(prompt)
}

pub async fn list_prompts(pool: &DbPool, project_id: Option<Uuid>) -> Result<Vec<Prompt>> {
    let prompts: Vec<Prompt> = if let Some(pid) = project_id {
        sqlx::query_as(
            "SELECT * FROM sys_prompts WHERE project_id = $1 AND is_active = true ORDER BY name ASC",
        )
        .bind(pid)
        .fetch_all(pool.inner())
        .await?
    } else {
        sqlx::query_as(
            "SELECT * FROM sys_prompts WHERE project_id IS NULL AND is_active = true ORDER BY name ASC",
        )
        .fetch_all(pool.inner())
        .await?
    };

    Ok(prompts)
}

pub async fn delete_prompt(pool: &DbPool, name: &str, project_id: Option<Uuid>) -> Result<()> {
    let result = if let Some(pid) = project_id {
        sqlx::query("DELETE FROM sys_prompts WHERE name = $1 AND project_id = $2")
            .bind(name)
            .bind(pid)
            .execute(pool.inner())
            .await?
    } else {
        sqlx::query("DELETE FROM sys_prompts WHERE name = $1 AND project_id IS NULL")
            .bind(name)
            .execute(pool.inner())
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(Error::NotFound(format!("Prompt '{}' not found", name)));
    }

    Ok(())
}
