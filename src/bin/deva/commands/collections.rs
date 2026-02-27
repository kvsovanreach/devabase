//! Collection management commands

use crate::client::ApiClient;
use crate::config::Config;
use crate::output::{self, OutputFormat, TableDisplay, TableRow};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub dimensions: i32,
    pub metric: String,
    pub vector_count: i32,
    pub document_count: i32,
    pub rag_enabled: bool,
    pub created_at: String,
}

impl TableRow for Collection {
    fn headers() -> Vec<&'static str> {
        vec!["NAME", "DIMENSIONS", "METRIC", "VECTORS", "DOCS", "RAG", "CREATED"]
    }

    fn row(&self) -> Vec<String> {
        vec![
            self.name.clone(),
            self.dimensions.to_string(),
            self.metric.clone(),
            self.vector_count.to_string(),
            self.document_count.to_string(),
            if self.rag_enabled { "✓" } else { "-" }.to_string(),
            output::format_time(&self.created_at),
        ]
    }
}

impl TableDisplay for Collection {
    fn print_table(&self) {
        output::print_kv(&[
            ("Name", self.name.clone()),
            ("ID", self.id.clone()),
            ("Dimensions", self.dimensions.to_string()),
            ("Metric", self.metric.clone()),
            ("Vectors", self.vector_count.to_string()),
            ("Documents", self.document_count.to_string()),
            ("RAG Enabled", if self.rag_enabled { "Yes" } else { "No" }.to_string()),
            ("Created", output::format_time(&self.created_at)),
        ]);
    }
}

#[derive(Debug, Serialize)]
struct CreateCollectionRequest {
    name: String,
    dimensions: i32,
    metric: String,
}

pub async fn list(config: &Config, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    let collections: Vec<Collection> = client.get("/collections").await?;

    if collections.is_empty() {
        output::info("No collections found. Create one with 'deva collections create <name>'");
        return Ok(());
    }

    output::print_list(&collections, format);
    Ok(())
}

pub async fn get(config: &Config, name: &str, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    let collection: Collection = client.get(&format!("/collections/{}", name)).await?;

    output::print_data(&collection, format);
    Ok(())
}

pub async fn create(
    config: &Config,
    name: &str,
    dimensions: i32,
    metric: &str,
    format: OutputFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    let collection: Collection = client.post("/collections", CreateCollectionRequest {
        name: name.to_string(),
        dimensions,
        metric: metric.to_string(),
    }).await?;

    output::success(format!("Created collection: {}", collection.name));
    output::print_data(&collection, format);
    Ok(())
}

pub async fn delete(config: &Config, name: &str, force: bool) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    if !force {
        let confirmed = output::confirm(&format!(
            "Delete collection '{}' and all its data?",
            name
        ));
        if !confirmed {
            output::info("Cancelled");
            return Ok(());
        }
    }

    let client = ApiClient::new(config);
    client.delete(&format!("/collections/{}", name)).await?;

    output::success(format!("Deleted collection: {}", name));
    Ok(())
}
