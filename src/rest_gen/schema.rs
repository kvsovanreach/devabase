use futures::future::try_join_all;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::models::user_table::{TableColumnInfo, TableInfo};
use crate::Result;

/// Fetch columns + row count for a single table in parallel
async fn build_table_info(
    pool: &PgPool,
    project_id: Uuid,
    table_name: String,
    created_at: chrono::DateTime<chrono::Utc>,
) -> Result<TableInfo> {
    let full_table_name = get_full_table_name(project_id, &table_name);

    // Run column lookup and row count in parallel
    let (columns, row_count) = tokio::try_join!(
        get_table_columns(pool, &full_table_name),
        get_row_count(pool, &full_table_name, project_id),
    )?;

    Ok(TableInfo {
        name: table_name,
        columns,
        row_count,
        created_at,
    })
}

/// Get all user tables for a project
pub async fn get_user_tables(pool: &PgPool, project_id: Uuid) -> Result<Vec<TableInfo>> {
    // Get tables from the registry
    let tables: Vec<(String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        r#"
        SELECT table_name, created_at
        FROM sys_user_tables
        WHERE project_id = $1 AND api_enabled = true
        ORDER BY created_at DESC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    // Fetch all table metadata in parallel (columns + row counts concurrently)
    let futures: Vec<_> = tables
        .into_iter()
        .map(|(name, created_at)| build_table_info(pool, project_id, name, created_at))
        .collect();

    let result = try_join_all(futures).await?;
    Ok(result)
}

/// Get all user tables for a project with pagination
pub async fn get_user_tables_paginated(pool: &PgPool, project_id: Uuid, limit: i64, offset: i64) -> Result<(Vec<TableInfo>, i64)> {
    // Run COUNT and table list fetch in parallel
    let (total, tables) = tokio::try_join!(
        async {
            let row: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM sys_user_tables WHERE project_id = $1 AND api_enabled = true"
            )
            .bind(project_id)
            .fetch_one(pool)
            .await?;
            Ok::<_, crate::Error>(row.0)
        },
        async {
            let rows: Vec<(String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
                r#"
                SELECT table_name, created_at
                FROM sys_user_tables
                WHERE project_id = $1 AND api_enabled = true
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                "#,
            )
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?;
            Ok::<_, crate::Error>(rows)
        },
    )?;

    // Fetch all table metadata in parallel
    let futures: Vec<_> = tables
        .into_iter()
        .map(|(name, created_at)| build_table_info(pool, project_id, name, created_at))
        .collect();

    let result = try_join_all(futures).await?;
    Ok((result, total))
}

/// Get a single user table by name
pub async fn get_user_table(pool: &PgPool, project_id: Uuid, table_name: &str) -> Result<Option<TableInfo>> {
    let record: Option<(String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        r#"
        SELECT table_name, created_at
        FROM sys_user_tables
        WHERE project_id = $1 AND table_name = $2 AND api_enabled = true
        "#,
    )
    .bind(project_id)
    .bind(table_name)
    .fetch_optional(pool)
    .await?;

    match record {
        Some((table_name, created_at)) => {
            let full_table_name = format!("ut_{}_{}", project_id.to_string().replace("-", "_"), table_name);
            let columns = get_table_columns(pool, &full_table_name).await?;
            let row_count = get_row_count(pool, &full_table_name, project_id).await?;

            Ok(Some(TableInfo {
                name: table_name,
                columns,
                row_count,
                created_at,
            }))
        }
        None => Ok(None),
    }
}

/// Get columns for a table from information_schema
async fn get_table_columns(pool: &PgPool, full_table_name: &str) -> Result<Vec<TableColumnInfo>> {
    let columns: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        r#"
        SELECT
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default
        FROM information_schema.columns c
        WHERE c.table_name = $1
        ORDER BY c.ordinal_position
        "#,
    )
    .bind(full_table_name)
    .fetch_all(pool)
    .await?;

    // Get primary key columns
    let pk_columns: Vec<(String,)> = sqlx::query_as(
        r#"
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary
        "#,
    )
    .bind(full_table_name)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let pk_set: std::collections::HashSet<&str> = pk_columns.iter().map(|(n,)| n.as_str()).collect();

    Ok(columns
        .into_iter()
        .filter(|(name, _, _, _)| name != "project_id") // Hide project_id from API
        .map(|(name, data_type, is_nullable, column_default)| TableColumnInfo {
            is_primary: pk_set.contains(name.as_str()),
            name,
            data_type,
            is_nullable: is_nullable == "YES",
            column_default,
        })
        .collect())
}

/// Get row count for a table
async fn get_row_count(pool: &PgPool, full_table_name: &str, project_id: Uuid) -> Result<i64> {
    let query = format!(
        "SELECT COUNT(*) as count FROM \"{}\" WHERE project_id = $1",
        full_table_name
    );

    let row: (i64,) = sqlx::query_as(&query)
        .bind(project_id)
        .fetch_one(pool)
        .await?;

    Ok(row.0)
}

/// Validate table name doesn't conflict with system tables
pub fn validate_table_name(name: &str) -> Result<()> {
    let name_lower = name.to_lowercase();

    // Check for reserved prefixes
    if name_lower.starts_with("sys_")
        || name_lower.starts_with("pg_")
        || name_lower.starts_with("_sqlx")
        || name_lower.starts_with("ut_") {
        return Err(crate::Error::Validation(
            "Table name cannot start with sys_, pg_, _sqlx, or ut_".into()
        ));
    }

    // Check for valid identifier
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(crate::Error::Validation(
            "Table name can only contain alphanumeric characters and underscores".into()
        ));
    }

    // Check length
    if name.is_empty() || name.len() > 63 {
        return Err(crate::Error::Validation(
            "Table name must be 1-63 characters".into()
        ));
    }

    // Check doesn't start with number
    if name.chars().next().map(|c| c.is_numeric()).unwrap_or(false) {
        return Err(crate::Error::Validation(
            "Table name cannot start with a number".into()
        ));
    }

    Ok(())
}

/// Get the full table name with project prefix
pub fn get_full_table_name(project_id: Uuid, table_name: &str) -> String {
    format!("ut_{}_{}", project_id.to_string().replace("-", "_"), table_name)
}
