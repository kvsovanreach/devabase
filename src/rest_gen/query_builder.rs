use crate::db::models::user_table::ColumnDefinition;
use crate::Result;
use uuid::Uuid;

/// Build CREATE TABLE SQL from column definitions.
/// Returns the CREATE TABLE statement followed by CREATE INDEX statements
/// for project_id and any foreign key columns.
pub fn build_create_table_sql(
    project_id: Uuid,
    table_name: &str,
    columns: &[ColumnDefinition],
) -> Result<String> {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);

    let mut column_defs = Vec::new();
    let mut foreign_keys = Vec::new();
    let mut index_columns: Vec<String> = Vec::new();

    // Always add project_id as first column (hidden from API but used for filtering)
    column_defs.push("project_id UUID NOT NULL".to_string());

    for col in columns {
        let mut def = format!("\"{}\" {}", col.name, map_column_type(&col.column_type)?);

        if col.primary {
            def.push_str(" PRIMARY KEY");
        }

        if !col.nullable && !col.primary {
            def.push_str(" NOT NULL");
        }

        if col.unique && !col.primary {
            def.push_str(" UNIQUE");
        }

        if let Some(default) = &col.default {
            def.push_str(&format!(" DEFAULT {}", default));
        }

        column_defs.push(def);

        // Handle foreign key reference
        if let Some(ref_table) = &col.references_table {
            let ref_column = col.references_column.as_deref().unwrap_or("id");
            let ref_full_table = super::schema::get_full_table_name(project_id, ref_table);

            let mut fk = format!(
                "FOREIGN KEY (\"{}\") REFERENCES \"{}\"(\"{}\")",
                col.name, ref_full_table, ref_column
            );

            if let Some(on_delete) = &col.on_delete {
                let action = match on_delete.to_uppercase().as_str() {
                    "CASCADE" => "CASCADE",
                    "SET NULL" | "SETNULL" => "SET NULL",
                    "SET DEFAULT" | "SETDEFAULT" => "SET DEFAULT",
                    "RESTRICT" => "RESTRICT",
                    "NO ACTION" | "NOACTION" => "NO ACTION",
                    _ => "NO ACTION",
                };
                fk.push_str(&format!(" ON DELETE {}", action));
            }

            foreign_keys.push(fk);
            // Index FK columns for fast joins and cascade deletes
            index_columns.push(col.name.clone());
        }
    }

    // Combine column definitions and foreign key constraints
    let mut all_defs = column_defs;
    all_defs.extend(foreign_keys);

    let mut sql = format!(
        "CREATE TABLE \"{}\" ({})",
        full_table_name,
        all_defs.join(", ")
    );

    // Auto-create index on project_id (every query filters by this)
    sql.push_str(&format!(
        "; CREATE INDEX \"idx_{}_project_id\" ON \"{}\" (project_id)",
        table_name, full_table_name
    ));

    // Auto-create indexes on foreign key columns
    for col_name in &index_columns {
        sql.push_str(&format!(
            "; CREATE INDEX \"idx_{}_{col_name}\" ON \"{}\" (\"{col_name}\")",
            table_name, full_table_name, col_name = col_name
        ));
    }

    Ok(sql)
}

/// Build DROP TABLE SQL
pub fn build_drop_table_sql(project_id: Uuid, table_name: &str) -> String {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);
    format!("DROP TABLE IF EXISTS \"{}\"", full_table_name)
}

/// Build SELECT query with filtering and pagination
pub fn build_select_query(
    project_id: Uuid,
    table_name: &str,
    columns: Option<&str>,
    filter: Option<&str>,
    order: Option<&str>,
    limit: i32,
    offset: i32,
) -> Result<(String, Vec<serde_json::Value>)> {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);

    // Parse columns
    let select_cols = match columns {
        Some(cols) => {
            let parsed: Vec<&str> = cols.split(',').map(|s| s.trim()).collect();
            // Validate column names
            for col in &parsed {
                validate_identifier(col)?;
            }
            parsed.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
        }
        None => "*".to_string(),
    };

    let mut query = format!(
        "SELECT {} FROM \"{}\" WHERE project_id = $1",
        select_cols, full_table_name
    );
    let mut params: Vec<serde_json::Value> = vec![serde_json::json!(project_id.to_string())];

    // Parse filters (format: column.op=value)
    if let Some(filter_str) = filter {
        let (where_clause, filter_params) = parse_filters(filter_str, params.len())?;
        if !where_clause.is_empty() {
            query.push_str(&format!(" AND {}", where_clause));
            params.extend(filter_params);
        }
    }

    // Parse order
    if let Some(order_str) = order {
        let order_clause = parse_order(order_str)?;
        query.push_str(&format!(" ORDER BY {}", order_clause));
    }

    // Limit with max cap
    let capped_limit = limit.min(1000);
    query.push_str(&format!(" LIMIT {} OFFSET {}", capped_limit, offset));

    Ok((query, params))
}

/// Build COUNT query for total
pub fn build_count_query(
    project_id: Uuid,
    table_name: &str,
    filter: Option<&str>,
) -> Result<(String, Vec<serde_json::Value>)> {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);

    let mut query = format!(
        "SELECT COUNT(*) FROM \"{}\" WHERE project_id = $1",
        full_table_name
    );
    let mut params: Vec<serde_json::Value> = vec![serde_json::json!(project_id.to_string())];

    if let Some(filter_str) = filter {
        let (where_clause, filter_params) = parse_filters(filter_str, params.len())?;
        if !where_clause.is_empty() {
            query.push_str(&format!(" AND {}", where_clause));
            params.extend(filter_params);
        }
    }

    Ok((query, params))
}

/// Build INSERT query
pub fn build_insert_query(
    project_id: Uuid,
    table_name: &str,
    data: &serde_json::Value,
) -> Result<(String, Vec<serde_json::Value>)> {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);

    let obj = data.as_object().ok_or_else(|| {
        crate::Error::Validation("Request body must be a JSON object".into())
    })?;

    let mut columns = vec!["project_id".to_string()];
    let mut placeholders = vec!["$1".to_string()];
    let mut params: Vec<serde_json::Value> = vec![serde_json::json!(project_id.to_string())];

    for (key, value) in obj {
        validate_identifier(key)?;
        columns.push(format!("\"{}\"", key));
        // Cast JSON objects and arrays to JSONB
        let placeholder = if value.is_object() || value.is_array() {
            format!("${}::jsonb", params.len() + 1)
        } else {
            format!("${}", params.len() + 1)
        };
        placeholders.push(placeholder);
        params.push(value.clone());
    }

    let query = format!(
        "INSERT INTO \"{}\" ({}) VALUES ({}) RETURNING *",
        full_table_name,
        columns.join(", "),
        placeholders.join(", ")
    );

    Ok((query, params))
}

/// Build UPDATE query
pub fn build_update_query(
    project_id: Uuid,
    table_name: &str,
    pk_column: &str,
    row_id: &str,
    data: &serde_json::Value,
) -> Result<(String, Vec<serde_json::Value>)> {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);

    let obj = data.as_object().ok_or_else(|| {
        crate::Error::Validation("Request body must be a JSON object".into())
    })?;

    if obj.is_empty() {
        return Err(crate::Error::Validation("No fields to update".into()));
    }

    // Block modifications to system columns
    for key in obj.keys() {
        if key == "project_id" || key == pk_column {
            return Err(crate::Error::Validation(format!(
                "Cannot modify system column '{}'",
                key
            )));
        }
    }

    let mut set_clauses = Vec::new();
    let mut params: Vec<serde_json::Value> = vec![
        serde_json::json!(project_id.to_string()),
        serde_json::json!(row_id),
    ];

    for (key, value) in obj {
        validate_identifier(key)?;
        // Cast JSON objects and arrays to JSONB
        let placeholder = if value.is_object() || value.is_array() {
            format!("${}::jsonb", params.len() + 1)
        } else {
            format!("${}", params.len() + 1)
        };
        set_clauses.push(format!("\"{}\" = {}", key, placeholder));
        params.push(value.clone());
    }

    let query = format!(
        "UPDATE \"{}\" SET {} WHERE project_id = $1 AND \"{}\" = $2 RETURNING *",
        full_table_name,
        set_clauses.join(", "),
        pk_column
    );

    Ok((query, params))
}

/// Build DELETE query
pub fn build_delete_query(
    project_id: Uuid,
    table_name: &str,
    pk_column: &str,
    row_id: &str,
) -> (String, Vec<serde_json::Value>) {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);

    let query = format!(
        "DELETE FROM \"{}\" WHERE project_id = $1 AND \"{}\" = $2 RETURNING \"{}\"",
        full_table_name, pk_column, pk_column
    );
    let params = vec![
        serde_json::json!(project_id.to_string()),
        serde_json::json!(row_id),
    ];

    (query, params)
}

/// Build SELECT single row query
pub fn build_select_one_query(
    project_id: Uuid,
    table_name: &str,
    pk_column: &str,
    row_id: &str,
) -> (String, Vec<serde_json::Value>) {
    let full_table_name = super::schema::get_full_table_name(project_id, table_name);

    let query = format!(
        "SELECT * FROM \"{}\" WHERE project_id = $1 AND \"{}\" = $2",
        full_table_name, pk_column
    );
    let params = vec![
        serde_json::json!(project_id.to_string()),
        serde_json::json!(row_id),
    ];

    (query, params)
}

/// Map user-friendly type names to PostgreSQL types
fn map_column_type(type_name: &str) -> Result<String> {
    let mapped = match type_name.to_lowercase().as_str() {
        "uuid" => "UUID",
        "text" | "string" => "TEXT",
        "int" | "integer" => "INTEGER",
        "bigint" => "BIGINT",
        "smallint" => "SMALLINT",
        "serial" => "SERIAL",
        "bigserial" => "BIGSERIAL",
        "float" | "real" => "REAL",
        "double" => "DOUBLE PRECISION",
        "decimal" | "numeric" => "NUMERIC",
        "bool" | "boolean" => "BOOLEAN",
        "json" | "jsonb" => "JSONB",
        "timestamp" | "timestamptz" => "TIMESTAMPTZ",
        "date" => "DATE",
        "time" => "TIME",
        "bytea" | "bytes" => "BYTEA",
        other => {
            // Allow varchar(n) and similar
            if other.starts_with("varchar") || other.starts_with("char") || other.starts_with("numeric(") {
                return Ok(other.to_uppercase());
            }
            return Err(crate::Error::Validation(format!(
                "Unsupported column type: {}",
                type_name
            )));
        }
    };

    Ok(mapped.to_string())
}

/// Parse filter string into WHERE clause
fn parse_filters(filter_str: &str, param_offset: usize) -> Result<(String, Vec<serde_json::Value>)> {
    let mut conditions = Vec::new();
    let mut params = Vec::new();

    for part in filter_str.split('&') {
        if part.is_empty() {
            continue;
        }

        // Format: column.op=value
        let (column_op, value) = part.split_once('=')
            .ok_or_else(|| crate::Error::Validation(format!("Invalid filter: {}", part)))?;

        let (column, op) = column_op.rsplit_once('.')
            .ok_or_else(|| crate::Error::Validation(format!("Invalid filter format: {}", part)))?;

        validate_identifier(column)?;

        let param_num = param_offset + params.len() + 1;
        let condition = match op {
            "eq" => format!("\"{}\" = ${}", column, param_num),
            "neq" => format!("\"{}\" != ${}", column, param_num),
            "gt" => format!("\"{}\" > ${}", column, param_num),
            "gte" => format!("\"{}\" >= ${}", column, param_num),
            "lt" => format!("\"{}\" < ${}", column, param_num),
            "lte" => format!("\"{}\" <= ${}", column, param_num),
            "like" => format!("\"{}\" ILIKE ${}", column, param_num),
            "is" => {
                if value == "null" {
                    format!("\"{}\" IS NULL", column)
                } else if value == "true" {
                    format!("\"{}\" IS TRUE", column)
                } else if value == "false" {
                    format!("\"{}\" IS FALSE", column)
                } else {
                    return Err(crate::Error::Validation(format!("Invalid is value: {}", value)));
                }
            }
            _ => return Err(crate::Error::Validation(format!("Invalid operator: {}", op))),
        };

        // Don't add param for IS conditions
        if op != "is" {
            // Auto-cast boolean and numeric values from string
            let typed_value = if value == "true" {
                serde_json::json!(true)
            } else if value == "false" {
                serde_json::json!(false)
            } else if value == "null" {
                serde_json::json!(null)
            } else if let Ok(n) = value.parse::<i64>() {
                serde_json::json!(n)
            } else if let Ok(n) = value.parse::<f64>() {
                serde_json::json!(n)
            } else {
                serde_json::json!(value)
            };
            params.push(typed_value);
        }
        conditions.push(condition);
    }

    Ok((conditions.join(" AND "), params))
}

/// Parse order string into ORDER BY clause
fn parse_order(order_str: &str) -> Result<String> {
    let mut clauses = Vec::new();

    for part in order_str.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }

        let (column, direction) = if let Some((col, dir)) = part.split_once(':') {
            let dir = match dir.to_lowercase().as_str() {
                "asc" => "ASC",
                "desc" => "DESC",
                _ => return Err(crate::Error::Validation(format!("Invalid order direction: {}", dir))),
            };
            (col, dir)
        } else {
            (part, "ASC")
        };

        validate_identifier(column)?;
        clauses.push(format!("\"{}\" {}", column, direction));
    }

    if clauses.is_empty() {
        return Err(crate::Error::Validation("Empty order clause".into()));
    }

    Ok(clauses.join(", "))
}

/// Validate identifier to prevent SQL injection
fn validate_identifier(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 63 {
        return Err(crate::Error::Validation("Invalid identifier length".into()));
    }

    if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(crate::Error::Validation(format!(
            "Invalid identifier: {}",
            name
        )));
    }

    // Block system prefixes
    let name_lower = name.to_lowercase();
    if name_lower.starts_with("pg_") || name_lower.starts_with("sys_") {
        return Err(crate::Error::Validation(
            "Cannot access system columns".into()
        ));
    }

    Ok(())
}
