use crate::db::models::{Collection, CollectionStats, CreateCollection, UpdateCollection};
use crate::db::DbPool;
use crate::{Config, Error, Result};
use uuid::Uuid;

/// Get the vector table name for a collection
/// Format: uv_{project_id}_{collection_name}
pub fn get_vector_table_name(project_id: Option<Uuid>, collection_name: &str) -> String {
    match project_id {
        Some(pid) => format!("uv_{}_{}", pid.to_string().replace('-', "_"), collection_name),
        None => format!("uv_default_{}", collection_name),
    }
}

pub async fn create_collection(
    pool: &DbPool,
    input: CreateCollection,
    config: &Config,
    project_id: Option<Uuid>,
) -> Result<Collection> {
    // Validate collection name (alphanumeric and underscores only)
    if !input
        .name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_')
    {
        return Err(Error::BadRequest(
            "Collection name must be alphanumeric with underscores only".to_string(),
        ));
    }

    let dimensions = input.dimensions.unwrap_or(config.vector.default_dimensions as i32);
    let metric = input
        .metric
        .unwrap_or_else(|| config.vector.default_metric.clone());
    let index_type = input
        .index_type
        .unwrap_or_else(|| config.vector.index_type.clone());

    // Validate metric
    if !["cosine", "l2", "euclidean", "ip", "inner_product"].contains(&metric.as_str()) {
        return Err(Error::BadRequest(format!("Invalid metric: {}", metric)));
    }

    let id = Uuid::new_v4();

    // Insert collection (trigger will create the vector table)
    sqlx::query(
        r#"
        INSERT INTO sys_collections (id, name, dimensions, metric, index_type, metadata, project_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(id)
    .bind(&input.name)
    .bind(dimensions)
    .bind(&metric)
    .bind(&index_type)
    .bind(&input.metadata)
    .bind(project_id)
    .execute(pool.inner())
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("collections_name_key") {
                return Error::Conflict(format!("Collection '{}' already exists", input.name));
            }
        }
        Error::Database(e)
    })?;

    tracing::info!("Created collection '{}' with {} dimensions for project {:?}", input.name, dimensions, project_id);

    // Fetch the created collection with document_count
    let collection = get_collection_by_id(pool, id).await?;
    Ok(collection)
}

pub async fn get_collection(pool: &DbPool, name: &str, project_id: Option<Uuid>) -> Result<Collection> {
    let collection: Option<Collection> = if let Some(pid) = project_id {
        sqlx::query_as(
            r#"
            SELECT
                c.id, c.name, c.dimensions, c.metric, c.index_type, c.metadata,
                c.vector_count, COALESCE(d.doc_count, 0) as document_count,
                c.project_id, c.rag_enabled, c.rag_config, c.created_at, c.updated_at
            FROM sys_collections c
            LEFT JOIN (
                SELECT collection_id, COUNT(*) as doc_count
                FROM sys_documents
                GROUP BY collection_id
            ) d ON d.collection_id = c.id
            WHERE c.name = $1 AND c.project_id = $2
            "#
        )
            .bind(name)
            .bind(pid)
            .fetch_optional(pool.inner())
            .await?
    } else {
        sqlx::query_as(
            r#"
            SELECT
                c.id, c.name, c.dimensions, c.metric, c.index_type, c.metadata,
                c.vector_count, COALESCE(d.doc_count, 0) as document_count,
                c.project_id, c.rag_enabled, c.rag_config, c.created_at, c.updated_at
            FROM sys_collections c
            LEFT JOIN (
                SELECT collection_id, COUNT(*) as doc_count
                FROM sys_documents
                GROUP BY collection_id
            ) d ON d.collection_id = c.id
            WHERE c.name = $1 AND c.project_id IS NULL
            "#
        )
            .bind(name)
            .fetch_optional(pool.inner())
            .await?
    };

    collection.ok_or_else(|| Error::NotFound(format!("Collection '{}' not found", name)))
}

pub async fn get_collection_by_id(pool: &DbPool, id: Uuid) -> Result<Collection> {
    let collection: Collection = sqlx::query_as(
        r#"
        SELECT
            c.id, c.name, c.dimensions, c.metric, c.index_type, c.metadata,
            c.vector_count, COALESCE(d.doc_count, 0) as document_count,
            c.project_id, c.rag_enabled, c.rag_config, c.created_at, c.updated_at
        FROM sys_collections c
        LEFT JOIN (
            SELECT collection_id, COUNT(*) as doc_count
            FROM sys_documents
            GROUP BY collection_id
        ) d ON d.collection_id = c.id
        WHERE c.id = $1
        "#
    )
        .bind(id)
        .fetch_optional(pool.inner())
        .await?
        .ok_or_else(|| Error::NotFound("Collection not found".to_string()))?;

    Ok(collection)
}

pub async fn list_collections(pool: &DbPool, project_id: Option<Uuid>) -> Result<Vec<Collection>> {
    let collections: Vec<Collection> = if let Some(pid) = project_id {
        sqlx::query_as(
            r#"
            SELECT
                c.id, c.name, c.dimensions, c.metric, c.index_type, c.metadata,
                c.vector_count, COALESCE(d.doc_count, 0) as document_count,
                c.project_id, c.rag_enabled, c.rag_config, c.created_at, c.updated_at
            FROM sys_collections c
            LEFT JOIN (
                SELECT collection_id, COUNT(*) as doc_count
                FROM sys_documents
                GROUP BY collection_id
            ) d ON d.collection_id = c.id
            WHERE c.project_id = $1
            ORDER BY c.created_at DESC
            "#
        )
            .bind(pid)
            .fetch_all(pool.inner())
            .await?
    } else {
        sqlx::query_as(
            r#"
            SELECT
                c.id, c.name, c.dimensions, c.metric, c.index_type, c.metadata,
                c.vector_count, COALESCE(d.doc_count, 0) as document_count,
                c.project_id, c.rag_enabled, c.rag_config, c.created_at, c.updated_at
            FROM sys_collections c
            LEFT JOIN (
                SELECT collection_id, COUNT(*) as doc_count
                FROM sys_documents
                GROUP BY collection_id
            ) d ON d.collection_id = c.id
            WHERE c.project_id IS NULL
            ORDER BY c.created_at DESC
            "#
        )
            .fetch_all(pool.inner())
            .await?
    };

    Ok(collections)
}

pub async fn update_collection(
    pool: &DbPool,
    name: &str,
    input: UpdateCollection,
    project_id: Option<Uuid>,
) -> Result<Collection> {
    let result = if let Some(pid) = project_id {
        sqlx::query(
            r#"
            UPDATE sys_collections SET metadata = COALESCE($2, metadata)
            WHERE name = $1 AND project_id = $3
            "#,
        )
        .bind(name)
        .bind(&input.metadata)
        .bind(pid)
        .execute(pool.inner())
        .await?
    } else {
        sqlx::query(
            r#"
            UPDATE sys_collections SET metadata = COALESCE($2, metadata)
            WHERE name = $1 AND project_id IS NULL
            "#,
        )
        .bind(name)
        .bind(&input.metadata)
        .execute(pool.inner())
        .await?
    };

    if result.rows_affected() == 0 {
        return Err(Error::NotFound(format!("Collection '{}' not found", name)));
    }

    // Fetch the updated collection with document_count
    get_collection(pool, name, project_id).await
}

pub async fn delete_collection(pool: &DbPool, name: &str, project_id: Option<Uuid>) -> Result<()> {
    // The trigger will drop the vector table
    let result = if let Some(pid) = project_id {
        sqlx::query("DELETE FROM sys_collections WHERE name = $1 AND project_id = $2")
            .bind(name)
            .bind(pid)
            .execute(pool.inner())
            .await?
    } else {
        sqlx::query("DELETE FROM sys_collections WHERE name = $1 AND project_id IS NULL")
            .bind(name)
            .execute(pool.inner())
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(Error::NotFound(format!("Collection '{}' not found", name)));
    }

    tracing::info!("Deleted collection '{}' from project {:?}", name, project_id);
    Ok(())
}

pub async fn get_collection_stats(pool: &DbPool, name: &str, project_id: Option<Uuid>) -> Result<CollectionStats> {
    let collection = get_collection(pool, name, project_id).await?;

    // Get vector count from the collection-specific table
    let table_name = get_vector_table_name(project_id, name);
    let count_query = format!("SELECT COUNT(*) as count FROM \"{}\"", table_name);

    let (vector_count,): (i64,) = sqlx::query_as(&count_query)
        .fetch_one(pool.inner())
        .await
        .unwrap_or((0,));

    // Estimate storage size
    let size_query = format!(
        "SELECT pg_total_relation_size('\"{}\"') as size",
        table_name
    );
    let (storage_bytes,): (i64,) = sqlx::query_as(&size_query)
        .fetch_one(pool.inner())
        .await
        .unwrap_or((0,));

    Ok(CollectionStats {
        name: collection.name,
        dimensions: collection.dimensions,
        metric: collection.metric,
        vector_count,
        index_type: collection.index_type,
        storage_bytes,
    })
}

pub async fn update_vector_count(pool: &DbPool, collection_id: Uuid, delta: i64) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sys_collections
        SET vector_count = vector_count + $2
        WHERE id = $1
        "#,
    )
    .bind(collection_id)
    .bind(delta)
    .execute(pool.inner())
    .await?;

    Ok(())
}
