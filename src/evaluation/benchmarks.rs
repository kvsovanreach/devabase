//! Benchmark Execution Engine
//!
//! Runs evaluations across multiple configurations for ablation studies.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbPool;
use crate::rag::EmbeddingProvider;
use crate::Result;

use super::datasets::BenchmarkDataset;
use super::metrics::{aggregate_metrics, compute_query_metrics, paired_t_test, AggregatedMetrics, QueryMetrics, SignificanceTest};

/// Configuration for a single benchmark run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkConfig {
    pub name: String,
    pub description: Option<String>,

    // Retrieval settings
    pub search_method: SearchMethod,
    pub top_k: usize,

    // Hybrid search weights
    pub vector_weight: Option<f64>,
    pub keyword_weight: Option<f64>,

    // Reranking
    pub rerank_enabled: bool,
    pub rerank_top_n: Option<usize>,
    pub rerank_provider: Option<String>,

    // Embedding
    pub embedding_provider: Option<String>,
    pub embedding_model: Option<String>,

    // Chunking (for corpus indexing)
    pub chunk_size: Option<usize>,
    pub chunk_overlap: Option<usize>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SearchMethod {
    Vector,
    Keyword,
    Hybrid,
}

impl Default for BenchmarkConfig {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            description: None,
            search_method: SearchMethod::Vector,
            top_k: 10,
            vector_weight: Some(0.7),
            keyword_weight: Some(0.3),
            rerank_enabled: false,
            rerank_top_n: None,
            rerank_provider: None,
            embedding_provider: None,
            embedding_model: None,
            chunk_size: Some(512),
            chunk_overlap: Some(50),
        }
    }
}

/// Results from a single benchmark run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub config: BenchmarkConfig,
    pub dataset_name: String,
    pub metrics: AggregatedMetrics,
    pub query_results: Vec<QueryMetrics>,
    pub latency_stats: LatencyStats,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyStats {
    pub total_queries: usize,
    pub total_time_ms: f64,
    pub mean_latency_ms: f64,
    pub p50_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
}

/// Results from a complete benchmark suite (multiple configurations)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkSuiteResult {
    pub suite_name: String,
    pub dataset_name: String,
    pub results: Vec<BenchmarkResult>,
    pub comparisons: Vec<MethodComparison>,
    pub best_config: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodComparison {
    pub method_a: String,
    pub method_b: String,
    pub significance_tests: Vec<SignificanceTest>,
}

/// Benchmark runner
pub struct BenchmarkRunner {
    pool: DbPool,
    collection_name: String,
    project_id: Uuid,
}

impl BenchmarkRunner {
    pub fn new(pool: DbPool, project_id: Uuid, collection_name: &str) -> Self {
        Self {
            pool,
            project_id,
            collection_name: collection_name.to_string(),
        }
    }

    /// Run a single benchmark configuration
    pub async fn run(
        &self,
        dataset: &BenchmarkDataset,
        config: &BenchmarkConfig,
        embedding_provider: &dyn EmbeddingProvider,
    ) -> Result<BenchmarkResult> {
        let mut query_results = Vec::new();
        let mut latencies = Vec::new();

        for query in &dataset.queries {
            let start = std::time::Instant::now();

            // Execute retrieval
            let retrieved = self.retrieve(
                &query.text,
                config,
                embedding_provider,
            ).await?;

            let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
            latencies.push(latency_ms);

            // Compute metrics - use chunk IDs from retrieval
            let retrieved_ids: Vec<String> = retrieved.iter().map(|id| id.to_string()).collect();
            let metrics = compute_query_metrics(
                &query.id,
                &retrieved_ids,
                &query.relevant_doc_ids,
                config.top_k,
            );
            query_results.push(metrics);
        }

        // Aggregate metrics
        let aggregated = aggregate_metrics(&query_results, config.top_k);

        // Compute latency stats
        let latency_stats = compute_latency_stats(&latencies);

        Ok(BenchmarkResult {
            config: config.clone(),
            dataset_name: dataset.name.clone(),
            metrics: aggregated,
            query_results,
            latency_stats,
            timestamp: chrono::Utc::now(),
        })
    }

    /// Run multiple configurations (ablation study)
    pub async fn run_suite(
        &self,
        dataset: &BenchmarkDataset,
        configs: &[BenchmarkConfig],
        embedding_provider: &dyn EmbeddingProvider,
    ) -> Result<BenchmarkSuiteResult> {
        let mut results = Vec::new();

        for config in configs {
            tracing::info!("Running benchmark: {}", config.name);
            let result = self.run(dataset, config, embedding_provider).await?;
            results.push(result);
        }

        // Generate pairwise comparisons
        let comparisons = self.generate_comparisons(&results);

        // Find best config by NDCG
        let best_config = results
            .iter()
            .max_by(|a, b| {
                a.metrics.ndcg_at_k
                    .partial_cmp(&b.metrics.ndcg_at_k)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|r| r.config.name.clone())
            .unwrap_or_default();

        Ok(BenchmarkSuiteResult {
            suite_name: format!("{}_ablation", dataset.name),
            dataset_name: dataset.name.clone(),
            results,
            comparisons,
            best_config,
            timestamp: chrono::Utc::now(),
        })
    }

    /// Execute retrieval with given config and return chunk IDs
    async fn retrieve(
        &self,
        query: &str,
        config: &BenchmarkConfig,
        embedding_provider: &dyn EmbeddingProvider,
    ) -> Result<Vec<Uuid>> {
        // Standard vector retrieval for all methods (simplification)
        // TODO: Add hybrid search support when API is unified
        let retrieval_query = crate::rag::RetrievalQuery {
            collection: self.collection_name.clone(),
            query: query.to_string(),
            top_k: Some(config.top_k as i32),
            filter: None,
            rerank: Some(config.rerank_enabled),
            include_content: Some(true),
        };

        let results = crate::rag::retrieve_with_provider(
            &self.pool,
            embedding_provider,
            retrieval_query,
            Some(self.project_id),
        ).await?;

        // Return chunk IDs
        Ok(results.into_iter().map(|r| r.id).collect())
    }

    /// Generate pairwise significance tests
    fn generate_comparisons(&self, results: &[BenchmarkResult]) -> Vec<MethodComparison> {
        let mut comparisons = Vec::new();

        for i in 0..results.len() {
            for j in (i + 1)..results.len() {
                let a = &results[i];
                let b = &results[j];

                let mut tests = Vec::new();

                // Test each metric
                let metrics = vec![
                    ("NDCG@K",
                     a.query_results.iter().map(|r| r.ndcg_at_k).collect::<Vec<_>>(),
                     b.query_results.iter().map(|r| r.ndcg_at_k).collect::<Vec<_>>()),
                    ("MRR",
                     a.query_results.iter().map(|r| r.reciprocal_rank).collect::<Vec<_>>(),
                     b.query_results.iter().map(|r| r.reciprocal_rank).collect::<Vec<_>>()),
                    ("Precision@K",
                     a.query_results.iter().map(|r| r.precision_at_k).collect::<Vec<_>>(),
                     b.query_results.iter().map(|r| r.precision_at_k).collect::<Vec<_>>()),
                    ("Recall@K",
                     a.query_results.iter().map(|r| r.recall_at_k).collect::<Vec<_>>(),
                     b.query_results.iter().map(|r| r.recall_at_k).collect::<Vec<_>>()),
                ];

                for (metric_name, values_a, values_b) in metrics {
                    if let Some(test) = paired_t_test(
                        metric_name,
                        &a.config.name,
                        &b.config.name,
                        &values_a,
                        &values_b,
                    ) {
                        tests.push(test);
                    }
                }

                comparisons.push(MethodComparison {
                    method_a: a.config.name.clone(),
                    method_b: b.config.name.clone(),
                    significance_tests: tests,
                });
            }
        }

        comparisons
    }
}

fn compute_latency_stats(latencies: &[f64]) -> LatencyStats {
    if latencies.is_empty() {
        return LatencyStats {
            total_queries: 0,
            total_time_ms: 0.0,
            mean_latency_ms: 0.0,
            p50_latency_ms: 0.0,
            p95_latency_ms: 0.0,
            p99_latency_ms: 0.0,
        };
    }

    let mut sorted = latencies.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let total: f64 = latencies.iter().sum();
    let n = latencies.len();

    LatencyStats {
        total_queries: n,
        total_time_ms: total,
        mean_latency_ms: total / n as f64,
        p50_latency_ms: percentile(&sorted, 50.0),
        p95_latency_ms: percentile(&sorted, 95.0),
        p99_latency_ms: percentile(&sorted, 99.0),
    }
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p / 100.0) * (sorted.len() - 1) as f64).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Standard ablation study configurations
pub fn standard_ablation_configs() -> Vec<BenchmarkConfig> {
    vec![
        // Baseline: Vector only
        BenchmarkConfig {
            name: "vector_only".to_string(),
            description: Some("Vector search baseline".to_string()),
            search_method: SearchMethod::Vector,
            top_k: 10,
            rerank_enabled: false,
            ..Default::default()
        },
        // Keyword only (BM25)
        BenchmarkConfig {
            name: "keyword_only".to_string(),
            description: Some("BM25 keyword search".to_string()),
            search_method: SearchMethod::Keyword,
            top_k: 10,
            rerank_enabled: false,
            ..Default::default()
        },
        // Hybrid 50/50
        BenchmarkConfig {
            name: "hybrid_50_50".to_string(),
            description: Some("Hybrid search with equal weights".to_string()),
            search_method: SearchMethod::Hybrid,
            top_k: 10,
            vector_weight: Some(0.5),
            keyword_weight: Some(0.5),
            rerank_enabled: false,
            ..Default::default()
        },
        // Hybrid 70/30 (recommended)
        BenchmarkConfig {
            name: "hybrid_70_30".to_string(),
            description: Some("Hybrid search with 70% vector weight".to_string()),
            search_method: SearchMethod::Hybrid,
            top_k: 10,
            vector_weight: Some(0.7),
            keyword_weight: Some(0.3),
            rerank_enabled: false,
            ..Default::default()
        },
        // Hybrid 90/10
        BenchmarkConfig {
            name: "hybrid_90_10".to_string(),
            description: Some("Hybrid search with 90% vector weight".to_string()),
            search_method: SearchMethod::Hybrid,
            top_k: 10,
            vector_weight: Some(0.9),
            keyword_weight: Some(0.1),
            rerank_enabled: false,
            ..Default::default()
        },
        // Vector + Reranking
        BenchmarkConfig {
            name: "vector_rerank".to_string(),
            description: Some("Vector search with reranking".to_string()),
            search_method: SearchMethod::Vector,
            top_k: 10,
            rerank_enabled: true,
            rerank_top_n: Some(50),
            ..Default::default()
        },
        // Hybrid + Reranking (best expected)
        BenchmarkConfig {
            name: "hybrid_rerank".to_string(),
            description: Some("Hybrid search with reranking".to_string()),
            search_method: SearchMethod::Hybrid,
            top_k: 10,
            vector_weight: Some(0.7),
            keyword_weight: Some(0.3),
            rerank_enabled: true,
            rerank_top_n: Some(50),
            ..Default::default()
        },
    ]
}

/// Chunk size ablation configs
pub fn chunk_size_ablation_configs() -> Vec<BenchmarkConfig> {
    vec![256, 512, 1024, 2048]
        .into_iter()
        .map(|size| BenchmarkConfig {
            name: format!("chunk_{}", size),
            description: Some(format!("Chunk size: {} tokens", size)),
            search_method: SearchMethod::Vector,
            top_k: 10,
            chunk_size: Some(size),
            chunk_overlap: Some(size / 10),
            ..Default::default()
        })
        .collect()
}

/// Top-K ablation configs
pub fn top_k_ablation_configs() -> Vec<BenchmarkConfig> {
    vec![5, 10, 20, 50, 100]
        .into_iter()
        .map(|k| BenchmarkConfig {
            name: format!("top_{}", k),
            description: Some(format!("Top-K: {}", k)),
            search_method: SearchMethod::Vector,
            top_k: k,
            ..Default::default()
        })
        .collect()
}
