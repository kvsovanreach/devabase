pub mod commands;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "devabase")]
#[command(about = "Lightweight backend for RAG/LLM applications")]
#[command(version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,

    /// Path to config file
    #[arg(short, long, default_value = "devabase.toml")]
    pub config: String,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Initialize a new project
    Init,

    /// Start the server
    Serve {
        /// Host to bind to
        #[arg(short = 'H', long)]
        host: Option<String>,

        /// Port to bind to
        #[arg(short, long)]
        port: Option<u16>,
    },

    /// Database commands
    #[command(subcommand)]
    Db(DbCommands),

    /// API key commands
    #[command(subcommand)]
    Key(KeyCommands),

    /// Vector commands
    #[command(subcommand)]
    Vector(VectorCommands),

    /// User management commands
    #[command(subcommand)]
    User(UserCommands),

    /// Project management commands
    #[command(subcommand)]
    Project(ProjectCommands),

    /// Document management commands
    #[command(subcommand)]
    Document(DocumentCommands),

    /// Configuration commands
    #[command(subcommand)]
    Config(ConfigCommands),
}

#[derive(Subcommand)]
pub enum DbCommands {
    /// Set up the database (create and run migrations)
    Setup,

    /// Run pending migrations
    Migrate,

    /// Check migration status
    Status,

    /// Backup the database
    Backup {
        /// Output file path
        #[arg(short, long)]
        output: Option<String>,
    },

    /// Restore database from backup
    Restore {
        /// Input backup file path
        #[arg()]
        input: String,

        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
    },
}

#[derive(Subcommand)]
pub enum KeyCommands {
    /// Create a new API key for a project
    Create {
        /// Project ID (UUID)
        #[arg(short, long)]
        project: String,

        /// Name for the API key
        #[arg(short, long)]
        name: String,

        /// Scopes (comma-separated: read,write,admin)
        #[arg(short, long, default_value = "read,write")]
        scopes: String,
    },

    /// List all API keys for a project
    List {
        /// Project ID (UUID)
        #[arg(short, long)]
        project: String,
    },

    /// Revoke an API key
    Revoke {
        /// Project ID (UUID)
        #[arg(short, long)]
        project: String,

        /// API key ID
        #[arg()]
        id: String,
    },
}

#[derive(Subcommand)]
pub enum VectorCommands {
    /// Create a new collection
    CreateCollection {
        /// Collection name
        #[arg()]
        name: String,

        /// Vector dimensions
        #[arg(short, long, default_value = "1536")]
        dimensions: i32,

        /// Distance metric (cosine, l2, ip)
        #[arg(short, long, default_value = "cosine")]
        metric: String,
    },

    /// List all collections
    ListCollections,

    /// Delete a collection
    DeleteCollection {
        /// Collection name
        #[arg()]
        name: String,
    },

    /// Get collection stats
    Stats {
        /// Collection name
        #[arg()]
        name: String,
    },
}

#[derive(Subcommand)]
pub enum UserCommands {
    /// Create a new user
    Create {
        /// User email
        #[arg(short, long)]
        email: String,

        /// User name
        #[arg(short, long)]
        name: String,

        /// Password (will prompt if not provided)
        #[arg(short, long)]
        password: Option<String>,
    },

    /// List all users
    List {
        /// Limit number of results
        #[arg(short, long, default_value = "50")]
        limit: i64,
    },

    /// Get user details
    Get {
        /// User email or ID
        #[arg()]
        identifier: String,
    },

    /// Delete a user
    Delete {
        /// User email or ID
        #[arg()]
        identifier: String,

        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
    },
}

#[derive(Subcommand)]
pub enum ProjectCommands {
    /// Create a new project
    Create {
        /// Project name
        #[arg(short, long)]
        name: String,

        /// Project description
        #[arg(short, long)]
        description: Option<String>,

        /// Owner user email or ID
        #[arg(short, long)]
        owner: String,
    },

    /// List all projects
    List {
        /// Filter by user (email or ID)
        #[arg(short, long)]
        user: Option<String>,

        /// Limit number of results
        #[arg(short, long, default_value = "50")]
        limit: i64,
    },

    /// Get project details
    Get {
        /// Project ID
        #[arg()]
        id: String,
    },

    /// Delete a project
    Delete {
        /// Project ID
        #[arg()]
        id: String,

        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
    },
}

#[derive(Subcommand)]
pub enum DocumentCommands {
    /// Upload a document to a collection
    Upload {
        /// Collection name
        #[arg(short, long)]
        collection: String,

        /// Project ID
        #[arg(short, long)]
        project: String,

        /// File path to upload
        #[arg()]
        file: String,
    },

    /// List documents in a collection
    List {
        /// Collection name
        #[arg(short, long)]
        collection: String,

        /// Project ID
        #[arg(short, long)]
        project: String,

        /// Filter by status (pending, processing, processed, failed)
        #[arg(short, long)]
        status: Option<String>,

        /// Limit number of results
        #[arg(short, long, default_value = "50")]
        limit: i64,
    },

    /// Get document details
    Get {
        /// Document ID
        #[arg()]
        id: String,

        /// Project ID
        #[arg(short, long)]
        project: String,
    },

    /// Delete a document
    Delete {
        /// Document ID
        #[arg()]
        id: String,

        /// Project ID
        #[arg(short, long)]
        project: String,

        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
    },

    /// Reprocess a document
    Reprocess {
        /// Document ID
        #[arg()]
        id: String,

        /// Project ID
        #[arg(short, long)]
        project: String,
    },
}

#[derive(Subcommand)]
pub enum ConfigCommands {
    /// Show current configuration
    Show {
        /// Show only specific section (server, database, embedding, etc.)
        #[arg(short, long)]
        section: Option<String>,
    },

    /// Validate configuration
    Validate,

    /// Generate default configuration file
    Generate {
        /// Output file path
        #[arg(short, long, default_value = "devabase.toml")]
        output: String,

        /// Overwrite existing file
        #[arg(short, long)]
        force: bool,
    },
}
