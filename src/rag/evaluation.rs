use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Metrics calculated from an evaluation run
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EvaluationMetrics {
    /// Precision at K: relevant_retrieved / k
    pub precision_at_k: f64,
    /// Recall at K: relevant_retrieved / total_relevant
    pub recall_at_k: f64,
    /// Mean Reciprocal Rank: 1/position of first relevant result
    pub mrr: f64,
    /// Normalized Discounted Cumulative Gain
    pub ndcg: f64,
    /// Number of test cases evaluated
    pub cases_evaluated: usize,
    /// K value used for evaluation
    pub k: usize,
}

/// Result for a single test case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseResult {
    pub case_id: Uuid,
    pub query: String,
    pub expected_count: usize,
    pub retrieved_ids: Vec<Uuid>,
    pub relevant_retrieved: usize,
    pub precision: f64,
    pub recall: f64,
    pub reciprocal_rank: f64,
    pub ndcg: f64,
}

/// Calculate Precision at K
/// precision@k = |relevant ∩ retrieved@k| / k
pub fn calculate_precision_at_k(retrieved: &[Uuid], relevant: &[Uuid], k: usize) -> f64 {
    if k == 0 {
        return 0.0;
    }

    let retrieved_set: std::collections::HashSet<_> = retrieved.iter().take(k).collect();
    let relevant_set: std::collections::HashSet<_> = relevant.iter().collect();

    let relevant_retrieved = retrieved_set.intersection(&relevant_set).count();
    relevant_retrieved as f64 / k as f64
}

/// Calculate Recall at K
/// recall@k = |relevant ∩ retrieved@k| / |relevant|
pub fn calculate_recall_at_k(retrieved: &[Uuid], relevant: &[Uuid], k: usize) -> f64 {
    if relevant.is_empty() {
        return 0.0;
    }

    let retrieved_set: std::collections::HashSet<_> = retrieved.iter().take(k).collect();
    let relevant_set: std::collections::HashSet<_> = relevant.iter().collect();

    let relevant_retrieved = retrieved_set.intersection(&relevant_set).count();
    relevant_retrieved as f64 / relevant.len() as f64
}

/// Calculate Mean Reciprocal Rank (MRR)
/// MRR = 1/rank of first relevant result (0 if none found)
pub fn calculate_reciprocal_rank(retrieved: &[Uuid], relevant: &[Uuid]) -> f64 {
    let relevant_set: std::collections::HashSet<_> = relevant.iter().collect();

    for (i, id) in retrieved.iter().enumerate() {
        if relevant_set.contains(id) {
            return 1.0 / (i + 1) as f64;
        }
    }

    0.0
}

/// Calculate Discounted Cumulative Gain (DCG)
/// DCG = sum(rel_i / log2(i + 2)) for i in 0..k
fn calculate_dcg(retrieved: &[Uuid], relevant: &[Uuid], k: usize) -> f64 {
    let relevant_set: std::collections::HashSet<_> = relevant.iter().collect();

    retrieved
        .iter()
        .take(k)
        .enumerate()
        .map(|(i, id)| {
            let relevance = if relevant_set.contains(id) { 1.0 } else { 0.0 };
            relevance / (i as f64 + 2.0).log2()
        })
        .sum()
}

/// Calculate Ideal DCG (IDCG) - DCG with perfect ranking
fn calculate_idcg(relevant_count: usize, k: usize) -> f64 {
    (0..k.min(relevant_count))
        .map(|i| 1.0 / (i as f64 + 2.0).log2())
        .sum()
}

/// Calculate Normalized Discounted Cumulative Gain (NDCG)
/// NDCG = DCG / IDCG (normalized to 0-1 range)
pub fn calculate_ndcg(retrieved: &[Uuid], relevant: &[Uuid], k: usize) -> f64 {
    let idcg = calculate_idcg(relevant.len(), k);
    if idcg == 0.0 {
        return 0.0;
    }

    let dcg = calculate_dcg(retrieved, relevant, k);
    dcg / idcg
}

/// Evaluate a single test case
pub fn evaluate_case(
    case_id: Uuid,
    query: &str,
    retrieved: &[Uuid],
    expected: &[Uuid],
    k: usize,
) -> CaseResult {
    let precision = calculate_precision_at_k(retrieved, expected, k);
    let recall = calculate_recall_at_k(retrieved, expected, k);
    let reciprocal_rank = calculate_reciprocal_rank(retrieved, expected);
    let ndcg = calculate_ndcg(retrieved, expected, k);

    let retrieved_set: std::collections::HashSet<_> = retrieved.iter().take(k).collect();
    let expected_set: std::collections::HashSet<_> = expected.iter().collect();
    let relevant_retrieved = retrieved_set.intersection(&expected_set).count();

    CaseResult {
        case_id,
        query: query.to_string(),
        expected_count: expected.len(),
        retrieved_ids: retrieved.iter().take(k).cloned().collect(),
        relevant_retrieved,
        precision,
        recall,
        reciprocal_rank,
        ndcg,
    }
}

/// Aggregate metrics from multiple case results
pub fn aggregate_metrics(case_results: &[CaseResult], k: usize) -> EvaluationMetrics {
    if case_results.is_empty() {
        return EvaluationMetrics {
            k,
            ..Default::default()
        };
    }

    let n = case_results.len() as f64;

    let precision_at_k = case_results.iter().map(|r| r.precision).sum::<f64>() / n;
    let recall_at_k = case_results.iter().map(|r| r.recall).sum::<f64>() / n;
    let mrr = case_results.iter().map(|r| r.reciprocal_rank).sum::<f64>() / n;
    let ndcg = case_results.iter().map(|r| r.ndcg).sum::<f64>() / n;

    EvaluationMetrics {
        precision_at_k,
        recall_at_k,
        mrr,
        ndcg,
        cases_evaluated: case_results.len(),
        k,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uuid(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    #[test]
    fn test_precision_at_k() {
        let retrieved = vec![uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)];
        let relevant = vec![uuid(1), uuid(3), uuid(5)];

        // P@5: 3 relevant out of 5 retrieved
        assert!((calculate_precision_at_k(&retrieved, &relevant, 5) - 0.6).abs() < 0.001);

        // P@3: 2 relevant (1, 3) out of 3 retrieved
        assert!((calculate_precision_at_k(&retrieved, &relevant, 3) - 0.667).abs() < 0.01);
    }

    #[test]
    fn test_recall_at_k() {
        let retrieved = vec![uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)];
        let relevant = vec![uuid(1), uuid(3), uuid(5)];

        // R@5: 3 relevant retrieved out of 3 total relevant
        assert!((calculate_recall_at_k(&retrieved, &relevant, 5) - 1.0).abs() < 0.001);

        // R@3: 2 relevant retrieved (1, 3) out of 3 total relevant
        assert!((calculate_recall_at_k(&retrieved, &relevant, 3) - 0.667).abs() < 0.01);
    }

    #[test]
    fn test_reciprocal_rank() {
        let relevant = vec![uuid(3)];

        // Relevant at position 3 (0-indexed: 2)
        let retrieved = vec![uuid(1), uuid(2), uuid(3), uuid(4)];
        assert!((calculate_reciprocal_rank(&retrieved, &relevant) - 0.333).abs() < 0.01);

        // Relevant at position 1
        let retrieved = vec![uuid(3), uuid(1), uuid(2)];
        assert!((calculate_reciprocal_rank(&retrieved, &relevant) - 1.0).abs() < 0.001);

        // No relevant found
        let retrieved = vec![uuid(1), uuid(2)];
        assert!((calculate_reciprocal_rank(&retrieved, &relevant) - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_ndcg() {
        let relevant = vec![uuid(1), uuid(3)];

        // Perfect ranking: relevant items at positions 1 and 2
        let perfect = vec![uuid(1), uuid(3), uuid(2), uuid(4)];
        assert!((calculate_ndcg(&perfect, &relevant, 4) - 1.0).abs() < 0.001);

        // No relevant items retrieved
        let none = vec![uuid(2), uuid(4), uuid(5)];
        assert!((calculate_ndcg(&none, &relevant, 3) - 0.0).abs() < 0.001);
    }
}
