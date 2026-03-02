#!/bin/bash

# ==============================================================================
# Devabase Database Reset Script
# Completely resets the database to a fresh state
#
# Usage:
#   ./scripts/reset-db.sh                # Full reset via Docker
#   ./scripts/reset-db.sh --soft         # Soft reset (user data only)
#   ./scripts/reset-db.sh --local        # Use direct psql instead of Docker
#   ./scripts/reset-db.sh --soft --local # Combine flags
#
# Environment variables:
#   POSTGRES_USER     - Database user (default: devabase)
#   POSTGRES_DB       - Database name (default: devabase)
#   POSTGRES_HOST     - Database host for --local (default: localhost)
#   POSTGRES_PORT     - Database port for --local (default: 5432)
#   POSTGRES_PASSWORD - Password for --local mode
#   DB_CONTAINER      - Docker container name (default: DEVABASE_POSTGRES)
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
SOFT_RESET=false
for arg in "$@"; do
    if [ "$arg" == "--soft" ] || [ "$arg" == "-s" ]; then
        SOFT_RESET=true
    fi
done

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Database credentials
DB_USER="${POSTGRES_USER:-devabase}"
DB_NAME="${POSTGRES_DB:-devabase}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Docker container name
CONTAINER_NAME="${DB_CONTAINER:-DEVABASE_POSTGRES}"

# Check for --local flag to use direct psql instead of docker
USE_LOCAL=false
for arg in "$@"; do
    if [ "$arg" == "--local" ] || [ "$arg" == "-l" ]; then
        USE_LOCAL=true
    fi
done

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
if [ "$SOFT_RESET" = true ]; then
echo "║         DEVABASE DATABASE SOFT RESET                         ║"
else
echo "║              DEVABASE DATABASE RESET                         ║"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "Database:  ${YELLOW}${DB_NAME}${NC}"
if [ "$USE_LOCAL" = true ]; then
echo -e "Host:      ${YELLOW}${DB_HOST}:${DB_PORT}${NC}"
echo -e "Mode:      ${YELLOW}Local (direct psql)${NC}"
else
echo -e "Container: ${YELLOW}${CONTAINER_NAME}${NC}"
fi
if [ "$SOFT_RESET" = true ]; then
echo -e "Reset:     ${YELLOW}Soft (user data only)${NC}"
else
echo -e "Reset:     ${YELLOW}Full (everything)${NC}"
fi
echo ""

if [ "$USE_LOCAL" = false ]; then
    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}Error: Container '${CONTAINER_NAME}' is not running.${NC}"
        echo -e "Start it with: ${CYAN}docker compose up -d devabase-postgres${NC}"
        echo -e "Or use --local flag to connect directly: ${CYAN}./scripts/reset-db.sh --local${NC}"
        exit 1
    fi
fi

# Confirm action
if [ "$SOFT_RESET" = true ]; then
    echo -e "${YELLOW}WARNING: This will delete all user tables (ut_*, uv_*) and sample data!${NC}"
else
    echo -e "${RED}WARNING: This will DELETE ALL DATA in the database!${NC}"
fi
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
fi

echo ""

# Function to run SQL (via docker or direct psql)
run_sql() {
    if [ "$USE_LOCAL" = true ]; then
        PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
    else
        docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" "$@"
    fi
}

if [ "$SOFT_RESET" = true ]; then
    # Soft reset: Only drop user tables and clear user data
    echo -e "${YELLOW}[1/2] Dropping user tables (ut_*, uv_*, vec_*)...${NC}"
    run_sql << 'EOF'
-- Drop all user tables (ut_*) - dynamic tables created via API
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'ut_%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.tablename);
        RAISE NOTICE 'Dropped table: %', tbl.tablename;
    END LOOP;
END $$;

-- Drop all vector tables (uv_*, vec_*) - collection vector storage
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND (tablename LIKE 'uv_%' OR tablename LIKE 'vec_%')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.tablename);
        RAISE NOTICE 'Dropped vector table: %', tbl.tablename;
    END LOOP;
END $$;

-- Clear user table registry
DELETE FROM sys_user_tables;
EOF
    echo -e "${GREEN}      Done${NC}"

    echo -e "${YELLOW}[2/2] Clearing sample/user data from system tables...${NC}"
    run_sql << 'EOF'
-- Clear data from system tables (preserving schema)
-- Order matters due to foreign key constraints

-- ============================================================
-- App Authentication (end-user auth)
-- ============================================================
DELETE FROM sys_app_oauth_connections;
DELETE FROM sys_app_sessions;
DELETE FROM sys_app_users;
DELETE FROM sys_app_auth_settings;

-- ============================================================
-- Knowledge Graph
-- ============================================================
DELETE FROM sys_relationships;
DELETE FROM sys_entities;

-- ============================================================
-- Evaluation & Benchmarks
-- ============================================================
DELETE FROM sys_evaluation_runs;
DELETE FROM sys_evaluation_cases;
DELETE FROM sys_evaluation_datasets;
DELETE FROM sys_benchmark_results;

-- ============================================================
-- Documents, Chunks, Collections
-- ============================================================
DELETE FROM sys_chunks;
DELETE FROM sys_documents;

-- Drop all collection vector tables (vec_projectid_collectionname)
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'vec_%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.tablename);
        RAISE NOTICE 'Dropped vector table: %', tbl.tablename;
    END LOOP;
END $$;

DELETE FROM sys_collections;

-- ============================================================
-- Conversations & Messages
-- ============================================================
DELETE FROM sys_messages;
DELETE FROM sys_conversations;

-- ============================================================
-- Prompts
-- ============================================================
DELETE FROM sys_prompt_history;
DELETE FROM sys_prompts;

-- ============================================================
-- API Keys & Webhooks
-- ============================================================
DELETE FROM sys_api_keys;
DELETE FROM sys_webhook_logs;
DELETE FROM sys_webhooks;

-- ============================================================
-- Files & Cache
-- ============================================================
DELETE FROM sys_files;
DELETE FROM sys_cache;

-- ============================================================
-- Project Members & Invitations
-- ============================================================
DELETE FROM sys_project_members;
DELETE FROM sys_project_invitations;
DELETE FROM sys_projects;

-- ============================================================
-- Users & Sessions
-- ============================================================
DELETE FROM sys_sessions;
DELETE FROM sys_users;

-- ============================================================
-- Query History & Usage
-- ============================================================
DELETE FROM sys_query_history;
DELETE FROM sys_usage_logs;
EOF
    echo -e "${GREEN}      Done${NC}"

else
    # Full reset: Drop everything

    # Stop backend if running
    echo -e "${YELLOW}[1/3] Stopping backend service...${NC}"
    docker compose stop devabase-backend 2>/dev/null || true
    echo -e "${GREEN}      Done${NC}"

    # Drop and recreate schema (cleanest way to reset)
    echo -e "${YELLOW}[2/3] Dropping all database objects...${NC}"
    run_sql << 'EOF'
-- First, explicitly drop all user tables (ut_*), vector tables (uv_*, vec_*)
-- This ensures they are cleaned up even if schema drop has issues
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE 'ut_%' OR tablename LIKE 'uv_%' OR tablename LIKE 'vec_%')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.tablename);
    END LOOP;
END $$;

-- Drop the entire public schema and recreate it
-- This removes ALL objects: tables, types, functions, etc.
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Restore default permissions
GRANT ALL ON SCHEMA public TO devabase;
GRANT ALL ON SCHEMA public TO public;

-- Re-enable required extensions (SQLx migrations expect these)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOF
    echo -e "${GREEN}      Done${NC}"
fi

if [ "$SOFT_RESET" = true ]; then
    # Soft reset complete
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           SOFT RESET COMPLETE!                               ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "User tables and data have been cleared."
    echo -e "System tables and schema remain intact."
    echo ""
    echo -e "To load sample data, run:"
    echo -e "  ${CYAN}./scripts/init-sample-data.sh${NC}"
    echo ""
else
    # Full reset: Restart backend
    # Restart backend (it will run migrations automatically)
    echo -e "${YELLOW}[3/3] Starting backend service (migrations will run automatically)...${NC}"
    docker compose up -d devabase-backend 2>/dev/null || true

    # Wait for backend to be healthy
    echo -e "      Waiting for backend to start..."
    sleep 3

    # Check if backend is running and migrations completed
    if docker ps --format '{{.Names}}' | grep -q "DEVABASE_BACKEND"; then
        # Wait a bit more for migrations
        sleep 2

        # Check logs for migration success and server start
        if docker logs DEVABASE_BACKEND 2>&1 | grep -q "Migrations completed successfully"; then
            echo -e "${GREEN}      Migrations applied successfully${NC}"
        fi

        if docker logs DEVABASE_BACKEND 2>&1 | tail -10 | grep -q "Listening on"; then
            echo -e "${GREEN}      Backend is running!${NC}"
        else
            echo -e "${YELLOW}      Backend is starting... Check logs with: docker logs -f DEVABASE_BACKEND${NC}"
        fi
    else
        echo -e "${RED}      Backend failed to start. Check logs with: docker logs DEVABASE_BACKEND${NC}"
    fi

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              DATABASE RESET COMPLETE!                        ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "You can now access the application at:"
    echo -e "  Frontend: ${CYAN}http://localhost:3000${NC}"
    echo -e "  Backend:  ${CYAN}http://localhost:8080${NC}"
    echo ""
fi
