#!/bin/bash

# ==============================================================================
# Devabase Sample Data Initialization Script
# Loads sample projects, collections, and tables for demonstration
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Database credentials
DB_USER="${POSTGRES_USER:-devabase}"
DB_NAME="${POSTGRES_DB:-devabase}"

# Docker container name
CONTAINER_NAME="${DB_CONTAINER:-DEVABASE_POSTGRES}"

# Sample data file
SAMPLE_DATA_FILE="scripts/sample-data.sql"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          DEVABASE SAMPLE DATA INITIALIZATION                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if migration file exists
if [ ! -f "$SAMPLE_DATA_FILE" ]; then
    echo -e "${RED}Error: Migration file not found: ${SAMPLE_DATA_FILE}${NC}"
    echo -e "Make sure you're running this script from the project root directory."
    exit 1
fi

echo -e "Data File: ${YELLOW}${SAMPLE_DATA_FILE}${NC}"
echo -e "Database:  ${YELLOW}${DB_NAME}${NC}"
echo -e "Container: ${YELLOW}${CONTAINER_NAME}${NC}"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Container '${CONTAINER_NAME}' is not running.${NC}"
    echo -e "Start it with: ${CYAN}docker compose up -d${NC}"
    exit 1
fi

echo -e "${YELLOW}Loading sample data...${NC}"
echo ""

# Run the migration
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" < "$SAMPLE_DATA_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          SAMPLE DATA LOADED SUCCESSFULLY!                    ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "You can now login with:"
    echo -e "  Email:    ${CYAN}demo@devabase.io${NC}"
    echo -e "  Password: ${CYAN}demo123${NC}"
    echo ""
    echo -e "Created Projects:"
    echo -e "  1. ${YELLOW}E-Commerce Platform${NC}"
    echo -e "     - Collections: products (RAG), reviews"
    echo -e "     - Tables: orders, customers"
    echo ""
    echo -e "  2. ${YELLOW}Knowledge Base${NC}"
    echo -e "     - Collections: documentation (RAG), faq (RAG)"
    echo -e "     - Tables: tickets, articles"
    echo ""
    echo -e "  3. ${YELLOW}Analytics Dashboard${NC}"
    echo -e "     - Collections: error_logs (RAG), user_feedback"
    echo -e "     - Tables: events, metrics"
    echo ""
    echo -e "Dashboard: ${CYAN}http://localhost:3000${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}Error: Failed to load sample data.${NC}"
    exit 1
fi
