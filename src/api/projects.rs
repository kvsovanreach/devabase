use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{Duration, Utc};
use rand::Rng;
use std::sync::Arc;
use uuid::Uuid;

use crate::api::pagination::{PaginatedResponse, PaginationQuery};
use crate::auth::AuthContext;
use crate::db::models::{
    AddProjectMember, CreateInvitation, CreateProject, InvitationResponse,
    Project, ProjectInvitation, ProjectMember, ProjectMemberResponse, ProjectResponse, ProjectRole,
    UpdateProject, UpdateProjectMember, User,
};
use crate::server::AppState;
use crate::{Error, Result};

// ============================================================================
// PROJECT CRUD
// ============================================================================

/// GET /v1/projects - List user's projects with pagination
pub async fn list_projects(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<PaginatedResponse<ProjectResponse>>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    let (limit, offset) = query.get_pagination();

    // Get total count
    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM sys_projects p
        JOIN sys_project_members pm ON pm.project_id = p.id
        WHERE pm.user_id = $1 AND p.is_active = true
        "#,
    )
    .bind(user_id)
    .fetch_one(state.pool.inner())
    .await?;

    // Get paginated projects
    let projects: Vec<Project> = sqlx::query_as(
        r#"
        SELECT p.*
        FROM sys_projects p
        JOIN sys_project_members pm ON pm.project_id = p.id
        WHERE pm.user_id = $1 AND p.is_active = true
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(state.pool.inner())
    .await?;

    // Then get roles for each project
    let mut responses = Vec::new();
    for project in projects {
        let role: (ProjectRole,) = sqlx::query_as(
            "SELECT role FROM sys_project_members WHERE project_id = $1 AND user_id = $2"
        )
        .bind(project.id)
        .bind(user_id)
        .fetch_one(state.pool.inner())
        .await?;

        let mut resp = ProjectResponse::from(project);
        resp.role = Some(role.0);
        responses.push(resp);
    }

    Ok(Json(PaginatedResponse::new(responses, total.0, limit, offset)))
}

/// POST /v1/projects - Create a new project
pub async fn create_project(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Json(input): Json<CreateProject>,
) -> Result<Json<ProjectResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    if input.name.trim().is_empty() {
        return Err(Error::BadRequest("Project name is required".to_string()));
    }

    // Generate slug from name if not provided
    let slug = input.slug.unwrap_or_else(|| {
        input
            .name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string()
    });

    if slug.is_empty() {
        return Err(Error::BadRequest("Invalid project slug".to_string()));
    }

    let project: Project = sqlx::query_as(
        r#"
        INSERT INTO sys_projects (name, slug, description, owner_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
    )
    .bind(input.name.trim())
    .bind(&slug)
    .bind(&input.description)
    .bind(user_id)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key") {
            Error::BadRequest("A project with this slug already exists".to_string())
        } else {
            Error::Database(e)
        }
    })?;

    let mut resp = ProjectResponse::from(project);
    resp.role = Some(ProjectRole::Owner);

    Ok(Json(resp))
}

/// GET /v1/projects/:id - Get project details
pub async fn get_project(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<ProjectResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Get project
    let project: Project = sqlx::query_as(
        r#"
        SELECT p.*
        FROM sys_projects p
        JOIN sys_project_members pm ON pm.project_id = p.id
        WHERE p.id = $1 AND pm.user_id = $2
        "#,
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Project not found".to_string()))?;

    // Get role
    let role: (ProjectRole,) = sqlx::query_as(
        "SELECT role FROM sys_project_members WHERE project_id = $1 AND user_id = $2"
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(state.pool.inner())
    .await?;

    let mut resp = ProjectResponse::from(project);
    resp.role = Some(role.0);

    Ok(Json(resp))
}

/// PATCH /v1/projects/:id - Update project
pub async fn update_project(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateProject>,
) -> Result<Json<ProjectResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission (must be owner or admin)
    let role = get_user_role(&state, user_id, id).await?;
    if !role.can_admin() {
        return Err(Error::Auth("Admin access required".to_string()));
    }

    let mut updates = Vec::new();
    let mut idx = 2;

    if let Some(name) = &input.name {
        if name.trim().is_empty() {
            return Err(Error::BadRequest("Name cannot be empty".to_string()));
        }
        updates.push(format!("name = ${}", idx));
        idx += 1;
    }

    if input.description.is_some() {
        updates.push(format!("description = ${}", idx));
        idx += 1;
    }

    if input.settings.is_some() {
        updates.push(format!("settings = ${}", idx));
    }

    if updates.is_empty() {
        return get_project(State(state), auth, Path(id)).await;
    }

    let query = format!(
        "UPDATE sys_projects SET {}, updated_at = NOW() WHERE id = $1 RETURNING *",
        updates.join(", ")
    );

    let mut query_builder = sqlx::query_as::<_, Project>(&query).bind(id);

    if let Some(name) = &input.name {
        query_builder = query_builder.bind(name.trim());
    }
    if let Some(description) = &input.description {
        query_builder = query_builder.bind(description);
    }
    if let Some(settings) = &input.settings {
        query_builder = query_builder.bind(settings);
    }

    let project = query_builder.fetch_one(state.pool.inner()).await?;

    let mut resp = ProjectResponse::from(project);
    resp.role = Some(role);

    Ok(Json(resp))
}

/// DELETE /v1/projects/:id - Delete project
pub async fn delete_project(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission (must be owner)
    let role = get_user_role(&state, user_id, id).await?;
    if !role.is_owner() {
        return Err(Error::Auth("Only project owner can delete".to_string()));
    }

    // Soft delete (set is_active = false)
    sqlx::query("UPDATE sys_projects SET is_active = false, updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(state.pool.inner())
        .await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ============================================================================
// PROJECT MEMBERS
// ============================================================================

/// GET /v1/projects/:id/members - List project members
pub async fn list_members(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(project_id): Path<Uuid>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<PaginatedResponse<ProjectMemberResponse>>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check access
    let _ = get_user_role(&state, user_id, project_id).await?;

    let (limit, offset) = query.get_pagination();

    // Get total count
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sys_project_members WHERE project_id = $1"
    )
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await?;

    // Get paginated members
    let members: Vec<ProjectMember> = sqlx::query_as(
        r#"
        SELECT *
        FROM sys_project_members
        WHERE project_id = $1
        ORDER BY role, joined_at
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(project_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(state.pool.inner())
    .await?;

    // Build responses with user info
    let mut responses = Vec::new();
    for pm in members {
        let user: User = sqlx::query_as("SELECT * FROM sys_users WHERE id = $1")
            .bind(pm.user_id)
            .fetch_one(state.pool.inner())
            .await?;

        responses.push(ProjectMemberResponse {
            id: pm.id,
            user_id: pm.user_id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar_url,
            role: pm.role,
            joined_at: pm.joined_at,
        });
    }

    Ok(Json(PaginatedResponse::new(responses, total.0, limit, offset)))
}

/// POST /v1/projects/:id/members - Add member directly (by user_id)
pub async fn add_member(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(project_id): Path<Uuid>,
    Json(input): Json<AddProjectMember>,
) -> Result<Json<ProjectMemberResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission
    let role = get_user_role(&state, user_id, project_id).await?;
    if !role.can_admin() {
        return Err(Error::Auth("Admin access required".to_string()));
    }

    // Cannot add as owner
    if input.role == ProjectRole::Owner {
        return Err(Error::BadRequest("Cannot add member as owner".to_string()));
    }

    // Get user
    let target_user: User = sqlx::query_as("SELECT * FROM sys_users WHERE id = $1")
        .bind(input.user_id)
        .fetch_optional(state.pool.inner())
        .await?
        .ok_or_else(|| Error::NotFound("User not found".to_string()))?;

    // Add member
    let member: ProjectMember = sqlx::query_as(
        r#"
        INSERT INTO sys_project_members (project_id, user_id, role, invited_by, joined_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3, updated_at = NOW()
        RETURNING *
        "#,
    )
    .bind(project_id)
    .bind(input.user_id)
    .bind(input.role)
    .bind(user_id)
    .fetch_one(state.pool.inner())
    .await?;

    Ok(Json(ProjectMemberResponse {
        id: member.id,
        user_id: member.user_id,
        email: target_user.email,
        name: target_user.name,
        avatar_url: target_user.avatar_url,
        role: member.role,
        joined_at: member.joined_at,
    }))
}

/// PATCH /v1/projects/:id/members/:uid - Update member role
pub async fn update_member(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((project_id, member_user_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<UpdateProjectMember>,
) -> Result<Json<ProjectMemberResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission
    let role = get_user_role(&state, user_id, project_id).await?;
    if !role.can_admin() {
        return Err(Error::Auth("Admin access required".to_string()));
    }

    // Cannot change to/from owner
    if input.role == ProjectRole::Owner {
        return Err(Error::BadRequest("Cannot change role to owner".to_string()));
    }

    let member_role = get_user_role(&state, member_user_id, project_id).await?;
    if member_role.is_owner() {
        return Err(Error::BadRequest("Cannot change owner role".to_string()));
    }

    // Update role
    let member: ProjectMember = sqlx::query_as(
        "UPDATE sys_project_members SET role = $3, updated_at = NOW() WHERE project_id = $1 AND user_id = $2 RETURNING *"
    )
    .bind(project_id)
    .bind(member_user_id)
    .bind(input.role)
    .fetch_one(state.pool.inner())
    .await?;

    let target_user: User = sqlx::query_as("SELECT * FROM sys_users WHERE id = $1")
        .bind(member_user_id)
        .fetch_one(state.pool.inner())
        .await?;

    Ok(Json(ProjectMemberResponse {
        id: member.id,
        user_id: member.user_id,
        email: target_user.email,
        name: target_user.name,
        avatar_url: target_user.avatar_url,
        role: member.role,
        joined_at: member.joined_at,
    }))
}

/// DELETE /v1/projects/:id/members/:uid - Remove member
pub async fn remove_member(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((project_id, member_user_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission
    let role = get_user_role(&state, user_id, project_id).await?;
    if !role.can_admin() && user_id != member_user_id {
        return Err(Error::Auth("Admin access required".to_string()));
    }

    // Cannot remove owner
    let member_role = get_user_role(&state, member_user_id, project_id).await?;
    if member_role.is_owner() {
        return Err(Error::BadRequest("Cannot remove project owner".to_string()));
    }

    sqlx::query("DELETE FROM sys_project_members WHERE project_id = $1 AND user_id = $2")
        .bind(project_id)
        .bind(member_user_id)
        .execute(state.pool.inner())
        .await?;

    Ok(Json(serde_json::json!({ "removed": true })))
}

// ============================================================================
// INVITATIONS
// ============================================================================

/// POST /v1/projects/:id/invitations - Create invitation
pub async fn create_invitation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateInvitation>,
) -> Result<Json<InvitationResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission
    let role = get_user_role(&state, user_id, project_id).await?;
    if !role.can_admin() {
        return Err(Error::Auth("Admin access required".to_string()));
    }

    let invite_role = input.role.unwrap_or(ProjectRole::Member);
    if invite_role == ProjectRole::Owner {
        return Err(Error::BadRequest("Cannot invite as owner".to_string()));
    }

    // Generate token
    let token: String = (0..32)
        .map(|_| rand::thread_rng().gen::<u8>())
        .collect::<Vec<_>>()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect();

    let expires_at = Utc::now() + Duration::days(7);

    let invitation: ProjectInvitation = sqlx::query_as(
        r#"
        INSERT INTO sys_project_invitations (project_id, email, role, token, invited_by, expires_at)
        VALUES ($1, LOWER($2), $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(project_id)
    .bind(&input.email)
    .bind(invite_role)
    .bind(&token)
    .bind(user_id)
    .bind(expires_at)
    .fetch_one(state.pool.inner())
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key") {
            Error::BadRequest("Invitation already sent to this email".to_string())
        } else {
            Error::Database(e)
        }
    })?;

    Ok(Json(InvitationResponse::from(invitation)))
}

/// GET /v1/projects/:id/invitations - List pending invitations with pagination
pub async fn list_invitations(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(project_id): Path<Uuid>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<PaginatedResponse<InvitationResponse>>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission
    let role = get_user_role(&state, user_id, project_id).await?;
    if !role.can_admin() {
        return Err(Error::Auth("Admin access required".to_string()));
    }

    let (limit, offset) = query.get_pagination();

    // Get total count
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sys_project_invitations WHERE project_id = $1 AND status = 'pending'"
    )
    .bind(project_id)
    .fetch_one(state.pool.inner())
    .await?;

    let invitations: Vec<ProjectInvitation> = sqlx::query_as(
        r#"
        SELECT * FROM sys_project_invitations
        WHERE project_id = $1 AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(project_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(state.pool.inner())
    .await?;

    let responses: Vec<InvitationResponse> = invitations.into_iter().map(InvitationResponse::from).collect();
    Ok(Json(PaginatedResponse::new(responses, total.0, limit, offset)))
}

/// DELETE /v1/projects/:id/invitations/:iid - Revoke invitation
pub async fn revoke_invitation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path((project_id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Check permission
    let role = get_user_role(&state, user_id, project_id).await?;
    if !role.can_admin() {
        return Err(Error::Auth("Admin access required".to_string()));
    }

    sqlx::query(
        "UPDATE sys_project_invitations SET status = 'revoked' WHERE id = $1 AND project_id = $2",
    )
    .bind(invitation_id)
    .bind(project_id)
    .execute(state.pool.inner())
    .await?;

    Ok(Json(serde_json::json!({ "revoked": true })))
}

/// POST /v1/invitations/:token/accept - Accept invitation
pub async fn accept_invitation(
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
    Path(token): Path<String>,
) -> Result<Json<ProjectResponse>> {
    let user_id = auth
        .user_id
        .ok_or_else(|| Error::Auth("User authentication required".to_string()))?;

    // Get invitation
    let invitation: ProjectInvitation = sqlx::query_as(
        r#"
        SELECT * FROM sys_project_invitations
        WHERE token = $1 AND status = 'pending' AND expires_at > NOW()
        "#,
    )
    .bind(&token)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Invalid or expired invitation".to_string()))?;

    // Add user as member
    sqlx::query(
        r#"
        INSERT INTO sys_project_members (project_id, user_id, role, invited_by, joined_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (project_id, user_id) DO NOTHING
        "#,
    )
    .bind(invitation.project_id)
    .bind(user_id)
    .bind(invitation.role)
    .bind(invitation.invited_by)
    .execute(state.pool.inner())
    .await?;

    // Mark invitation as accepted
    sqlx::query(
        "UPDATE sys_project_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1",
    )
    .bind(invitation.id)
    .execute(state.pool.inner())
    .await?;

    // Get project
    let project: Project = sqlx::query_as("SELECT * FROM sys_projects WHERE id = $1")
        .bind(invitation.project_id)
        .fetch_one(state.pool.inner())
        .await?;

    let mut resp = ProjectResponse::from(project);
    resp.role = Some(invitation.role);

    Ok(Json(resp))
}

// ============================================================================
// HELPERS
// ============================================================================

async fn get_user_role(state: &Arc<AppState>, user_id: Uuid, project_id: Uuid) -> Result<ProjectRole> {
    let row: (ProjectRole,) = sqlx::query_as(
        "SELECT role FROM sys_project_members WHERE user_id = $1 AND project_id = $2",
    )
    .bind(user_id)
    .bind(project_id)
    .fetch_optional(state.pool.inner())
    .await?
    .ok_or_else(|| Error::NotFound("Not a member of this project".to_string()))?;

    Ok(row.0)
}
