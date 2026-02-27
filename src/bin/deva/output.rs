//! Output formatting for CLI

use serde::Serialize;
use std::fmt::Display;

#[derive(Debug, Clone, Copy, Default, clap::ValueEnum)]
pub enum OutputFormat {
    #[default]
    Table,
    Json,
    Csv,
}

impl std::str::FromStr for OutputFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "table" => Ok(OutputFormat::Table),
            "json" => Ok(OutputFormat::Json),
            "csv" => Ok(OutputFormat::Csv),
            _ => Err(format!("Unknown format: {}", s)),
        }
    }
}

/// Print data in the specified format
pub fn print_data<T: Serialize + TableDisplay>(data: &T, format: OutputFormat) {
    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(data).unwrap_or_default());
        }
        OutputFormat::Table => {
            data.print_table();
        }
        OutputFormat::Csv => {
            data.print_csv();
        }
    }
}

/// Print a list of items in the specified format
pub fn print_list<T: Serialize + TableRow>(items: &[T], format: OutputFormat) {
    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(items).unwrap_or_default());
        }
        OutputFormat::Table => {
            if items.is_empty() {
                println!("No items found.");
                return;
            }
            print_table(items);
        }
        OutputFormat::Csv => {
            if items.is_empty() {
                return;
            }
            print_csv(items);
        }
    }
}

/// Trait for displaying a single item as a table
pub trait TableDisplay {
    fn print_table(&self);
    fn print_csv(&self) {
        // Default implementation - override if needed
        println!("CSV output not supported for this type");
    }
}

/// Trait for displaying items in a table row
pub trait TableRow {
    fn headers() -> Vec<&'static str>;
    fn row(&self) -> Vec<String>;
}

/// Print a list of items as a table
fn print_table<T: TableRow>(items: &[T]) {
    let headers = T::headers();
    let rows: Vec<Vec<String>> = items.iter().map(|i| i.row()).collect();

    // Calculate column widths
    let mut widths: Vec<usize> = headers.iter().map(|h| h.len()).collect();
    for row in &rows {
        for (i, cell) in row.iter().enumerate() {
            if i < widths.len() {
                widths[i] = widths[i].max(cell.len());
            }
        }
    }

    // Print header
    print_row(&headers.iter().map(|s| s.to_string()).collect::<Vec<_>>(), &widths);
    print_separator(&widths);

    // Print rows
    for row in &rows {
        print_row(row, &widths);
    }
}

fn print_row(cells: &[String], widths: &[usize]) {
    let formatted: Vec<String> = cells
        .iter()
        .enumerate()
        .map(|(i, cell)| {
            let width = widths.get(i).copied().unwrap_or(cell.len());
            format!("{:width$}", cell, width = width)
        })
        .collect();
    println!("  {}  ", formatted.join("  "));
}

fn print_separator(widths: &[usize]) {
    let lines: Vec<String> = widths.iter().map(|w| "-".repeat(*w)).collect();
    println!("  {}  ", lines.join("  "));
}

/// Print items as CSV
fn print_csv<T: TableRow>(items: &[T]) {
    let headers = T::headers();
    println!("{}", headers.join(","));

    for item in items {
        let row = item.row();
        let escaped: Vec<String> = row
            .iter()
            .map(|cell| {
                if cell.contains(',') || cell.contains('"') || cell.contains('\n') {
                    format!("\"{}\"", cell.replace('"', "\"\""))
                } else {
                    cell.clone()
                }
            })
            .collect();
        println!("{}", escaped.join(","));
    }
}

/// Print a success message
pub fn success(msg: impl Display) {
    println!("\x1b[32m✓\x1b[0m {}", msg);
}

/// Print an info message
pub fn info(msg: impl Display) {
    println!("\x1b[34mℹ\x1b[0m {}", msg);
}

/// Print a warning message
pub fn warn(msg: impl Display) {
    eprintln!("\x1b[33m⚠\x1b[0m {}", msg);
}

/// Print key-value pairs nicely
pub fn print_kv(pairs: &[(&str, String)]) {
    let max_key_len = pairs.iter().map(|(k, _)| k.len()).max().unwrap_or(0);

    for (key, value) in pairs {
        println!(
            "  \x1b[90m{:>width$}:\x1b[0m {}",
            key,
            value,
            width = max_key_len
        );
    }
}

/// Prompt for confirmation
pub fn confirm(msg: &str) -> bool {
    use std::io::{self, Write};

    print!("{} [y/N]: ", msg);
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    matches!(input.trim().to_lowercase().as_str(), "y" | "yes")
}

/// Prompt for input
pub fn prompt(msg: &str) -> String {
    use std::io::{self, Write};

    print!("{}: ", msg);
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    input.trim().to_string()
}

/// Prompt for password (hidden input)
pub fn prompt_password(msg: &str) -> String {
    use std::io::{self, Write};

    print!("{}: ", msg);
    io::stdout().flush().unwrap();

    // Try to use rpassword-like behavior
    // For now, just read normally (in production, use rpassword crate)
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    input.trim().to_string()
}

/// Truncate string to max length
pub fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max.saturating_sub(3)])
    }
}

/// Format bytes as human readable
pub fn format_bytes(bytes: i64) -> String {
    const KB: i64 = 1024;
    const MB: i64 = KB * 1024;
    const GB: i64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Format timestamp as relative time
pub fn format_time(timestamp: &str) -> String {
    // Simple implementation - just return the date part
    if let Some(date) = timestamp.split('T').next() {
        date.to_string()
    } else {
        timestamp.to_string()
    }
}
