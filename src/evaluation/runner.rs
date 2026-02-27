//! High-level Evaluation Runner
//!
//! Provides a simple interface for running complete evaluations.

use std::path::Path;
use uuid::Uuid;

use crate::db::DbPool;
use crate::rag::get_project_embedding_provider;
use crate::Result;

use super::benchmarks::{
    BenchmarkConfig, BenchmarkRunner, BenchmarkSuiteResult,
    chunk_size_ablation_configs, standard_ablation_configs, top_k_ablation_configs,
};
use super::datasets::{BEIRLoader, BenchmarkDataset, CustomDatasetLoader};
use super::report::ReportGenerator;

/// Evaluation configuration
#[derive(Debug, Clone)]
pub struct EvaluationConfig {
    pub dataset_source: DatasetSourceConfig,
    pub collection_name: String,
    pub project_id: Uuid,
    pub output_dir: Option<String>,
    pub configs: EvaluationConfigs,
}

#[derive(Debug, Clone)]
pub enum DatasetSourceConfig {
    BEIR { name: String, data_dir: String },
    Custom { path: String },
    DevabaseDataset { dataset_id: Uuid },
    Synthetic { num_queries: usize, num_docs: usize },
}

#[derive(Debug, Clone)]
pub enum EvaluationConfigs {
    Standard,           // Standard ablation study
    ChunkSize,          // Chunk size ablation
    TopK,               // Top-K ablation
    Custom(Vec<BenchmarkConfig>),
}

/// High-level evaluation runner
pub struct EvaluationRunner {
    pool: DbPool,
}

impl EvaluationRunner {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Run a complete evaluation and generate reports
    pub async fn run(&self, config: EvaluationConfig) -> Result<EvaluationResult> {
        tracing::info!("Starting evaluation for collection: {}", config.collection_name);

        // Load dataset
        let dataset = self.load_dataset(&config.dataset_source).await?;
        tracing::info!("Loaded dataset: {} ({} queries, {} documents)",
            dataset.name, dataset.statistics.num_queries, dataset.statistics.num_documents);

        // Get embedding provider
        let project = self.get_project(config.project_id).await?;
        let embedding_provider = get_project_embedding_provider(&project.settings.unwrap_or_default())?;

        // Get benchmark configs
        let benchmark_configs = match config.configs {
            EvaluationConfigs::Standard => standard_ablation_configs(),
            EvaluationConfigs::ChunkSize => chunk_size_ablation_configs(),
            EvaluationConfigs::TopK => top_k_ablation_configs(),
            EvaluationConfigs::Custom(configs) => configs,
        };

        // Run benchmarks
        let runner = BenchmarkRunner::new(
            self.pool.clone(),
            config.project_id,
            &config.collection_name,
        );

        let suite_result = runner.run_suite(&dataset, &benchmark_configs, embedding_provider.as_ref()).await?;

        // Generate reports
        if let Some(output_dir) = &config.output_dir {
            let output_path = Path::new(output_dir);
            ReportGenerator::write_reports(&suite_result, output_path).await?;
        }

        // Store results in database
        let result_id = self.store_results(&suite_result, config.project_id).await?;

        Ok(EvaluationResult {
            id: result_id,
            suite: suite_result,
        })
    }

    /// Run evaluation on existing Devabase evaluation dataset
    pub async fn run_on_dataset(
        &self,
        dataset_id: Uuid,
        project_id: Uuid,
        collection_name: &str,
        output_dir: Option<&str>,
    ) -> Result<EvaluationResult> {
        let config = EvaluationConfig {
            dataset_source: DatasetSourceConfig::DevabaseDataset { dataset_id },
            collection_name: collection_name.to_string(),
            project_id,
            output_dir: output_dir.map(String::from),
            configs: EvaluationConfigs::Standard,
        };

        self.run(config).await
    }

    /// Run quick evaluation with default settings
    pub async fn run_quick(
        &self,
        project_id: Uuid,
        collection_name: &str,
        queries: Vec<(String, Vec<String>)>, // (query, relevant_chunk_ids)
    ) -> Result<QuickEvalResult> {
        // Build synthetic dataset from provided queries
        let mut dataset = BenchmarkDataset::new(
            "quick_eval",
            "Quick evaluation dataset",
            super::datasets::DatasetSource::Custom("quick".to_string()),
        );

        for (i, (query_text, relevant_ids)) in queries.into_iter().enumerate() {
            dataset.queries.push(super::datasets::BenchmarkQuery {
                id: format!("q{}", i),
                text: query_text,
                relevant_doc_ids: relevant_ids.into_iter().collect(),
                metadata: None,
            });
        }

        dataset.compute_statistics();

        // Get embedding provider
        let project = self.get_project(project_id).await?;
        let embedding_provider = get_project_embedding_provider(&project.settings.unwrap_or_default())?;

        // Run with default config
        let runner = BenchmarkRunner::new(self.pool.clone(), project_id, collection_name);
        let config = BenchmarkConfig::default();
        let result = runner.run(&dataset, &config, embedding_provider.as_ref()).await?;

        Ok(QuickEvalResult {
            ndcg: result.metrics.ndcg_at_k,
            mrr: result.metrics.mrr,
            precision: result.metrics.precision_at_k,
            recall: result.metrics.recall_at_k,
            num_queries: result.metrics.num_queries,
        })
    }

    async fn load_dataset(&self, source: &DatasetSourceConfig) -> Result<BenchmarkDataset> {
        match source {
            DatasetSourceConfig::BEIR { name, data_dir } => {
                BEIRLoader::load(name, Path::new(data_dir)).await
            }
            DatasetSourceConfig::Custom { path } => {
                CustomDatasetLoader::load_json(Path::new(path)).await
            }
            DatasetSourceConfig::DevabaseDataset { dataset_id } => {
                CustomDatasetLoader::from_evaluation_dataset(&self.pool, *dataset_id).await
            }
            DatasetSourceConfig::Synthetic { num_queries, num_docs } => {
                Ok(super::datasets::generate_synthetic_dataset(*num_queries, *num_docs, 5))
            }
        }
    }

    async fn get_project(&self, project_id: Uuid) -> Result<crate::db::models::Project> {
        sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
            .bind(project_id)
            .fetch_one(self.pool.inner())
            .await
            .map_err(|_| crate::Error::NotFound("Project not found".to_string()))
    }

    async fn store_results(&self, suite: &BenchmarkSuiteResult, project_id: Uuid) -> Result<Uuid> {
        let id = Uuid::new_v4();
        let results_json = serde_json::to_value(suite)
            .map_err(|e| crate::Error::Internal(format!("Serialization failed: {}", e)))?;

        sqlx::query(
            r#"
            INSERT INTO sys_benchmark_results (id, project_id, suite_name, dataset_name, results, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            "#
        )
        .bind(id)
        .bind(project_id)
        .bind(&suite.suite_name)
        .bind(&suite.dataset_name)
        .bind(results_json)
        .execute(self.pool.inner())
        .await?;

        Ok(id)
    }
}

#[derive(Debug, Clone)]
pub struct EvaluationResult {
    pub id: Uuid,
    pub suite: BenchmarkSuiteResult,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct QuickEvalResult {
    pub ndcg: f64,
    pub mrr: f64,
    pub precision: f64,
    pub recall: f64,
    pub num_queries: usize,
}

/// Compare two evaluation runs
pub fn compare_runs(
    run_a: &BenchmarkSuiteResult,
    run_b: &BenchmarkSuiteResult,
) -> RunComparison {
    let improvements: Vec<MetricImprovement> = vec!["ndcg", "mrr", "precision", "recall", "map"]
        .into_iter()
        .filter_map(|metric| {
            let (a_val, b_val) = match metric {
                "ndcg" => (
                    run_a.results.first()?.metrics.ndcg_at_k,
                    run_b.results.first()?.metrics.ndcg_at_k,
                ),
                "mrr" => (
                    run_a.results.first()?.metrics.mrr,
                    run_b.results.first()?.metrics.mrr,
                ),
                "precision" => (
                    run_a.results.first()?.metrics.precision_at_k,
                    run_b.results.first()?.metrics.precision_at_k,
                ),
                "recall" => (
                    run_a.results.first()?.metrics.recall_at_k,
                    run_b.results.first()?.metrics.recall_at_k,
                ),
                "map" => (
                    run_a.results.first()?.metrics.map,
                    run_b.results.first()?.metrics.map,
                ),
                _ => return None,
            };

            Some(MetricImprovement {
                metric: metric.to_string(),
                value_a: a_val,
                value_b: b_val,
                absolute_diff: b_val - a_val,
                relative_diff: if a_val > 0.0 { (b_val - a_val) / a_val * 100.0 } else { 0.0 },
            })
        })
        .collect();

    RunComparison {
        run_a_name: run_a.suite_name.clone(),
        run_b_name: run_b.suite_name.clone(),
        improvements,
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RunComparison {
    pub run_a_name: String,
    pub run_b_name: String,
    pub improvements: Vec<MetricImprovement>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MetricImprovement {
    pub metric: String,
    pub value_a: f64,
    pub value_b: f64,
    pub absolute_diff: f64,
    pub relative_diff: f64, // percentage
}
