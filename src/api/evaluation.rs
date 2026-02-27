use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::api::pagination::{PaginatedResponse, PaginationQuery};
use crate::auth::AuthContext;
use crate::db::models::Project;
use crate::db::DbPool;
use crate::rag::evaluation::{aggregate_metrics, evaluate_case, CaseResult, EvaluationMetrics};
use crate::rag::get_project_embedding_provider;
use crate::server::AppState;
use crate::vector;
use crate::{Error, Result};

// ─────────────────────────────────────────
// Database Models
// ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct EvaluationDataset {
    pub id: Uuid,
    pub project_id: Uuid,
    pub collection_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct EvaluationCase {
    pub id: Uuid,
    pub dataset_id: Uuid,
    pub query: String,
    pub expected_chunk_ids: Vec<Uuid>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct EvaluationRun {
    pub id: Uuid,
    pub dataset_id: Uuid,
    pub search_mode: String,
    pub config: Option<serde_json::Value>,
    pub metrics: serde_json::Value,
    pub case_results: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// ─────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateDatasetRequest {
    pub collection_name: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDatasetRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCaseRequest {
    pub query: String,
    pub expected_chunk_ids: Vec<Uuid>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCaseRequest {
    pub query: Option<String>,
    pub expected_chunk_ids: Option<Vec<Uuid>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct RunEvaluationRequest {
    #[serde(default = "default_search_mode")]
    pub search_mode: String,
    #[serde(default = "default_top_k")]
    pub top_k: i32,
    pub vector_weight: Option<f32>,
    pub keyword_weight: Option<f32>,
}

fn default_search_mode() -> String {
    "vector".to_string()
}

fn default_top_k() -> i32 {
    5
}

#[derive(Debug, Serialize)]
pub struct DatasetWithStats {
    #[serde(flatten)]
    pub dataset: EvaluationDataset,
    pub case_count: i64,
    pub run_count: i64,
    pub last_run: Option<chrono::DateTime<chrono::Utc>>,
    pub collection_name: String,
}

#[derive(Debug, Serialize)]
pub struct DatasetDetail {
    #[serde(flatten)]
    pub dataset: EvaluationDataset,
    pub collection_name: String,
    pub cases: Vec<EvaluationCase>,
}

#[derive(Debug, Serialize)]
pub struct RunResult {
    pub run: EvaluationRun,
    pub metrics: EvaluationMetrics,
}

// ─────────────────────────────────────────
// Dataset Endpoints
// ─────────────────────────────────────────

/// GET /evaluation/datasets - List all datasets with pagination
pub async fn list_datasets(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<PaginatedResponse<DatasetWithStats>>> {
    let project_id = auth.require_project()?;

    let (limit, offset) = query.get_pagination();

    // Get total count
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sys_evaluation_datasets WHERE project_id = $1"
    )
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await?;

    let datasets: Vec<DatasetWithStats> = sqlx::query_as::<_, (
        Uuid, Uuid, Uuid, String, Option<String>,
        chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>,
        i64, i64, Option<chrono::DateTime<chrono::Utc>>, String
    )>(
        r#"
        SELECT
            d.id, d.project_id, d.collection_id, d.name, d.description,
            d.created_at, d.updated_at,
            COALESCE((SELECT COUNT(*) FROM sys_evaluation_cases WHERE dataset_id = d.id), 0) as case_count,
            COALESCE((SELECT COUNT(*) FROM sys_evaluation_runs WHERE dataset_id = d.id), 0) as run_count,
            (SELECT MAX(created_at) FROM sys_evaluation_runs WHERE dataset_id = d.id) as last_run,
            c.name as collection_name
        FROM sys_evaluation_datasets d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.project_id = $1
        ORDER BY d.updated_at DESC
        LIMIT $2 OFFSET $3
        "#
    )
    .bind(project_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(state.pool.inner())
    .await?
    .into_iter()
    .map(|(id, project_id, collection_id, name, description, created_at, updated_at, case_count, run_count, last_run, collection_name)| {
        DatasetWithStats {
            dataset: EvaluationDataset {
                id,
                project_id,
                collection_id,
                name,
                description,
                created_at,
                updated_at,
            },
            case_count,
            run_count,
            last_run,
            collection_name,
        }
    })
    .collect();

    Ok(Json(PaginatedResponse::new(datasets, total.0, limit, offset)))
}

/// POST /evaluation/datasets - Create a dataset
pub async fn create_dataset(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<CreateDatasetRequest>,
) -> Result<Json<EvaluationDataset>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Get collection ID
    let collection = vector::get_collection(&state.pool, &req.collection_name, Some(project_id)).await?;

    let dataset: EvaluationDataset = sqlx::query_as(
        r#"
        INSERT INTO sys_evaluation_datasets (project_id, collection_id, name, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#
    )
    .bind(project_id)
    .bind(collection.id)
    .bind(&req.name)
    .bind(&req.description)
    .fetch_one(state.pool.inner())
    .await?;

    Ok(Json(dataset))
}

/// GET /evaluation/datasets/:id - Get dataset with cases
pub async fn get_dataset(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(dataset_id): Path<Uuid>,
) -> Result<Json<DatasetDetail>> {
    let project_id = auth.require_project()?;

    let row: (
        Uuid, Uuid, Uuid, String, Option<String>,
        chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>, String
    ) = sqlx::query_as(
        r#"
        SELECT d.id, d.project_id, d.collection_id, d.name, d.description,
               d.created_at, d.updated_at, c.name as collection_name
        FROM sys_evaluation_datasets d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.id = $1 AND d.project_id = $2
        "#
    )
    .bind(dataset_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Dataset not found".to_string()))?;

    let dataset = EvaluationDataset {
        id: row.0,
        project_id: row.1,
        collection_id: row.2,
        name: row.3,
        description: row.4,
        created_at: row.5,
        updated_at: row.6,
    };
    let collection_name = row.7;

    let cases: Vec<EvaluationCase> = sqlx::query_as(
        "SELECT * FROM sys_evaluation_cases WHERE dataset_id = $1 ORDER BY created_at"
    )
    .bind(dataset_id)
    .fetch_all(state.pool.inner())
    .await?;

    Ok(Json(DatasetDetail {
        dataset,
        collection_name,
        cases,
    }))
}

/// PATCH /evaluation/datasets/:id - Update dataset
pub async fn update_dataset(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(dataset_id): Path<Uuid>,
    Json(req): Json<UpdateDatasetRequest>,
) -> Result<Json<EvaluationDataset>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let dataset: EvaluationDataset = sqlx::query_as(
        r#"
        UPDATE sys_evaluation_datasets
        SET name = COALESCE($3, name),
            description = COALESCE($4, description),
            updated_at = NOW()
        WHERE id = $1 AND project_id = $2
        RETURNING *
        "#
    )
    .bind(dataset_id)
    .bind(project_id)
    .bind(&req.name)
    .bind(&req.description)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Dataset not found".to_string()))?;

    Ok(Json(dataset))
}

/// DELETE /evaluation/datasets/:id - Delete dataset
pub async fn delete_dataset(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(dataset_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let result = sqlx::query(
        "DELETE FROM sys_evaluation_datasets WHERE id = $1 AND project_id = $2"
    )
    .bind(dataset_id)
    .bind(project_id)
    .execute(state.pool.inner())
    .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("Dataset not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ─────────────────────────────────────────
// Case Endpoints
// ─────────────────────────────────────────

/// POST /evaluation/datasets/:id/cases - Add test case
pub async fn create_case(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(dataset_id): Path<Uuid>,
    Json(req): Json<CreateCaseRequest>,
) -> Result<Json<EvaluationCase>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Verify dataset belongs to project
    verify_dataset_ownership(&state.pool, dataset_id, project_id).await?;

    let case: EvaluationCase = sqlx::query_as(
        r#"
        INSERT INTO sys_evaluation_cases (dataset_id, query, expected_chunk_ids, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#
    )
    .bind(dataset_id)
    .bind(&req.query)
    .bind(&req.expected_chunk_ids)
    .bind(&req.metadata)
    .fetch_one(state.pool.inner())
    .await?;

    Ok(Json(case))
}

/// PATCH /evaluation/cases/:id - Update test case
pub async fn update_case(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(case_id): Path<Uuid>,
    Json(req): Json<UpdateCaseRequest>,
) -> Result<Json<EvaluationCase>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Verify case exists and belongs to project
    let _existing: EvaluationCase = sqlx::query_as(
        r#"
        SELECT c.* FROM sys_evaluation_cases c
        JOIN sys_evaluation_datasets d ON c.dataset_id = d.id
        WHERE c.id = $1 AND d.project_id = $2
        "#
    )
    .bind(case_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Case not found".to_string()))?;

    let case: EvaluationCase = sqlx::query_as(
        r#"
        UPDATE sys_evaluation_cases
        SET query = COALESCE($2, query),
            expected_chunk_ids = COALESCE($3, expected_chunk_ids),
            metadata = COALESCE($4, metadata),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        "#
    )
    .bind(case_id)
    .bind(&req.query)
    .bind(&req.expected_chunk_ids)
    .bind(&req.metadata)
    .fetch_one(state.pool.inner())
    .await?;

    Ok(Json(case))
}

/// DELETE /evaluation/cases/:id - Delete test case
pub async fn delete_case(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(case_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let result = sqlx::query(
        r#"
        DELETE FROM sys_evaluation_cases
        WHERE id = $1 AND dataset_id IN (
            SELECT id FROM sys_evaluation_datasets WHERE project_id = $2
        )
        "#
    )
    .bind(case_id)
    .bind(project_id)
    .execute(state.pool.inner())
    .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("Case not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ─────────────────────────────────────────
// Run Endpoints
// ─────────────────────────────────────────

/// POST /evaluation/datasets/:id/run - Run evaluation
pub async fn run_evaluation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(dataset_id): Path<Uuid>,
    Json(req): Json<RunEvaluationRequest>,
) -> Result<Json<RunResult>> {
    let project_id = auth.require_project()?;

    // Get dataset and collection name
    let row: (
        Uuid, Uuid, Uuid, String, Option<String>,
        chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>, String
    ) = sqlx::query_as(
        r#"
        SELECT d.id, d.project_id, d.collection_id, d.name, d.description,
               d.created_at, d.updated_at, c.name as collection_name
        FROM sys_evaluation_datasets d
        JOIN sys_collections c ON d.collection_id = c.id
        WHERE d.id = $1 AND d.project_id = $2
        "#
    )
    .bind(dataset_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Dataset not found".to_string()))?;

    let collection_name = row.7;

    // Get test cases
    let cases: Vec<EvaluationCase> = sqlx::query_as(
        "SELECT * FROM sys_evaluation_cases WHERE dataset_id = $1"
    )
    .bind(dataset_id)
    .fetch_all(state.pool.inner())
    .await?;

    if cases.is_empty() {
        return Err(Error::BadRequest("Dataset has no test cases".to_string()));
    }

    // Get embedding provider
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(state.pool.inner())
        .await?;

    let settings = project.settings.unwrap_or_default();
    let embedding_provider = get_project_embedding_provider(&settings)?;

    // Run evaluation for each case
    let mut case_results: Vec<CaseResult> = Vec::new();
    let k = req.top_k as usize;

    for case in &cases {
        // Generate embedding for query
        let embeddings = embedding_provider.embed(&[case.query.clone()]).await?;
        let embedding = embeddings.into_iter().next()
            .ok_or_else(|| Error::Internal("Failed to generate embedding".to_string()))?;

        // Search based on mode
        let retrieved_ids: Vec<Uuid> = if req.search_mode == "hybrid" {
            let params = vector::HybridSearchParams {
                query: case.query.clone(),
                embedding,
                top_k: Some(req.top_k),
                vector_weight: req.vector_weight,
                keyword_weight: req.keyword_weight,
                filter: None,
            };
            let results = vector::hybrid_search(&state.pool, project_id, &collection_name, params).await?;
            results.into_iter().map(|r| r.id).collect()
        } else {
            let query = vector::SearchQuery {
                embedding,
                top_k: Some(req.top_k),
                filter: None,
                include_metadata: Some(false),
            };
            let results = vector::search_vectors(&state.pool, project_id, &collection_name, query).await?;
            results.into_iter().map(|r| r.id).collect()
        };

        let result = evaluate_case(
            case.id,
            &case.query,
            &retrieved_ids,
            &case.expected_chunk_ids,
            k,
        );
        case_results.push(result);
    }

    // Aggregate metrics
    let metrics = aggregate_metrics(&case_results, k);

    // Store run
    let config = serde_json::json!({
        "top_k": req.top_k,
        "vector_weight": req.vector_weight,
        "keyword_weight": req.keyword_weight,
    });

    let run: EvaluationRun = sqlx::query_as(
        r#"
        INSERT INTO sys_evaluation_runs (dataset_id, search_mode, config, metrics, case_results)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#
    )
    .bind(dataset_id)
    .bind(&req.search_mode)
    .bind(&config)
    .bind(serde_json::to_value(&metrics)?)
    .bind(serde_json::to_value(&case_results)?)
    .fetch_one(state.pool.inner())
    .await?;

    Ok(Json(RunResult { run, metrics }))
}

/// GET /evaluation/datasets/:id/runs - Get run history with pagination
pub async fn list_runs(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(dataset_id): Path<Uuid>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<PaginatedResponse<EvaluationRun>>> {
    let project_id = auth.require_project()?;

    // Verify dataset belongs to project
    verify_dataset_ownership(&state.pool, dataset_id, project_id).await?;

    let (limit, offset) = query.get_pagination();

    // Get total count
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sys_evaluation_runs WHERE dataset_id = $1"
    )
    .bind(dataset_id)
    .fetch_one(state.pool.inner())
    .await?;

    let runs: Vec<EvaluationRun> = sqlx::query_as(
        r#"
        SELECT * FROM sys_evaluation_runs
        WHERE dataset_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        "#
    )
    .bind(dataset_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(state.pool.inner())
    .await?;

    Ok(Json(PaginatedResponse::new(runs, total.0, limit, offset)))
}

/// GET /evaluation/runs/:id - Get run details
pub async fn get_run(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(run_id): Path<Uuid>,
) -> Result<Json<EvaluationRun>> {
    let project_id = auth.require_project()?;

    let run: EvaluationRun = sqlx::query_as(
        r#"
        SELECT r.* FROM sys_evaluation_runs r
        JOIN sys_evaluation_datasets d ON r.dataset_id = d.id
        WHERE r.id = $1 AND d.project_id = $2
        "#
    )
    .bind(run_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Run not found".to_string()))?;

    Ok(Json(run))
}

// ─────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────

async fn verify_dataset_ownership(pool: &DbPool, dataset_id: Uuid, project_id: Uuid) -> Result<()> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM sys_evaluation_datasets WHERE id = $1 AND project_id = $2)"
    )
    .bind(dataset_id)
    .bind(project_id)
    .fetch_one(pool.inner())
    .await?;

    if !exists {
        return Err(Error::NotFound("Dataset not found".to_string()));
    }

    Ok(())
}
