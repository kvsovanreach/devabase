//! Table management commands

use crate::client::ApiClient;
use crate::config::Config;
use crate::output::{self, OutputFormat, TableDisplay, TableRow};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct Table {
    pub name: String,
    pub row_count: Option<i64>,
    pub columns: Vec<Column>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Column {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub primary_key: Option<bool>,
}

impl TableRow for Table {
    fn headers() -> Vec<&'static str> {
        vec!["NAME", "COLUMNS", "ROWS"]
    }

    fn row(&self) -> Vec<String> {
        vec![
            self.name.clone(),
            self.columns.len().to_string(),
            self.row_count.map(|r| r.to_string()).unwrap_or("-".to_string()),
        ]
    }
}

impl TableDisplay for Table {
    fn print_table(&self) {
        println!("Table: {}", self.name);
        if let Some(count) = self.row_count {
            println!("Rows: {}", count);
        }
        println!();
        println!("Columns:");
        
        // Print columns as a mini table
        let max_name = self.columns.iter().map(|c| c.name.len()).max().unwrap_or(4);
        let max_type = self.columns.iter().map(|c| c.data_type.len()).max().unwrap_or(4);

        println!("  {:name_width$}  {:type_width$}  NULLABLE  PK",
            "NAME", "TYPE",
            name_width = max_name,
            type_width = max_type
        );
        println!("  {:->name_width$}  {:->type_width$}  --------  --",
            "", "",
            name_width = max_name,
            type_width = max_type
        );

        for col in &self.columns {
            let pk = if col.primary_key.unwrap_or(false) { "✓" } else { "" };
            let nullable = if col.nullable { "yes" } else { "no" };
            println!("  {:name_width$}  {:type_width$}  {:8}  {}",
                col.name, col.data_type, nullable, pk,
                name_width = max_name,
                type_width = max_type
            );
        }
    }
}

pub async fn list(config: &Config, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    let tables: Vec<Table> = client.get("/tables").await?;

    if tables.is_empty() {
        output::info("No tables found.");
        return Ok(());
    }

    output::print_list(&tables, format);
    Ok(())
}

pub async fn get(config: &Config, name: &str, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    let table: Table = client.get(&format!("/tables/{}", name)).await?;

    output::print_data(&table, format);
    Ok(())
}

pub async fn export(
    config: &Config,
    name: &str,
    format: &str,
    output_file: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    let path = format!("/tables/{}/export?format={}", name, format);
    let content = client.download(&path).await?;

    match output_file {
        Some(file_path) => {
            fs::write(&file_path, &content)?;
            output::success(format!("Exported to: {}", file_path));
        }
        None => {
            println!("{}", content);
        }
    }

    Ok(())
}

pub async fn import(
    config: &Config,
    name: &str,
    file_path: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path).into());
    }

    output::info(format!("Importing data into table '{}'...", name));

    let client = ApiClient::new(config);
    
    // Read file content
    let content = fs::read_to_string(path)?;
    
    // Determine format from extension
    let format = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("json");

    #[derive(Deserialize)]
    struct ImportResult {
        imported: i32,
        errors: Vec<serde_json::Value>,
    }

    let result: ImportResult = client.post(
        &format!("/tables/{}/import?format={}", name, format),
        serde_json::json!({ "data": content })
    ).await?;

    output::success(format!("Imported {} rows", result.imported));
    
    if !result.errors.is_empty() {
        output::warn(format!("{} errors occurred", result.errors.len()));
    }

    Ok(())
}

pub async fn query(
    config: &Config,
    name: &str,
    filter: Option<String>,
    limit: i32,
    format: OutputFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    
    let mut params = vec![("limit", limit.to_string())];
    if let Some(ref f) = filter {
        params.push(("filter", f.clone()));
    }

    let params_ref: Vec<(&str, &str)> = params.iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect();

    let rows: Vec<serde_json::Value> = client
        .get_with_params(&format!("/tables/{}/rows", name), &params_ref)
        .await?;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&rows)?);
        }
        _ => {
            if rows.is_empty() {
                output::info("No rows found");
                return Ok(());
            }

            // Get column names from first row
            if let Some(first) = rows.first() {
                if let Some(obj) = first.as_object() {
                    let headers: Vec<&str> = obj.keys().map(|s| s.as_str()).collect();
                    
                    // Calculate widths
                    let mut widths: Vec<usize> = headers.iter().map(|h| h.len()).collect();
                    
                    for row in &rows {
                        if let Some(obj) = row.as_object() {
                            for (i, key) in headers.iter().enumerate() {
                                if let Some(val) = obj.get(*key) {
                                    let len = val.to_string().trim_matches('"').len();
                                    if i < widths.len() {
                                        widths[i] = widths[i].max(len.min(40));
                                    }
                                }
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
                    for row in &rows {
                        if let Some(obj) = row.as_object() {
                            let cells: Vec<String> = headers.iter()
                                .enumerate()
                                .map(|(i, key)| {
                                    let val = obj.get(*key)
                                        .map(|v| v.to_string().trim_matches('"').to_string())
                                        .unwrap_or_default();
                                    format!("{:width$}", output::truncate(&val, widths[i]), width = widths[i])
                                })
                                .collect();
                            println!("  {}  ", cells.join("  "));
                        }
                    }

                    println!();
                    output::info(format!("{} rows", rows.len()));
                }
            }
        }
    }

    Ok(())
}
