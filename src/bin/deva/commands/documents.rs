//! Document management commands

use crate::client::ApiClient;
use crate::config::Config;
use crate::output::{self, OutputFormat, TableDisplay, TableRow};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub collection_id: String,
    pub filename: String,
    pub content_type: String,
    pub file_size: i64,
    pub status: String,
    pub chunk_count: i32,
    pub created_at: String,
}

impl TableRow for Document {
    fn headers() -> Vec<&'static str> {
        vec!["ID", "FILENAME", "SIZE", "STATUS", "CHUNKS", "CREATED"]
    }

    fn row(&self) -> Vec<String> {
        vec![
            output::truncate(&self.id, 8),
            output::truncate(&self.filename, 30),
            output::format_bytes(self.file_size),
            self.status.clone(),
            self.chunk_count.to_string(),
            output::format_time(&self.created_at),
        ]
    }
}

impl TableDisplay for Document {
    fn print_table(&self) {
        output::print_kv(&[
            ("ID", self.id.clone()),
            ("Filename", self.filename.clone()),
            ("Content-Type", self.content_type.clone()),
            ("Size", output::format_bytes(self.file_size)),
            ("Status", self.status.clone()),
            ("Chunks", self.chunk_count.to_string()),
            ("Created", output::format_time(&self.created_at)),
        ]);
    }
}

pub async fn list(
    config: &Config,
    collection: Option<String>,
    format: OutputFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);

    let documents: Vec<Document> = if let Some(ref coll) = collection {
        client.get_with_params("/documents", &[("collection", coll)]).await?
    } else {
        client.get("/documents").await?
    };

    if documents.is_empty() {
        output::info("No documents found. Upload one with 'deva documents upload <file> -c <collection>'");
        return Ok(());
    }

    output::print_list(&documents, format);
    Ok(())
}

pub async fn upload(
    config: &Config,
    file_path: &str,
    collection: &str,
    format: OutputFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path).into());
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    output::info(format!("Uploading {}...", file_name));

    let client = ApiClient::new(config);
    let document: Document = client
        .upload_file("/documents/upload", path, collection)
        .await?;

    output::success(format!("Uploaded: {}", document.filename));
    output::print_data(&document, format);

    if document.status == "pending" || document.status == "processing" {
        output::info("Document is being processed. Check status with 'deva documents get <id>'");
    }

    Ok(())
}

pub async fn get(config: &Config, id: &str, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    let client = ApiClient::new(config);
    let document: Document = client.get(&format!("/documents/{}", id)).await?;

    output::print_data(&document, format);
    Ok(())
}

pub async fn delete(config: &Config, id: &str, force: bool) -> Result<(), Box<dyn std::error::Error>> {
    if config.current_project.is_none() {
        return Err("No project selected. Run 'deva project use <id>' first.".into());
    }

    if !force {
        let confirmed = output::confirm("Delete this document and its vectors?");
        if !confirmed {
            output::info("Cancelled");
            return Ok(());
        }
    }

    let client = ApiClient::new(config);
    client.delete(&format!("/documents/{}", id)).await?;

    output::success("Document deleted");
    Ok(())
}
