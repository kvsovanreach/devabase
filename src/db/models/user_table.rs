use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserTable {
    pub id: Uuid,
    pub project_id: Uuid,
    pub table_name: String,
    pub schema_definition: serde_json::Value,
    pub api_enabled: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDefinition {
    pub name: String,
    #[serde(rename = "type")]
    pub column_type: String,
    #[serde(default)]
    pub primary: bool,
    #[serde(default)]
    pub nullable: bool,
    #[serde(default)]
    pub unique: bool,
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub references_table: Option<String>,
    #[serde(default)]
    pub references_column: Option<String>,
    #[serde(default)]
    pub on_delete: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTableRequest {
    pub name: String,
    pub columns: Vec<ColumnDefinition>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableInfo {
    pub name: String,
    pub columns: Vec<TableColumnInfo>,
    pub row_count: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary: bool,
    pub column_default: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RowQuery {
    #[serde(default = "default_limit")]
    pub limit: i32,
    #[serde(default)]
    pub offset: i32,
    pub order: Option<String>,
    pub filter: Option<String>,
    pub select: Option<String>,
}

fn default_limit() -> i32 {
    50
}

#[derive(Debug, Clone, Serialize)]
pub struct RowsResponse {
    pub rows: Vec<serde_json::Value>,
    pub total: i64,
    pub limit: i32,
    pub offset: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct RowResponse {
    pub row: serde_json::Value,
}
