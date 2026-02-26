use crate::db::models::SearchResult;
use crate::db::DbPool;
use crate::vector::collection::get_vector_table_name;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
