//! Devabase CLI - Command-line interface for Devabase
//!
//! Usage:
//!   deva login                    - Authenticate with Devabase
//!   deva logout                   - Clear saved credentials
//!   deva whoami                   - Show current user
//!   deva project list             - List all projects
//!   deva project use <id>         - Set current project
//!   deva collections list         - List collections
//!   deva collections create       - Create a collection
//!   deva documents list           - List documents
//!   deva documents upload <file>  - Upload a document
//!   deva tables list              - List tables
//!   deva tables export <name>     - Export table data
//!   deva sql <query>              - Execute SQL query

mod commands;
mod config;
mod client;
mod output;

use clap::{Parser, Subcommand};
use commands::{auth, collections, documents, projects, tables, sql};

#[derive(Parser)]
#[command(name = "deva")]
#[command(author = "Devabase")]
#[command(version = env!("CARGO_PKG_VERSION"))]
#[command(about = "CLI for Devabase - The open-source backend for AI applications")]
#[command(propagate_version = true)]
struct Cli {
    /// API base URL (overrides config)
    #[arg(long, global = true, env = "DEVABASE_API_URL")]
    api_url: Option<String>,

    /// Output format
    #[arg(long, global = true, default_value = "table")]
    format: output::OutputFormat,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Authenticate with Devabase
    Login(auth::LoginArgs),

    /// Clear saved credentials
    Logout,

    /// Show current user info
    Whoami,

    /// Manage projects
    #[command(subcommand)]
    Project(ProjectCommands),

    /// Manage collections
    #[command(subcommand)]
    Collections(CollectionCommands),

    /// Manage documents
    #[command(subcommand)]
    Documents(DocumentCommands),

    /// Manage tables
    #[command(subcommand)]
    Tables(TableCommands),

    /// Execute SQL query
    Sql(sql::SqlArgs),

    /// Show or update configuration
    Config {
        /// Configuration key to get or set
        key: Option<String>,
        /// Value to set
        value: Option<String>,
    },
}

#[derive(Subcommand)]
enum ProjectCommands {
    /// List all projects
    List,
    /// Set current project
    Use {
        /// Project ID or slug
        project: String,
    },
    /// Show current project
    Current,
    /// Create a new project
    Create {
        /// Project name
        name: String,
        /// Project slug (optional, generated from name if not provided)
        #[arg(short, long)]
        slug: Option<String>,
        /// Project description
        #[arg(short, long)]
        description: Option<String>,
    },
}

#[derive(Subcommand)]
enum CollectionCommands {
    /// List all collections
    List,
    /// Get collection details
    Get {
        /// Collection name
        name: String,
    },
    /// Create a new collection
    Create {
        /// Collection name
        name: String,
        /// Vector dimensions
        #[arg(short, long, default_value = "1536")]
        dimensions: i32,
        /// Distance metric (cosine, euclidean, dot)
        #[arg(short, long, default_value = "cosine")]
        metric: String,
    },
    /// Delete a collection
    Delete {
        /// Collection name
        name: String,
        /// Skip confirmation
        #[arg(short, long)]
        force: bool,
    },
}

#[derive(Subcommand)]
enum DocumentCommands {
    /// List documents
    List {
        /// Filter by collection
        #[arg(short, long)]
        collection: Option<String>,
    },
    /// Upload a document
    Upload {
        /// File path to upload
        file: String,
        /// Target collection
        #[arg(short, long)]
        collection: String,
    },
    /// Get document details
    Get {
        /// Document ID
        id: String,
    },
    /// Delete a document
    Delete {
        /// Document ID
        id: String,
        /// Skip confirmation
        #[arg(short, long)]
        force: bool,
    },
}

#[derive(Subcommand)]
enum TableCommands {
    /// List all tables
    List,
    /// Get table schema
    Get {
        /// Table name
        name: String,
    },
    /// Export table data
    Export {
        /// Table name
        name: String,
        /// Output format (csv, json)
        #[arg(short, long, default_value = "json")]
        format: String,
        /// Output file (stdout if not specified)
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Import data into table
    Import {
        /// Table name
        name: String,
        /// Input file
        file: String,
    },
    /// Query table rows
    Query {
        /// Table name
        name: String,
        /// Filter expression (e.g., "status=active")
        #[arg(short, long)]
        filter: Option<String>,
        /// Limit results
        #[arg(short, long, default_value = "100")]
        limit: i32,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    // Initialize config
    let mut cfg = config::Config::load().unwrap_or_default();

    // Override API URL if provided
    if let Some(url) = cli.api_url {
        cfg.api_url = url;
    }

    let result = match cli.command {
        // Auth commands
        Commands::Login(args) => auth::login(&mut cfg, args).await,
        Commands::Logout => auth::logout(&mut cfg).await,
        Commands::Whoami => auth::whoami(&cfg, cli.format).await,

        // Project commands
        Commands::Project(cmd) => match cmd {
            ProjectCommands::List => projects::list(&cfg, cli.format).await,
            ProjectCommands::Use { project } => projects::use_project(&mut cfg, &project).await,
            ProjectCommands::Current => projects::current(&cfg, cli.format).await,
            ProjectCommands::Create { name, slug, description } => {
                projects::create(&cfg, &name, slug, description, cli.format).await
            }
        },

        // Collection commands
        Commands::Collections(cmd) => match cmd {
            CollectionCommands::List => collections::list(&cfg, cli.format).await,
            CollectionCommands::Get { name } => collections::get(&cfg, &name, cli.format).await,
            CollectionCommands::Create { name, dimensions, metric } => {
                collections::create(&cfg, &name, dimensions, &metric, cli.format).await
            }
            CollectionCommands::Delete { name, force } => {
                collections::delete(&cfg, &name, force).await
            }
        },

        // Document commands
        Commands::Documents(cmd) => match cmd {
            DocumentCommands::List { collection } => {
                documents::list(&cfg, collection, cli.format).await
            }
            DocumentCommands::Upload { file, collection } => {
                documents::upload(&cfg, &file, &collection, cli.format).await
            }
            DocumentCommands::Get { id } => documents::get(&cfg, &id, cli.format).await,
            DocumentCommands::Delete { id, force } => documents::delete(&cfg, &id, force).await,
        },

        // Table commands
        Commands::Tables(cmd) => match cmd {
            TableCommands::List => tables::list(&cfg, cli.format).await,
            TableCommands::Get { name } => tables::get(&cfg, &name, cli.format).await,
            TableCommands::Export { name, format, output } => {
                tables::export(&cfg, &name, &format, output).await
            }
            TableCommands::Import { name, file } => tables::import(&cfg, &name, &file).await,
            TableCommands::Query { name, filter, limit } => {
                tables::query(&cfg, &name, filter, limit, cli.format).await
            }
        },

        // SQL command
        Commands::Sql(args) => sql::execute(&cfg, args, cli.format).await,

        // Config command
        Commands::Config { key, value } => {
            match (key, value) {
                (None, None) => {
                    // Show all config
                    println!("api_url: {}", cfg.api_url);
                    if let Some(ref p) = cfg.current_project {
                        println!("project: {}", p);
                    }
                    if cfg.token.is_some() {
                        println!("authenticated: yes");
                    }
                    Ok(())
                }
                (Some(k), None) => {
                    // Get config value
                    match k.as_str() {
                        "api_url" => println!("{}", cfg.api_url),
                        "project" => {
                            if let Some(ref p) = cfg.current_project {
                                println!("{}", p);
                            }
                        }
                        _ => eprintln!("Unknown config key: {}", k),
                    }
                    Ok(())
                }
                (Some(k), Some(v)) => {
                    // Set config value
                    if k == "api_url" {
                        cfg.api_url = v;
                        match cfg.save() {
                            Ok(_) => {
                                println!("Config updated");
                                Ok(())
                            }
                            Err(e) => Err(e.to_string().into())
                        }
                    } else {
                        Err(format!("Cannot set config key: {}", k).into())
                    }
                }
                _ => Ok(()),
            }
        }
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
