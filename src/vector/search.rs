use crate::db::models::SearchResult;
use crate::db::DbPool;
use crate::vector::collection::get_vector_table_name;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Parameters for hybrid search combining vector and keyword search
#[derive(Debug, Clone, Deserialize)]
pub struct HybridSearchParams {
    pub query: String,
    pub embedding: Vec<f32>,
    pub top_k: Option<i32>,
    pub vector_weight: Option<f32>,  // 0.0-1.0, default 0.7
    pub keyword_weight: Option<f32>, // 0.0-1.0, default 0.3
    pub filter: Option<serde_json::Value>,
}

/// Result from hybrid search with individual scores
#[derive(Debug, Clone, Serialize)]
pub struct HybridSearchResult {
    pub id: Uuid,
    pub document_id: Uuid,
    pub content: String,
    pub score: f64,           // Combined RRF score
    pub vector_score: f64,    // Vector similarity score
    pub keyword_score: f64,   // BM25/keyword score
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VectorUpsert {
    pub id: Option<String>,
    pub embedding: Vec<f32>,
    pub metadata: Option<serde_json::Value>,
    pub chunk_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchQuery {
    pub embedding: Vec<f32>,
    pub top_k: Option<i32>,
    pub filter: Option<serde_json::Value>,
    pub include_metadata: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VectorMatch {
    pub id: Uuid,
    pub external_id: Option<String>,
    pub score: f64,
    pub metadata: Option<serde_json::Value>,
}

pub async fn upsert_vectors(
    pool: &DbPool,
    project_id: Uuid,
    collection_name: &str,
    vectors: Vec<VectorUpsert>,
) -> Result<usize> {
    if vectors.is_empty() {
        return Ok(0);
    }

    let table_name = get_vector_table_name(Some(project_id), collection_name);
    let mut count = 0;

    for vector in vectors {
        let id = Uuid::new_v4();
        let embedding_str = format!(
            "[{}]",
            vector
                .embedding
                .iter()
                .map(|f| f.to_string())
                .collect::<Vec<_>>()
                .join(",")
        );

        // Use different query depending on whether external_id is provided
        let query = if vector.id.is_some() {
            format!(
                r#"
                INSERT INTO "{}" (id, external_id, chunk_id, embedding, metadata)
                VALUES ($1, $2, $3, $4::vector, $5)
                ON CONFLICT (external_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    metadata = EXCLUDED.metadata
                "#,
                table_name
            )
        } else {
            // Simple INSERT when no external_id (from document processing)
            format!(
                r#"
                INSERT INTO "{}" (id, external_id, chunk_id, embedding, metadata)
                VALUES ($1, $2, $3, $4::vector, $5)
                "#,
                table_name
            )
        };

        sqlx::query(&query)
            .bind(id)
            .bind(&vector.id)
            .bind(vector.chunk_id)
            .bind(&embedding_str)
            .bind(&vector.metadata)
            .execute(pool.inner())
            .await?;

        count += 1;
    }

    Ok(count)
}

pub async fn search_vectors(
    pool: &DbPool,
    project_id: Uuid,
    collection_name: &str,
    query: SearchQuery,
) -> Result<Vec<VectorMatch>> {
    let table_name = get_vector_table_name(Some(project_id), collection_name);
    let top_k = query.top_k.unwrap_or(10);

    let embedding_str = format!(
        "[{}]",
        query
            .embedding
            .iter()
            .map(|f| f.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );

    // Build the search query with optional metadata filter
    let (filter_clause, _filter_values) = build_filter_clause(&query.filter);

    let search_query = format!(
        r#"
        SELECT
            id,
            external_id,
            1 - (embedding <=> $1::vector) as score,
            metadata
        FROM "{}"
        WHERE 1=1 {}
        ORDER BY embedding <=> $1::vector
        LIMIT $2
        "#,
        table_name, filter_clause
    );

    let rows: Vec<(Uuid, Option<String>, f64, Option<serde_json::Value>)> =
        sqlx::query_as(&search_query)
            .bind(&embedding_str)
            .bind(top_k)
            .fetch_all(pool.inner())
            .await?;

    let matches = rows
        .into_iter()
        .map(|(id, external_id, score, metadata)| VectorMatch {
            id,
            external_id,
            score,
            metadata,
        })
        .collect();

    Ok(matches)
}

pub async fn search_with_content(
    pool: &DbPool,
    project_id: Uuid,
    collection_name: &str,
    query: SearchQuery,
) -> Result<Vec<SearchResult>> {
    let table_name = get_vector_table_name(Some(project_id), collection_name);
    let top_k = query.top_k.unwrap_or(10);

    let embedding_str = format!(
        "[{}]",
        query
            .embedding
            .iter()
            .map(|f| f.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );

    // Join with sys_documents to get the document name
    let search_query = format!(
        r#"
        SELECT
            v.id,
            c.document_id,
            c.content,
            1 - (v.embedding <=> $1::vector) as score,
            COALESCE(
                jsonb_set(
                    COALESCE(c.metadata, '{{}}'::jsonb),
                    '{{document_name}}',
                    to_jsonb(COALESCE(d.filename, 'Unknown'))
                ),
                '{{}}'::jsonb
            ) as metadata
        FROM "{}" v
        JOIN sys_chunks c ON v.chunk_id = c.id
        LEFT JOIN sys_documents d ON c.document_id = d.id
        ORDER BY v.embedding <=> $1::vector
        LIMIT $2
        "#,
        table_name
    );

    let rows: Vec<(Uuid, Uuid, String, f64, Option<serde_json::Value>)> =
        sqlx::query_as(&search_query)
            .bind(&embedding_str)
            .bind(top_k)
            .fetch_all(pool.inner())
            .await?;

    let results = rows
        .into_iter()
        .map(|(id, document_id, content, score, metadata)| SearchResult {
            id,
            document_id,
            content,
            score,
            metadata,
        })
        .collect();

    Ok(results)
}

/// Hybrid search combining vector similarity with keyword/BM25 search
/// Uses Reciprocal Rank Fusion (RRF) to combine results: score = sum(1 / (k + rank))
/// where k = 60 is the standard RRF constant
pub async fn hybrid_search(
    pool: &DbPool,
    project_id: Uuid,
    collection_name: &str,
    params: HybridSearchParams,
) -> Result<Vec<HybridSearchResult>> {
    let table_name = get_vector_table_name(Some(project_id), collection_name);
    let top_k = params.top_k.unwrap_or(10);
    let vector_weight = params.vector_weight.unwrap_or(0.7).clamp(0.0, 1.0);
    let keyword_weight = params.keyword_weight.unwrap_or(0.3).clamp(0.0, 1.0);

    // RRF constant - standard value
    let rrf_k: i32 = 60;

    let embedding_str = format!(
        "[{}]",
        params
            .embedding
            .iter()
            .map(|f| f.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );

    // Build optional metadata filter clause
    let (filter_clause, _) = build_filter_clause(&params.filter);

    // Escape the query for tsquery - remove special characters
    let sanitized_query = sanitize_tsquery(&params.query);

    // Hybrid search query using RRF (Reciprocal Rank Fusion)
    // CTEs: vector_results ranks by vector similarity, keyword_results ranks by BM25
    // Final query combines using: weighted_score = (vector_weight * vector_rrf) + (keyword_weight * keyword_rrf)
    let search_query = format!(
        r#"
        WITH vector_results AS (
            SELECT
                v.id,
                v.chunk_id,
                c.document_id,
                c.content,
                (1 - (v.embedding <=> $1::vector))::float8 as vector_score,
                ROW_NUMBER() OVER (ORDER BY v.embedding <=> $1::vector) as vector_rank,
                COALESCE(
                    jsonb_set(
                        COALESCE(c.metadata, '{{}}'::jsonb),
                        '{{document_name}}',
                        to_jsonb(COALESCE(d.filename, 'Unknown'))
                    ),
                    '{{}}'::jsonb
                ) as metadata
            FROM "{table}" v
            JOIN sys_chunks c ON v.chunk_id = c.id
            LEFT JOIN sys_documents d ON c.document_id = d.id
            WHERE 1=1 {filter}
            ORDER BY v.embedding <=> $1::vector
            LIMIT $2 * 2
        ),
        keyword_results AS (
            SELECT
                v.id,
                v.chunk_id,
                c.document_id,
                c.content,
                (CASE
                    WHEN $4 = '' THEN 0
                    ELSE ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', $4))
                END)::float8 as keyword_score,
                ROW_NUMBER() OVER (
                    ORDER BY CASE
                        WHEN $4 = '' THEN 0
                        ELSE ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', $4))
                    END DESC
                ) as keyword_rank,
                COALESCE(
                    jsonb_set(
                        COALESCE(c.metadata, '{{}}'::jsonb),
                        '{{document_name}}',
                        to_jsonb(COALESCE(d.filename, 'Unknown'))
                    ),
                    '{{}}'::jsonb
                ) as metadata
            FROM "{table}" v
            JOIN sys_chunks c ON v.chunk_id = c.id
            LEFT JOIN sys_documents d ON c.document_id = d.id
            WHERE 1=1 {filter}
            AND (
                $4 = ''
                OR to_tsvector('english', c.content) @@ plainto_tsquery('english', $4)
            )
            ORDER BY keyword_score DESC
            LIMIT $2 * 2
        ),
        combined AS (
            SELECT
                COALESCE(vr.id, kr.id) as id,
                COALESCE(vr.document_id, kr.document_id) as document_id,
                COALESCE(vr.content, kr.content) as content,
                COALESCE(vr.vector_score, 0)::float8 as vector_score,
                COALESCE(kr.keyword_score, 0)::float8 as keyword_score,
                COALESCE(vr.metadata, kr.metadata) as metadata,
                -- RRF scoring: score = weight * (1 / (k + rank))
                (
                    $5::float * COALESCE(1.0 / ($3 + vr.vector_rank), 0) +
                    $6::float * COALESCE(1.0 / ($3 + kr.keyword_rank), 0)
                ) as rrf_score
            FROM vector_results vr
            FULL OUTER JOIN keyword_results kr ON vr.id = kr.id
        )
        SELECT
            id,
            document_id,
            content,
            rrf_score as score,
            vector_score,
            keyword_score,
            metadata
        FROM combined
        ORDER BY rrf_score DESC
        LIMIT $2
        "#,
        table = table_name,
        filter = filter_clause
    );

    let rows: Vec<(Uuid, Uuid, String, f64, f64, f64, Option<serde_json::Value>)> =
        sqlx::query_as(&search_query)
            .bind(&embedding_str)
            .bind(top_k)
            .bind(rrf_k)
            .bind(&sanitized_query)
            .bind(vector_weight)
            .bind(keyword_weight)
            .fetch_all(pool.inner())
            .await?;

    let results = rows
        .into_iter()
        .map(|(id, document_id, content, score, vector_score, keyword_score, metadata)| {
            HybridSearchResult {
                id,
                document_id,
                content,
                score,
                vector_score,
                keyword_score,
                metadata,
            }
        })
        .collect();

    Ok(results)
}

/// Sanitize query string for tsquery to prevent syntax errors
fn sanitize_tsquery(query: &str) -> String {
    // Remove special characters that could break tsquery
    query
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .trim()
        .to_string()
}

pub async fn delete_vector(pool: &DbPool, project_id: Uuid, collection_name: &str, id: Uuid) -> Result<()> {
    let table_name = get_vector_table_name(Some(project_id), collection_name);

    let query = format!("DELETE FROM \"{}\" WHERE id = $1", table_name);

    let result = sqlx::query(&query)
        .bind(id)
        .execute(pool.inner())
        .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("Vector not found".to_string()));
    }

    Ok(())
}

pub async fn delete_vectors_by_external_id(
    pool: &DbPool,
    project_id: Uuid,
    collection_name: &str,
    external_id: &str,
) -> Result<u64> {
    let table_name = get_vector_table_name(Some(project_id), collection_name);

    let query = format!("DELETE FROM \"{}\" WHERE external_id = $1", table_name);

    let result = sqlx::query(&query)
        .bind(external_id)
        .execute(pool.inner())
        .await?;

    Ok(result.rows_affected())
}

/// Build SQL WHERE clause for metadata filtering
/// Supports the following filter operators:
/// - { "key": "value" } - exact match
/// - { "key": { "$eq": "value" } } - explicit equals
/// - { "key": { "$ne": "value" } } - not equals
/// - { "key": { "$gt": 5 } } - greater than (numeric)
/// - { "key": { "$gte": 5 } } - greater than or equal
/// - { "key": { "$lt": 10 } } - less than (numeric)
/// - { "key": { "$lte": 10 } } - less than or equal
/// - { "key": { "$in": ["a", "b"] } } - value in array
/// - { "key": { "$contains": "text" } } - text contains (case-insensitive)
/// - { "$and": [...] } - all conditions must match
/// - { "$or": [...] } - any condition must match
fn build_filter_clause(filter: &Option<serde_json::Value>) -> (String, Vec<serde_json::Value>) {
    match filter {
        None => (String::new(), vec![]),
        Some(serde_json::Value::Null) => (String::new(), vec![]),
        Some(serde_json::Value::Object(map)) if map.is_empty() => (String::new(), vec![]),
        Some(filter_value) => {
            let mut conditions = Vec::new();
            let mut param_offset = 3; // $1 and $2 are used for embedding and top_k

            if let Err(e) = parse_filter_object(filter_value, &mut conditions, &mut param_offset) {
                tracing::warn!("Invalid metadata filter: {}", e);
                return (String::new(), vec![]);
            }

            if conditions.is_empty() {
                (String::new(), vec![])
            } else {
                let clause = format!(" AND ({})", conditions.join(" AND "));
                (clause, vec![])
            }
        }
    }
}

fn parse_filter_object(
    value: &serde_json::Value,
    conditions: &mut Vec<String>,
    _param_offset: &mut usize,
) -> std::result::Result<(), String> {
    match value {
        serde_json::Value::Object(map) => {
            for (key, val) in map {
                match key.as_str() {
                    // Logical operators
                    "$and" => {
                        if let serde_json::Value::Array(arr) = val {
                            let mut sub_conditions = Vec::new();
                            for item in arr {
                                let mut inner_conds = Vec::new();
                                parse_filter_object(item, &mut inner_conds, _param_offset)?;
                                sub_conditions.extend(inner_conds);
                            }
                            if !sub_conditions.is_empty() {
                                conditions.push(format!("({})", sub_conditions.join(" AND ")));
                            }
                        } else {
                            return Err("$and must be an array".to_string());
                        }
                    }
                    "$or" => {
                        if let serde_json::Value::Array(arr) = val {
                            let mut sub_conditions = Vec::new();
                            for item in arr {
                                let mut inner_conds = Vec::new();
                                parse_filter_object(item, &mut inner_conds, _param_offset)?;
                                if !inner_conds.is_empty() {
                                    sub_conditions.push(format!("({})", inner_conds.join(" AND ")));
                                }
                            }
                            if !sub_conditions.is_empty() {
                                conditions.push(format!("({})", sub_conditions.join(" OR ")));
                            }
                        } else {
                            return Err("$or must be an array".to_string());
                        }
                    }
                    // Field filters
                    _ => {
                        let sanitized_key = sanitize_json_key(key);
                        parse_field_filter(&sanitized_key, val, conditions)?;
                    }
                }
            }
            Ok(())
        }
        _ => Err("Filter must be an object".to_string()),
    }
}

fn parse_field_filter(
    key: &str,
    value: &serde_json::Value,
    conditions: &mut Vec<String>,
) -> std::result::Result<(), String> {
    match value {
        // Direct value comparison (exact match)
        serde_json::Value::String(s) => {
            let escaped = escape_sql_string(s);
            conditions.push(format!("metadata->>'{}' = '{}'", key, escaped));
        }
        serde_json::Value::Number(n) => {
            conditions.push(format!("(metadata->'{}')::numeric = {}", key, n));
        }
        serde_json::Value::Bool(b) => {
            conditions.push(format!("(metadata->'{}')::boolean = {}", key, b));
        }
        serde_json::Value::Null => {
            conditions.push(format!("metadata->>'{}' IS NULL", key));
        }
        // Operator object
        serde_json::Value::Object(ops) => {
            for (op, op_val) in ops {
                match op.as_str() {
                    "$eq" => {
                        let cond = format_comparison(key, "=", op_val)?;
                        conditions.push(cond);
                    }
                    "$ne" => {
                        let cond = format_comparison(key, "!=", op_val)?;
                        conditions.push(cond);
                    }
                    "$gt" => {
                        let cond = format_numeric_comparison(key, ">", op_val)?;
                        conditions.push(cond);
                    }
                    "$gte" => {
                        let cond = format_numeric_comparison(key, ">=", op_val)?;
                        conditions.push(cond);
                    }
                    "$lt" => {
                        let cond = format_numeric_comparison(key, "<", op_val)?;
                        conditions.push(cond);
                    }
                    "$lte" => {
                        let cond = format_numeric_comparison(key, "<=", op_val)?;
                        conditions.push(cond);
                    }
                    "$in" => {
                        if let serde_json::Value::Array(arr) = op_val {
                            let values: Vec<String> = arr
                                .iter()
                                .filter_map(|v| match v {
                                    serde_json::Value::String(s) => {
                                        Some(format!("'{}'", escape_sql_string(s)))
                                    }
                                    serde_json::Value::Number(n) => Some(n.to_string()),
                                    _ => None,
                                })
                                .collect();
                            if !values.is_empty() {
                                conditions.push(format!(
                                    "metadata->>'{}' IN ({})",
                                    key,
                                    values.join(", ")
                                ));
                            }
                        } else {
                            return Err("$in operator requires an array".to_string());
                        }
                    }
                    "$contains" => {
                        if let serde_json::Value::String(s) = op_val {
                            let escaped = escape_sql_string(s);
                            conditions.push(format!(
                                "metadata->>'{}' ILIKE '%{}%'",
                                key, escaped
                            ));
                        } else {
                            return Err("$contains operator requires a string".to_string());
                        }
                    }
                    "$exists" => {
                        if let serde_json::Value::Bool(exists) = op_val {
                            if *exists {
                                conditions.push(format!("metadata ? '{}'", key));
                            } else {
                                conditions.push(format!("NOT (metadata ? '{}')", key));
                            }
                        } else {
                            return Err("$exists operator requires a boolean".to_string());
                        }
                    }
                    _ => {
                        return Err(format!("Unknown operator: {}", op));
                    }
                }
            }
        }
        serde_json::Value::Array(_) => {
            return Err("Array values not supported for direct comparison. Use $in operator.".to_string());
        }
    }
    Ok(())
}

fn format_comparison(key: &str, op: &str, value: &serde_json::Value) -> std::result::Result<String, String> {
    match value {
        serde_json::Value::String(s) => {
            let escaped = escape_sql_string(s);
            Ok(format!("metadata->>'{}' {} '{}'", key, op, escaped))
        }
        serde_json::Value::Number(n) => {
            Ok(format!("(metadata->'{}')::numeric {} {}", key, op, n))
        }
        serde_json::Value::Bool(b) => {
            Ok(format!("(metadata->'{}')::boolean {} {}", key, op, b))
        }
        serde_json::Value::Null => {
            if op == "=" {
                Ok(format!("metadata->>'{}' IS NULL", key))
            } else {
                Ok(format!("metadata->>'{}' IS NOT NULL", key))
            }
        }
        _ => Err(format!("Unsupported value type for {} comparison", op)),
    }
}

fn format_numeric_comparison(key: &str, op: &str, value: &serde_json::Value) -> std::result::Result<String, String> {
    match value {
        serde_json::Value::Number(n) => {
            Ok(format!("(metadata->'{}')::numeric {} {}", key, op, n))
        }
        _ => Err(format!("Numeric comparison {} requires a number", op)),
    }
}

/// Sanitize JSON key to prevent injection
fn sanitize_json_key(key: &str) -> String {
    key.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect()
}

/// Escape SQL string to prevent injection
fn escape_sql_string(s: &str) -> String {
    s.replace('\'', "''")
        .replace('\\', "\\\\")
}
