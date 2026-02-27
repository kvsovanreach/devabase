//! Evaluation Framework for Academic Benchmarking
//!
//! This module provides comprehensive evaluation capabilities for RAG systems,
//! suitable for academic publication. It supports standard IR benchmarks (BEIR, MS MARCO),
//! computes standard metrics (Precision, Recall, MRR, NDCG), and generates
//! publication-ready reports with statistical significance testing.

pub mod benchmarks;
pub mod metrics;
pub mod runner;
pub mod report;
pub mod datasets;

pub use benchmarks::*;
pub use metrics::*;
pub use runner::*;
pub use report::*;
pub use datasets::*;
