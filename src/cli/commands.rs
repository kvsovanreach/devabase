//! Server CLI command handlers

use crate::cli::{
    Cli, Commands, DbCommands, KeyCommands, VectorCommands,
    UserCommands, ProjectCommands, DocumentCommands, ConfigCommands
};
use crate::config::Config;
use crate::db;
use crate::rag::EmbeddingService;
use crate::server::{create_router, AppState};
use crate::storage::StorageService;
use crate::Result;
use std::net::SocketAddr;
use std::sync::Arc;

/// Load configuration from file or environment variables
fn load_config(config_path: &str) -> Result<Config> {
    if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)
    } else {
        tracing::info!("Config file '{}' not found, using environment variables", config_path);
        Config::from_env()
    }
}

pub async fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Commands::Init => {
            println!("Initializing Devabase project...");
            let toml_str = Config::default_config_toml();
            std::fs::write("devabase.toml", toml_str)?;
            println!("Created devabase.toml");
            Ok(())
        }

        Commands::Serve { host, port } => {
            let mut config = load_config(&cli.config)?;

            // Apply CLI overrides
            if let Some(h) = host {
                config.server.host = h;
            }
            if let Some(p) = port {
                config.server.port = p;
            }

            run_server(config).await
        }

        Commands::Db(cmd) => handle_db_command(cmd, &cli.config).await,
        Commands::Key(cmd) => handle_key_command(cmd),
        Commands::Vector(cmd) => handle_vector_command(cmd),
        Commands::User(cmd) => handle_user_command(cmd),
        Commands::Project(cmd) => handle_project_command(cmd),
        Commands::Document(cmd) => handle_document_command(cmd),
        Commands::Config(cmd) => handle_config_command(cmd, &cli.config),
    }
}

async fn run_server(config: Config) -> Result<()> {
    tracing::info!("Starting Devabase server...");

    // Initialize database (creates pool and runs migrations)
    let pool = db::init(&config).await?;

    // Create storage service
    let storage = StorageService::new(&config)?;

    // Create embedding service
    let embedding = EmbeddingService::new(&config)?;

    // Create app state
    let state = Arc::new(AppState::new(pool, config.clone(), storage, embedding));

    // Create router
    let app = create_router(state);

    // Start server
    let addr: SocketAddr = format!("{}:{}", config.server.host, config.server.port)
        .parse()
        .expect("Invalid server address");

    tracing::info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn handle_db_command(cmd: DbCommands, config_path: &str) -> Result<()> {
    let config = load_config(config_path)?;

    match cmd {
        DbCommands::Setup | DbCommands::Migrate => {
            println!("Setting up database and running migrations...");
            // db::init handles both pool creation and migrations
            let _pool = db::init(&config).await?;
            println!("Database setup complete.");
        }
        DbCommands::Status => {
            // Just try to connect
            let _pool = db::init(&config).await?;
            println!("Database connection: OK");
        }
        DbCommands::Backup { output } => {
            let output_path = output.unwrap_or_else(|| {
                format!("devabase_backup_{}.sql", chrono::Utc::now().format("%Y%m%d_%H%M%S"))
            });
            println!("Backup to {} (not implemented)", output_path);
        }
        DbCommands::Restore { input, yes: _ } => {
            println!("Restore from {} (not implemented)", input);
        }
    }
    Ok(())
}

fn handle_key_command(cmd: KeyCommands) -> Result<()> {
    println!("Use the `deva` CLI or dashboard to manage API keys.");
    println!("  deva project use <project-id>");
    match cmd {
        KeyCommands::Create { project, name: _, scopes: _ } => {
            println!("To create an API key for project {}:", project);
            println!("  Use the dashboard at /settings/api-keys");
        }
        KeyCommands::List { project } => {
            println!("To list API keys for project {}:", project);
            println!("  Use the dashboard at /settings/api-keys");
        }
        KeyCommands::Revoke { project, id } => {
            println!("To revoke API key {} in project {}:", id, project);
            println!("  Use the dashboard at /settings/api-keys");
        }
    }
    Ok(())
}

fn handle_vector_command(cmd: VectorCommands) -> Result<()> {
    println!("Use the `deva` CLI or REST API to manage vectors.");
    match cmd {
        VectorCommands::CreateCollection { name, dimensions, metric } => {
            println!("To create collection '{}' ({} dims, {}):", name, dimensions, metric);
            println!("  deva collections create {} -d {} -m {}", name, dimensions, metric);
        }
        VectorCommands::ListCollections => {
            println!("To list collections:");
            println!("  deva collections list");
        }
        VectorCommands::DeleteCollection { name } => {
            println!("To delete collection '{}':", name);
            println!("  deva collections delete {}", name);
        }
        VectorCommands::Stats { name } => {
            println!("To view stats for collection '{}':", name);
            println!("  deva collections get {}", name);
        }
    }
    Ok(())
}

fn handle_user_command(cmd: UserCommands) -> Result<()> {
    println!("Use the REST API or dashboard to manage users.");
    match cmd {
        UserCommands::Create { email, name, password: _ } => {
            println!("To create user {} ({}):", name, email);
            println!("  POST /v1/auth/register");
        }
        UserCommands::List { limit: _ } => {
            println!("User listing via API is admin-only.");
        }
        UserCommands::Get { identifier } => {
            println!("To get user {}:", identifier);
            println!("  GET /v1/users/me (for current user)");
        }
        UserCommands::Delete { identifier, yes: _ } => {
            println!("To delete user {}:", identifier);
            println!("  Use the admin dashboard");
        }
    }
    Ok(())
}

fn handle_project_command(cmd: ProjectCommands) -> Result<()> {
    println!("Use the `deva` CLI to manage projects.");
    match cmd {
        ProjectCommands::Create { name, description: _, owner: _ } => {
            println!("To create project '{}':", name);
            println!("  deva project create {}", name);
        }
        ProjectCommands::List { user: _, limit: _ } => {
            println!("To list projects:");
            println!("  deva project list");
        }
        ProjectCommands::Get { id } => {
            println!("Project management via deva CLI:");
            println!("  deva project use {}", id);
        }
        ProjectCommands::Delete { id, yes: _ } => {
            println!("To delete project {}:", id);
            println!("  Use the dashboard at /settings/danger");
        }
    }
    Ok(())
}

fn handle_document_command(cmd: DocumentCommands) -> Result<()> {
    println!("Use the `deva` CLI to manage documents.");
    match cmd {
        DocumentCommands::Upload { collection, project: _, file } => {
            println!("To upload {} to collection '{}':", file, collection);
            println!("  deva documents upload {} -c {}", file, collection);
        }
        DocumentCommands::List { collection, project: _, status: _, limit: _ } => {
            println!("To list documents in collection '{}':", collection);
            println!("  deva documents list -c {}", collection);
        }
        DocumentCommands::Get { id, project: _ } => {
            println!("To get document {}:", id);
            println!("  deva documents get {}", id);
        }
        DocumentCommands::Delete { id, project: _, yes: _ } => {
            println!("To delete document {}:", id);
            println!("  deva documents delete {}", id);
        }
        DocumentCommands::Reprocess { id, project: _ } => {
            println!("To reprocess document {}:", id);
            println!("  Use the API: POST /v1/documents/{}/reprocess", id);
        }
    }
    Ok(())
}

fn handle_config_command(cmd: ConfigCommands, config_path: &str) -> Result<()> {
    match cmd {
        ConfigCommands::Show { section } => {
            let config = load_config(config_path)?;
            let toml_str = toml::to_string_pretty(&config)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

            if let Some(section_name) = section {
                let mut in_section = false;
                for line in toml_str.lines() {
                    if line.starts_with(&format!("[{}]", section_name)) {
                        in_section = true;
                    } else if line.starts_with('[') && in_section {
                        break;
                    }
                    if in_section {
                        println!("{}", line);
                    }
                }
            } else {
                println!("{}", toml_str);
            }
        }
        ConfigCommands::Validate => {
            match load_config(config_path) {
                Ok(_) => println!("✓ Configuration is valid."),
                Err(e) => {
                    println!("✗ Configuration error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        ConfigCommands::Generate { output, force } => {
            if std::path::Path::new(&output).exists() && !force {
                println!("File {} already exists. Use --force to overwrite.", output);
                return Ok(());
            }

            let toml_str = Config::default_config_toml();
            std::fs::write(&output, toml_str)?;
            println!("Generated default config at {}", output);
        }
    }
    Ok(())
}
