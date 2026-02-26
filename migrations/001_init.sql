-- ============================================================================
-- Devabase Database Schema
-- Version: 2.1.0
--
-- Naming Conventions:
--   sys_*                           - System tables (platform + application)
--   uv_{project_id}_{collection}    - User vector tables (per-project)
--   ut_{project_id}_{table}         - User custom tables (per-project)
--
-- Trigger Naming:
--   trg_{table}_{action}            - All triggers use trg_ prefix
--
-- Index Naming:
--   idx_{table}_{column(s)}         - All indexes use idx_ prefix
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE project_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');
CREATE TYPE api_key_type AS ENUM ('personal', 'project');
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'processed', 'failed');
CREATE TYPE webhook_status AS ENUM ('active', 'paused', 'disabled');

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PLATFORM TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- sys_users: User accounts
-- -----------------------------------------------------------------------------
CREATE TABLE sys_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    status user_status NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sys_users_email ON sys_users(LOWER(email));
CREATE INDEX idx_sys_users_status ON sys_users(status);

CREATE TRIGGER trg_sys_users_updated_at
    BEFORE UPDATE ON sys_users
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_sessions: User sessions for refresh tokens
-- -----------------------------------------------------------------------------
CREATE TABLE sys_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sys_users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_sessions_user_id ON sys_sessions(user_id);
CREATE INDEX idx_sys_sessions_expires_at ON sys_sessions(expires_at);

-- -----------------------------------------------------------------------------
-- sys_projects: Projects/workspaces
-- -----------------------------------------------------------------------------
CREATE TABLE sys_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES sys_users(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sys_projects_owner_slug UNIQUE(owner_id, slug)
);

CREATE INDEX idx_sys_projects_owner_id ON sys_projects(owner_id);
CREATE INDEX idx_sys_projects_slug ON sys_projects(slug);
CREATE INDEX idx_sys_projects_is_active ON sys_projects(is_active) WHERE is_active = true;

CREATE TRIGGER trg_sys_projects_updated_at
    BEFORE UPDATE ON sys_projects
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_project_members: Project membership
-- -----------------------------------------------------------------------------
CREATE TABLE sys_project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES sys_users(id) ON DELETE CASCADE,
    role project_role NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES sys_users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sys_project_members UNIQUE(project_id, user_id)
);

CREATE INDEX idx_sys_project_members_project_id ON sys_project_members(project_id);
CREATE INDEX idx_sys_project_members_user_id ON sys_project_members(user_id);
CREATE INDEX idx_sys_project_members_role ON sys_project_members(role);

CREATE TRIGGER trg_sys_project_members_updated_at
    BEFORE UPDATE ON sys_project_members
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_project_invitations: Pending invitations
-- -----------------------------------------------------------------------------
CREATE TABLE sys_project_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
    role project_role NOT NULL DEFAULT 'member',
    token VARCHAR(64) NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES sys_users(id) ON DELETE CASCADE,
    status invitation_status NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_project_invitations_token ON sys_project_invitations(token);
CREATE INDEX idx_sys_project_invitations_email ON sys_project_invitations(LOWER(email));
CREATE INDEX idx_sys_project_invitations_project_id ON sys_project_invitations(project_id);
CREATE INDEX idx_sys_project_invitations_status ON sys_project_invitations(status);

-- -----------------------------------------------------------------------------
-- sys_api_keys: API authentication keys
-- -----------------------------------------------------------------------------
CREATE TABLE sys_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES sys_users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES sys_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    key_type api_key_type NOT NULL DEFAULT 'personal',
    description TEXT,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    rate_limit INTEGER,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_api_keys_key_hash ON sys_api_keys(key_hash);
CREATE INDEX idx_sys_api_keys_key_prefix ON sys_api_keys(key_prefix);
CREATE INDEX idx_sys_api_keys_user_id ON sys_api_keys(user_id);
CREATE INDEX idx_sys_api_keys_project_id ON sys_api_keys(project_id);

CREATE TRIGGER trg_sys_api_keys_updated_at
    BEFORE UPDATE ON sys_api_keys
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- OBSERVABILITY TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- sys_usage_logs: API usage tracking
-- -----------------------------------------------------------------------------
CREATE TABLE sys_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES sys_users(id) ON DELETE SET NULL,
    project_id UUID REFERENCES sys_projects(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES sys_api_keys(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code SMALLINT NOT NULL,
    request_tokens INTEGER,
    response_tokens INTEGER,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_usage_logs_created_at ON sys_usage_logs(created_at DESC);
CREATE INDEX idx_sys_usage_logs_project_id ON sys_usage_logs(project_id);
CREATE INDEX idx_sys_usage_logs_user_id ON sys_usage_logs(user_id);
CREATE INDEX idx_sys_usage_logs_api_key_id ON sys_usage_logs(api_key_id);
CREATE INDEX idx_sys_usage_logs_endpoint ON sys_usage_logs(endpoint);

-- -----------------------------------------------------------------------------
-- sys_cache: Response caching
-- -----------------------------------------------------------------------------
CREATE TABLE sys_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(64) NOT NULL UNIQUE,
    cache_type VARCHAR(50) NOT NULL DEFAULT 'exact',
    request_hash VARCHAR(64) NOT NULL,
    response TEXT NOT NULL,
    token_count INTEGER,
    hit_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_cache_key ON sys_cache(cache_key);
CREATE INDEX idx_sys_cache_expires_at ON sys_cache(expires_at);

-- -----------------------------------------------------------------------------
-- sys_webhooks: Webhook configurations
-- -----------------------------------------------------------------------------
CREATE TABLE sys_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255) NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    status webhook_status NOT NULL DEFAULT 'active',
    headers JSONB DEFAULT '{}',
    retry_count INTEGER NOT NULL DEFAULT 3,
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_webhooks_project_id ON sys_webhooks(project_id);
CREATE INDEX idx_sys_webhooks_status ON sys_webhooks(status);

CREATE TRIGGER trg_sys_webhooks_updated_at
    BEFORE UPDATE ON sys_webhooks
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_webhook_logs: Webhook delivery logs
-- -----------------------------------------------------------------------------
CREATE TABLE sys_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES sys_webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    request_headers JSONB,
    response_status INTEGER,
    response_body TEXT,
    response_headers JSONB,
    latency_ms INTEGER,
    attempt INTEGER NOT NULL DEFAULT 1,
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_webhook_logs_webhook_id ON sys_webhook_logs(webhook_id);
CREATE INDEX idx_sys_webhook_logs_created_at ON sys_webhook_logs(created_at DESC);
CREATE INDEX idx_sys_webhook_logs_event_type ON sys_webhook_logs(event_type);

-- ============================================================================
-- STORAGE TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- sys_files: File storage metadata
-- -----------------------------------------------------------------------------
CREATE TABLE sys_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES sys_projects(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_files_project_id ON sys_files(project_id);
CREATE INDEX idx_sys_files_filename ON sys_files(filename);
CREATE INDEX idx_sys_files_created_at ON sys_files(created_at DESC);

-- ============================================================================
-- AUTO-API TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- sys_user_tables: Registry for user-defined tables
-- -----------------------------------------------------------------------------
CREATE TABLE sys_user_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    table_name VARCHAR(255) NOT NULL,
    schema_definition JSONB NOT NULL,
    api_enabled BOOLEAN NOT NULL DEFAULT true,
    api_permissions JSONB DEFAULT '{"read": true, "create": true, "update": true, "delete": true}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sys_user_tables_project_name UNIQUE(project_id, table_name)
);

CREATE INDEX idx_sys_user_tables_project_id ON sys_user_tables(project_id);
CREATE INDEX idx_sys_user_tables_api_enabled ON sys_user_tables(api_enabled) WHERE api_enabled = true;

CREATE TRIGGER trg_sys_user_tables_updated_at
    BEFORE UPDATE ON sys_user_tables
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_query_history: SQL query history
-- -----------------------------------------------------------------------------
CREATE TABLE sys_query_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES sys_users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    execution_time_ms INTEGER,
    row_count INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_query_history_project_id ON sys_query_history(project_id);
CREATE INDEX idx_sys_query_history_user_id ON sys_query_history(user_id);
CREATE INDEX idx_sys_query_history_created_at ON sys_query_history(created_at DESC);

-- ============================================================================
-- VECTOR/RAG TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- sys_collections: Vector collections
-- -----------------------------------------------------------------------------
CREATE TABLE sys_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    dimensions INTEGER NOT NULL DEFAULT 1536,
    metric VARCHAR(50) NOT NULL DEFAULT 'cosine',
    index_type VARCHAR(50) NOT NULL DEFAULT 'hnsw',
    metadata JSONB DEFAULT '{}',
    vector_count BIGINT NOT NULL DEFAULT 0,
    rag_enabled BOOLEAN NOT NULL DEFAULT false,
    rag_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sys_collections_project_name UNIQUE(project_id, name)
);

CREATE INDEX idx_sys_collections_project_id ON sys_collections(project_id);
CREATE INDEX idx_sys_collections_name ON sys_collections(name);
CREATE INDEX idx_sys_collections_rag_enabled ON sys_collections(rag_enabled) WHERE rag_enabled = true;

CREATE TRIGGER trg_sys_collections_updated_at
    BEFORE UPDATE ON sys_collections
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_documents: Uploaded documents
-- -----------------------------------------------------------------------------
CREATE TABLE sys_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES sys_collections(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000),
    file_size BIGINT NOT NULL DEFAULT 0,
    status document_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_sys_documents_collection_id ON sys_documents(collection_id);
CREATE INDEX idx_sys_documents_status ON sys_documents(status);
CREATE INDEX idx_sys_documents_created_at ON sys_documents(created_at DESC);

CREATE TRIGGER trg_sys_documents_updated_at
    BEFORE UPDATE ON sys_documents
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_chunks: Document chunks
-- -----------------------------------------------------------------------------
CREATE TABLE sys_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES sys_documents(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES sys_collections(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    start_offset INTEGER NOT NULL DEFAULT 0,
    end_offset INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_chunks_document_id ON sys_chunks(document_id);
CREATE INDEX idx_sys_chunks_collection_id ON sys_chunks(collection_id);
CREATE INDEX idx_sys_chunks_document_index ON sys_chunks(document_id, chunk_index);

-- -----------------------------------------------------------------------------
-- sys_prompts: Prompt templates
-- -----------------------------------------------------------------------------
CREATE TABLE sys_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    description TEXT,
    variables TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sys_prompts_project_name_version UNIQUE(project_id, name, version)
);

CREATE INDEX idx_sys_prompts_project_id ON sys_prompts(project_id);
CREATE INDEX idx_sys_prompts_name ON sys_prompts(name);
CREATE INDEX idx_sys_prompts_is_active ON sys_prompts(is_active) WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- sys_prompt_history: Prompt change tracking
-- -----------------------------------------------------------------------------
CREATE TABLE sys_prompt_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id UUID NOT NULL REFERENCES sys_prompts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    changed_by UUID REFERENCES sys_users(id) ON DELETE SET NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_prompt_history_prompt_id ON sys_prompt_history(prompt_id);

-- ============================================================================
-- CONVERSATION TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- sys_conversations: Chat sessions with collections
-- -----------------------------------------------------------------------------
CREATE TABLE sys_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES sys_collections(id) ON DELETE CASCADE,
    user_id UUID REFERENCES sys_users(id) ON DELETE SET NULL,
    title VARCHAR(500),
    summary TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_conversations_project_id ON sys_conversations(project_id);
CREATE INDEX idx_sys_conversations_collection_id ON sys_conversations(collection_id);
CREATE INDEX idx_sys_conversations_user_id ON sys_conversations(user_id);
CREATE INDEX idx_sys_conversations_created_at ON sys_conversations(created_at DESC);

CREATE TRIGGER trg_sys_conversations_updated_at
    BEFORE UPDATE ON sys_conversations
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_messages: Chat messages
-- -----------------------------------------------------------------------------
CREATE TABLE sys_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES sys_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    sources JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sys_messages_conversation_id ON sys_messages(conversation_id);
CREATE INDEX idx_sys_messages_created_at ON sys_messages(created_at);

-- ============================================================================
-- BUSINESS LOGIC TRIGGERS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Auto-add owner as project member on project creation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_project_add_owner()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sys_project_members (project_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.owner_id, 'owner', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_projects_add_owner
    AFTER INSERT ON sys_projects
    FOR EACH ROW EXECUTE FUNCTION fn_project_add_owner();

-- -----------------------------------------------------------------------------
-- Update conversation stats after message insert
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_message_update_conversation()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sys_conversations
    SET message_count = message_count + 1,
        total_tokens = total_tokens + NEW.tokens,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_messages_update_conversation
    AFTER INSERT ON sys_messages
    FOR EACH ROW EXECUTE FUNCTION fn_message_update_conversation();

-- -----------------------------------------------------------------------------
-- Extract and update prompt variables
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_extract_prompt_variables(content TEXT)
RETURNS TEXT[] AS $$
DECLARE
    vars TEXT[];
BEGIN
    SELECT ARRAY(
        SELECT DISTINCT (regexp_matches(content, '\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}', 'g'))[1]
    ) INTO vars;
    RETURN COALESCE(vars, '{}');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_prompt_extract_variables()
RETURNS TRIGGER AS $$
BEGIN
    NEW.variables := fn_extract_prompt_variables(NEW.content);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_prompts_extract_variables
    BEFORE INSERT OR UPDATE ON sys_prompts
    FOR EACH ROW EXECUTE FUNCTION fn_prompt_extract_variables();

-- -----------------------------------------------------------------------------
-- Limit query history per project (keep last 1000)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_query_history_cleanup()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM sys_query_history
    WHERE project_id = NEW.project_id
      AND id NOT IN (
          SELECT id FROM sys_query_history
          WHERE project_id = NEW.project_id
          ORDER BY created_at DESC
          LIMIT 1000
      );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_query_history_cleanup
    AFTER INSERT ON sys_query_history
    FOR EACH ROW EXECUTE FUNCTION fn_query_history_cleanup();

-- ============================================================================
-- VECTOR TABLE MANAGEMENT
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Get vector table name for a collection
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_vector_table_name(
    p_project_id UUID,
    p_collection_name VARCHAR
)
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'uv_' || REPLACE(p_project_id::text, '-', '_') || '_' || p_collection_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -----------------------------------------------------------------------------
-- Create vector table for a collection
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_vector_table(
    p_project_id UUID,
    p_collection_name VARCHAR,
    p_dimensions INTEGER,
    p_metric VARCHAR
)
RETURNS VOID AS $$
DECLARE
    v_table_name VARCHAR;
    v_index_name VARCHAR;
    v_index_ops VARCHAR;
BEGIN
    v_table_name := fn_get_vector_table_name(p_project_id, p_collection_name);
    v_index_name := 'idx_' || v_table_name || '_embedding';

    -- Determine index operator class based on metric
    CASE p_metric
        WHEN 'cosine' THEN v_index_ops := 'vector_cosine_ops';
        WHEN 'l2', 'euclidean' THEN v_index_ops := 'vector_l2_ops';
        ELSE v_index_ops := 'vector_ip_ops';
    END CASE;

    -- Create the vector table
    EXECUTE format($sql$
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            chunk_id UUID REFERENCES sys_chunks(id) ON DELETE CASCADE,
            external_id VARCHAR(255),
            embedding vector(%s) NOT NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    $sql$, v_table_name, p_dimensions);

    -- Create HNSW index for vector similarity search
    EXECUTE format($sql$
        CREATE INDEX IF NOT EXISTS %I ON %I
        USING hnsw (embedding %s)
        WITH (m = 16, ef_construction = 64)
    $sql$, v_index_name, v_table_name, v_index_ops);

    -- Create index on external_id for lookups
    EXECUTE format($sql$
        CREATE INDEX IF NOT EXISTS %I ON %I (external_id)
    $sql$, 'idx_' || v_table_name || '_external_id', v_table_name);

    -- Create index on chunk_id for joins
    EXECUTE format($sql$
        CREATE INDEX IF NOT EXISTS %I ON %I (chunk_id)
    $sql$, 'idx_' || v_table_name || '_chunk_id', v_table_name);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Drop vector table for a collection
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_drop_vector_table(
    p_project_id UUID,
    p_collection_name VARCHAR
)
RETURNS VOID AS $$
DECLARE
    v_table_name VARCHAR;
BEGIN
    v_table_name := fn_get_vector_table_name(p_project_id, p_collection_name);
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_table_name);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Trigger: Create vector table on collection insert
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_collection_create_vector_table()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_create_vector_table(NEW.project_id, NEW.name, NEW.dimensions, NEW.metric);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_collections_create_vector_table
    AFTER INSERT ON sys_collections
    FOR EACH ROW EXECUTE FUNCTION fn_collection_create_vector_table();

-- -----------------------------------------------------------------------------
-- Trigger: Drop vector table on collection delete
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_collection_drop_vector_table()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_drop_vector_table(OLD.project_id, OLD.name);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_collections_drop_vector_table
    AFTER DELETE ON sys_collections
    FOR EACH ROW EXECUTE FUNCTION fn_collection_drop_vector_table();

-- ============================================================================
-- ACCESS CONTROL FUNCTIONS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Check if user has access to project with specific roles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_user_has_project_access(
    p_user_id UUID,
    p_project_id UUID,
    p_required_roles project_role[] DEFAULT ARRAY['owner', 'admin', 'member', 'viewer']::project_role[]
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sys_project_members
        WHERE user_id = p_user_id
          AND project_id = p_project_id
          AND role = ANY(p_required_roles)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- Check if user can write to project
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_user_can_write_project(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN fn_user_has_project_access(
        p_user_id,
        p_project_id,
        ARRAY['owner', 'admin', 'member']::project_role[]
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- Check if user can admin project
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_user_can_admin_project(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN fn_user_has_project_access(
        p_user_id,
        p_project_id,
        ARRAY['owner', 'admin']::project_role[]
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- Get user's role in project
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_user_project_role(p_user_id UUID, p_project_id UUID)
RETURNS project_role AS $$
DECLARE
    v_role project_role;
BEGIN
    SELECT role INTO v_role
    FROM sys_project_members
    WHERE user_id = p_user_id AND project_id = p_project_id;
    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Cleanup expired cache entries
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM sys_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Cleanup expired sessions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM sys_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Cleanup old usage logs (older than 90 days)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cleanup_old_usage_logs(p_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM sys_usage_logs
    WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
