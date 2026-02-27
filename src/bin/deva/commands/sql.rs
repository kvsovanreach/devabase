//! SQL execution command

use crate::client::ApiClient;
use crate::config::Config;
use crate::output::{self, OutputFormat};
use clap::Args;
use serde::{Deserialize, Serialize};

#[derive(Args)]
pub struct SqlArgs {
    /// SQL query to execute
    pub query: String,

    /// Limit number of rows
    #[arg(short, long, default_value = "100")]
    pub limit: i32,
}

#[derive(Debug, Serialize)]
struct SqlRequest {
    query: String,
    limit: i32,
}

#[derive(Debug, Deserialize)]
struct SqlResponse {
    columns: Vec<ColumnInfo>,
    rows: Vec<Vec<serde_json::Value>>,
    row_count: i32,
    execution_time_ms: i64,
}

#[derive(Debug, Deserialize)]
struct ColumnInfo {
    name: String,
    #[serde(rename = "type_name")]
    _type_name: String,
}

pub async fn execute(
    config: &Config,
    args: SqlArgs,
    format: OutputFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);

    let response: SqlResponse = client.post("/sql/execute", SqlRequest {
        query: args.query,
        limit: args.limit,
    }).await?;

    match format {
        OutputFormat::Json => {
            let output = serde_json::json!({
                "columns": response.columns.iter().map(|c| &c.name).collect::<Vec<_>>(),
                "rows": response.rows,
                "row_count": response.row_count,
                "execution_time_ms": response.execution_time_ms,
            });
            println!("{}", serde_json::to_string_pretty(&output)?);
        }
        OutputFormat::Csv => {
            // Print header
            let headers: Vec<&str> = response.columns.iter().map(|c| c.name.as_str()).collect();
            println!("{}", headers.join(","));

            // Print rows
            for row in &response.rows {
                let cells: Vec<String> = row.iter()
                    .map(|v| {
                        let s = match v {
                            serde_json::Value::String(s) => s.clone(),
                            serde_json::Value::Null => String::new(),
                            _ => v.to_string(),
                        };
                        if s.contains(',') || s.contains('"') || s.contains('\n') {
                            format!("\"{}\"", s.replace('"', "\"\""))
                        } else {
                            s
                        }
                    })
                    .collect();
                println!("{}", cells.join(","));
            }
        }
        OutputFormat::Table => {
            if response.rows.is_empty() {
                output::info("No rows returned");
                println!();
                println!("Execution time: {} ms", response.execution_time_ms);
                return Ok(());
            }

            // Calculate column widths
            let headers: Vec<&str> = response.columns.iter().map(|c| c.name.as_str()).collect();
            let mut widths: Vec<usize> = headers.iter().map(|h| h.len()).collect();

            for row in &response.rows {
                for (i, cell) in row.iter().enumerate() {
                    if i < widths.len() {
                        let len = match cell {
                            serde_json::Value::String(s) => s.len(),
                            serde_json::Value::Null => 4, // "null"
                            _ => cell.to_string().len(),
                        };
                        widths[i] = widths[i].max(len.min(40));
                    }
                }
            }

            // Print header
            let header_row: Vec<String> = headers.iter()
                .enumerate()
                .map(|(i, h)| format!("{:width$}", h.to_uppercase(), width = widths[i]))
                .collect();
            println!("  {}  ", header_row.join("  "));

            let sep: Vec<String> = widths.iter().map(|w| "-".repeat(*w)).collect();
            println!("  {}  ", sep.join("  "));

            // Print rows
            for row in &response.rows {
                let cells: Vec<String> = row.iter()
                    .enumerate()
                    .map(|(i, cell)| {
                        let s = match cell {
                            serde_json::Value::String(s) => s.clone(),
                            serde_json::Value::Null => "null".to_string(),
                            _ => cell.to_string(),
                        };
                        let width = widths.get(i).copied().unwrap_or(s.len());
                        format!("{:width$}", output::truncate(&s, width), width = width)
                    })
                    .collect();
                println!("  {}  ", cells.join("  "));
            }

            println!();
            output::info(format!(
                "{} rows ({} ms)",
                response.row_count,
                response.execution_time_ms
            ));
        }
    }

    Ok(())
}
