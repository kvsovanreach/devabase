//! Test fixtures for creating test data

use super::client::TestClient;
use super::test_id;
use super::TestContext;

/// Create a test user with unique email
pub fn unique_email() -> String {
    format!("test_{}@example.com", test_id())
}

/// Create a unique collection name
pub fn unique_collection_name() -> String {
    format!("test_collection_{}", test_id())
}

/// Create a unique table name
pub fn unique_table_name() -> String {
    format!("test_table_{}", test_id())
}

/// Create a unique project name
pub fn unique_project_name() -> String {
    format!("Test Project {}", test_id())
}

/// Test user credentials
pub struct TestUser {
    pub email: String,
    pub password: String,
    pub name: String,
}

impl TestUser {
    pub fn new() -> Self {
        Self {
            email: unique_email(),
            password: "TestPass123!".to_string(),
            name: format!("Test User {}", test_id()),
        }
    }
}

impl Default for TestUser {
    fn default() -> Self {
        Self::new()
    }
}

/// Setup a fully authenticated test client with user and project
pub async fn setup_authenticated_client(ctx: &TestContext) -> TestClient {
    let mut client = TestClient::new(ctx.router.clone());
    let user = TestUser::new();

    // Register user
    client.register(&user.email, &user.password, &user.name)
        .await
        .expect("Failed to register test user");

    // Create project
    client.create_project(&unique_project_name())
        .await
        .expect("Failed to create test project");

    client
}

/// Column definition for test tables
#[derive(serde::Serialize)]
pub struct ColumnDef {
    pub name: String,
    #[serde(rename = "type")]
    pub col_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nullable: Option<bool>,
}

impl ColumnDef {
    pub fn id() -> Self {
        Self {
            name: "id".to_string(),
            col_type: "uuid".to_string(),
            primary: Some(true),
            nullable: Some(false),
        }
    }

    pub fn string(name: &str) -> Self {
        Self {
            name: name.to_string(),
            col_type: "text".to_string(),
            primary: None,
            nullable: Some(true),
        }
    }

    pub fn string_required(name: &str) -> Self {
        Self {
            name: name.to_string(),
            col_type: "text".to_string(),
            primary: None,
            nullable: Some(false),
        }
    }

    pub fn integer(name: &str) -> Self {
        Self {
            name: name.to_string(),
            col_type: "integer".to_string(),
            primary: None,
            nullable: Some(true),
        }
    }

    pub fn boolean(name: &str) -> Self {
        Self {
            name: name.to_string(),
            col_type: "boolean".to_string(),
            primary: None,
            nullable: Some(true),
        }
    }

    pub fn timestamp(name: &str) -> Self {
        Self {
            name: name.to_string(),
            col_type: "timestamptz".to_string(),
            primary: None,
            nullable: Some(true),
        }
    }

    pub fn jsonb(name: &str) -> Self {
        Self {
            name: name.to_string(),
            col_type: "jsonb".to_string(),
            primary: None,
            nullable: Some(true),
        }
    }
}

/// Create a standard test table schema
pub fn standard_table_columns() -> Vec<ColumnDef> {
    vec![
        ColumnDef::id(),
        ColumnDef::string_required("title"),
        ColumnDef::string("description"),
        ColumnDef::integer("priority"),
        ColumnDef::boolean("completed"),
        ColumnDef::timestamp("due_date"),
        ColumnDef::jsonb("metadata"),
    ]
}
