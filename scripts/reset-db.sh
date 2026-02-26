#!/bin/bash

# ==============================================================================
# Devabase Database Reset Script
# Completely resets the database to a fresh state
#
# Usage:
#   ./scripts/reset-db.sh         # Full reset (drops everything)
#   ./scripts/reset-db.sh --soft  # Soft reset (only user tables & data)
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
if [ "$1" == "--soft" ] || [ "$1" == "-s" ]; then
    SOFT_RESET=true
fi

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Database credentials
DB_USER="${POSTGRES_USER:-devabase}"
DB_NAME="${POSTGRES_DB:-devabase}"

# Docker container name
CONTAINER_NAME="${DB_CONTAINER:-DEVABASE_POSTGRES}"

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
echo -e "Container: ${YELLOW}${CONTAINER_NAME}${NC}"
if [ "$SOFT_RESET" = true ]; then
echo -e "Mode:      ${YELLOW}Soft Reset (user tables only)${NC}"
else
echo -e "Mode:      ${YELLOW}Full Reset (everything)${NC}"
fi
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Container '${CONTAINER_NAME}' is not running.${NC}"
    echo -e "Start it with: ${CYAN}docker compose up -d devabase-postgres${NC}"
    exit 1
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

# Function to run SQL via docker
run_sql() {
    docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

if [ "$SOFT_RESET" = true ]; then
    # Soft reset: Only drop user tables and clear user data
    echo -e "${YELLOW}[1/2] Dropping user tables (ut_* and uv_*)...${NC}"
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

-- Drop all vector tables (uv_*) - if any exist
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'uv_%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.tablename);
        RAISE NOTICE 'Dropped table: %', tbl.tablename;
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

-- Clear documents and chunks (vectors are in collection tables)
DELETE FROM sys_chunks;
DELETE FROM sys_documents;

-- Clear conversations and messages
DELETE FROM sys_conversation_messages;
DELETE FROM sys_conversations;

-- Clear API keys
DELETE FROM sys_api_keys;

-- Clear webhooks
DELETE FROM sys_webhook_logs;
DELETE FROM sys_webhooks;

-- Clear prompts
DELETE FROM sys_prompts;

-- Clear project members and projects
DELETE FROM sys_project_members;
DELETE FROM sys_projects;

-- Clear sessions and users
DELETE FROM sys_sessions;
DELETE FROM sys_users;

-- Clear collections (this also drops collection vector tables via trigger if exists)
DELETE FROM sys_collections;

-- Clear query history
DELETE FROM sys_query_history;

-- Clear usage tracking
DELETE FROM sys_usage_daily;
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
-- First, explicitly drop all user tables (ut_*) and vector tables (uv_*)
-- This ensures they are cleaned up even if schema drop has issues
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND (tablename LIKE 'ut_%' OR tablename LIKE 'uv_%')
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
