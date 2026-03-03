//! Shared pagination types and utilities for all API endpoints

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};

/// Query parameters for paginated endpoints
#[derive(Debug, Clone, Deserialize)]
pub struct PaginationQuery {
    /// Number of items to return (default: 50, max: 1000)
    #[serde(default = "default_limit")]
    pub limit: i64,
    /// Offset for pagination (use with limit)
    #[serde(default)]
    pub offset: i64,
    /// Page number (1-indexed, alternative to offset)
    pub page: Option<i64>,
    /// Items per page (alternative to limit)
    pub per_page: Option<i64>,
    /// Cursor for cursor-based pagination (base64 encoded)
    pub cursor: Option<String>,
}

fn default_limit() -> i64 {
    50
}

impl PaginationQuery {
    /// Get effective limit and offset, handling page-based params
    pub fn get_pagination(&self) -> (i64, i64) {
        // If cursor is provided, decode it
        if let Some(ref cursor) = self.cursor {
            if let Some(offset) = decode_cursor(cursor) {
                let limit = self.per_page.unwrap_or(self.limit).min(1000).max(1);
                return (limit, offset);
            }
        }

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

/// Pagination metadata included in responses
#[derive(Debug, Clone, Serialize)]
pub struct PaginationMeta {
    /// Total number of items matching the filter
    pub total: i64,
    /// Number of items returned in this response
    pub count: i64,
    /// Current limit (items per page)
    pub limit: i64,
    /// Current offset
    pub offset: i64,
    /// Current page number (1-indexed)
    pub page: i64,
    /// Total number of pages
    pub total_pages: i64,
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
    pub fn new(total: i64, limit: i64, offset: i64, count: i64) -> Self {
        let page = (offset / limit) + 1;
        let total_pages = ((total as f64) / (limit as f64)).ceil() as i64;
        let has_next = (offset + limit) < total;
        let has_previous = offset > 0;

        let next_cursor = if has_next {
            Some(encode_cursor(offset + limit))
        } else {
            None
        };

        let prev_cursor = if has_previous {
            Some(encode_cursor((offset - limit).max(0)))
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

/// Generic paginated response wrapper
#[derive(Debug, Clone, Serialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: PaginationMeta,
}

impl<T> PaginatedResponse<T> {
    pub fn new(data: Vec<T>, total: i64, limit: i64, offset: i64) -> Self {
        let count = data.len() as i64;
        Self {
            data,
            pagination: PaginationMeta::new(total, limit, offset, count),
        }
    }
}

/// Encode offset as base64 cursor
fn encode_cursor(offset: i64) -> String {
    URL_SAFE_NO_PAD.encode(format!("offset:{}", offset))
}

/// Decode base64 cursor to offset
pub fn decode_cursor(cursor: &str) -> Option<i64> {
    let decoded = URL_SAFE_NO_PAD.decode(cursor).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    if let Some(offset_str) = s.strip_prefix("offset:") {
        offset_str.parse().ok()
    } else {
        None
    }
}
