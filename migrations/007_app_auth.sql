-- ============================================================================
-- Application User Authentication Tables
-- Allows developers to use Devabase as auth backend for their own applications
-- ============================================================================

-- Application users (end-users of apps built with Devabase)
CREATE TABLE IF NOT EXISTS sys_app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,

    -- Authentication
    email VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),  -- NULL for OAuth-only users

    -- Profile
    name VARCHAR(255),
    avatar_url TEXT,
    phone VARCHAR(50),

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),

    -- Metadata (custom fields per project)
    metadata JSONB DEFAULT '{}',

    -- Security
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,

    -- Email verification
    email_verification_token VARCHAR(255),
    email_verification_sent_at TIMESTAMPTZ,

    -- Password reset
    password_reset_token VARCHAR(255),
    password_reset_sent_at TIMESTAMPTZ,
    password_reset_expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique email per project
    CONSTRAINT uq_app_user_email_project UNIQUE(project_id, email)
);

CREATE INDEX idx_app_users_project ON sys_app_users(project_id);
CREATE INDEX idx_app_users_email ON sys_app_users(project_id, email);
CREATE INDEX idx_app_users_status ON sys_app_users(project_id, status);

-- Application user sessions/refresh tokens
CREATE TABLE IF NOT EXISTS sys_app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sys_app_users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,

    -- Token info
    refresh_token_hash VARCHAR(255) NOT NULL,

    -- Session info
    user_agent TEXT,
    ip_address VARCHAR(45),
    device_info JSONB,

    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL,

    -- Status
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_app_sessions_user ON sys_app_sessions(user_id);
CREATE INDEX idx_app_sessions_project ON sys_app_sessions(project_id);
CREATE INDEX idx_app_sessions_expires ON sys_app_sessions(expires_at) WHERE NOT revoked;

-- OAuth connections for app users
CREATE TABLE IF NOT EXISTS sys_app_oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sys_app_users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,

    -- Provider info
    provider VARCHAR(50) NOT NULL,  -- google, github, facebook, etc.
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),

    -- Tokens (encrypted in production)
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,

    -- Profile from provider
    provider_data JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_oauth_connection UNIQUE(project_id, provider, provider_user_id)
);

CREATE INDEX idx_oauth_connections_user ON sys_app_oauth_connections(user_id);
CREATE INDEX idx_oauth_connections_provider ON sys_app_oauth_connections(project_id, provider);

-- Project auth settings
CREATE TABLE IF NOT EXISTS sys_app_auth_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE UNIQUE,

    -- General settings
    allow_registration BOOLEAN DEFAULT TRUE,
    require_email_verification BOOLEAN DEFAULT FALSE,

    -- Password policy
    min_password_length INT DEFAULT 8,
    require_uppercase BOOLEAN DEFAULT FALSE,
    require_lowercase BOOLEAN DEFAULT FALSE,
    require_numbers BOOLEAN DEFAULT FALSE,
    require_special_chars BOOLEAN DEFAULT FALSE,

    -- Session settings
    access_token_ttl_seconds INT DEFAULT 3600,      -- 1 hour
    refresh_token_ttl_seconds INT DEFAULT 2592000,  -- 30 days
    max_sessions_per_user INT DEFAULT 10,

    -- Security
    max_failed_attempts INT DEFAULT 5,
    lockout_duration_seconds INT DEFAULT 900,  -- 15 minutes

    -- OAuth providers config (encrypted secrets)
    oauth_providers JSONB DEFAULT '{}',

    -- Custom JWT claims template
    custom_claims_template JSONB,

    -- Webhook URLs for auth events
    webhooks JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings for existing projects
INSERT INTO sys_app_auth_settings (project_id)
SELECT id FROM sys_projects
WHERE id NOT IN (SELECT project_id FROM sys_app_auth_settings)
ON CONFLICT DO NOTHING;
