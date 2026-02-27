use crate::auth::AuthContext;
use crate::db::models::user_table::{
    CreateTableRequest, PaginationMeta, RowQuery, RowResponse, RowsResponse, TableInfo,
    decode_cursor,
};
use crate::rest_gen;
use crate::server::AppState;
use crate::{Error, Result};
use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, ValueRef};
use std::sync::Arc;

/// List all user tables for the current project
pub async fn list_tables(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<Vec<TableInfo>>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let tables = rest_gen::get_user_tables(state.pool.inner(), project_id).await?;
    Ok(Json(tables))
}

/// Get a single table by name
pub async fn get_table(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(table_name): Path<String>,
) -> Result<Json<TableInfo>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    rest_gen::validate_table_name(&table_name)?;

    let table = rest_gen::get_user_table(state.pool.inner(), project_id, &table_name)
        .await?
        .ok_or_else(|| Error::NotFound(format!("Table '{}' not found", table_name)))?;

    Ok(Json(table))
}

/// Create a new user table
pub async fn create_table(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<CreateTableRequest>,
) -> Result<(StatusCode, Json<TableInfo>)> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    // Validate table name
    rest_gen::validate_table_name(&input.name)?;

    // Validate columns
    if input.columns.is_empty() {
        return Err(Error::Validation("At least one column is required".into()));
    }

    // Check for duplicate column names
    let mut seen_columns = std::collections::HashSet::new();
    for col in &input.columns {
        if !seen_columns.insert(col.name.to_lowercase()) {
            return Err(Error::Validation(format!(
                "Duplicate column name: {}",
                col.name
            )));
        }
    }

    // Check that at least one column is primary key or has an id
    let has_primary = input.columns.iter().any(|c| c.primary);
    let has_id = input.columns.iter().any(|c| c.name.to_lowercase() == "id");
    if !has_primary && !has_id {
        return Err(Error::Validation(
            "Table must have either a primary key or an 'id' column".into(),
        ));
    }

    // Check if table already exists
    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_user_tables WHERE project_id = $1 AND table_name = $2",
    )
    .bind(project_id)
    .bind(&input.name)
    .fetch_optional(state.pool.inner())
    .await?;

    if existing.is_some() {
        return Err(Error::Validation(format!(
            "Table '{}' already exists",
            input.name
        )));
    }

    // Build CREATE TABLE SQL
    let create_sql = rest_gen::build_create_table_sql(project_id, &input.name, &input.columns)?;

    // Execute in a transaction
    let mut tx = state.pool.inner().begin().await?;

    // Create the actual table
    sqlx::query(&create_sql).execute(&mut *tx).await.map_err(|e| {
        Error::Validation(format!("Failed to create table: {}", e))
    })?;

    // Register in sys_user_tables
    let schema_def = serde_json::to_value(&input.columns)?;
    sqlx::query(
        r#"
        INSERT INTO sys_user_tables (project_id, table_name, schema_definition, api_enabled)
        VALUES ($1, $2, $3, true)
        "#,
    )
    .bind(project_id)
    .bind(&input.name)
    .bind(&schema_def)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    // Get the created table info
    let table = rest_gen::get_user_table(state.pool.inner(), project_id, &input.name)
        .await?
        .ok_or_else(|| Error::Internal("Failed to retrieve created table".into()))?;

    Ok((StatusCode::CREATED, Json(table)))
}

/// Delete a user table
pub async fn delete_table(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(table_name): Path<String>,
) -> Result<StatusCode> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    rest_gen::validate_table_name(&table_name)?;

    // Check if table exists
    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_user_tables WHERE project_id = $1 AND table_name = $2",
    )
    .bind(project_id)
    .bind(&table_name)
    .fetch_optional(state.pool.inner())
    .await?;

    if existing.is_none() {
        return Err(Error::NotFound(format!("Table '{}' not found", table_name)));
    }

    // Execute in a transaction
    let mut tx = state.pool.inner().begin().await?;

    // Drop the actual table
    let drop_sql = rest_gen::build_drop_table_sql(project_id, &table_name);
    sqlx::query(&drop_sql).execute(&mut *tx).await?;

    // Remove from registry
    sqlx::query(
        "DELETE FROM sys_user_tables WHERE project_id = $1 AND table_name = $2",
    )
    .bind(project_id)
    .bind(&table_name)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

/// List rows from a table with automatic pagination
///
/// Supports multiple pagination styles:
/// - Offset-based: `?limit=50&offset=100`
/// - Page-based: `?page=3&per_page=50`
/// - Cursor-based: `?cursor=<base64_cursor>`
///
/// Query parameters:
/// - `limit` / `per_page`: Number of rows per page (default: 50, max: 1000)
/// - `offset`: Starting position (0-indexed)
/// - `page`: Page number (1-indexed, alternative to offset)
/// - `cursor`: Base64 cursor from previous response
/// - `order`: Sort order (e.g., "created_at:desc,name:asc")
/// - `filter`: Filter conditions (e.g., "status.eq=active&age.gte=18")
/// - `select`: Columns to return (e.g., "id,name,email")
pub async fn list_rows(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(table_name): Path<String>,
    Query(query): Query<RowQuery>,
) -> Result<Json<RowsResponse>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    rest_gen::validate_table_name(&table_name)?;

    // Verify table exists and API is enabled
    let exists: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_user_tables WHERE project_id = $1 AND table_name = $2 AND api_enabled = true",
    )
    .bind(project_id)
    .bind(&table_name)
    .fetch_optional(state.pool.inner())
    .await?;

    if exists.is_none() {
        return Err(Error::NotFound(format!("Table '{}' not found", table_name)));
    }

    // Resolve pagination parameters
    let (limit, mut offset) = query.get_pagination();

    // Handle cursor-based pagination (overrides offset if present)
    if let Some(ref cursor) = query.cursor {
        if let Some(cursor_offset) = decode_cursor(cursor) {
            offset = cursor_offset;
        }
    }

    // Build and execute count query
    let (count_sql, count_params) = rest_gen::build_count_query(
        project_id,
        &table_name,
        query.filter.as_deref(),
    )?;

    let total: i64 = execute_count_query(state.pool.inner(), &count_sql, &count_params).await?;

    // Build and execute select query
    let (select_sql, select_params) = rest_gen::build_select_query(
        project_id,
        &table_name,
        query.select.as_deref(),
        query.filter.as_deref(),
        query.order.as_deref(),
        limit,
        offset,
    )?;

    let rows = execute_select_query(state.pool.inner(), &select_sql, &select_params).await?;
    let count = rows.len() as i32;

    Ok(Json(RowsResponse {
        rows,
        pagination: PaginationMeta::new(total, limit, offset, count),
    }))
}

/// Get a single row by ID
pub async fn get_row(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((table_name, row_id)): Path<(String, String)>,
) -> Result<Json<RowResponse>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    rest_gen::validate_table_name(&table_name)?;

    // Verify table exists
    let exists: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_user_tables WHERE project_id = $1 AND table_name = $2 AND api_enabled = true",
    )
    .bind(project_id)
    .bind(&table_name)
    .fetch_optional(state.pool.inner())
    .await?;

    if exists.is_none() {
        return Err(Error::NotFound(format!("Table '{}' not found", table_name)));
    }

    let (sql, params) = rest_gen::build_select_one_query(project_id, &table_name, &row_id);

    let rows = execute_select_query(state.pool.inner(), &sql, &params).await?;

    if rows.is_empty() {
        return Err(Error::NotFound("Row not found".into()));
    }

    Ok(Json(RowResponse { row: rows[0].clone() }))
}

/// Insert a new row
pub async fn create_row(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(table_name): Path<String>,
    Json(data): Json<Value>,
) -> Result<(StatusCode, Json<RowResponse>)> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    rest_gen::validate_table_name(&table_name)?;

    // Verify table exists
    let exists: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_user_tables WHERE project_id = $1 AND table_name = $2 AND api_enabled = true",
    )
    .bind(project_id)
    .bind(&table_name)
    .fetch_optional(state.pool.inner())
    .await?;

    if exists.is_none() {
        return Err(Error::NotFound(format!("Table '{}' not found", table_name)));
    }

    let (sql, params) = rest_gen::build_insert_query(project_id, &table_name, &data)?;

    let rows = execute_returning_query(state.pool.inner(), &sql, &params).await?;

    if rows.is_empty() {
        return Err(Error::Internal("Insert failed to return row".into()));
    }

    // Emit event
    if let Some(id) = rows[0].get("id") {
        let event = crate::events::Event::new(
            crate::events::EventType::TableRowCreated,
            project_id,
            &id.to_string(),
            serde_json::json!({
                "table": table_name,
                "row": rows[0],
            }),
        );
        let _ = state.events.publish(event);
    }

    Ok((StatusCode::CREATED, Json(RowResponse { row: rows[0].clone() })))
}

/// Update a row
pub async fn update_row(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((table_name, row_id)): Path<(String, String)>,
    Json(data): Json<Value>,
) -> Result<Json<RowResponse>> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    rest_gen::validate_table_name(&table_name)?;

    // Verify table exists
    let exists: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_user_tables WHERE project_id = $1 AND table_name = $2 AND api_enabled = true",
    )
    .bind(project_id)
    .bind(&table_name)
    .fetch_optional(state.pool.inner())
    .await?;

    if exists.is_none() {
        return Err(Error::NotFound(format!("Table '{}' not found", table_name)));
    }

    let (sql, params) = rest_gen::build_update_query(project_id, &table_name, &row_id, &data)?;

    let rows = execute_returning_query(state.pool.inner(), &sql, &params).await?;

    if rows.is_empty() {
        return Err(Error::NotFound("Row not found".into()));
    }

    // Emit event
    let event = crate::events::Event::new(
        crate::events::EventType::TableRowUpdated,
        project_id,
        &row_id,
        serde_json::json!({
            "table": table_name,
            "row": rows[0],
        }),
    );
    let _ = state.events.publish(event);

    Ok(Json(RowResponse { row: rows[0].clone() }))
}

/// Delete a row
pub async fn delete_row(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((table_name, row_id)): Path<(String, String)>,
) -> Result<StatusCode> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    rest_gen::validate_table_name(&table_name)?;

    // Verify table exists
    let exists: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM sys_user_tables WHERE project_id = $1 AND table_name = $2 AND api_enabled = true",
    )
    .bind(project_id)
    .bind(&table_name)
    .fetch_optional(state.pool.inner())
    .await?;

    if exists.is_none() {
        return Err(Error::NotFound(format!("Table '{}' not found", table_name)));
    }

    let (sql, params) = rest_gen::build_delete_query(project_id, &table_name, &row_id);

    let rows = execute_returning_query(state.pool.inner(), &sql, &params).await?;

    if rows.is_empty() {
        return Err(Error::NotFound("Row not found".into()));
    }

    // Emit event
    let event = crate::events::Event::new(
        crate::events::EventType::TableRowDeleted,
        project_id,
        &row_id,
        serde_json::json!({
            "table": table_name,
            "row_id": row_id,
        }),
    );
    let _ = state.events.publish(event);

    Ok(StatusCode::NO_CONTENT)
}

// Helper functions for dynamic query execution

async fn execute_count_query(
    pool: &sqlx::PgPool,
    sql: &str,
    params: &[Value],
) -> Result<i64> {
    let mut query = sqlx::query(sql);
    for param in params {
        query = bind_json_value(query, param);
    }

    let row = query.fetch_one(pool).await?;
    // PostgreSQL COUNT returns bigint, but handle both i32 and i64 for safety
    if let Ok(count) = row.try_get::<i64, _>(0) {
        Ok(count)
    } else if let Ok(count) = row.try_get::<i32, _>(0) {
        Ok(count as i64)
    } else {
        Ok(0)
    }
}

async fn execute_select_query(
    pool: &sqlx::PgPool,
    sql: &str,
    params: &[Value],
) -> Result<Vec<Value>> {
    let mut query = sqlx::query(sql);
    for param in params {
        query = bind_json_value(query, param);
    }

    let rows = query.fetch_all(pool).await?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row_to_json(&row)?);
    }

    Ok(results)
}

async fn execute_returning_query(
    pool: &sqlx::PgPool,
    sql: &str,
    params: &[Value],
) -> Result<Vec<Value>> {
    let mut query = sqlx::query(sql);
    for param in params {
        query = bind_json_value(query, param);
    }

    let rows = query.fetch_all(pool).await?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row_to_json(&row)?);
    }

    Ok(results)
}

fn bind_json_value<'q>(
    query: sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments>,
    value: &'q Value,
) -> sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments> {
    match value {
        Value::Null => query.bind(Option::<String>::None),
        Value::Bool(b) => query.bind(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else if let Some(f) = n.as_f64() {
                query.bind(f)
            } else {
                query.bind(n.to_string())
            }
        }
        Value::String(s) => {
            // Try to parse as UUID first (for project_id and id columns)
            if let Ok(uuid) = uuid::Uuid::parse_str(s) {
                query.bind(uuid)
            } else {
                query.bind(s.as_str())
            }
        }
        Value::Array(_) | Value::Object(_) => query.bind(value.clone()),
    }
}

fn row_to_json(row: &sqlx::postgres::PgRow) -> Result<Value> {
    use sqlx::Column;

    let mut obj = serde_json::Map::new();

    for column in row.columns() {
        let name = column.name();
        // Skip internal columns
        if name == "project_id" {
            continue;
        }

        let value: Value = match row.try_get_raw(name) {
            Ok(raw) => {
                if raw.is_null() {
                    Value::Null
                } else {
                    // Try common types
                    if let Ok(v) = row.try_get::<String, _>(name) {
                        Value::String(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(name) {
                        Value::Number(v.into())
                    } else if let Ok(v) = row.try_get::<i32, _>(name) {
                        Value::Number(v.into())
                    } else if let Ok(v) = row.try_get::<i16, _>(name) {
                        Value::Number(v.into())
                    } else if let Ok(v) = row.try_get::<f64, _>(name) {
                        serde_json::Number::from_f64(v)
                            .map(Value::Number)
                            .unwrap_or(Value::Null)
                    } else if let Ok(v) = row.try_get::<f32, _>(name) {
                        serde_json::Number::from_f64(v as f64)
                            .map(Value::Number)
                            .unwrap_or(Value::Null)
                    } else if let Ok(v) = row.try_get::<bool, _>(name) {
                        Value::Bool(v)
                    } else if let Ok(v) = row.try_get::<uuid::Uuid, _>(name) {
                        Value::String(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(name) {
                        Value::String(v.to_rfc3339())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(name) {
                        Value::String(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(name) {
                        Value::String(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(name) {
                        Value::String(v.to_string())
                    // Array types
                    } else if let Ok(v) = row.try_get::<Vec<String>, _>(name) {
                        Value::Array(v.into_iter().map(Value::String).collect())
                    } else if let Ok(v) = row.try_get::<Vec<i32>, _>(name) {
                        Value::Array(v.into_iter().map(|n| Value::Number(n.into())).collect())
                    } else if let Ok(v) = row.try_get::<Vec<i64>, _>(name) {
                        Value::Array(v.into_iter().map(|n| Value::Number(n.into())).collect())
                    } else if let Ok(v) = row.try_get::<Vec<f64>, _>(name) {
                        Value::Array(v.into_iter().filter_map(|n| serde_json::Number::from_f64(n).map(Value::Number)).collect())
                    } else if let Ok(v) = row.try_get::<Vec<bool>, _>(name) {
                        Value::Array(v.into_iter().map(Value::Bool).collect())
                    } else if let Ok(v) = row.try_get::<Vec<uuid::Uuid>, _>(name) {
                        Value::Array(v.into_iter().map(|u| Value::String(u.to_string())).collect())
                    } else if let Ok(v) = row.try_get::<Value, _>(name) {
                        v
                    } else {
                        // Try to get raw bytes and convert to string as last resort
                        Value::Null
                    }
                }
            }
            Err(_) => Value::Null,
        };

        obj.insert(name.to_string(), value);
    }

    Ok(Value::Object(obj))
}

// ============================================================================
// Export / Import Endpoints
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub format: Option<String>, // "csv" or "json" (default: json)
}

/// Export table data as CSV or JSON
pub async fn export_table(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(table_name): Path<String>,
    Query(query): Query<ExportQuery>,
) -> Result<Response> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    rest_gen::validate_table_name(&table_name)?;

    // Verify table exists
    let table = rest_gen::get_user_table(state.pool.inner(), project_id, &table_name)
        .await?
        .ok_or_else(|| Error::NotFound(format!("Table '{}' not found", table_name)))?;

    // Fetch all rows (with a reasonable limit)
    let (select_sql, select_params) = rest_gen::build_select_query(
        project_id,
        &table_name,
        None,   // all columns
        None,   // no filter
        None,   // default order
        10000,  // max 10k rows for export
        0,
    )?;

    let rows = execute_select_query(state.pool.inner(), &select_sql, &select_params).await?;

    let format = query.format.as_deref().unwrap_or("json");

    match format {
        "csv" => {
            // Build CSV
            let columns: Vec<String> = table.columns.iter()
                .map(|c| c.name.clone())
                .collect();

            let mut csv_content = columns.join(",") + "\n";

            for row in &rows {
                let row_obj = match row.as_object() {
                    Some(obj) => obj,
                    None => continue, // Skip non-object rows
                };
                let values: Vec<String> = columns.iter()
                    .map(|col| {
                        match row_obj.get(col) {
                            Some(Value::Null) | None => String::new(),
                            Some(Value::String(s)) => {
                                // Escape quotes and wrap in quotes if contains comma
                                if s.contains(',') || s.contains('"') || s.contains('\n') {
                                    format!("\"{}\"", s.replace('"', "\"\""))
                                } else {
                                    s.clone()
                                }
                            }
                            Some(v) => v.to_string().trim_matches('"').to_string(),
                        }
                    })
                    .collect();
                csv_content.push_str(&values.join(","));
                csv_content.push('\n');
            }

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
                .header(
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{}.csv\"", table_name),
                )
                .body(Body::from(csv_content))
                .map_err(|e| Error::Internal(format!("Failed to build response: {}", e)))
        }
        _ => {
            // JSON format
            let json_content = serde_json::to_string_pretty(&rows)?;

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json")
                .header(
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{}.json\"", table_name),
                )
                .body(Body::from(json_content))
                .map_err(|e| Error::Internal(format!("Failed to build response: {}", e)))
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub total: usize,
    pub imported: usize,
    pub errors: Vec<ImportError>,
}

#[derive(Debug, Serialize)]
pub struct ImportError {
    pub row: usize,
    pub message: String,
}

/// Import data from CSV or JSON file
pub async fn import_table(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(table_name): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ImportResult>> {
    let project_id = auth.require_project()?;
    auth.require_write()?;

    rest_gen::validate_table_name(&table_name)?;

    // Verify table exists
    let table = rest_gen::get_user_table(state.pool.inner(), project_id, &table_name)
        .await?
        .ok_or_else(|| Error::NotFound(format!("Table '{}' not found", table_name)))?;

    // Get file from multipart
    let mut file_content = Vec::new();
    let mut file_name = String::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        Error::BadRequest(format!("Failed to read multipart field: {}", e))
    })? {
        if field.name() == Some("file") {
            file_name = field.file_name().unwrap_or("data").to_string();
            file_content = field.bytes().await.map_err(|e| {
                Error::BadRequest(format!("Failed to read file: {}", e))
            })?.to_vec();
            break;
        }
    }

    if file_content.is_empty() {
        return Err(Error::BadRequest("No file provided".to_string()));
    }

    let content = String::from_utf8(file_content)
        .map_err(|_| Error::BadRequest("File must be valid UTF-8".to_string()))?;

    // Detect format and parse
    let rows: Vec<Value> = if file_name.ends_with(".csv") || content.starts_with(|c: char| c.is_alphabetic()) {
        // Parse CSV
        parse_csv(&content, &table)?
    } else {
        // Parse JSON
        serde_json::from_str(&content)
            .map_err(|e| Error::BadRequest(format!("Invalid JSON: {}", e)))?
    };

    let total = rows.len();
    let mut imported = 0;
    let mut errors = Vec::new();

    // Insert rows in batches
    for (i, row) in rows.iter().enumerate() {
        match insert_row_for_import(&state, project_id, &table_name, row).await {
            Ok(_) => imported += 1,
            Err(e) => {
                errors.push(ImportError {
                    row: i + 1,
                    message: e.to_string(),
                });
                // Continue with other rows
            }
        }
    }

    Ok(Json(ImportResult {
        total,
        imported,
        errors,
    }))
}

fn parse_csv(content: &str, table: &TableInfo) -> Result<Vec<Value>> {
    let mut lines = content.lines();

    // Parse header
    let header_line = lines.next()
        .ok_or_else(|| Error::BadRequest("CSV file is empty".to_string()))?;

    let headers: Vec<&str> = header_line.split(',')
        .map(|s| s.trim().trim_matches('"'))
        .collect();

    // Validate headers match table columns
    let column_names: Vec<&str> = table.columns.iter()
        .map(|c| c.name.as_str())
        .collect();

    let mut rows = Vec::new();

    for line in lines {
        if line.trim().is_empty() {
            continue;
        }

        let values = parse_csv_line(line);

        if values.len() != headers.len() {
            continue; // Skip malformed rows
        }

        let mut obj = serde_json::Map::new();

        for (i, value) in values.iter().enumerate() {
            let header = headers[i];
            // Only include columns that exist in the table
            if column_names.contains(&header) {
                let json_value = if value.is_empty() {
                    Value::Null
                } else {
                    // Try to parse as number, bool, or keep as string
                    if let Ok(n) = value.parse::<i64>() {
                        Value::Number(n.into())
                    } else if let Ok(f) = value.parse::<f64>() {
                        serde_json::Number::from_f64(f)
                            .map(Value::Number)
                            .unwrap_or(Value::String(value.to_string()))
                    } else if value == "true" {
                        Value::Bool(true)
                    } else if value == "false" {
                        Value::Bool(false)
                    } else {
                        Value::String(value.to_string())
                    }
                };
                obj.insert(header.to_string(), json_value);
            }
        }

        rows.push(Value::Object(obj));
    }

    Ok(rows)
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes && chars.peek() == Some(&'"') {
                    // Escaped quote
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = !in_quotes;
                }
            }
            ',' if !in_quotes => {
                values.push(current.trim().to_string());
                current = String::new();
            }
            _ => {
                current.push(c);
            }
        }
    }

    values.push(current.trim().to_string());
    values
}

async fn insert_row_for_import(
    state: &Arc<AppState>,
    project_id: uuid::Uuid,
    table_name: &str,
    data: &Value,
) -> Result<()> {
    let (sql, params) = rest_gen::build_insert_query(project_id, table_name, data)?;

    let mut query = sqlx::query(&sql);
    for param in &params {
        query = bind_json_value(query, param);
    }

    query.execute(state.pool.inner()).await?;
    Ok(())
}
