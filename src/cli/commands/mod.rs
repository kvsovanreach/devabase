use crate::cli::{
    Cli, Commands, ConfigCommands, DbCommands, DocumentCommands, KeyCommands,
    ProjectCommands, UserCommands, VectorCommands,
};
use crate::db::models::CreateApiKey;
use crate::{auth, db, vector, Config, Result};
use std::io::{self, Write};

pub async fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Commands::Init => init().await,
        Commands::Serve { host, port } => serve(&cli.config, host, port).await,
        Commands::Db(cmd) => run_db_command(&cli.config, cmd).await,
        Commands::Key(cmd) => run_key_command(&cli.config, cmd).await,
        Commands::Vector(cmd) => run_vector_command(&cli.config, cmd).await,
        Commands::User(cmd) => run_user_command(&cli.config, cmd).await,
        Commands::Project(cmd) => run_project_command(&cli.config, cmd).await,
        Commands::Document(cmd) => run_document_command(&cli.config, cmd).await,
        Commands::Config(cmd) => run_config_command(&cli.config, cmd).await,
    }
}

/// Prompt for confirmation
fn confirm(message: &str) -> bool {
    print!("{} [y/N]: ", message);
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    matches!(input.trim().to_lowercase().as_str(), "y" | "yes")
}

/// Prompt for password (hidden input)
fn prompt_password(prompt: &str) -> Result<String> {
    print!("{}: ", prompt);
    io::stdout().flush().unwrap();

    // For now, just read normally (in production, use rpassword crate)
    let mut password = String::new();
    io::stdin().read_line(&mut password)?;
    Ok(password.trim().to_string())
}

async fn init() -> Result<()> {
    use std::fs;
    use std::path::Path;

    println!("Initializing Devabase project...");

    // Create config file if it doesn't exist
    if !Path::new("devabase.toml").exists() {
        fs::write("devabase.toml", Config::default_config_toml())?;
        println!("Created devabase.toml");
    } else {
        println!("devabase.toml already exists, skipping");
    }

    // Create data directory
    fs::create_dir_all("./data/files")?;
    println!("Created ./data/files directory");

    // Create .env example
    if !Path::new(".env.example").exists() {
        fs::write(
            ".env.example",
            r#"DATABASE_URL=postgres://user:password@localhost:5432/devabase
JWT_SECRET=your-secret-key-here
OPENAI_API_KEY=your-openai-api-key
"#,
        )?;
        println!("Created .env.example");
    }

    // Create docker-compose.yml
    if !Path::new("docker-compose.yml").exists() {
        fs::write(
            "docker-compose.yml",
            r#"services:
  db:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: devabase
      POSTGRES_PASSWORD: devabase
      POSTGRES_DB: devabase

volumes:
  pgdata:
"#,
        )?;
        println!("Created docker-compose.yml");
    }

    println!("\nProject initialized! Next steps:");
    println!("  1. Copy .env.example to .env and fill in your values");
    println!("  2. Start PostgreSQL: docker compose up -d");
    println!("  3. Run migrations: devabase db setup");
    println!("  4. Create an API key: devabase key create --name default");
    println!("  5. Start the server: devabase serve");

    Ok(())
}

async fn serve(config_path: &str, host: Option<String>, port: Option<u16>) -> Result<()> {
    use crate::rag::EmbeddingService;
    use crate::server::{create_router, AppState};
    use crate::storage::StorageService;
    use std::sync::Arc;

    // Load environment variables
    dotenvy::dotenv().ok();

    // Load config
    let mut config = if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)?
    } else {
        Config::from_env()?
    };

    // Override with CLI args
    if let Some(h) = host {
        config.server.host = h;
    }
    if let Some(p) = port {
        config.server.port = p;
    }

    println!("Starting Devabase server...");

    // Validate configuration and show warnings
    let warnings = config.validate();
    if !warnings.is_empty() {
        println!("\n{}", "=".repeat(60));
        println!("Configuration Warnings:");
        println!("{}", "=".repeat(60));
        for warning in &warnings {
            if warning.starts_with("ERROR") {
                eprintln!("  {}", warning);
            } else {
                println!("  {}", warning);
            }
        }
        println!("{}", "=".repeat(60));
        println!();

        // Check for critical errors
        if warnings.iter().any(|w| w.starts_with("ERROR")) {
            return Err(crate::Error::Config(
                "Configuration has critical errors. Please fix them before starting the server.".to_string()
            ));
        }
    }

    // Initialize database
    let pool = db::init(&config).await?;
    println!("Database connected");

    // Initialize services
    let storage = StorageService::new(&config)?;
    println!("Storage initialized");

    let embedding = EmbeddingService::new(&config)?;
    println!("Embedding service initialized ({})", config.embedding.provider);

    // Create app state
    let state = Arc::new(AppState::new(pool, config.clone(), storage, embedding));

    // Create router
    let app = create_router(state);

    // Start server
    let addr = format!("{}:{}", config.server.host, config.server.port);
    println!("\nServer listening on http://{}", addr);
    println!("API endpoint: http://{}/v1", addr);
    if config.server.ui_enabled {
        println!("Web UI: http://{}/ui", addr);
    }

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn run_db_command(config_path: &str, cmd: DbCommands) -> Result<()> {
    dotenvy::dotenv().ok();

    let config = if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)?
    } else {
        Config::from_env()?
    };

    match cmd {
        DbCommands::Setup => {
            println!("Setting up database...");
            let _pool = db::init(&config).await?;
            println!("Database setup complete!");
            Ok(())
        }
        DbCommands::Migrate => {
            println!("Running migrations...");
            let _pool = db::init(&config).await?;
            println!("Migrations complete!");
            Ok(())
        }
        DbCommands::Status => {
            println!("Checking database status...");
            let pool = db::pool::create_pool(&config.database).await?;

            // Check pgvector
            let has_pgvector: (bool,) = sqlx::query_as(
                "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')",
            )
            .fetch_one(&pool)
            .await?;

            println!("Database connection: OK");
            println!("pgvector extension: {}", if has_pgvector.0 { "OK" } else { "NOT INSTALLED" });

            // Count tables
            let (table_count,): (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'",
            )
            .fetch_one(&pool)
            .await?;
            println!("Tables: {}", table_count);

            Ok(())
        }
        DbCommands::Backup { output } => {
            let output_path = output.unwrap_or_else(|| {
                format!("backup_{}.sql", chrono::Utc::now().format("%Y%m%d_%H%M%S"))
            });

            println!("Creating backup...");
            println!("NOTE: For production backups, use pg_dump directly for better reliability.");

            // Extract connection info from DATABASE_URL
            let database_url = &config.database.url;

            // Try to use pg_dump if available
            let pg_dump_result = std::process::Command::new("pg_dump")
                .arg("--format=plain")
                .arg("--no-owner")
                .arg("--no-acl")
                .arg(database_url)
                .output();

            match pg_dump_result {
                Ok(output_cmd) if output_cmd.status.success() => {
                    std::fs::write(&output_path, &output_cmd.stdout)?;
                    println!("Backup created successfully: {}", output_path);
                    println!("Size: {} bytes", output_cmd.stdout.len());
                }
                Ok(output_cmd) => {
                    let stderr = String::from_utf8_lossy(&output_cmd.stderr);
                    return Err(crate::Error::Internal(format!(
                        "pg_dump failed: {}. Make sure pg_dump is installed and DATABASE_URL is correct.",
                        stderr.trim()
                    )));
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err(crate::Error::Internal(
                        "pg_dump not found. Install PostgreSQL client tools or use Docker:\n\
                         docker exec <container> pg_dump -U <user> <database> > backup.sql".to_string()
                    ));
                }
                Err(e) => {
                    return Err(crate::Error::Internal(format!(
                        "Failed to run pg_dump: {}",
                        e
                    )));
                }
            }

            Ok(())
        }
        DbCommands::Restore { input, yes } => {
            // Check if backup file exists
            if !std::path::Path::new(&input).exists() {
                return Err(crate::Error::BadRequest(format!(
                    "Backup file not found: {}",
                    input
                )));
            }

            // Confirm before restore
            if !yes {
                println!("WARNING: This will restore the database from backup.");
                println!("All current data will be overwritten!");
                if !confirm("Are you sure you want to proceed?") {
                    println!("Restore cancelled.");
                    return Ok(());
                }
            }

            println!("Restoring database from {}...", input);

            let database_url = &config.database.url;

            // Use psql to restore
            let psql_result = std::process::Command::new("psql")
                .arg(database_url)
                .arg("-f")
                .arg(&input)
                .output();

            match psql_result {
                Ok(output_cmd) if output_cmd.status.success() => {
                    println!("Database restored successfully!");
                }
                Ok(output_cmd) => {
                    let stderr = String::from_utf8_lossy(&output_cmd.stderr);
                    // psql may output warnings that aren't fatal
                    if output_cmd.status.code() == Some(0) || stderr.contains("already exists") {
                        println!("Database restored (with warnings).");
                        println!("Warnings: {}", stderr);
                    } else {
                        return Err(crate::Error::Internal(format!(
                            "psql restore failed: {}",
                            stderr.trim()
                        )));
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err(crate::Error::Internal(
                        "psql not found. Install PostgreSQL client tools or use Docker:\n\
                         docker exec -i <container> psql -U <user> <database> < backup.sql".to_string()
                    ));
                }
                Err(e) => {
                    return Err(crate::Error::Internal(format!(
                        "Failed to run psql: {}",
                        e
                    )));
                }
            }

            Ok(())
        }
    }
}

async fn run_key_command(config_path: &str, cmd: KeyCommands) -> Result<()> {
    dotenvy::dotenv().ok();

    let config = if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)?
    } else {
        Config::from_env()?
    };

    let pool = db::init(&config).await?;

    match cmd {
        KeyCommands::Create { project, name, scopes } => {
            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;
            let scopes: Vec<String> = scopes.split(',').map(|s| s.trim().to_string()).collect();

            let key = auth::create_key(
                &pool,
                project_id,
                CreateApiKey {
                    name: name.clone(),
                    scopes: scopes.clone(),
                    rate_limit: None,
                    expires_at: None,
                },
                &config.auth.api_key_prefix,
            )
            .await?;

            println!("\nAPI Key created successfully!");
            println!("Project: {}", project);
            println!("Name: {}", name);
            println!("Scopes: {:?}", scopes);
            println!("\n{}", "=".repeat(60));
            println!("API Key: {}", key.key);
            println!("{}", "=".repeat(60));
            println!("\nSave this key securely - it won't be shown again!");
            println!("This key is scoped to project {} and does not require X-Project-ID header.", project);

            Ok(())
        }
        KeyCommands::List { project } => {
            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;

            let keys = auth::list_keys(&pool, project_id).await?;

            if keys.is_empty() {
                println!("No API keys found for project {}.", project);
            } else {
                println!("API keys for project {}:", project);
                println!("{:<36} {:<20} {:<15} {:<20}", "ID", "Name", "Prefix", "Scopes");
                println!("{}", "-".repeat(95));
                for key in keys {
                    println!(
                        "{:<36} {:<20} {:<15} {:?}",
                        key.id, key.name, key.key_prefix, key.scopes
                    );
                }
            }

            Ok(())
        }
        KeyCommands::Revoke { project, id } => {
            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;
            let key_id = uuid::Uuid::parse_str(&id)
                .map_err(|_| crate::Error::BadRequest("Invalid key UUID".to_string()))?;

            auth::delete_key(&pool, project_id, key_id).await?;
            println!("API key revoked successfully.");

            Ok(())
        }
    }
}

async fn run_vector_command(config_path: &str, cmd: VectorCommands) -> Result<()> {
    dotenvy::dotenv().ok();

    let config = if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)?
    } else {
        Config::from_env()?
    };

    let pool = db::init(&config).await?;

    match cmd {
        VectorCommands::CreateCollection {
            name,
            dimensions,
            metric,
        } => {
            let collection = vector::create_collection(
                &pool,
                crate::db::models::CreateCollection {
                    name: name.clone(),
                    dimensions: Some(dimensions),
                    metric: Some(metric.clone()),
                    index_type: None,
                    metadata: None,
                },
                &config,
                None, // CLI commands don't have project context
            )
            .await?;

            println!("Collection '{}' created successfully!", name);
            println!("  Dimensions: {}", collection.dimensions);
            println!("  Metric: {}", collection.metric);
            println!("  Index type: {}", collection.index_type);

            Ok(())
        }
        VectorCommands::ListCollections => {
            let collections = vector::list_collections(&pool, None).await?;

            if collections.is_empty() {
                println!("No collections found.");
            } else {
                println!("{:<30} {:<12} {:<12} {:<12}", "Name", "Dimensions", "Metric", "Vectors");
                println!("{}", "-".repeat(70));
                for c in collections {
                    println!(
                        "{:<30} {:<12} {:<12} {:<12}",
                        c.name, c.dimensions, c.metric, c.vector_count
                    );
                }
            }

            Ok(())
        }
        VectorCommands::DeleteCollection { name } => {
            vector::delete_collection(&pool, &name, None).await?;
            println!("Collection '{}' deleted successfully.", name);
            Ok(())
        }
        VectorCommands::Stats { name } => {
            let stats = vector::get_collection_stats(&pool, &name, None).await?;

            println!("Collection: {}", stats.name);
            println!("  Dimensions: {}", stats.dimensions);
            println!("  Metric: {}", stats.metric);
            println!("  Index type: {}", stats.index_type);
            println!("  Vector count: {}", stats.vector_count);
            println!("  Storage: {} bytes", stats.storage_bytes);

            Ok(())
        }
    }
}

// ============================================================================
// User Commands
// ============================================================================

async fn run_user_command(config_path: &str, cmd: UserCommands) -> Result<()> {
    dotenvy::dotenv().ok();

    let config = if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)?
    } else {
        Config::from_env()?
    };

    let pool = db::init(&config).await?;

    match cmd {
        UserCommands::Create { email, name, password } => {
            let password = match password {
                Some(p) => p,
                None => prompt_password("Enter password")?,
            };

            if password.len() < 8 {
                return Err(crate::Error::BadRequest(
                    "Password must be at least 8 characters".to_string()
                ));
            }

            let password_hash = auth::hash_password(&password)?;
            let id = uuid::Uuid::new_v4();

            sqlx::query(
                r#"
                INSERT INTO sys_users (id, email, password_hash, name, status)
                VALUES ($1, $2, $3, $4, 'active')
                "#
            )
            .bind(id)
            .bind(&email)
            .bind(&password_hash)
            .bind(&name)
            .execute(pool.inner())
            .await
            .map_err(|e| {
                if e.to_string().contains("duplicate key") {
                    crate::Error::Conflict(format!("User with email '{}' already exists", email))
                } else {
                    crate::Error::Database(e)
                }
            })?;

            println!("User created successfully!");
            println!("  ID: {}", id);
            println!("  Email: {}", email);
            println!("  Name: {}", name);

            Ok(())
        }
        UserCommands::List { limit } => {
            let users: Vec<(uuid::Uuid, String, String, String, chrono::DateTime<chrono::Utc>)> =
                sqlx::query_as(
                    "SELECT id, email, name, status::text, created_at FROM sys_users ORDER BY created_at DESC LIMIT $1"
                )
                .bind(limit)
                .fetch_all(pool.inner())
                .await?;

            if users.is_empty() {
                println!("No users found.");
            } else {
                println!("{:<36} {:<30} {:<20} {:<10} {}", "ID", "Email", "Name", "Status", "Created");
                println!("{}", "-".repeat(110));
                for (id, email, name, status, created) in users {
                    println!(
                        "{:<36} {:<30} {:<20} {:<10} {}",
                        id,
                        if email.len() > 28 { format!("{}...", &email[..25]) } else { email },
                        if name.len() > 18 { format!("{}...", &name[..15]) } else { name },
                        status,
                        created.format("%Y-%m-%d %H:%M")
                    );
                }
            }

            Ok(())
        }
        UserCommands::Get { identifier } => {
            let user: Option<(uuid::Uuid, String, String, String, Option<chrono::DateTime<chrono::Utc>>, chrono::DateTime<chrono::Utc>)> =
                sqlx::query_as(
                    "SELECT id, email, name, status::text, last_login_at, created_at FROM sys_users WHERE id::text = $1 OR email = $1"
                )
                .bind(&identifier)
                .fetch_optional(pool.inner())
                .await?;

            match user {
                Some((id, email, name, status, last_login, created)) => {
                    println!("User Details:");
                    println!("  ID: {}", id);
                    println!("  Email: {}", email);
                    println!("  Name: {}", name);
                    println!("  Status: {}", status);
                    println!("  Last Login: {}", last_login.map(|t| t.to_string()).unwrap_or_else(|| "Never".to_string()));
                    println!("  Created: {}", created);
                }
                None => {
                    return Err(crate::Error::NotFound(format!("User '{}' not found", identifier)));
                }
            }

            Ok(())
        }
        UserCommands::Delete { identifier, yes } => {
            // Find user first
            let user: Option<(uuid::Uuid, String)> = sqlx::query_as(
                "SELECT id, email FROM sys_users WHERE id::text = $1 OR email = $1"
            )
            .bind(&identifier)
            .fetch_optional(pool.inner())
            .await?;

            let (user_id, email) = user.ok_or_else(|| {
                crate::Error::NotFound(format!("User '{}' not found", identifier))
            })?;

            if !yes {
                if !confirm(&format!("Delete user '{}'?", email)) {
                    println!("Deletion cancelled.");
                    return Ok(());
                }
            }

            sqlx::query("DELETE FROM sys_users WHERE id = $1")
                .bind(user_id)
                .execute(pool.inner())
                .await?;

            println!("User '{}' deleted successfully.", email);

            Ok(())
        }
    }
}

// ============================================================================
// Project Commands
// ============================================================================

async fn run_project_command(config_path: &str, cmd: ProjectCommands) -> Result<()> {
    dotenvy::dotenv().ok();

    let config = if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)?
    } else {
        Config::from_env()?
    };

    let pool = db::init(&config).await?;

    match cmd {
        ProjectCommands::Create { name, description, owner } => {
            // Find owner user
            let owner_user: Option<(uuid::Uuid,)> = sqlx::query_as(
                "SELECT id FROM sys_users WHERE id::text = $1 OR email = $1"
            )
            .bind(&owner)
            .fetch_optional(pool.inner())
            .await?;

            let (owner_id,) = owner_user.ok_or_else(|| {
                crate::Error::NotFound(format!("Owner user '{}' not found", owner))
            })?;

            let project_id = uuid::Uuid::new_v4();

            // Create project
            sqlx::query(
                r#"
                INSERT INTO sys_projects (id, name, description)
                VALUES ($1, $2, $3)
                "#
            )
            .bind(project_id)
            .bind(&name)
            .bind(&description)
            .execute(pool.inner())
            .await?;

            // Add owner as project member with owner role
            sqlx::query(
                r#"
                INSERT INTO sys_project_members (project_id, user_id, role)
                VALUES ($1, $2, 'owner')
                "#
            )
            .bind(project_id)
            .bind(owner_id)
            .execute(pool.inner())
            .await?;

            println!("Project created successfully!");
            println!("  ID: {}", project_id);
            println!("  Name: {}", name);
            println!("  Owner: {}", owner);

            Ok(())
        }
        ProjectCommands::List { user, limit } => {
            let projects: Vec<(uuid::Uuid, String, Option<String>, i64, chrono::DateTime<chrono::Utc>)> =
                if let Some(user_filter) = user {
                    sqlx::query_as(
                        r#"
                        SELECT p.id, p.name, p.description,
                               (SELECT COUNT(*) FROM sys_project_members WHERE project_id = p.id) as member_count,
                               p.created_at
                        FROM sys_projects p
                        JOIN sys_project_members pm ON pm.project_id = p.id
                        JOIN sys_users u ON u.id = pm.user_id
                        WHERE u.id::text = $1 OR u.email = $1
                        ORDER BY p.created_at DESC
                        LIMIT $2
                        "#
                    )
                    .bind(&user_filter)
                    .bind(limit)
                    .fetch_all(pool.inner())
                    .await?
                } else {
                    sqlx::query_as(
                        r#"
                        SELECT p.id, p.name, p.description,
                               (SELECT COUNT(*) FROM sys_project_members WHERE project_id = p.id) as member_count,
                               p.created_at
                        FROM sys_projects p
                        ORDER BY p.created_at DESC
                        LIMIT $1
                        "#
                    )
                    .bind(limit)
                    .fetch_all(pool.inner())
                    .await?
                };

            if projects.is_empty() {
                println!("No projects found.");
            } else {
                println!("{:<36} {:<25} {:<8} {}", "ID", "Name", "Members", "Created");
                println!("{}", "-".repeat(85));
                for (id, name, _desc, members, created) in projects {
                    println!(
                        "{:<36} {:<25} {:<8} {}",
                        id,
                        if name.len() > 23 { format!("{}...", &name[..20]) } else { name },
                        members,
                        created.format("%Y-%m-%d")
                    );
                }
            }

            Ok(())
        }
        ProjectCommands::Get { id } => {
            let project_id = uuid::Uuid::parse_str(&id)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;

            let project: Option<(uuid::Uuid, String, Option<String>, chrono::DateTime<chrono::Utc>)> =
                sqlx::query_as(
                    "SELECT id, name, description, created_at FROM sys_projects WHERE id = $1"
                )
                .bind(project_id)
                .fetch_optional(pool.inner())
                .await?;

            match project {
                Some((id, name, desc, created)) => {
                    println!("Project Details:");
                    println!("  ID: {}", id);
                    println!("  Name: {}", name);
                    println!("  Description: {}", desc.unwrap_or_else(|| "-".to_string()));
                    println!("  Created: {}", created);

                    // List members
                    let members: Vec<(String, String, String)> = sqlx::query_as(
                        r#"
                        SELECT u.email, u.name, pm.role::text
                        FROM sys_project_members pm
                        JOIN sys_users u ON u.id = pm.user_id
                        WHERE pm.project_id = $1
                        ORDER BY pm.role, u.name
                        "#
                    )
                    .bind(project_id)
                    .fetch_all(pool.inner())
                    .await?;

                    if !members.is_empty() {
                        println!("\nMembers:");
                        for (email, name, role) in members {
                            println!("  - {} ({}) - {}", name, email, role);
                        }
                    }
                }
                None => {
                    return Err(crate::Error::NotFound(format!("Project '{}' not found", id)));
                }
            }

            Ok(())
        }
        ProjectCommands::Delete { id, yes } => {
            let project_id = uuid::Uuid::parse_str(&id)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;

            // Get project name
            let project: Option<(String,)> = sqlx::query_as(
                "SELECT name FROM sys_projects WHERE id = $1"
            )
            .bind(project_id)
            .fetch_optional(pool.inner())
            .await?;

            let (name,) = project.ok_or_else(|| {
                crate::Error::NotFound(format!("Project '{}' not found", id))
            })?;

            if !yes {
                println!("WARNING: This will delete the project and all associated data!");
                if !confirm(&format!("Delete project '{}'?", name)) {
                    println!("Deletion cancelled.");
                    return Ok(());
                }
            }

            // Delete project (cascades to members, etc.)
            sqlx::query("DELETE FROM sys_projects WHERE id = $1")
                .bind(project_id)
                .execute(pool.inner())
                .await?;

            println!("Project '{}' deleted successfully.", name);

            Ok(())
        }
    }
}

// ============================================================================
// Document Commands
// ============================================================================

async fn run_document_command(config_path: &str, cmd: DocumentCommands) -> Result<()> {
    dotenvy::dotenv().ok();

    let config = if std::path::Path::new(config_path).exists() {
        Config::from_file(config_path)?
    } else {
        Config::from_env()?
    };

    let pool = db::init(&config).await?;

    match cmd {
        DocumentCommands::Upload { collection, project, file } => {
            use crate::rag::{count_tokens, Chunker, EmbeddingService};

            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;

            // Check if file exists
            if !std::path::Path::new(&file).exists() {
                return Err(crate::Error::BadRequest(format!("File not found: {}", file)));
            }

            // Get collection
            let coll = vector::get_collection(&pool, &collection, Some(project_id)).await?;

            // Read file
            let content = std::fs::read(&file)?;
            let filename = std::path::Path::new(&file)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            println!("Uploading '{}'...", filename);

            // Detect content type
            let content_type = mime_guess::from_path(&file)
                .first_or_octet_stream()
                .to_string();

            // Create document record
            let doc_id = uuid::Uuid::new_v4();
            sqlx::query(
                r#"
                INSERT INTO sys_documents (id, collection_id, filename, content_type, file_size, status)
                VALUES ($1, $2, $3, $4, $5, 'processing')
                "#
            )
            .bind(doc_id)
            .bind(coll.id)
            .bind(filename)
            .bind(&content_type)
            .bind(content.len() as i64)
            .execute(pool.inner())
            .await?;

            // Extract text based on content type
            let text = match content_type.as_str() {
                "text/plain" | "text/markdown" => {
                    String::from_utf8_lossy(&content).to_string()
                }
                _ => {
                    // For other types, just use raw content as text
                    String::from_utf8_lossy(&content).to_string()
                }
            };

            // Chunk the document
            let chunker = Chunker::new(&config);
            let chunks = chunker.chunk(&text);

            println!("  Created {} chunks", chunks.len());

            // Generate embeddings
            let embedding_service = EmbeddingService::new(&config)?;
            let chunk_texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
            let embeddings = embedding_service.embed(&chunk_texts).await?;

            // Insert chunks and vectors
            for (i, (chunk, embedding)) in chunks.iter().zip(embeddings.iter()).enumerate() {
                let chunk_id = uuid::Uuid::new_v4();
                let token_count = count_tokens(&chunk.content);

                // Insert chunk
                sqlx::query(
                    r#"
                    INSERT INTO sys_chunks (id, document_id, chunk_index, content, token_count, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    "#
                )
                .bind(chunk_id)
                .bind(doc_id)
                .bind(i as i32)
                .bind(&chunk.content)
                .bind(token_count as i32)
                .bind(serde_json::json!({}))
                .execute(pool.inner())
                .await?;

                // Insert vector
                let vector_id = uuid::Uuid::new_v4();
                sqlx::query(
                    &format!(
                        r#"
                        INSERT INTO "{}" (id, chunk_id, document_id, embedding, metadata)
                        VALUES ($1, $2, $3, $4, $5)
                        "#,
                        coll.name
                    )
                )
                .bind(vector_id)
                .bind(chunk_id)
                .bind(doc_id)
                .bind(embedding)
                .bind(serde_json::json!({
                    "document_name": filename,
                    "chunk_index": i
                }))
                .execute(pool.inner())
                .await?;
            }

            // Update document status
            sqlx::query(
                "UPDATE sys_documents SET status = 'processed', chunk_count = $1 WHERE id = $2"
            )
            .bind(chunks.len() as i32)
            .bind(doc_id)
            .execute(pool.inner())
            .await?;

            // Update collection vector count
            vector::update_vector_count(&pool, coll.id, chunks.len() as i64).await?;

            println!("Document uploaded successfully!");
            println!("  ID: {}", doc_id);
            println!("  Chunks: {}", chunks.len());

            Ok(())
        }
        DocumentCommands::List { collection, project, status, limit } => {
            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;

            // Get collection
            let coll = vector::get_collection(&pool, &collection, Some(project_id)).await?;

            let docs: Vec<(uuid::Uuid, String, String, i32, chrono::DateTime<chrono::Utc>)> =
                if let Some(status_filter) = status {
                    sqlx::query_as(
                        r#"
                        SELECT id, filename, status::text, chunk_count, created_at
                        FROM sys_documents
                        WHERE collection_id = $1 AND status::text = $2
                        ORDER BY created_at DESC
                        LIMIT $3
                        "#
                    )
                    .bind(coll.id)
                    .bind(&status_filter)
                    .bind(limit)
                    .fetch_all(pool.inner())
                    .await?
                } else {
                    sqlx::query_as(
                        r#"
                        SELECT id, filename, status::text, chunk_count, created_at
                        FROM sys_documents
                        WHERE collection_id = $1
                        ORDER BY created_at DESC
                        LIMIT $2
                        "#
                    )
                    .bind(coll.id)
                    .bind(limit)
                    .fetch_all(pool.inner())
                    .await?
                };

            if docs.is_empty() {
                println!("No documents found in collection '{}'.", collection);
            } else {
                println!("Documents in collection '{}':", collection);
                println!("{:<36} {:<30} {:<12} {:<8} {}", "ID", "Filename", "Status", "Chunks", "Created");
                println!("{}", "-".repeat(100));
                for (id, filename, status, chunks, created) in docs {
                    println!(
                        "{:<36} {:<30} {:<12} {:<8} {}",
                        id,
                        if filename.len() > 28 { format!("{}...", &filename[..25]) } else { filename },
                        status,
                        chunks,
                        created.format("%Y-%m-%d %H:%M")
                    );
                }
            }

            Ok(())
        }
        DocumentCommands::Get { id, project } => {
            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;
            let doc_id = uuid::Uuid::parse_str(&id)
                .map_err(|_| crate::Error::BadRequest("Invalid document UUID".to_string()))?;

            let doc: Option<(uuid::Uuid, String, String, i64, i32, String, chrono::DateTime<chrono::Utc>)> =
                sqlx::query_as(
                    r#"
                    SELECT d.id, d.filename, d.content_type, d.file_size, d.chunk_count, d.status::text, d.created_at
                    FROM sys_documents d
                    JOIN sys_collections c ON c.id = d.collection_id
                    WHERE d.id = $1 AND c.project_id = $2
                    "#
                )
                .bind(doc_id)
                .bind(project_id)
                .fetch_optional(pool.inner())
                .await?;

            match doc {
                Some((id, filename, content_type, size, chunks, status, created)) => {
                    println!("Document Details:");
                    println!("  ID: {}", id);
                    println!("  Filename: {}", filename);
                    println!("  Content Type: {}", content_type);
                    println!("  File Size: {} bytes", size);
                    println!("  Chunks: {}", chunks);
                    println!("  Status: {}", status);
                    println!("  Created: {}", created);
                }
                None => {
                    return Err(crate::Error::NotFound(format!("Document '{}' not found", id)));
                }
            }

            Ok(())
        }
        DocumentCommands::Delete { id, project, yes } => {
            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;
            let doc_id = uuid::Uuid::parse_str(&id)
                .map_err(|_| crate::Error::BadRequest("Invalid document UUID".to_string()))?;

            // Get document
            let doc: Option<(String, uuid::Uuid)> = sqlx::query_as(
                r#"
                SELECT d.filename, d.collection_id
                FROM sys_documents d
                JOIN sys_collections c ON c.id = d.collection_id
                WHERE d.id = $1 AND c.project_id = $2
                "#
            )
            .bind(doc_id)
            .bind(project_id)
            .fetch_optional(pool.inner())
            .await?;

            let (filename, _collection_id) = doc.ok_or_else(|| {
                crate::Error::NotFound(format!("Document '{}' not found", id))
            })?;

            if !yes {
                if !confirm(&format!("Delete document '{}'?", filename)) {
                    println!("Deletion cancelled.");
                    return Ok(());
                }
            }

            // Delete document (cascades to chunks and vectors)
            sqlx::query("DELETE FROM sys_documents WHERE id = $1")
                .bind(doc_id)
                .execute(pool.inner())
                .await?;

            println!("Document '{}' deleted successfully.", filename);

            Ok(())
        }
        DocumentCommands::Reprocess { id, project } => {
            let project_id = uuid::Uuid::parse_str(&project)
                .map_err(|_| crate::Error::BadRequest("Invalid project UUID".to_string()))?;
            let doc_id = uuid::Uuid::parse_str(&id)
                .map_err(|_| crate::Error::BadRequest("Invalid document UUID".to_string()))?;

            // Check document exists
            let doc: Option<(String,)> = sqlx::query_as(
                r#"
                SELECT d.filename
                FROM sys_documents d
                JOIN sys_collections c ON c.id = d.collection_id
                WHERE d.id = $1 AND c.project_id = $2
                "#
            )
            .bind(doc_id)
            .bind(project_id)
            .fetch_optional(pool.inner())
            .await?;

            let (filename,) = doc.ok_or_else(|| {
                crate::Error::NotFound(format!("Document '{}' not found", id))
            })?;

            // Mark for reprocessing
            sqlx::query("UPDATE sys_documents SET status = 'pending' WHERE id = $1")
                .bind(doc_id)
                .execute(pool.inner())
                .await?;

            println!("Document '{}' marked for reprocessing.", filename);
            println!("Note: Background processor will handle reprocessing.");

            Ok(())
        }
    }
}

// ============================================================================
// Config Commands
// ============================================================================

async fn run_config_command(config_path: &str, cmd: ConfigCommands) -> Result<()> {
    dotenvy::dotenv().ok();

    match cmd {
        ConfigCommands::Show { section } => {
            let config = if std::path::Path::new(config_path).exists() {
                Config::from_file(config_path)?
            } else {
                Config::from_env()?
            };

            let config_json = serde_json::to_value(&config)?;

            match section {
                Some(s) => {
                    if let Some(section_value) = config_json.get(&s) {
                        println!("[{}]", s);
                        println!("{}", serde_json::to_string_pretty(section_value)?);
                    } else {
                        let available: Vec<&str> = config_json.as_object()
                            .map(|m| m.keys().map(|k| k.as_str()).collect())
                            .unwrap_or_default();
                        return Err(crate::Error::BadRequest(format!(
                            "Unknown section '{}'. Available: {:?}",
                            s, available
                        )));
                    }
                }
                None => {
                    println!("Current Configuration (from {}):", config_path);
                    println!("{}", "=".repeat(60));
                    println!("{}", serde_json::to_string_pretty(&config_json)?);
                }
            }

            Ok(())
        }
        ConfigCommands::Validate => {
            println!("Validating configuration...");

            let config = if std::path::Path::new(config_path).exists() {
                Config::from_file(config_path)?
            } else {
                Config::from_env()?
            };

            let warnings = config.validate();

            if warnings.is_empty() {
                println!("Configuration is valid!");
            } else {
                println!("\nConfiguration Issues:");
                println!("{}", "-".repeat(60));
                for warning in &warnings {
                    if warning.starts_with("ERROR") {
                        println!("  [ERROR] {}", &warning[7..]);
                    } else if warning.starts_with("WARNING") {
                        println!("  [WARN]  {}", &warning[9..]);
                    } else if warning.starts_with("INFO") {
                        println!("  [INFO]  {}", &warning[6..]);
                    } else {
                        println!("  {}", warning);
                    }
                }
                println!("{}", "-".repeat(60));

                if warnings.iter().any(|w| w.starts_with("ERROR")) {
                    println!("\nConfiguration has errors that must be fixed.");
                    return Err(crate::Error::Config("Validation failed".to_string()));
                } else {
                    println!("\nConfiguration is valid (with warnings).");
                }
            }

            Ok(())
        }
        ConfigCommands::Generate { output, force } => {
            if std::path::Path::new(&output).exists() && !force {
                return Err(crate::Error::BadRequest(format!(
                    "File '{}' already exists. Use --force to overwrite.",
                    output
                )));
            }

            std::fs::write(&output, Config::default_config_toml())?;
            println!("Configuration file generated: {}", output);

            Ok(())
        }
    }
}
