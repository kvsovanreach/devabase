use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "project_role", rename_all = "lowercase")]
pub enum ProjectRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

impl ProjectRole {
    pub fn can_read(&self) -> bool {
        true
    }

    pub fn can_write(&self) -> bool {
        matches!(self, ProjectRole::Owner | ProjectRole::Admin | ProjectRole::Member)
    }

    pub fn can_admin(&self) -> bool {
        matches!(self, ProjectRole::Owner | ProjectRole::Admin)
    }

    pub fn is_owner(&self) -> bool {
        matches!(self, ProjectRole::Owner)
    }
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub is_active: bool,
    pub settings: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProject {
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub description: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub is_active: bool,
    pub settings: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub role: Option<ProjectRole>,
}

impl From<Project> for ProjectResponse {
    fn from(project: Project) -> Self {
        Self {
            id: project.id,
            name: project.name,
            slug: project.slug,
            description: project.description,
            owner_id: project.owner_id,
            is_active: project.is_active,
            settings: project.settings,
            created_at: project.created_at,
            updated_at: project.updated_at,
            role: None,
        }
    }
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ProjectMember {
    pub id: Uuid,
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub role: ProjectRole,
    pub invited_by: Option<Uuid>,
    pub joined_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddProjectMember {
    pub user_id: Uuid,
    pub role: ProjectRole,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectMember {
    pub role: ProjectRole,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectMemberResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub role: ProjectRole,
    pub joined_at: Option<DateTime<Utc>>,
}
