#!/bin/bash

# ============================================================================
# Devabase Demo Initialization Script
# ============================================================================
# This script sets up demo data to showcase Devabase features:
# - Authentication & Projects
# - Collections & Documents
# - Vector Search & RAG
# - Tables with Auto-API
# - Knowledge Graph
# ============================================================================

set -e

# Configuration
BASE_URL="${DEVABASE_URL:-http://localhost:8080}"
DEMO_EMAIL="${DEMO_EMAIL:-demo@devabase.dev}"
DEMO_PASSWORD="${DEMO_PASSWORD:-demo123456}"
DEMO_NAME="${DEMO_NAME:-Demo User}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Devabase Demo Data Initialization${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if server is reachable
echo -e "${YELLOW}Checking server connectivity...${NC}"
if ! curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}Cannot connect to Devabase server at $BASE_URL${NC}"
    echo -e "${YELLOW}Make sure the server is running:${NC}"
    echo -e "  cargo run -- serve"
    echo -e "  # or"
    echo -e "  docker compose up -d"
    exit 1
fi
echo -e "${GREEN}✓ Server is reachable${NC}"
echo ""

# Helper function for API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local auth_header=""

    if [ -n "$TOKEN" ]; then
        auth_header="-H \"Authorization: Bearer $TOKEN\""
    fi

    if [ -n "$PROJECT_ID" ]; then
        auth_header="$auth_header -H \"X-Project-ID: $PROJECT_ID\""
    fi

    if [ "$method" = "GET" ]; then
        eval "curl -s -X GET \"$BASE_URL$endpoint\" $auth_header -H \"Content-Type: application/json\""
    else
        eval "curl -s -X $method \"$BASE_URL$endpoint\" $auth_header -H \"Content-Type: application/json\" -d '$data'"
    fi
}

# ============================================================================
# Step 1: Register/Login Demo User
# ============================================================================
echo -e "${YELLOW}Step 1: Setting up demo user...${NC}"

# Try to register (might already exist)
REGISTER_RESULT=$(curl -s -X POST "$BASE_URL/v1/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$DEMO_EMAIL\", \"password\": \"$DEMO_PASSWORD\", \"name\": \"$DEMO_NAME\"}" 2>/dev/null)

# Login to get token
LOGIN_RESULT=$(curl -s -X POST "$BASE_URL/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$DEMO_EMAIL\", \"password\": \"$DEMO_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Failed to login. Response: $LOGIN_RESULT${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Logged in as $DEMO_EMAIL${NC}"

# ============================================================================
# Step 2: Create Demo Project
# ============================================================================
echo -e "${YELLOW}Step 2: Creating demo project...${NC}"

PROJECT_RESULT=$(curl -s -X POST "$BASE_URL/v1/projects" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name": "Demo Project", "description": "A demo project showcasing Devabase features"}')

PROJECT_ID=$(echo "$PROJECT_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PROJECT_ID" ]; then
    # Project might already exist, try to get it
    PROJECTS=$(curl -s -X GET "$BASE_URL/v1/projects" \
        -H "Authorization: Bearer $TOKEN")
    PROJECT_ID=$(echo "$PROJECTS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Failed to create/get project${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Project ID: $PROJECT_ID${NC}"

# ============================================================================
# Step 3: Create Collections
# ============================================================================
echo -e "${YELLOW}Step 3: Creating collections...${NC}"

# Documentation collection
curl -s -X POST "$BASE_URL/v1/collections" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Project-ID: $PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{"name": "documentation", "description": "Technical documentation and guides", "dimensions": 1536}' > /dev/null

echo -e "${GREEN}✓ Created 'documentation' collection${NC}"

# FAQ collection
curl -s -X POST "$BASE_URL/v1/collections" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Project-ID: $PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{"name": "faq", "description": "Frequently asked questions", "dimensions": 1536}' > /dev/null

echo -e "${GREEN}✓ Created 'faq' collection${NC}"

# Knowledge base collection
curl -s -X POST "$BASE_URL/v1/collections" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Project-ID: $PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{"name": "knowledge-base", "description": "General knowledge articles", "dimensions": 1536}' > /dev/null

echo -e "${GREEN}✓ Created 'knowledge-base' collection${NC}"

# ============================================================================
# Step 4: Create Demo Tables
# ============================================================================
echo -e "${YELLOW}Step 4: Creating demo tables...${NC}"

# Users table
curl -s -X POST "$BASE_URL/v1/tables" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Project-ID: $PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "customers",
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "name", "type": "text", "nullable": false},
            {"name": "email", "type": "text", "nullable": false, "unique": true},
            {"name": "company", "type": "text"},
            {"name": "plan", "type": "text", "default": "'\''free'\''"},
            {"name": "status", "type": "text", "default": "'\''active'\''"},
            {"name": "created_at", "type": "timestamptz", "default": "now()"}
        ]
    }' > /dev/null

echo -e "${GREEN}✓ Created 'customers' table${NC}"

# Products table
curl -s -X POST "$BASE_URL/v1/tables" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Project-ID: $PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "products",
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "name", "type": "text", "nullable": false},
            {"name": "description", "type": "text"},
            {"name": "price", "type": "numeric", "nullable": false},
            {"name": "category", "type": "text"},
            {"name": "in_stock", "type": "boolean", "default": "true"},
            {"name": "created_at", "type": "timestamptz", "default": "now()"}
        ]
    }' > /dev/null

echo -e "${GREEN}✓ Created 'products' table${NC}"

# Orders table
curl -s -X POST "$BASE_URL/v1/tables" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Project-ID: $PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "orders",
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "customer_email", "type": "text", "nullable": false},
            {"name": "product_name", "type": "text", "nullable": false},
            {"name": "quantity", "type": "integer", "default": "1"},
            {"name": "total", "type": "numeric", "nullable": false},
            {"name": "status", "type": "text", "default": "'\''pending'\''"},
            {"name": "created_at", "type": "timestamptz", "default": "now()"}
        ]
    }' > /dev/null

echo -e "${GREEN}✓ Created 'orders' table${NC}"

# ============================================================================
# Step 5: Insert Demo Data into Tables
# ============================================================================
echo -e "${YELLOW}Step 5: Inserting demo data...${NC}"

# Insert customers
CUSTOMERS=(
    '{"name": "Alice Johnson", "email": "alice@example.com", "company": "TechCorp", "plan": "pro"}'
    '{"name": "Bob Smith", "email": "bob@example.com", "company": "StartupXYZ", "plan": "free"}'
    '{"name": "Carol Williams", "email": "carol@example.com", "company": "Enterprise Inc", "plan": "enterprise"}'
    '{"name": "David Brown", "email": "david@example.com", "company": "DevShop", "plan": "pro"}'
    '{"name": "Eva Martinez", "email": "eva@example.com", "company": "DataFlow", "plan": "enterprise"}'
)

for customer in "${CUSTOMERS[@]}"; do
    curl -s -X POST "$BASE_URL/v1/tables/customers/rows" \
        -H "Authorization: Bearer $TOKEN" \
        -H "X-Project-ID: $PROJECT_ID" \
        -H "Content-Type: application/json" \
        -d "$customer" > /dev/null
done

echo -e "${GREEN}✓ Inserted 5 customers${NC}"

# Insert products
PRODUCTS=(
    '{"name": "Devabase Cloud", "description": "Managed Devabase instance in the cloud", "price": 99.00, "category": "SaaS"}'
    '{"name": "Enterprise License", "description": "Self-hosted enterprise license", "price": 499.00, "category": "License"}'
    '{"name": "Premium Support", "description": "24/7 premium support package", "price": 199.00, "category": "Support"}'
    '{"name": "Training Workshop", "description": "2-day hands-on training", "price": 1500.00, "category": "Training"}'
    '{"name": "Custom Integration", "description": "Custom integration development", "price": 5000.00, "category": "Services"}'
)

for product in "${PRODUCTS[@]}"; do
    curl -s -X POST "$BASE_URL/v1/tables/products/rows" \
        -H "Authorization: Bearer $TOKEN" \
        -H "X-Project-ID: $PROJECT_ID" \
        -H "Content-Type: application/json" \
        -d "$product" > /dev/null
done

echo -e "${GREEN}✓ Inserted 5 products${NC}"

# Insert orders
ORDERS=(
    '{"customer_email": "alice@example.com", "product_name": "Devabase Cloud", "quantity": 1, "total": 99.00, "status": "completed"}'
    '{"customer_email": "carol@example.com", "product_name": "Enterprise License", "quantity": 2, "total": 998.00, "status": "completed"}'
    '{"customer_email": "eva@example.com", "product_name": "Premium Support", "quantity": 1, "total": 199.00, "status": "active"}'
    '{"customer_email": "bob@example.com", "product_name": "Training Workshop", "quantity": 3, "total": 4500.00, "status": "pending"}'
    '{"customer_email": "david@example.com", "product_name": "Devabase Cloud", "quantity": 1, "total": 99.00, "status": "completed"}'
)

for order in "${ORDERS[@]}"; do
    curl -s -X POST "$BASE_URL/v1/tables/orders/rows" \
        -H "Authorization: Bearer $TOKEN" \
        -H "X-Project-ID: $PROJECT_ID" \
        -H "Content-Type: application/json" \
        -d "$order" > /dev/null
done

echo -e "${GREEN}✓ Inserted 5 orders${NC}"

# ============================================================================
# Step 6: Create Sample Documents (as text chunks)
# ============================================================================
echo -e "${YELLOW}Step 6: Creating sample document content...${NC}"

# Note: Full document upload requires file upload which is complex in shell.
# For demo purposes, we'll show the structure. In production, use the SDK or dashboard.

echo -e "${BLUE}  → Document upload requires the dashboard or SDK${NC}"
echo -e "${BLUE}  → Navigate to Collections > Upload to add documents${NC}"

# ============================================================================
# Step 7: Display Summary
# ============================================================================
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}   Demo Data Initialization Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "Demo Credentials:"
echo -e "  Email:    ${YELLOW}$DEMO_EMAIL${NC}"
echo -e "  Password: ${YELLOW}$DEMO_PASSWORD${NC}"
echo ""
echo -e "Project ID: ${YELLOW}$PROJECT_ID${NC}"
echo ""
echo -e "Created Resources:"
echo -e "  ${GREEN}✓${NC} 3 Collections: documentation, faq, knowledge-base"
echo -e "  ${GREEN}✓${NC} 3 Tables: customers, products, orders"
echo -e "  ${GREEN}✓${NC} 15 Sample records across tables"
echo ""
echo -e "Next Steps:"
echo -e "  1. Open ${YELLOW}http://localhost:3000${NC} in your browser"
echo -e "  2. Login with the demo credentials"
echo -e "  3. Configure your AI providers in Settings > Providers"
echo -e "  4. Upload documents to collections"
echo -e "  5. Try the search and RAG chat features"
echo ""
echo -e "API Examples:"
echo -e "  ${BLUE}# List collections${NC}"
echo -e "  curl -H \"Authorization: Bearer \$TOKEN\" \\"
echo -e "       -H \"X-Project-ID: $PROJECT_ID\" \\"
echo -e "       $BASE_URL/v1/collections"
echo ""
echo -e "  ${BLUE}# Query customers table${NC}"
echo -e "  curl -H \"Authorization: Bearer \$TOKEN\" \\"
echo -e "       -H \"X-Project-ID: $PROJECT_ID\" \\"
echo -e "       \"$BASE_URL/v1/tables/customers/rows?plan=pro\""
echo ""
