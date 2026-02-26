use crate::auth::AuthContext;
use crate::db::DbPool;
use crate::server::AppState;
use crate::{Error, Result};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlparser::ast::{SetExpr, Statement, TableFactor};
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::parser::Parser;
use sqlx::{postgres::PgRow, Column, FromRow, Row};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

/// Maximum rows to return from a query
const MAX_ROWS: i64 = 1000;
/// Query timeout in seconds
const QUERY_TIMEOUT_SECS: u64 = 30;

/// Tables that are blocked from SQL queries
const BLOCKED_TABLE_PREFIXES: &[&str] = &["sys_", "pg_", "_sqlx"];

/// Execute a SQL query
#[derive(Debug, Deserialize)]
pub struct ExecuteRequest {
    pub query: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    100
}

#[derive(Debug, Serialize)]
pub struct ExecuteResponse {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub execution_time_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
}

pub async fn execute_sql(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let user_id = auth.user_id.ok_or_else(|| {
        Error::Auth("User authentication required for SQL execution".to_string())
    })?;

    // Validate and parse the query, rewriting table names for user tables
    let validated_query = validate_and_rewrite_query(&input.query, project_id, input.limit.min(MAX_ROWS), &state.pool).await?;

    let start = Instant::now();

    // Execute query with timeout
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(QUERY_TIMEOUT_SECS),
        execute_validated_query(&state.pool, &validated_query),
    )
    .await
    .map_err(|_| Error::BadRequest("Query timeout exceeded".to_string()))??;

    let execution_time_ms = start.elapsed().as_millis() as u64;

    // Log query to history
    let _ = log_query(
        &state.pool,
        project_id,
        user_id,
        &input.query,
        execution_time_ms as i32,
        result.rows.len() as i32,
        None,
    )
    .await;

    Ok(Json(ExecuteResponse {
        columns: result.columns,
        rows: result.rows.clone(),
        row_count: result.rows.len(),
        execution_time_ms,
    }))
}

/// Validate and rewrite a SQL query, translating user table names to their full names
async fn validate_and_rewrite_query(sql: &str, project_id: Uuid, limit: i64, pool: &DbPool) -> Result<String> {
    let dialect = PostgreSqlDialect {};

    // Parse the SQL
    let statements = Parser::parse_sql(&dialect, sql)
        .map_err(|e| Error::Validation(format!("SQL parse error: {}", e)))?;

    // Must have exactly one statement
    if statements.is_empty() {
        return Err(Error::Validation("No SQL statement provided".to_string()));
    }
    if statements.len() > 1 {
        return Err(Error::Validation(
            "Only one statement per query is allowed".to_string(),
        ));
    }

    let statement = &statements[0];

    // Only allow SELECT statements
    match statement {
        Statement::Query(query) => {
            // Check for blocked tables in FROM clause
            check_blocked_tables(query)?;

            // Get user tables for this project to know which names to rewrite
            let user_tables: Vec<(String,)> = sqlx::query_as(
                "SELECT table_name FROM sys_user_tables WHERE project_id = $1"
            )
            .bind(project_id)
            .fetch_all(pool.inner())
            .await?;

            let user_table_names: std::collections::HashSet<String> =
                user_tables.into_iter().map(|(name,)| name.to_lowercase()).collect();

            // Rewrite table names in the query
            let project_prefix = format!("ut_{}_", project_id.to_string().replace("-", "_"));
            let rewritten_sql = rewrite_table_names(sql, &user_table_names, &project_prefix);

            // Reconstruct query with limit
            let query_str = rewritten_sql.trim().trim_end_matches(';');

            // Add LIMIT if not present
            if !query_str.to_uppercase().contains(" LIMIT ") {
                Ok(format!("{} LIMIT {}", query_str, limit))
            } else {
                // Enforce our limit by wrapping
                Ok(format!("SELECT * FROM ({}) AS _q LIMIT {}", query_str, limit))
            }
        }
        _ => Err(Error::Validation(
            "Only SELECT statements are allowed".to_string(),
        )),
    }
}

/// Check if the query references any blocked tables
fn check_blocked_tables(query: &sqlparser::ast::Query) -> Result<()> {
    match &*query.body {
        SetExpr::Select(select) => {
            for table_with_joins in &select.from {
                check_table_factor(&table_with_joins.relation)?;
                for join in &table_with_joins.joins {
                    check_table_factor(&join.relation)?;
                }
            }
        }
        SetExpr::Query(subquery) => {
            check_blocked_tables(subquery)?;
        }
        SetExpr::SetOperation { left, right, .. } => {
            if let SetExpr::Query(q) = &**left {
                check_blocked_tables(q)?;
            }
            if let SetExpr::Query(q) = &**right {
                check_blocked_tables(q)?;
            }
        }
        _ => {}
    }

    // Check subqueries in WHERE clause etc would require more complex AST walking
    // For now, we also do a simple string check
    let query_str = format!("{}", query).to_lowercase();
    for prefix in BLOCKED_TABLE_PREFIXES {
        if query_str.contains(&format!("{}", prefix)) {
            return Err(Error::Validation(format!(
                "Access to system tables ({}) is not allowed",
                prefix
            )));
        }
    }

    Ok(())
}

/// Rewrite user table names in SQL to their full prefixed names
fn rewrite_table_names(sql: &str, user_tables: &std::collections::HashSet<String>, prefix: &str) -> String {
    let mut result = sql.to_string();

    for table_name in user_tables {
        let full_name = format!("{}{}", prefix, table_name);

        // Replace various SQL patterns (case-insensitive manual matching)
        let keywords = ["FROM", "JOIN", "from", "join", "From", "Join"];
        for keyword in keywords {
            // Pattern: "FROM tablename" or "JOIN tablename"
            let pattern = format!("{} {}", keyword, table_name);
            let replacement = format!("{} {}", keyword, full_name);
            result = result.replace(&pattern, &replacement);

            // Also handle with newlines/multiple spaces
            let pattern_space = format!("{}  {}", keyword, table_name);
            let replacement_space = format!("{}  {}", keyword, full_name);
            result = result.replace(&pattern_space, &replacement_space);
        }
    }

    result
}

fn check_table_factor(factor: &TableFactor) -> Result<()> {
    match factor {
        TableFactor::Table { name, .. } => {
            let table_name = name.to_string().to_lowercase();
            for prefix in BLOCKED_TABLE_PREFIXES {
                if table_name.starts_with(prefix) || table_name.contains(&format!(".{}", prefix)) {
                    return Err(Error::Validation(format!(
                        "Access to system table '{}' is not allowed",
                        name
                    )));
                }
            }
        }
        TableFactor::Derived { subquery, .. } => {
            check_blocked_tables(subquery)?;
        }
        TableFactor::NestedJoin { table_with_joins, .. } => {
            check_table_factor(&table_with_joins.relation)?;
            for join in &table_with_joins.joins {
                check_table_factor(&join.relation)?;
            }
        }
        _ => {}
    }
    Ok(())
}

struct QueryResult {
    columns: Vec<ColumnInfo>,
    rows: Vec<Vec<serde_json::Value>>,
}

/// Execute a validated query
async fn execute_validated_query(pool: &DbPool, query: &str) -> Result<QueryResult> {
    // Use raw SQL execution
    let rows: Vec<PgRow> = sqlx::query(query).fetch_all(pool.inner()).await?;

    if rows.is_empty() {
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
        });
    }

    // Get column info from first row
    let first_row = &rows[0];
    let columns: Vec<ColumnInfo> = first_row
        .columns()
        .iter()
        .map(|col| ColumnInfo {
            name: col.name().to_string(),
            type_name: col.type_info().to_string(),
        })
        .collect();

    // Convert rows to JSON values
    let result_rows: Vec<Vec<serde_json::Value>> = rows
        .iter()
        .map(|row| {
            columns
                .iter()
                .enumerate()
                .map(|(i, col)| row_value_to_json(row, i, &col.type_name))
                .collect()
        })
        .collect();

    Ok(QueryResult {
        columns,
        rows: result_rows,
    })
}

/// Convert a row value to JSON
fn row_value_to_json(row: &PgRow, index: usize, _type_name: &str) -> serde_json::Value {
    // Try common types
    if let Ok(v) = row.try_get::<Option<String>, _>(index) {
        return v.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
        return v.map(|n| serde_json::Value::Number(n.into())).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(index) {
        return v.map(|n| serde_json::Value::Number(n.into())).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
        return v
            .and_then(|n| serde_json::Number::from_f64(n))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
        return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<serde_json::Value>, _>(index) {
        return v.unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Uuid>, _>(index) {
        return v.map(|u| serde_json::Value::String(u.to_string())).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(index) {
        return v
            .map(|dt| serde_json::Value::String(dt.to_rfc3339()))
            .unwrap_or(serde_json::Value::Null);
    }

    // Fallback
    serde_json::Value::Null
}

/// Log a query to history
async fn log_query(
    pool: &DbPool,
    project_id: Uuid,
    user_id: Uuid,
    query: &str,
    execution_time_ms: i32,
    row_count: i32,
    error_message: Option<String>,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO sys_query_history (project_id, user_id, query, execution_time_ms, row_count, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .bind(query)
    .bind(execution_time_ms)
    .bind(row_count)
    .bind(error_message)
    .execute(pool.inner())
    .await?;

    Ok(())
}

/// Get query history
#[derive(Deserialize)]
pub struct HistoryQuery {
    #[serde(default = "default_history_limit")]
    pub limit: i64,
}

fn default_history_limit() -> i64 {
    50
}

#[derive(Debug, Serialize, FromRow)]
pub struct QueryHistoryEntry {
    pub id: Uuid,
    pub query: String,
    pub execution_time_ms: Option<i32>,
    pub row_count: Option<i32>,
    pub error_message: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_query_history(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<Vec<QueryHistoryEntry>>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    let user_id = auth.user_id.ok_or_else(|| {
        Error::Auth("User authentication required".to_string())
    })?;

    let entries: Vec<QueryHistoryEntry> = sqlx::query_as(
        r#"
        SELECT id, query, execution_time_ms, row_count, error_message, created_at
        FROM sys_query_history
        WHERE project_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .bind(query.limit.min(100))
    .fetch_all(state.pool.inner())
    .await?;

    Ok(Json(entries))
}

/// Get available tables and columns for autocomplete
#[derive(Debug, Serialize)]
pub struct SchemaInfo {
    pub tables: Vec<TableInfo>,
}

#[derive(Debug, Serialize)]
pub struct TableInfo {
    pub name: String,
    pub columns: Vec<SchemaColumnInfo>,
}

#[derive(Debug, Serialize)]
pub struct SchemaColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
}

pub async fn get_schema(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<Json<SchemaInfo>> {
    let project_id = auth.require_project()?;
    auth.require_read()?;

    // Get only user tables for this project from the registry
    let tables: Vec<(String,)> = sqlx::query_as(
        r#"
        SELECT table_name
        FROM sys_user_tables
        WHERE project_id = $1 AND api_enabled = true
        ORDER BY table_name
        "#,
    )
    .bind(project_id)
    .fetch_all(state.pool.inner())
    .await?;

    let mut schema_tables = Vec::new();
    let project_prefix = format!("ut_{}_", project_id.to_string().replace("-", "_"));

    for (table_name,) in tables {
        // Get columns from the actual table (with prefix)
        let full_table_name = format!("{}{}", project_prefix, table_name);

        let columns: Vec<(String, String, String)> = sqlx::query_as(
            r#"
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
              AND column_name != 'project_id'
            ORDER BY ordinal_position
            "#,
        )
        .bind(&full_table_name)
        .fetch_all(state.pool.inner())
        .await?;

        // Display the simple table name (without prefix) to the user
        schema_tables.push(TableInfo {
            name: table_name,
            columns: columns
                .into_iter()
                .map(|(name, data_type, is_nullable)| SchemaColumnInfo {
                    name,
                    data_type,
                    is_nullable: is_nullable == "YES",
                })
                .collect(),
        });
    }

    Ok(Json(SchemaInfo {
        tables: schema_tables,
    }))
}
