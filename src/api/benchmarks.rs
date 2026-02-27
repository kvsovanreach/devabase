//! Benchmark API Endpoints
//!
//! Provides REST API for running evaluations and retrieving results.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::evaluation::{
    BenchmarkConfig, BenchmarkSuiteResult, EvaluationConfig, EvaluationConfigs,
    EvaluationRunner, DatasetSourceConfig, ReportGenerator, BEIRLoader,
    standard_ablation_configs, chunk_size_ablation_configs, top_k_ablation_configs,
};
use crate::server::AppState;
use crate::{Error, Result};

// ─────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RunBenchmarkRequest {
    pub collection: String,
    pub dataset_source: DatasetSourceRequest,
    #[serde(default)]
    pub configs: ConfigsRequest,
    pub output_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DatasetSourceRequest {
    Beir { name: String, data_dir: Option<String> },
    Custom { path: String },
    Dataset { dataset_id: Uuid },
    Synthetic { num_queries: usize, num_docs: usize },
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ConfigsRequest {
    #[default]
    Standard,
    ChunkSize,
    TopK,
    Custom { configs: Vec<BenchmarkConfigRequest> },
}

#[derive(Debug, Deserialize)]
pub struct BenchmarkConfigRequest {
    pub name: String,
    pub description: Option<String>,
    pub search_method: String,
    pub top_k: Option<usize>,
    pub vector_weight: Option<f64>,
    pub keyword_weight: Option<f64>,
    pub rerank_enabled: Option<bool>,
    pub rerank_top_n: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct BenchmarkRunResponse {
    pub id: Uuid,
    pub suite_name: String,
    pub dataset_name: String,
    pub best_config: String,
    pub results_summary: Vec<ResultSummary>,
    pub reports_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ResultSummary {
    pub config_name: String,
    pub ndcg: f64,
    pub mrr: f64,
    pub precision: f64,
    pub recall: f64,
    pub latency_ms: f64,
}

#[derive(Debug, Deserialize)]
pub struct ListBenchmarksQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct BenchmarkListItem {
    pub id: Uuid,
    pub suite_name: String,
    pub dataset_name: String,
    pub best_config: String,
    pub num_configs: usize,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct AvailableDatasetsResponse {
    pub beir_datasets: Vec<BeirDatasetInfo>,
}

#[derive(Debug, Serialize)]
pub struct BeirDatasetInfo {
    pub name: String,
    pub description: String,
    pub downloaded: bool,
}

#[derive(Debug, Deserialize)]
pub struct DownloadDatasetRequest {
    pub dataset_type: String,
    pub name: String,
    pub data_dir: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportResponse {
    pub format: String,
    pub content: String,
}

// ─────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────

/// POST /v1/benchmarks/run - Run a benchmark evaluation
pub async fn run_benchmark(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<RunBenchmarkRequest>,
) -> Result<Json<BenchmarkRunResponse>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    // Build evaluation config
    let dataset_source = match req.dataset_source {
        DatasetSourceRequest::Beir { name, data_dir } => {
            DatasetSourceConfig::BEIR {
                name,
                data_dir: data_dir.unwrap_or_else(|| "./data/benchmarks".to_string()),
            }
        }
        DatasetSourceRequest::Custom { path } => {
            DatasetSourceConfig::Custom { path }
        }
        DatasetSourceRequest::Dataset { dataset_id } => {
            DatasetSourceConfig::DevabaseDataset { dataset_id }
        }
        DatasetSourceRequest::Synthetic { num_queries, num_docs } => {
            DatasetSourceConfig::Synthetic { num_queries, num_docs }
        }
    };

    let configs = match req.configs {
        ConfigsRequest::Standard => EvaluationConfigs::Standard,
        ConfigsRequest::ChunkSize => EvaluationConfigs::ChunkSize,
        ConfigsRequest::TopK => EvaluationConfigs::TopK,
        ConfigsRequest::Custom { configs } => {
            EvaluationConfigs::Custom(configs.into_iter().map(|c| {
                BenchmarkConfig {
                    name: c.name,
                    description: c.description,
                    search_method: match c.search_method.as_str() {
                        "keyword" => crate::evaluation::SearchMethod::Keyword,
                        "hybrid" => crate::evaluation::SearchMethod::Hybrid,
                        _ => crate::evaluation::SearchMethod::Vector,
                    },
                    top_k: c.top_k.unwrap_or(10),
                    vector_weight: c.vector_weight,
                    keyword_weight: c.keyword_weight,
                    rerank_enabled: c.rerank_enabled.unwrap_or(false),
                    rerank_top_n: c.rerank_top_n,
                    ..Default::default()
                }
            }).collect())
        }
    };

    let eval_config = EvaluationConfig {
        dataset_source,
        collection_name: req.collection,
        project_id,
        output_dir: req.output_dir.clone(),
        configs,
    };

    // Run evaluation
    let runner = EvaluationRunner::new(state.pool.clone());
    let result = runner.run(eval_config).await?;

    // Build response
    let results_summary: Vec<ResultSummary> = result.suite.results.iter().map(|r| {
        ResultSummary {
            config_name: r.config.name.clone(),
            ndcg: r.metrics.ndcg_at_k,
            mrr: r.metrics.mrr,
            precision: r.metrics.precision_at_k,
            recall: r.metrics.recall_at_k,
            latency_ms: r.latency_stats.mean_latency_ms,
        }
    }).collect();

    Ok(Json(BenchmarkRunResponse {
        id: result.id,
        suite_name: result.suite.suite_name.clone(),
        dataset_name: result.suite.dataset_name.clone(),
        best_config: result.suite.best_config.clone(),
        results_summary,
        reports_path: req.output_dir,
    }))
}

/// GET /v1/benchmarks - List benchmark results
pub async fn list_benchmarks(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<ListBenchmarksQuery>,
) -> Result<Json<Vec<BenchmarkListItem>>> {
    let project_id = auth.require_project()?;

    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);

    let results: Vec<(Uuid, String, String, serde_json::Value, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        r#"
        SELECT id, suite_name, dataset_name, results, created_at
        FROM sys_benchmark_results
        WHERE project_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        "#
    )
    .bind(project_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(state.pool.inner())
    .await?;

    let items: Vec<BenchmarkListItem> = results.into_iter().map(|(id, suite_name, dataset_name, results, created_at)| {
        let best_config = results["best_config"].as_str().unwrap_or("").to_string();
        let num_configs = results["results"].as_array().map(|a| a.len()).unwrap_or(0);

        BenchmarkListItem {
            id,
            suite_name,
            dataset_name,
            best_config,
            num_configs,
            created_at,
        }
    }).collect();

    Ok(Json(items))
}

/// GET /v1/benchmarks/:id - Get benchmark result details
pub async fn get_benchmark(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<BenchmarkSuiteResult>> {
    let project_id = auth.require_project()?;

    let (results,): (serde_json::Value,) = sqlx::query_as(
        "SELECT results FROM sys_benchmark_results WHERE id = $1 AND project_id = $2"
    )
    .bind(id)
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|_| Error::NotFound("Benchmark result not found".to_string()))?;

    let suite: BenchmarkSuiteResult = serde_json::from_value(results)
        .map_err(|e| Error::Internal(format!("Failed to deserialize results: {}", e)))?;

    Ok(Json(suite))
}

/// GET /v1/benchmarks/:id/export - Export benchmark results
pub async fn export_benchmark(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
    Query(params): Query<ExportParams>,
) -> Result<Json<ExportResponse>> {
    let project_id = auth.require_project()?;

    let (results,): (serde_json::Value,) = sqlx::query_as(
        "SELECT results FROM sys_benchmark_results WHERE id = $1 AND project_id = $2"
    )
    .bind(id)
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|_| Error::NotFound("Benchmark result not found".to_string()))?;

    let suite: BenchmarkSuiteResult = serde_json::from_value(results)
        .map_err(|e| Error::Internal(format!("Failed to deserialize results: {}", e)))?;

    let format = params.format.as_deref().unwrap_or("latex");
    let content = match format {
        "latex" => ReportGenerator::to_latex_table(&suite),
        "latex_ci" => ReportGenerator::to_latex_table_with_ci(&suite),
        "latex_sig" => ReportGenerator::to_latex_significance_table(&suite.comparisons),
        "csv" => ReportGenerator::to_csv(&suite),
        "markdown" | "md" => ReportGenerator::to_markdown(&suite),
        "json" => ReportGenerator::to_json(&suite)?,
        _ => return Err(Error::BadRequest(format!("Unknown format: {}", format))),
    };

    Ok(Json(ExportResponse {
        format: format.to_string(),
        content,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ExportParams {
    pub format: Option<String>,
}

/// DELETE /v1/benchmarks/:id - Delete benchmark result
pub async fn delete_benchmark(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let result = sqlx::query(
        "DELETE FROM sys_benchmark_results WHERE id = $1 AND project_id = $2"
    )
    .bind(id)
    .bind(project_id)
    .execute(state.pool.inner())
    .await?;

    if result.rows_affected() == 0 {
        return Err(Error::NotFound("Benchmark result not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}

/// GET /v1/benchmarks/datasets - List available benchmark datasets
pub async fn list_datasets(
    State(_state): State<Arc<AppState>>,
    _auth: AuthContext,
) -> Result<Json<AvailableDatasetsResponse>> {
    let beir_datasets: Vec<BeirDatasetInfo> = BEIRLoader::available_datasets()
        .into_iter()
        .map(|(name, description)| {
            // Check if downloaded (simplified check)
            let downloaded = std::path::Path::new(&format!("./data/benchmarks/beir/{}", name)).exists();
            BeirDatasetInfo {
                name: name.to_string(),
                description: description.to_string(),
                downloaded,
            }
        })
        .collect();

    Ok(Json(AvailableDatasetsResponse { beir_datasets }))
}

/// POST /v1/benchmarks/datasets/download - Download a benchmark dataset
pub async fn download_dataset(
    State(_state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<DownloadDatasetRequest>,
) -> Result<Json<serde_json::Value>> {
    let _project_id = auth.require_project()?;

    if !auth.can_write() {
        return Err(Error::Forbidden("Write access required".to_string()));
    }

    let data_dir = req.data_dir.unwrap_or_else(|| "./data/benchmarks".to_string());

    match req.dataset_type.as_str() {
        "beir" => {
            BEIRLoader::download(&req.name, std::path::Path::new(&data_dir)).await?;
        }
        _ => {
            return Err(Error::BadRequest(format!("Unknown dataset type: {}", req.dataset_type)));
        }
    }

    Ok(Json(serde_json::json!({
        "downloaded": true,
        "dataset": req.name,
        "path": format!("{}/beir/{}", data_dir, req.name)
    })))
}

/// GET /v1/benchmarks/configs - Get preset configurations
pub async fn get_preset_configs(
    _auth: AuthContext,
) -> Result<Json<serde_json::Value>> {
    Ok(Json(serde_json::json!({
        "standard": standard_ablation_configs(),
        "chunk_size": chunk_size_ablation_configs(),
        "top_k": top_k_ablation_configs(),
    })))
}

/// POST /v1/benchmarks/compare - Compare two benchmark runs
pub async fn compare_benchmarks(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(req): Json<CompareBenchmarksRequest>,
) -> Result<Json<crate::evaluation::RunComparison>> {
    let project_id = auth.require_project()?;

    // Load both runs
    let (results_a,): (serde_json::Value,) = sqlx::query_as(
        "SELECT results FROM sys_benchmark_results WHERE id = $1 AND project_id = $2"
    )
    .bind(req.run_a_id)
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|_| Error::NotFound("Benchmark run A not found".to_string()))?;

    let (results_b,): (serde_json::Value,) = sqlx::query_as(
        "SELECT results FROM sys_benchmark_results WHERE id = $1 AND project_id = $2"
    )
    .bind(req.run_b_id)
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|_| Error::NotFound("Benchmark run B not found".to_string()))?;

    let suite_a: BenchmarkSuiteResult = serde_json::from_value(results_a)
        .map_err(|e| Error::Internal(format!("Failed to deserialize run A: {}", e)))?;

    let suite_b: BenchmarkSuiteResult = serde_json::from_value(results_b)
        .map_err(|e| Error::Internal(format!("Failed to deserialize run B: {}", e)))?;

    let comparison = crate::evaluation::compare_runs(&suite_a, &suite_b);

    Ok(Json(comparison))
}

#[derive(Debug, Deserialize)]
pub struct CompareBenchmarksRequest {
    pub run_a_id: Uuid,
    pub run_b_id: Uuid,
}
