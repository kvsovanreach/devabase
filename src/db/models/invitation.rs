use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use super::ProjectRole;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "invitation_status", rename_all = "lowercase")]
pub enum InvitationStatus {
    Pending,
    Accepted,
    Declined,
    Expired,
    Revoked,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ProjectInvitation {
    pub id: Uuid,
    pub project_id: Uuid,
    pub email: String,
    pub role: ProjectRole,
    pub token: String,
    pub invited_by: Uuid,
    pub status: InvitationStatus,
    pub expires_at: DateTime<Utc>,
    pub accepted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateInvitation {
    pub email: String,
    pub role: Option<ProjectRole>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InvitationResponse {
    pub id: Uuid,
    pub email: String,
    pub role: ProjectRole,
    pub status: InvitationStatus,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl From<ProjectInvitation> for InvitationResponse {
    fn from(inv: ProjectInvitation) -> Self {
        Self {
            id: inv.id,
            email: inv.email,
            role: inv.role,
            status: inv.status,
            expires_at: inv.expires_at,
            created_at: inv.created_at,
        }
    }
}
