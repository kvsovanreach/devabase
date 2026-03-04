//! Project management commands

use crate::client::ApiClient;
use crate::config::Config;
use crate::output::{self, OutputFormat, TableDisplay, TableRow};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub created_at: String,
    pub member_count: Option<i32>,
}

impl TableRow for Project {
    fn headers() -> Vec<&'static str> {
        vec!["ID", "NAME", "SLUG", "MEMBERS", "CREATED"]
    }

    fn row(&self) -> Vec<String> {
        vec![
            output::truncate(&self.id, 8),
            self.name.clone(),
            self.slug.clone(),
            self.member_count.map(|c| c.to_string()).unwrap_or_default(),
            output::format_time(&self.created_at),
        ]
    }
}

impl TableDisplay for Project {
    fn print_table(&self) {
        output::print_kv(&[
            ("ID", self.id.clone()),
            ("Name", self.name.clone()),
            ("Slug", self.slug.clone()),
            ("Description", self.description.clone().unwrap_or_default()),
            ("Created", output::format_time(&self.created_at)),
        ]);
    }
}

#[derive(Debug, Serialize)]
struct CreateProjectRequest {
    name: String,
    slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

pub async fn list(config: &Config, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if !config.is_authenticated() {
        return Err("Not logged in. Run 'deva login' first.".into());
    }

    let client = ApiClient::new(config);
    let projects: Vec<Project> = client.get("/projects").await?;

    if projects.is_empty() {
        output::info("No projects found. Create one with 'deva project create <name>'");
        return Ok(());
    }

    output::print_list(&projects, format);

    // Show current project hint
    if let Some(ref current) = config.current_project {
        println!();
        output::info(format!("Current project: {}", 
            config.current_project_name.as_ref().unwrap_or(current)));
    } else {
        println!();
        output::warn("No project selected. Use 'deva project use <id>' to select one.");
    }

    Ok(())
}

pub async fn use_project(config: &mut Config, project: &str) -> Result<(), Box<dyn std::error::Error>> {
    if !config.is_authenticated() {
        return Err("Not logged in. Run 'deva login' first.".into());
    }

    // Fetch project to validate it exists
    let client = ApiClient::new(config);
    let projects: Vec<Project> = client.get("/projects").await?;

    // Find project by ID or slug
    let found = projects.iter().find(|p| p.id == project || p.slug == project);

    match found {
        Some(p) => {
            config.current_project = Some(p.id.clone());
            config.current_project_name = Some(p.name.clone());
            config.save()?;
            output::success(format!("Switched to project: {}", p.name));
        }
        None => {
            return Err(format!("Project not found: {}", project).into());
        }
    }

    Ok(())
}

pub async fn current(config: &Config, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if !config.is_authenticated() {
        return Err("Not logged in. Run 'deva login' first.".into());
    }

    match (&config.current_project, &config.current_project_name) {
        (Some(id), Some(_name)) => {
            let client = ApiClient::new(config);
            let project: Project = client.get(&format!("/projects/{}", id)).await?;
            output::print_data(&project, format);
        }
        (Some(id), None) => {
            println!("Current project ID: {}", id);
        }
        _ => {
            output::warn("No project selected. Use 'deva project use <id>' to select one.");
        }
    }

    Ok(())
}

pub async fn create(
    config: &Config,
    name: &str,
    slug: Option<String>,
    description: Option<String>,
    format: OutputFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    if !config.is_authenticated() {
        return Err("Not logged in. Run 'deva login' first.".into());
    }

    // Generate slug from name if not provided
    let slug = slug.unwrap_or_else(|| {
        name.to_lowercase()
            .replace(' ', "-")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect()
    });

    let client = ApiClient::new(config);
    let project: Project = client.post("/projects", CreateProjectRequest {
        name: name.to_string(),
        slug,
        description,
    }).await?;

    output::success(format!("Created project: {}", project.name));
    output::print_data(&project, format);

    Ok(())
}
