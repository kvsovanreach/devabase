//! Benchmark Dataset Support
//!
//! Supports loading standard IR benchmark datasets:
//! - BEIR (Benchmarking IR) - Multiple domain datasets
//! - MS MARCO - Web passage retrieval
//! - Natural Questions - QA from Google
//! - Custom datasets - JSON/CSV format

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use crate::Result;

/// A benchmark dataset containing queries and relevance judgments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkDataset {
    pub name: String,
    pub description: String,
    pub source: DatasetSource,
    pub queries: Vec<BenchmarkQuery>,
    pub corpus: Vec<BenchmarkDocument>,
    pub statistics: DatasetStatistics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DatasetSource {
    BEIR(String),      // BEIR dataset name (msmarco, nfcorpus, etc.)
    MSMARCO,
    NaturalQuestions,
    Custom(String),    // Path or identifier
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkQuery {
    pub id: String,
    pub text: String,
    pub relevant_doc_ids: HashSet<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkDocument {
    pub id: String,
    pub title: Option<String>,
    pub text: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetStatistics {
    pub num_queries: usize,
    pub num_documents: usize,
    pub avg_query_length: f64,
    pub avg_doc_length: f64,
    pub avg_relevant_per_query: f64,
    pub total_relevance_judgments: usize,
}

impl BenchmarkDataset {
    /// Create a new empty dataset
    pub fn new(name: &str, description: &str, source: DatasetSource) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            source,
            queries: Vec::new(),
            corpus: Vec::new(),
            statistics: DatasetStatistics {
                num_queries: 0,
                num_documents: 0,
                avg_query_length: 0.0,
                avg_doc_length: 0.0,
                avg_relevant_per_query: 0.0,
                total_relevance_judgments: 0,
            },
        }
    }

    /// Compute statistics after loading data
    pub fn compute_statistics(&mut self) {
        let num_queries = self.queries.len();
        let num_documents = self.corpus.len();

        let total_query_chars: usize = self.queries.iter().map(|q| q.text.chars().count()).sum();
        let total_doc_chars: usize = self.corpus.iter().map(|d| d.text.chars().count()).sum();
        let total_relevant: usize = self.queries.iter().map(|q| q.relevant_doc_ids.len()).sum();

        self.statistics = DatasetStatistics {
            num_queries,
            num_documents,
            avg_query_length: if num_queries > 0 { total_query_chars as f64 / num_queries as f64 } else { 0.0 },
            avg_doc_length: if num_documents > 0 { total_doc_chars as f64 / num_documents as f64 } else { 0.0 },
            avg_relevant_per_query: if num_queries > 0 { total_relevant as f64 / num_queries as f64 } else { 0.0 },
            total_relevance_judgments: total_relevant,
        };
    }

    /// Get a subset of queries for evaluation
    pub fn sample_queries(&self, n: usize) -> Vec<&BenchmarkQuery> {
        self.queries.iter().take(n).collect()
    }
}

/// BEIR dataset loader
pub struct BEIRLoader;

impl BEIRLoader {
    /// Available BEIR datasets
    pub fn available_datasets() -> Vec<(&'static str, &'static str)> {
        vec![
            ("msmarco", "MS MARCO Passage Retrieval"),
            ("trec-covid", "TREC-COVID Scientific Articles"),
            ("nfcorpus", "Nutrition Facts Corpus"),
            ("nq", "Natural Questions"),
            ("hotpotqa", "HotpotQA Multi-hop"),
            ("fiqa", "Financial QA"),
            ("arguana", "ArguAna Counterarguments"),
            ("webis-touche2020", "Touche Argument Retrieval"),
            ("cqadupstack", "CQA StackExchange"),
            ("quora", "Quora Duplicate Questions"),
            ("dbpedia-entity", "DBpedia Entity Search"),
            ("scidocs", "Scientific Document Search"),
            ("fever", "Fact Verification"),
            ("climate-fever", "Climate Fact Verification"),
            ("scifact", "Scientific Fact Verification"),
        ]
    }

    /// Load BEIR dataset from HuggingFace or local path
    pub async fn load(dataset_name: &str, data_dir: &Path) -> Result<BenchmarkDataset> {
        let dataset_path = data_dir.join(format!("beir/{}", dataset_name));

        // Check if already downloaded
        if !dataset_path.exists() {
            return Err(crate::Error::NotFound(format!(
                "BEIR dataset '{}' not found at {:?}. Download it first using: deva benchmark download beir/{}",
                dataset_name, dataset_path, dataset_name
            )));
        }

        let mut dataset = BenchmarkDataset::new(
            dataset_name,
            &format!("BEIR {} benchmark", dataset_name),
            DatasetSource::BEIR(dataset_name.to_string()),
        );

        // Load corpus
        let corpus_path = dataset_path.join("corpus.jsonl");
        if corpus_path.exists() {
            dataset.corpus = Self::load_corpus(&corpus_path).await?;
        }

        // Load queries
        let queries_path = dataset_path.join("queries.jsonl");
        if queries_path.exists() {
            dataset.queries = Self::load_queries(&queries_path).await?;
        }

        // Load qrels (relevance judgments)
        let qrels_path = dataset_path.join("qrels/test.tsv");
        if qrels_path.exists() {
            Self::load_qrels(&qrels_path, &mut dataset.queries).await?;
        }

        dataset.compute_statistics();
        Ok(dataset)
    }

    async fn load_corpus(path: &Path) -> Result<Vec<BenchmarkDocument>> {
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| crate::Error::Internal(format!("Failed to read corpus: {}", e)))?;

        let mut documents = Vec::new();
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let doc: serde_json::Value = serde_json::from_str(line)
                .map_err(|e| crate::Error::Internal(format!("Failed to parse corpus line: {}", e)))?;

            documents.push(BenchmarkDocument {
                id: doc["_id"].as_str().unwrap_or_default().to_string(),
                title: doc["title"].as_str().map(|s| s.to_string()),
                text: doc["text"].as_str().unwrap_or_default().to_string(),
                metadata: doc.get("metadata").cloned(),
            });
        }
        Ok(documents)
    }

    async fn load_queries(path: &Path) -> Result<Vec<BenchmarkQuery>> {
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| crate::Error::Internal(format!("Failed to read queries: {}", e)))?;

        let mut queries = Vec::new();
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let q: serde_json::Value = serde_json::from_str(line)
                .map_err(|e| crate::Error::Internal(format!("Failed to parse query line: {}", e)))?;

            queries.push(BenchmarkQuery {
                id: q["_id"].as_str().unwrap_or_default().to_string(),
                text: q["text"].as_str().unwrap_or_default().to_string(),
                relevant_doc_ids: HashSet::new(),
                metadata: q.get("metadata").cloned(),
            });
        }
        Ok(queries)
    }

    async fn load_qrels(path: &Path, queries: &mut [BenchmarkQuery]) -> Result<()> {
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| crate::Error::Internal(format!("Failed to read qrels: {}", e)))?;

        // Build query ID to index map (owned strings to avoid borrow issues)
        let query_map: HashMap<String, usize> = queries
            .iter()
            .enumerate()
            .map(|(i, q)| (q.id.clone(), i))
            .collect();

        for line in content.lines().skip(1) { // Skip header
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 4 {
                let query_id = parts[0];
                let doc_id = parts[2];
                let relevance: i32 = parts[3].parse().unwrap_or(0);

                if relevance > 0 {
                    if let Some(&idx) = query_map.get(query_id) {
                        queries[idx].relevant_doc_ids.insert(doc_id.to_string());
                    }
                }
            }
        }
        Ok(())
    }

    /// Download BEIR dataset from HuggingFace
    pub async fn download(dataset_name: &str, data_dir: &Path) -> Result<()> {
        let url = format!(
            "https://huggingface.co/datasets/BeIR/{}/resolve/main",
            dataset_name
        );

        let dataset_path = data_dir.join(format!("beir/{}", dataset_name));
        tokio::fs::create_dir_all(&dataset_path).await
            .map_err(|e| crate::Error::Internal(format!("Failed to create directory: {}", e)))?;

        // Download corpus, queries, and qrels
        let files = vec![
            ("corpus.jsonl", format!("{}/corpus.jsonl", url)),
            ("queries.jsonl", format!("{}/queries.jsonl", url)),
            ("qrels/test.tsv", format!("{}/qrels/test.tsv", url)),
        ];

        let client = reqwest::Client::new();
        for (filename, file_url) in files {
            let file_path = dataset_path.join(filename);
            if let Some(parent) = file_path.parent() {
                tokio::fs::create_dir_all(parent).await.ok();
            }

            tracing::info!("Downloading {} from {}", filename, file_url);

            let response = client.get(&file_url).send().await
                .map_err(|e| crate::Error::Internal(format!("Failed to download {}: {}", filename, e)))?;

            if response.status().is_success() {
                let content = response.bytes().await
                    .map_err(|e| crate::Error::Internal(format!("Failed to read response: {}", e)))?;
                tokio::fs::write(&file_path, &content).await
                    .map_err(|e| crate::Error::Internal(format!("Failed to write file: {}", e)))?;
            } else {
                tracing::warn!("Failed to download {}: HTTP {}", filename, response.status());
            }
        }

        Ok(())
    }
}

/// Custom dataset loader (JSON format)
pub struct CustomDatasetLoader;

impl CustomDatasetLoader {
    /// Load dataset from JSON file
    ///
    /// Expected format:
    /// ```json
    /// {
    ///   "name": "my-dataset",
    ///   "description": "...",
    ///   "queries": [
    ///     {"id": "q1", "text": "...", "relevant_doc_ids": ["d1", "d2"]}
    ///   ],
    ///   "corpus": [
    ///     {"id": "d1", "text": "...", "title": "..."}
    ///   ]
    /// }
    /// ```
    pub async fn load_json(path: &Path) -> Result<BenchmarkDataset> {
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| crate::Error::Internal(format!("Failed to read file: {}", e)))?;

        let data: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| crate::Error::Internal(format!("Failed to parse JSON: {}", e)))?;

        let mut dataset = BenchmarkDataset::new(
            data["name"].as_str().unwrap_or("custom"),
            data["description"].as_str().unwrap_or("Custom benchmark dataset"),
            DatasetSource::Custom(path.to_string_lossy().to_string()),
        );

        // Parse queries
        if let Some(queries) = data["queries"].as_array() {
            for q in queries {
                let relevant: HashSet<String> = q["relevant_doc_ids"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();

                dataset.queries.push(BenchmarkQuery {
                    id: q["id"].as_str().unwrap_or_default().to_string(),
                    text: q["text"].as_str().unwrap_or_default().to_string(),
                    relevant_doc_ids: relevant,
                    metadata: q.get("metadata").cloned(),
                });
            }
        }

        // Parse corpus
        if let Some(corpus) = data["corpus"].as_array() {
            for d in corpus {
                dataset.corpus.push(BenchmarkDocument {
                    id: d["id"].as_str().unwrap_or_default().to_string(),
                    title: d["title"].as_str().map(String::from),
                    text: d["text"].as_str().unwrap_or_default().to_string(),
                    metadata: d.get("metadata").cloned(),
                });
            }
        }

        dataset.compute_statistics();
        Ok(dataset)
    }

    /// Create dataset from existing Devabase evaluation dataset
    pub async fn from_evaluation_dataset(
        pool: &crate::db::DbPool,
        dataset_id: uuid::Uuid,
    ) -> Result<BenchmarkDataset> {
        // Local types for query results
        #[derive(sqlx::FromRow)]
        struct DatasetRow {
            name: String,
            description: Option<String>,
        }

        #[derive(sqlx::FromRow)]
        struct CaseRow {
            id: uuid::Uuid,
            query: String,
            expected_chunk_ids: Vec<uuid::Uuid>,
            metadata: Option<serde_json::Value>,
        }

        // Get dataset info
        let dataset: DatasetRow = sqlx::query_as(
            "SELECT name, description FROM sys_evaluation_datasets WHERE id = $1"
        )
        .bind(dataset_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|_| crate::Error::NotFound("Dataset not found".to_string()))?;

        // Get cases
        let cases: Vec<CaseRow> = sqlx::query_as(
            "SELECT id, query, expected_chunk_ids, metadata FROM sys_evaluation_cases WHERE dataset_id = $1"
        )
        .bind(dataset_id)
        .fetch_all(pool.inner())
        .await?;

        // Get chunks for relevant doc IDs
        let chunk_ids: Vec<uuid::Uuid> = cases.iter()
            .flat_map(|c| c.expected_chunk_ids.clone())
            .collect();

        let chunks: Vec<(uuid::Uuid, String)> = sqlx::query_as(
            "SELECT id, content FROM sys_chunks WHERE id = ANY($1)"
        )
        .bind(&chunk_ids)
        .fetch_all(pool.inner())
        .await?;

        let chunk_map: HashMap<uuid::Uuid, String> = chunks.into_iter().collect();

        // Build dataset
        let mut benchmark = BenchmarkDataset::new(
            &dataset.name,
            dataset.description.as_deref().unwrap_or("Devabase evaluation dataset"),
            DatasetSource::Custom(format!("devabase://{}", dataset_id)),
        );

        for case in cases {
            benchmark.queries.push(BenchmarkQuery {
                id: case.id.to_string(),
                text: case.query,
                relevant_doc_ids: case.expected_chunk_ids.iter().map(|id| id.to_string()).collect(),
                metadata: case.metadata,
            });
        }

        // Add chunks as corpus
        for (id, content) in chunk_map {
            benchmark.corpus.push(BenchmarkDocument {
                id: id.to_string(),
                title: None,
                text: content,
                metadata: None,
            });
        }

        benchmark.compute_statistics();
        Ok(benchmark)
    }
}

/// Generate a synthetic benchmark dataset for testing
pub fn generate_synthetic_dataset(
    num_queries: usize,
    num_docs: usize,
    avg_relevant_per_query: usize,
) -> BenchmarkDataset {
    use rand::seq::SliceRandom;
    use rand::Rng;

    let mut rng = rand::thread_rng();
    let mut dataset = BenchmarkDataset::new(
        "synthetic",
        "Synthetic benchmark dataset for testing",
        DatasetSource::Custom("synthetic".to_string()),
    );

    // Generate corpus
    let topics = vec![
        "machine learning", "deep neural networks", "natural language processing",
        "computer vision", "reinforcement learning", "transformer models",
        "embedding vectors", "semantic search", "knowledge graphs",
        "retrieval augmented generation",
    ];

    for i in 0..num_docs {
        let topic = topics.choose(&mut rng).unwrap_or(&"general");
        dataset.corpus.push(BenchmarkDocument {
            id: format!("doc_{}", i),
            title: Some(format!("Document about {}", topic)),
            text: format!(
                "This is document {} about {}. It contains information about {} and related concepts. \
                The document discusses various aspects of {} in detail.",
                i, topic, topic, topic
            ),
            metadata: Some(serde_json::json!({ "topic": topic })),
        });
    }

    // Generate queries with relevance judgments
    for i in 0..num_queries {
        let topic = topics.choose(&mut rng).unwrap_or(&"general");
        let num_relevant = rng.gen_range(1..=avg_relevant_per_query * 2);

        // Find documents about this topic
        let relevant_docs: HashSet<String> = dataset.corpus
            .iter()
            .filter(|d| d.text.contains(topic))
            .take(num_relevant)
            .map(|d| d.id.clone())
            .collect();

        dataset.queries.push(BenchmarkQuery {
            id: format!("query_{}", i),
            text: format!("What is {} and how does it work?", topic),
            relevant_doc_ids: relevant_docs,
            metadata: Some(serde_json::json!({ "topic": topic })),
        });
    }

    dataset.compute_statistics();
    dataset
}
