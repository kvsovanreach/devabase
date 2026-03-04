//! Integration tests for Devabase API
//!
//! Run all tests:
//! ```bash
//! cargo test --test integration
//! ```
//!
//! Run specific test module:
//! ```bash
//! cargo test --test integration auth
//! cargo test --test integration tables
//! ```
//!
//! Run with output:
//! ```bash
//! cargo test --test integration -- --nocapture
//! ```

mod common;
mod api;

// Re-export for test modules
pub use common::*;
