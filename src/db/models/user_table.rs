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
    /// Number of rows to return (default: 50, max: 1000)
    #[serde(default = "default_limit")]
    pub limit: i32,
    /// Offset for pagination (use with limit)
    #[serde(default)]
    pub offset: i32,
    /// Page number (1-indexed, alternative to offset)
    pub page: Option<i32>,
    /// Rows per page (alternative to limit)
    pub per_page: Option<i32>,
    /// Cursor for cursor-based pagination (base64 encoded)
    pub cursor: Option<String>,
    /// Order by columns (e.g., "created_at:desc,name:asc")
    pub order: Option<String>,
    /// Filter expression (e.g., "status.eq=active&age.gte=18")
    pub filter: Option<String>,
    /// Columns to select (e.g., "id,name,email")
    pub select: Option<String>,
}

impl RowQuery {
    /// Get effective limit and offset, handling page-based params
    pub fn get_pagination(&self) -> (i32, i32) {
        // If page/per_page are provided, use them
        if let (Some(page), Some(per_page)) = (self.page, self.per_page) {
            let page = page.max(1);
            let per_page = per_page.min(1000).max(1);
            let offset = (page - 1) * per_page;
            return (per_page, offset);
        }

        // Otherwise use limit/offset
        let limit = self.per_page.unwrap_or(self.limit).min(1000).max(1);
        (limit, self.offset.max(0))
    }
}

fn default_limit() -> i32 {
    50
}

#[derive(Debug, Clone, Serialize)]
pub struct RowsResponse {
    /// The data rows
    pub rows: Vec<serde_json::Value>,
    /// Pagination metadata
    pub pagination: PaginationMeta,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaginationMeta {
    /// Total number of rows matching the filter
    pub total: i64,
    /// Number of rows returned in this response
    pub count: i32,
    /// Current limit (rows per page)
    pub limit: i32,
    /// Current offset
    pub offset: i32,
    /// Current page number (1-indexed)
    pub page: i32,
    /// Total number of pages
    pub total_pages: i32,
    /// Whether there is a next page
    pub has_next: bool,
    /// Whether there is a previous page
    pub has_previous: bool,
    /// Cursor for next page (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    /// Cursor for previous page (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prev_cursor: Option<String>,
}

impl PaginationMeta {
    pub fn new(total: i64, limit: i32, offset: i32, count: i32) -> Self {
        let page = (offset / limit) + 1;
        let total_pages = ((total as f64) / (limit as f64)).ceil() as i32;
        let has_next = (offset + limit) < total as i32;
        let has_previous = offset > 0;

        // Generate cursors using base64 encoded offset
        let next_cursor = if has_next {
            Some(base64_encode_cursor(offset + limit))
        } else {
            None
        };

        let prev_cursor = if has_previous {
            Some(base64_encode_cursor((offset - limit).max(0)))
        } else {
            None
        };

        Self {
            total,
            count,
            limit,
            offset,
            page,
            total_pages,
            has_next,
            has_previous,
            next_cursor,
            prev_cursor,
        }
    }
}

/// Encode offset as base64 cursor
fn base64_encode_cursor(offset: i32) -> String {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    URL_SAFE_NO_PAD.encode(format!("offset:{}", offset))
}

/// Decode base64 cursor to offset
pub fn decode_cursor(cursor: &str) -> Option<i32> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    let decoded = URL_SAFE_NO_PAD.decode(cursor).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    if let Some(offset_str) = s.strip_prefix("offset:") {
        offset_str.parse().ok()
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RowResponse {
    pub row: serde_json::Value,
}
