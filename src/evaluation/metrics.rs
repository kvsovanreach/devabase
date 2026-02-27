//! Standard Information Retrieval Metrics
//!
//! Implements metrics commonly used in IR evaluation papers:
//! - Precision@K, Recall@K
//! - Mean Reciprocal Rank (MRR)
//! - Normalized Discounted Cumulative Gain (NDCG)
//! - Mean Average Precision (MAP)
//! - Hit Rate (Success@K)

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Results for a single query evaluation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryMetrics {
    pub query_id: String,
    pub precision_at_k: f64,
    pub recall_at_k: f64,
    pub reciprocal_rank: f64,
    pub ndcg_at_k: f64,
    pub average_precision: f64,
    pub hit: bool, // Did we find at least one relevant doc?
    pub k: usize,
    pub num_relevant: usize,
    pub num_retrieved: usize,
    pub relevant_retrieved: usize,
}

/// Aggregated metrics across all queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregatedMetrics {
    pub num_queries: usize,
    pub k: usize,

    // Mean metrics
    pub precision_at_k: f64,
    pub recall_at_k: f64,
    pub mrr: f64,  // Mean Reciprocal Rank
    pub ndcg_at_k: f64,
    pub map: f64,  // Mean Average Precision
    pub hit_rate: f64,  // Success@K

    // Standard deviations (for confidence intervals)
    pub precision_std: f64,
    pub recall_std: f64,
    pub mrr_std: f64,
    pub ndcg_std: f64,
    pub map_std: f64,

    // Confidence intervals (95%)
    pub precision_ci: (f64, f64),
    pub recall_ci: (f64, f64),
    pub mrr_ci: (f64, f64),
    pub ndcg_ci: (f64, f64),
    pub map_ci: (f64, f64),
}

/// Compute Precision@K
/// Precision = |relevant ∩ retrieved| / |retrieved|
pub fn precision_at_k(retrieved: &[String], relevant: &HashSet<String>, k: usize) -> f64 {
    let top_k: HashSet<_> = retrieved.iter().take(k).collect();
    let relevant_in_top_k = top_k.iter().filter(|id| relevant.contains(**id)).count();

    if k == 0 {
        return 0.0;
    }
    relevant_in_top_k as f64 / k.min(retrieved.len()) as f64
}

/// Compute Recall@K
/// Recall = |relevant ∩ retrieved| / |relevant|
pub fn recall_at_k(retrieved: &[String], relevant: &HashSet<String>, k: usize) -> f64 {
    let top_k: HashSet<_> = retrieved.iter().take(k).collect();
    let relevant_in_top_k = top_k.iter().filter(|id| relevant.contains(**id)).count();

    if relevant.is_empty() {
        return 0.0;
    }
    relevant_in_top_k as f64 / relevant.len() as f64
}

/// Compute Reciprocal Rank
/// RR = 1 / rank of first relevant document
pub fn reciprocal_rank(retrieved: &[String], relevant: &HashSet<String>) -> f64 {
    for (i, doc_id) in retrieved.iter().enumerate() {
        if relevant.contains(doc_id) {
            return 1.0 / (i + 1) as f64;
        }
    }
    0.0
}

/// Compute NDCG@K (Normalized Discounted Cumulative Gain)
/// Uses binary relevance (1 if relevant, 0 otherwise)
pub fn ndcg_at_k(retrieved: &[String], relevant: &HashSet<String>, k: usize) -> f64 {
    let dcg = dcg_at_k(retrieved, relevant, k);
    let ideal_dcg = ideal_dcg_at_k(relevant.len(), k);

    if ideal_dcg == 0.0 {
        return 0.0;
    }
    dcg / ideal_dcg
}

/// Compute DCG@K
fn dcg_at_k(retrieved: &[String], relevant: &HashSet<String>, k: usize) -> f64 {
    retrieved
        .iter()
        .take(k)
        .enumerate()
        .map(|(i, doc_id)| {
            let rel = if relevant.contains(doc_id) { 1.0 } else { 0.0 };
            // Using log2(i+2) because positions are 0-indexed
            rel / (i as f64 + 2.0).log2()
        })
        .sum()
}

/// Compute Ideal DCG@K (all relevant docs at top)
fn ideal_dcg_at_k(num_relevant: usize, k: usize) -> f64 {
    (0..k.min(num_relevant))
        .map(|i| 1.0 / (i as f64 + 2.0).log2())
        .sum()
}

/// Compute Average Precision
/// AP = (1/|relevant|) * Σ(P@k * rel_k)
pub fn average_precision(retrieved: &[String], relevant: &HashSet<String>) -> f64 {
    if relevant.is_empty() {
        return 0.0;
    }

    let mut sum_precision = 0.0;
    let mut relevant_count = 0;

    for (i, doc_id) in retrieved.iter().enumerate() {
        if relevant.contains(doc_id) {
            relevant_count += 1;
            // Precision at this position
            sum_precision += relevant_count as f64 / (i + 1) as f64;
        }
    }

    sum_precision / relevant.len() as f64
}

/// Compute all metrics for a single query
pub fn compute_query_metrics(
    query_id: &str,
    retrieved: &[String],
    relevant: &HashSet<String>,
    k: usize,
) -> QueryMetrics {
    let top_k: HashSet<_> = retrieved.iter().take(k).collect();
    let relevant_retrieved = top_k.iter().filter(|id| relevant.contains(**id)).count();

    QueryMetrics {
        query_id: query_id.to_string(),
        precision_at_k: precision_at_k(retrieved, relevant, k),
        recall_at_k: recall_at_k(retrieved, relevant, k),
        reciprocal_rank: reciprocal_rank(retrieved, relevant),
        ndcg_at_k: ndcg_at_k(retrieved, relevant, k),
        average_precision: average_precision(retrieved, relevant),
        hit: relevant_retrieved > 0,
        k,
        num_relevant: relevant.len(),
        num_retrieved: retrieved.len(),
        relevant_retrieved,
    }
}

/// Aggregate metrics across multiple queries with statistical analysis
pub fn aggregate_metrics(query_metrics: &[QueryMetrics], k: usize) -> AggregatedMetrics {
    let n = query_metrics.len();

    if n == 0 {
        return AggregatedMetrics {
            num_queries: 0,
            k,
            precision_at_k: 0.0,
            recall_at_k: 0.0,
            mrr: 0.0,
            ndcg_at_k: 0.0,
            map: 0.0,
            hit_rate: 0.0,
            precision_std: 0.0,
            recall_std: 0.0,
            mrr_std: 0.0,
            ndcg_std: 0.0,
            map_std: 0.0,
            precision_ci: (0.0, 0.0),
            recall_ci: (0.0, 0.0),
            mrr_ci: (0.0, 0.0),
            ndcg_ci: (0.0, 0.0),
            map_ci: (0.0, 0.0),
        };
    }

    // Collect values
    let precisions: Vec<f64> = query_metrics.iter().map(|m| m.precision_at_k).collect();
    let recalls: Vec<f64> = query_metrics.iter().map(|m| m.recall_at_k).collect();
    let rrs: Vec<f64> = query_metrics.iter().map(|m| m.reciprocal_rank).collect();
    let ndcgs: Vec<f64> = query_metrics.iter().map(|m| m.ndcg_at_k).collect();
    let aps: Vec<f64> = query_metrics.iter().map(|m| m.average_precision).collect();
    let hits: Vec<f64> = query_metrics.iter().map(|m| if m.hit { 1.0 } else { 0.0 }).collect();

    // Compute means
    let precision_mean = mean(&precisions);
    let recall_mean = mean(&recalls);
    let mrr_mean = mean(&rrs);
    let ndcg_mean = mean(&ndcgs);
    let map_mean = mean(&aps);
    let hit_rate = mean(&hits);

    // Compute standard deviations
    let precision_std = std_dev(&precisions, precision_mean);
    let recall_std = std_dev(&recalls, recall_mean);
    let mrr_std = std_dev(&rrs, mrr_mean);
    let ndcg_std = std_dev(&ndcgs, ndcg_mean);
    let map_std = std_dev(&aps, map_mean);

    // Compute 95% confidence intervals
    let z = 1.96; // 95% CI
    let sqrt_n = (n as f64).sqrt();

    AggregatedMetrics {
        num_queries: n,
        k,
        precision_at_k: precision_mean,
        recall_at_k: recall_mean,
        mrr: mrr_mean,
        ndcg_at_k: ndcg_mean,
        map: map_mean,
        hit_rate,
        precision_std,
        recall_std,
        mrr_std,
        ndcg_std,
        map_std,
        precision_ci: confidence_interval(precision_mean, precision_std, z, sqrt_n),
        recall_ci: confidence_interval(recall_mean, recall_std, z, sqrt_n),
        mrr_ci: confidence_interval(mrr_mean, mrr_std, z, sqrt_n),
        ndcg_ci: confidence_interval(ndcg_mean, ndcg_std, z, sqrt_n),
        map_ci: confidence_interval(map_mean, map_std, z, sqrt_n),
    }
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

fn std_dev(values: &[f64], mean: f64) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let variance = values.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (values.len() - 1) as f64;
    variance.sqrt()
}

fn confidence_interval(mean: f64, std: f64, z: f64, sqrt_n: f64) -> (f64, f64) {
    let margin = z * std / sqrt_n;
    ((mean - margin).max(0.0), (mean + margin).min(1.0))
}

/// Statistical significance testing using paired t-test
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignificanceTest {
    pub metric: String,
    pub method_a: String,
    pub method_b: String,
    pub mean_a: f64,
    pub mean_b: f64,
    pub t_statistic: f64,
    pub p_value: f64,
    pub significant_at_05: bool,
    pub significant_at_01: bool,
    pub effect_size: f64, // Cohen's d
}

/// Perform paired t-test between two methods
pub fn paired_t_test(
    metric_name: &str,
    method_a_name: &str,
    method_b_name: &str,
    values_a: &[f64],
    values_b: &[f64],
) -> Option<SignificanceTest> {
    if values_a.len() != values_b.len() || values_a.len() < 2 {
        return None;
    }

    let n = values_a.len() as f64;
    let differences: Vec<f64> = values_a.iter().zip(values_b.iter()).map(|(a, b)| a - b).collect();

    let mean_diff = mean(&differences);
    let std_diff = std_dev(&differences, mean_diff);

    if std_diff == 0.0 {
        return None;
    }

    let t_statistic = mean_diff / (std_diff / n.sqrt());
    let _df = n - 1.0; // degrees of freedom (for reference)

    // Approximate p-value using normal distribution for large n
    // For more accurate results, use a proper t-distribution
    let p_value = 2.0 * (1.0 - normal_cdf(t_statistic.abs()));

    // Cohen's d effect size
    let pooled_std = ((std_dev(values_a, mean(values_a)).powi(2) +
                       std_dev(values_b, mean(values_b)).powi(2)) / 2.0).sqrt();
    let effect_size = if pooled_std > 0.0 { mean_diff.abs() / pooled_std } else { 0.0 };

    Some(SignificanceTest {
        metric: metric_name.to_string(),
        method_a: method_a_name.to_string(),
        method_b: method_b_name.to_string(),
        mean_a: mean(values_a),
        mean_b: mean(values_b),
        t_statistic,
        p_value,
        significant_at_05: p_value < 0.05,
        significant_at_01: p_value < 0.01,
        effect_size,
    })
}

/// Approximate CDF of standard normal distribution
fn normal_cdf(x: f64) -> f64 {
    0.5 * (1.0 + erf(x / std::f64::consts::SQRT_2))
}

/// Error function approximation (Abramowitz and Stegun)
fn erf(x: f64) -> f64 {
    let a1 =  0.254829592;
    let a2 = -0.284496736;
    let a3 =  1.421413741;
    let a4 = -1.453152027;
    let a5 =  1.061405429;
    let p  =  0.3275911;

    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let x = x.abs();

    let t = 1.0 / (1.0 + p * x);
    let y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x * x).exp();

    sign * y
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_precision_at_k() {
        let retrieved = vec!["a".to_string(), "b".to_string(), "c".to_string(), "d".to_string()];
        let relevant: HashSet<_> = vec!["a".to_string(), "c".to_string(), "e".to_string()].into_iter().collect();

        assert_eq!(precision_at_k(&retrieved, &relevant, 2), 0.5); // 1/2
        assert_eq!(precision_at_k(&retrieved, &relevant, 4), 0.5); // 2/4
    }

    #[test]
    fn test_recall_at_k() {
        let retrieved = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let relevant: HashSet<_> = vec!["a".to_string(), "c".to_string(), "e".to_string()].into_iter().collect();

        assert!((recall_at_k(&retrieved, &relevant, 3) - 2.0/3.0).abs() < 0.001);
    }

    #[test]
    fn test_reciprocal_rank() {
        let retrieved = vec!["x".to_string(), "a".to_string(), "y".to_string()];
        let relevant: HashSet<_> = vec!["a".to_string()].into_iter().collect();

        assert_eq!(reciprocal_rank(&retrieved, &relevant), 0.5); // 1/2
    }

    #[test]
    fn test_ndcg() {
        let retrieved = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let relevant: HashSet<_> = vec!["a".to_string(), "c".to_string()].into_iter().collect();

        let ndcg = ndcg_at_k(&retrieved, &relevant, 3);
        assert!(ndcg > 0.0 && ndcg <= 1.0);
    }
}
