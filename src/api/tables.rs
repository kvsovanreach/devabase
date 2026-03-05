use crate::api::pagination::{PaginatedResponse, PaginationQuery};
use crate::auth::AuthContext;
use crate::db::models::user_table::{
    CreateTableRequest, PaginationMeta, RowQuery, RowResponse, RowsResponse, TableColumnInfo,
    TableInfo, decode_cursor,
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
use uuid::Uuid;

/// Get table info with schema cache — avoids repeated information_schema lookups.
/// Falls back to database on cache miss. Caches for 60 seconds.
async fn get_table_info_cached(
    state: &AppState,
    project_id: Uuid,
    table_name: &str,
) -> Result<TableInfo> {
    // Check cache first
    if let Some(info) = state.table_schema_cache.get(project_id, table_name).await {
        return Ok(info);
    }

    // Cache miss — fetch from database
    let info = rest_gen::get_user_table(state.pool.inner(), project_id, table_name)
        .await?
        .ok_or_else(|| Error::NotFound(format!("Table '{}' not found", table_name)))?;

    // Store in cache
    state.table_schema_cache.set(project_id, table_name, info.clone()).await;

    Ok(info)
}

/// List all user tables for the current project with pagination
pub async fn list_tables(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<PaginatedResponse<TableInfo>>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let (limit, offset) = query.get_pagination();
    let (tables, total) = rest_gen::get_user_tables_paginated(state.pool.inner(), project_id, limit, offset).await?;
    Ok(Json(PaginatedResponse::new(tables, total, limit, offset)))
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

    let table = get_table_info_cached(&state, project_id, &table_name).await?;

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

    // Create the table and indexes (semicolon-separated statements)
    for stmt in create_sql.split(';') {
        let stmt = stmt.trim();
        if stmt.is_empty() {
            continue;
        }
        sqlx::query(stmt).execute(&mut *tx).await.map_err(|e| {
            Error::Validation(format!("Failed to create table: {}", e))
        })?;
    }

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

    // Fetch and cache the created table info
    let table = rest_gen::get_user_table(state.pool.inner(), project_id, &input.name)
        .await?
        .ok_or_else(|| Error::Internal("Failed to retrieve created table".into()))?;
    state.table_schema_cache.set(project_id, &input.name, table.clone()).await;

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

    // Invalidate schema cache for the deleted table
    state.table_schema_cache.invalidate(project_id, &table_name).await;

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

    // Resolve pagination parameters
    let (limit, mut offset) = query.get_pagination();

    // Handle cursor-based pagination (overrides offset if present)
    if let Some(ref cursor) = query.cursor {
        if let Some(cursor_offset) = decode_cursor(cursor) {
            offset = cursor_offset;
        }
    }

    // Build select query
    let (select_sql, select_params) = rest_gen::build_select_query(
        project_id,
        &table_name,
        query.select.as_deref(),
        query.filter.as_deref(),
        query.order.as_deref(),
        limit,
        offset,
    )?;

    // Run COUNT and SELECT in parallel to halve latency
    let (count_sql, count_params) = rest_gen::build_count_query(
        project_id,
        &table_name,
        query.filter.as_deref(),
    )?;

    let pool = state.pool.inner();
    let (total, rows) = tokio::try_join!(
        execute_count_query(pool, &count_sql, &count_params),
        execute_select_query(pool, &select_sql, &select_params),
    )?;
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

    // Get table info with cache
    let table_info = get_table_info_cached(&state, project_id, &table_name).await?;

    let pk_column = get_primary_key_column(&table_info.columns);

    let (sql, params) = rest_gen::build_select_one_query(project_id, &table_name, pk_column, &row_id);

    let rows = execute_select_query(state.pool.inner(), &sql, &params).await?;

    if rows.is_empty() {
        return Err(Error::NotFound("Row not found".into()));
    }

    Ok(Json(RowResponse { row: rows[0].clone() }))
}

/// Get the primary key column name from table columns
/// Returns "id" as fallback if no explicit primary key is found
fn get_primary_key_column(columns: &[TableColumnInfo]) -> &str {
    columns
        .iter()
        .find(|c| c.is_primary)
        .map(|c| c.name.as_str())
        .unwrap_or("id")
}

/// Preprocess row data before insertion
/// - Auto-generate UUIDs for primary key columns of type 'uuid' if not provided
/// - Convert empty strings to null for timestamp/date/uuid columns
fn preprocess_row_data(
    data: &Value,
    columns: &[TableColumnInfo],
) -> Result<Value> {
    let mut obj = data
        .as_object()
        .ok_or_else(|| Error::Validation("Request body must be a JSON object".into()))?
        .clone();

    for col in columns {
        let col_type_lower = col.data_type.to_lowercase();

        // Auto-generate UUID for primary key uuid columns if not provided
        if col.is_primary
            && (col_type_lower == "uuid" || col_type_lower.contains("uuid"))
            && !obj.contains_key(&col.name)
        {
            obj.insert(
                col.name.clone(),
                Value::String(uuid::Uuid::new_v4().to_string()),
            );
        }

        // Convert empty strings to null for timestamp/date/uuid types
        if let Some(Value::String(s)) = obj.get(&col.name) {
            if s.is_empty() {
                let needs_null = col_type_lower.contains("timestamp")
                    || col_type_lower.contains("date")
                    || col_type_lower.contains("time")
                    || col_type_lower == "uuid";

                if needs_null {
                    obj.insert(col.name.clone(), Value::Null);
                }
            }
        }
    }

    Ok(Value::Object(obj))
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

    // Get table info with cache
    let table_info = get_table_info_cached(&state, project_id, &table_name).await?;

    // Process the data: auto-generate UUIDs and handle empty values
    let processed_data = preprocess_row_data(&data, &table_info.columns)?;

    let (sql, params) = rest_gen::build_insert_query(project_id, &table_name, &processed_data)?;

    let rows = execute_returning_query(state.pool.inner(), &sql, &params).await?;

    if rows.is_empty() {
        return Err(Error::Internal("Insert failed to return row".into()));
    }

    // Emit event using the actual primary key column
    let pk_column = get_primary_key_column(&table_info.columns);
    let pk_value = rows[0]
        .get(pk_column)
        .map(|v| v.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let event = crate::events::Event::new(
        crate::events::EventType::TableRowCreated,
        project_id,
        &pk_value,
        serde_json::json!({
            "table": table_name,
            "row": rows[0],
        }),
    );
    let _ = state.events.publish(event);

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

    // Get table info from cache (avoids repeated schema lookups)
    let table_info = get_table_info_cached(&state, project_id, &table_name).await?;

    let pk_column = get_primary_key_column(&table_info.columns);

    let (sql, params) = rest_gen::build_update_query(project_id, &table_name, pk_column, &row_id, &data)?;

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

    // Get table info from cache (avoids repeated schema lookups)
    let table_info = get_table_info_cached(&state, project_id, &table_name).await?;

    let pk_column = get_primary_key_column(&table_info.columns);

    let (sql, params) = rest_gen::build_delete_query(project_id, &table_name, pk_column, &row_id);

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
            // Empty strings are bound as empty strings — NOT converted to NULL here.
            // Column-specific NULL conversion (for timestamps, dates, uuids) is handled
            // upstream in preprocess_row_data() which sets Value::Null explicitly.
            if s.is_empty() {
                return query.bind(s.as_str());
            }
            // Try to parse as UUID first (for project_id and id columns)
            if let Ok(uuid) = uuid::Uuid::parse_str(s) {
                query.bind(uuid)
            // Try to parse as ISO 8601 timestamp (e.g., "2024-01-15T10:30:00.000Z")
            } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                query.bind(dt.with_timezone(&chrono::Utc))
            // Try alternate ISO format without timezone (e.g., "2024-01-15T10:30:00")
            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
                query.bind(dt)
            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                query.bind(dt)
            // Try date only format (e.g., "2024-01-15")
            } else if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                query.bind(d)
            } else {
                query.bind(s.as_str())
            }
        }
        // For JSON objects and arrays, serialize to string for ::jsonb casting
        Value::Array(_) | Value::Object(_) => {
            let json_str = serde_json::to_string(value).unwrap_or_default();
            query.bind(json_str)
        }
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
