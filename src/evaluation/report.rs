//! Report Generation for Academic Publications
//!
//! Generates publication-ready output:
//! - LaTeX tables
//! - CSV exports
//! - JSON data
//! - Markdown summaries

use serde::{Deserialize, Serialize};

use super::benchmarks::{BenchmarkResult, BenchmarkSuiteResult, MethodComparison};
use super::metrics::AggregatedMetrics;
use crate::Result;

/// Report generator
pub struct ReportGenerator;

impl ReportGenerator {
    /// Generate a complete LaTeX table for paper
    pub fn to_latex_table(suite: &BenchmarkSuiteResult) -> String {
        let mut latex = String::new();

        // Table header
        latex.push_str("\\begin{table}[htbp]\n");
        latex.push_str("\\centering\n");
        latex.push_str(&format!("\\caption{{Retrieval performance on {} dataset. Best results in \\textbf{{bold}}, second best \\underline{{underlined}}. $^*$ indicates $p < 0.05$, $^{{\\dagger}}$ indicates $p < 0.01$ vs. baseline.}}\n",
            suite.dataset_name));
        latex.push_str(&format!("\\label{{tab:{}_results}}\n", suite.dataset_name.replace("-", "_")));
        latex.push_str("\\begin{tabular}{l|cccccc}\n");
        latex.push_str("\\toprule\n");
        latex.push_str("Method & P@10 & R@10 & MRR & NDCG@10 & MAP & Latency (ms) \\\\\n");
        latex.push_str("\\midrule\n");

        // Find best and second best for each metric
        let metrics: Vec<(&str, Box<dyn Fn(&AggregatedMetrics) -> f64>)> = vec![
            ("precision", Box::new(|m: &AggregatedMetrics| m.precision_at_k)),
            ("recall", Box::new(|m: &AggregatedMetrics| m.recall_at_k)),
            ("mrr", Box::new(|m: &AggregatedMetrics| m.mrr)),
            ("ndcg", Box::new(|m: &AggregatedMetrics| m.ndcg_at_k)),
            ("map", Box::new(|m: &AggregatedMetrics| m.map)),
        ];

        let mut best_indices: Vec<(usize, usize)> = Vec::new(); // (best, second_best) per metric
        for (_, getter) in &metrics {
            let mut values: Vec<(usize, f64)> = suite.results.iter()
                .enumerate()
                .map(|(i, r)| (i, getter(&r.metrics)))
                .collect();
            values.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            best_indices.push((values[0].0, values.get(1).map(|v| v.0).unwrap_or(values[0].0)));
        }

        // Get baseline (first method) for significance comparison
        let baseline_name = suite.results.first().map(|r| r.config.name.clone()).unwrap_or_default();

        // Generate rows
        for (i, result) in suite.results.iter().enumerate() {
            let method_name = Self::escape_latex(&result.config.name);
            let m = &result.metrics;

            // Check significance vs baseline
            let sig_marker = if i > 0 {
                Self::get_significance_marker(&suite.comparisons, &baseline_name, &result.config.name)
            } else {
                ""
            };

            latex.push_str(&format!(
                "{}{} & {} & {} & {} & {} & {} & {:.1} \\\\\n",
                method_name,
                sig_marker,
                Self::format_metric(m.precision_at_k, i == best_indices[0].0, i == best_indices[0].1),
                Self::format_metric(m.recall_at_k, i == best_indices[1].0, i == best_indices[1].1),
                Self::format_metric(m.mrr, i == best_indices[2].0, i == best_indices[2].1),
                Self::format_metric(m.ndcg_at_k, i == best_indices[3].0, i == best_indices[3].1),
                Self::format_metric(m.map, i == best_indices[4].0, i == best_indices[4].1),
                result.latency_stats.mean_latency_ms,
            ));
        }

        latex.push_str("\\bottomrule\n");
        latex.push_str("\\end{tabular}\n");
        latex.push_str("\\end{table}\n");

        latex
    }

    /// Generate LaTeX table with confidence intervals
    pub fn to_latex_table_with_ci(suite: &BenchmarkSuiteResult) -> String {
        let mut latex = String::new();

        latex.push_str("\\begin{table}[htbp]\n");
        latex.push_str("\\centering\n");
        latex.push_str("\\small\n");
        latex.push_str(&format!("\\caption{{Retrieval performance on {} with 95\\% confidence intervals.}}\n",
            suite.dataset_name));
        latex.push_str(&format!("\\label{{tab:{}_ci}}\n", suite.dataset_name.replace("-", "_")));
        latex.push_str("\\begin{tabular}{l|cc|cc}\n");
        latex.push_str("\\toprule\n");
        latex.push_str("Method & NDCG@10 & 95\\% CI & MRR & 95\\% CI \\\\\n");
        latex.push_str("\\midrule\n");

        for result in &suite.results {
            let m = &result.metrics;
            latex.push_str(&format!(
                "{} & {:.3} & [{:.3}, {:.3}] & {:.3} & [{:.3}, {:.3}] \\\\\n",
                Self::escape_latex(&result.config.name),
                m.ndcg_at_k,
                m.ndcg_ci.0, m.ndcg_ci.1,
                m.mrr,
                m.mrr_ci.0, m.mrr_ci.1,
            ));
        }

        latex.push_str("\\bottomrule\n");
        latex.push_str("\\end{tabular}\n");
        latex.push_str("\\end{table}\n");

        latex
    }

    /// Generate significance test table
    pub fn to_latex_significance_table(comparisons: &[MethodComparison]) -> String {
        let mut latex = String::new();

        latex.push_str("\\begin{table}[htbp]\n");
        latex.push_str("\\centering\n");
        latex.push_str("\\caption{Statistical significance tests (paired t-test). Effect size: Cohen's d.}\n");
        latex.push_str("\\label{tab:significance}\n");
        latex.push_str("\\begin{tabular}{ll|rrrr}\n");
        latex.push_str("\\toprule\n");
        latex.push_str("Comparison & Metric & $t$ & $p$ & Sig. & Effect \\\\\n");
        latex.push_str("\\midrule\n");

        for comparison in comparisons {
            let comp_name = format!("{} vs {}", comparison.method_a, comparison.method_b);
            let mut first = true;

            for test in &comparison.significance_tests {
                let row_name = if first {
                    first = false;
                    Self::escape_latex(&comp_name)
                } else {
                    String::new()
                };

                let sig = if test.significant_at_01 {
                    "$^{**}$"
                } else if test.significant_at_05 {
                    "$^*$"
                } else {
                    ""
                };

                let effect = if test.effect_size > 0.8 {
                    "Large"
                } else if test.effect_size > 0.5 {
                    "Medium"
                } else if test.effect_size > 0.2 {
                    "Small"
                } else {
                    "Negligible"
                };

                latex.push_str(&format!(
                    "{} & {} & {:.2} & {:.4} & {} & {} \\\\\n",
                    row_name,
                    test.metric,
                    test.t_statistic,
                    test.p_value,
                    sig,
                    effect,
                ));
            }

            if !comparison.significance_tests.is_empty() {
                latex.push_str("\\midrule\n");
            }
        }

        latex.push_str("\\bottomrule\n");
        latex.push_str("\\end{tabular}\n");
        latex.push_str("\\end{table}\n");

        latex
    }

    /// Generate CSV export
    pub fn to_csv(suite: &BenchmarkSuiteResult) -> String {
        let mut csv = String::new();

        // Header
        csv.push_str("method,search_type,rerank,top_k,vector_weight,keyword_weight,");
        csv.push_str("precision_at_k,recall_at_k,mrr,ndcg_at_k,map,hit_rate,");
        csv.push_str("precision_std,recall_std,mrr_std,ndcg_std,map_std,");
        csv.push_str("mean_latency_ms,p50_latency_ms,p95_latency_ms,p99_latency_ms\n");

        for result in &suite.results {
            let c = &result.config;
            let m = &result.metrics;
            let l = &result.latency_stats;

            csv.push_str(&format!(
                "{},{:?},{},{},{},{},",
                c.name,
                c.search_method,
                c.rerank_enabled,
                c.top_k,
                c.vector_weight.unwrap_or(1.0),
                c.keyword_weight.unwrap_or(0.0),
            ));

            csv.push_str(&format!(
                "{:.4},{:.4},{:.4},{:.4},{:.4},{:.4},",
                m.precision_at_k, m.recall_at_k, m.mrr, m.ndcg_at_k, m.map, m.hit_rate,
            ));

            csv.push_str(&format!(
                "{:.4},{:.4},{:.4},{:.4},{:.4},",
                m.precision_std, m.recall_std, m.mrr_std, m.ndcg_std, m.map_std,
            ));

            csv.push_str(&format!(
                "{:.2},{:.2},{:.2},{:.2}\n",
                l.mean_latency_ms, l.p50_latency_ms, l.p95_latency_ms, l.p99_latency_ms,
            ));
        }

        csv
    }

    /// Generate per-query CSV for detailed analysis
    pub fn to_query_csv(results: &[BenchmarkResult]) -> String {
        let mut csv = String::new();

        csv.push_str("method,query_id,precision,recall,reciprocal_rank,ndcg,ap,hit,num_relevant,relevant_retrieved\n");

        for result in results {
            for q in &result.query_results {
                csv.push_str(&format!(
                    "{},{},{:.4},{:.4},{:.4},{:.4},{:.4},{},{},{}\n",
                    result.config.name,
                    q.query_id,
                    q.precision_at_k,
                    q.recall_at_k,
                    q.reciprocal_rank,
                    q.ndcg_at_k,
                    q.average_precision,
                    q.hit as i32,
                    q.num_relevant,
                    q.relevant_retrieved,
                ));
            }
        }

        csv
    }

    /// Generate Markdown summary
    pub fn to_markdown(suite: &BenchmarkSuiteResult) -> String {
        let mut md = String::new();

        md.push_str(&format!("# Benchmark Results: {}\n\n", suite.dataset_name));
        md.push_str(&format!("**Best Configuration:** {}\n\n", suite.best_config));
        md.push_str(&format!("**Timestamp:** {}\n\n", suite.timestamp.format("%Y-%m-%d %H:%M:%S UTC")));

        md.push_str("## Results Summary\n\n");
        md.push_str("| Method | P@10 | R@10 | MRR | NDCG@10 | MAP | Latency |\n");
        md.push_str("|--------|------|------|-----|---------|-----|----------|\n");

        for result in &suite.results {
            let m = &result.metrics;
            md.push_str(&format!(
                "| {} | {:.3} | {:.3} | {:.3} | {:.3} | {:.3} | {:.1}ms |\n",
                result.config.name,
                m.precision_at_k, m.recall_at_k, m.mrr, m.ndcg_at_k, m.map,
                result.latency_stats.mean_latency_ms,
            ));
        }

        md.push_str("\n## Configuration Details\n\n");
        for result in &suite.results {
            let c = &result.config;
            md.push_str(&format!("### {}\n", c.name));
            if let Some(desc) = &c.description {
                md.push_str(&format!("- **Description:** {}\n", desc));
            }
            md.push_str(&format!("- **Search Method:** {:?}\n", c.search_method));
            md.push_str(&format!("- **Top-K:** {}\n", c.top_k));
            if let Some(vw) = c.vector_weight {
                md.push_str(&format!("- **Vector Weight:** {}\n", vw));
            }
            md.push_str(&format!("- **Reranking:** {}\n", c.rerank_enabled));
            md.push_str("\n");
        }

        md.push_str("## Statistical Significance\n\n");
        for comparison in &suite.comparisons {
            md.push_str(&format!("### {} vs {}\n\n", comparison.method_a, comparison.method_b));
            md.push_str("| Metric | t-stat | p-value | Significant | Effect Size |\n");
            md.push_str("|--------|--------|---------|-------------|-------------|\n");

            for test in &comparison.significance_tests {
                let sig = if test.significant_at_01 {
                    "p < 0.01"
                } else if test.significant_at_05 {
                    "p < 0.05"
                } else {
                    "n.s."
                };

                md.push_str(&format!(
                    "| {} | {:.2} | {:.4} | {} | {:.2} |\n",
                    test.metric, test.t_statistic, test.p_value, sig, test.effect_size,
                ));
            }
            md.push_str("\n");
        }

        md
    }

    /// Generate JSON export
    pub fn to_json(suite: &BenchmarkSuiteResult) -> Result<String> {
        serde_json::to_string_pretty(suite)
            .map_err(|e| crate::Error::Internal(format!("JSON serialization failed: {}", e)))
    }

    /// Write all report formats to directory
    pub async fn write_reports(suite: &BenchmarkSuiteResult, output_dir: &std::path::Path) -> Result<()> {
        tokio::fs::create_dir_all(output_dir).await
            .map_err(|e| crate::Error::Internal(format!("Failed to create directory: {}", e)))?;

        let base_name = format!("{}_{}", suite.dataset_name, suite.timestamp.format("%Y%m%d_%H%M%S"));

        // LaTeX table
        let latex_path = output_dir.join(format!("{}_table.tex", base_name));
        tokio::fs::write(&latex_path, Self::to_latex_table(suite)).await
            .map_err(|e| crate::Error::Internal(format!("Failed to write LaTeX: {}", e)))?;

        // LaTeX with CI
        let latex_ci_path = output_dir.join(format!("{}_table_ci.tex", base_name));
        tokio::fs::write(&latex_ci_path, Self::to_latex_table_with_ci(suite)).await
            .map_err(|e| crate::Error::Internal(format!("Failed to write LaTeX CI: {}", e)))?;

        // Significance table
        let sig_path = output_dir.join(format!("{}_significance.tex", base_name));
        tokio::fs::write(&sig_path, Self::to_latex_significance_table(&suite.comparisons)).await
            .map_err(|e| crate::Error::Internal(format!("Failed to write significance: {}", e)))?;

        // CSV
        let csv_path = output_dir.join(format!("{}.csv", base_name));
        tokio::fs::write(&csv_path, Self::to_csv(suite)).await
            .map_err(|e| crate::Error::Internal(format!("Failed to write CSV: {}", e)))?;

        // Per-query CSV
        let query_csv_path = output_dir.join(format!("{}_queries.csv", base_name));
        tokio::fs::write(&query_csv_path, Self::to_query_csv(&suite.results)).await
            .map_err(|e| crate::Error::Internal(format!("Failed to write query CSV: {}", e)))?;

        // Markdown
        let md_path = output_dir.join(format!("{}.md", base_name));
        tokio::fs::write(&md_path, Self::to_markdown(suite)).await
            .map_err(|e| crate::Error::Internal(format!("Failed to write Markdown: {}", e)))?;

        // JSON
        let json_path = output_dir.join(format!("{}.json", base_name));
        tokio::fs::write(&json_path, Self::to_json(suite)?).await
            .map_err(|e| crate::Error::Internal(format!("Failed to write JSON: {}", e)))?;

        tracing::info!("Reports written to {:?}", output_dir);

        Ok(())
    }

    // Helper functions
    fn escape_latex(s: &str) -> String {
        s.replace("_", "\\_")
         .replace("&", "\\&")
         .replace("%", "\\%")
    }

    fn format_metric(value: f64, is_best: bool, is_second: bool) -> String {
        let formatted = format!("{:.3}", value);
        if is_best {
            format!("\\textbf{{{}}}", formatted)
        } else if is_second {
            format!("\\underline{{{}}}", formatted)
        } else {
            formatted
        }
    }

    fn get_significance_marker(comparisons: &[MethodComparison], baseline: &str, method: &str) -> &'static str {
        for comp in comparisons {
            if (comp.method_a == baseline && comp.method_b == method) ||
               (comp.method_b == baseline && comp.method_a == method) {
                // Check NDCG significance
                for test in &comp.significance_tests {
                    if test.metric == "NDCG@K" {
                        if test.significant_at_01 {
                            return "$^\\dagger$";
                        } else if test.significant_at_05 {
                            return "$^*$";
                        }
                    }
                }
            }
        }
        ""
    }
}

/// Paper-ready figure data (for plotting with Python/R)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotData {
    pub title: String,
    pub x_label: String,
    pub y_label: String,
    pub series: Vec<PlotSeries>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotSeries {
    pub name: String,
    pub x_values: Vec<f64>,
    pub y_values: Vec<f64>,
    pub error_bars: Option<Vec<f64>>,
}

impl PlotData {
    /// Generate data for K vs NDCG plot
    pub fn k_vs_ndcg(results_by_k: &[(usize, BenchmarkResult)]) -> Self {
        let mut series = PlotSeries {
            name: "NDCG".to_string(),
            x_values: Vec::new(),
            y_values: Vec::new(),
            error_bars: Some(Vec::new()),
        };

        for (k, result) in results_by_k {
            series.x_values.push(*k as f64);
            series.y_values.push(result.metrics.ndcg_at_k);
            if let Some(ref mut errors) = series.error_bars {
                errors.push(result.metrics.ndcg_std);
            }
        }

        PlotData {
            title: "NDCG@K vs K".to_string(),
            x_label: "K".to_string(),
            y_label: "NDCG@K".to_string(),
            series: vec![series],
        }
    }

    /// Generate data for method comparison bar chart
    pub fn method_comparison(suite: &BenchmarkSuiteResult, metric: &str) -> Self {
        let getter: Box<dyn Fn(&AggregatedMetrics) -> (f64, f64)> = match metric {
            "ndcg" => Box::new(|m| (m.ndcg_at_k, m.ndcg_std)),
            "mrr" => Box::new(|m| (m.mrr, m.mrr_std)),
            "precision" => Box::new(|m| (m.precision_at_k, m.precision_std)),
            "recall" => Box::new(|m| (m.recall_at_k, m.recall_std)),
            "map" => Box::new(|m| (m.map, m.map_std)),
            _ => Box::new(|m| (m.ndcg_at_k, m.ndcg_std)),
        };

        let mut series = PlotSeries {
            name: metric.to_uppercase(),
            x_values: Vec::new(),
            y_values: Vec::new(),
            error_bars: Some(Vec::new()),
        };

        for (i, result) in suite.results.iter().enumerate() {
            let (value, std) = getter(&result.metrics);
            series.x_values.push(i as f64);
            series.y_values.push(value);
            if let Some(ref mut errors) = series.error_bars {
                errors.push(std);
            }
        }

        PlotData {
            title: format!("{} by Method", metric.to_uppercase()),
            x_label: "Method".to_string(),
            y_label: metric.to_uppercase(),
            series: vec![series],
        }
    }

    /// Export to JSON for Python plotting
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self)
            .map_err(|e| crate::Error::Internal(format!("JSON serialization failed: {}", e)))
    }
}
