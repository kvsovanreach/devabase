-- ============================================================================
-- Devabase Sample Data
-- Version: 1.0.0
--
-- This migration creates sample data for demonstration purposes:
--   - 1 Demo user (demo@devabase.io / demo123)
--   - 3 Projects with collections and tables
--
-- Run this AFTER 001_init.sql to populate sample data.
-- To reset: DELETE FROM sys_users WHERE email = 'demo@devabase.io';
-- ============================================================================

-- ============================================================================
-- DEMO USER
-- ============================================================================
-- Password: demo123 (Argon2 hash)
-- You can login with: demo@devabase.io / demo123

INSERT INTO sys_users (id, email, email_verified, password_hash, name, status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'demo@devabase.io',
    true,
    '$argon2id$v=19$m=65536,t=3,p=4$tgXF3KhBgbcekufFzEZf7Q$Xry17KHZibqQcAsyO7ERleCnsjP3xXPj+gnPmsMtSbc', -- demo123
    'Demo User',
    'active'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PROJECT 1: E-Commerce Platform
-- A sample e-commerce backend with product search and order management
-- ============================================================================

INSERT INTO sys_projects (id, name, slug, description, owner_id, settings)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'E-Commerce Platform',
    'ecommerce',
    'Sample e-commerce backend with product catalog, semantic search, and order management.',
    '00000000-0000-0000-0000-000000000001',
    '{
        "llm_providers": [],
        "embedding_providers": []
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- E-Commerce: Products Collection (for semantic product search)
INSERT INTO sys_collections (id, project_id, name, dimensions, metric, index_type, metadata, rag_enabled, rag_config)
VALUES (
    '11000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'products',
    1536,
    'cosine',
    'hnsw',
    '{"description": "Product catalog for semantic search", "category": "ecommerce"}'::jsonb,
    true,
    '{
        "llm_provider_id": "openai-1",
        "model": "gpt-4o-mini",
        "system_prompt": "You are a helpful shopping assistant. Help customers find products based on their needs. Be concise and recommend specific products from the catalog.",
        "temperature": 0.7,
        "max_tokens": 500,
        "top_k": 5
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- E-Commerce: Reviews Collection (for sentiment analysis)
INSERT INTO sys_collections (id, project_id, name, dimensions, metric, index_type, metadata)
VALUES (
    '11000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'reviews',
    1536,
    'cosine',
    'hnsw',
    '{"description": "Product reviews for sentiment search", "category": "ecommerce"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- E-Commerce: Orders Table
INSERT INTO sys_user_tables (id, project_id, table_name, schema_definition, api_enabled)
VALUES (
    '12000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'orders',
    '{
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "customer_email", "type": "varchar(255)", "nullable": false},
            {"name": "customer_name", "type": "varchar(255)", "nullable": false},
            {"name": "status", "type": "varchar(50)", "default": "pending"},
            {"name": "total_amount", "type": "decimal(10,2)", "nullable": false},
            {"name": "currency", "type": "varchar(3)", "default": "USD"},
            {"name": "items", "type": "jsonb", "default": "[]"},
            {"name": "shipping_address", "type": "jsonb"},
            {"name": "notes", "type": "text"},
            {"name": "created_at", "type": "timestamptz", "default": "now()"},
            {"name": "updated_at", "type": "timestamptz", "default": "now()"}
        ]
    }'::jsonb,
    true
) ON CONFLICT (id) DO NOTHING;

-- Create the actual orders table
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS ut_10000000_0000_0000_0000_000000000001_orders (
        project_id UUID NOT NULL,
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_email VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        total_amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        items JSONB DEFAULT '[]',
        shipping_address JSONB,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- E-Commerce: Customers Table
INSERT INTO sys_user_tables (id, project_id, table_name, schema_definition, api_enabled)
VALUES (
    '12000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'customers',
    '{
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "email", "type": "varchar(255)", "nullable": false, "unique": true},
            {"name": "name", "type": "varchar(255)", "nullable": false},
            {"name": "phone", "type": "varchar(50)"},
            {"name": "tier", "type": "varchar(20)", "default": "standard"},
            {"name": "total_orders", "type": "integer", "default": "0"},
            {"name": "total_spent", "type": "decimal(12,2)", "default": "0"},
            {"name": "metadata", "type": "jsonb", "default": "{}"},
            {"name": "created_at", "type": "timestamptz", "default": "now()"}
        ]
    }'::jsonb,
    true
) ON CONFLICT (id) DO NOTHING;

-- Create the actual customers table
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS ut_10000000_0000_0000_0000_000000000001_customers (
        project_id UUID NOT NULL,
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        tier VARCHAR(20) DEFAULT 'standard',
        total_orders INTEGER DEFAULT 0,
        total_spent DECIMAL(12,2) DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Insert sample customers
INSERT INTO ut_10000000_0000_0000_0000_000000000001_customers (project_id, email, name, phone, tier, total_orders, total_spent)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'john.doe@example.com', 'John Doe', '+1-555-0101', 'premium', 12, 2499.99),
    ('10000000-0000-0000-0000-000000000001', 'jane.smith@example.com', 'Jane Smith', '+1-555-0102', 'standard', 3, 349.50),
    ('10000000-0000-0000-0000-000000000001', 'bob.wilson@example.com', 'Bob Wilson', '+1-555-0103', 'premium', 28, 8750.00)
ON CONFLICT (email) DO NOTHING;

-- Insert sample orders
INSERT INTO ut_10000000_0000_0000_0000_000000000001_orders (project_id, customer_email, customer_name, status, total_amount, items)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'john.doe@example.com', 'John Doe', 'completed', 299.99, '[{"product": "Wireless Headphones", "qty": 1, "price": 299.99}]'::jsonb),
    ('10000000-0000-0000-0000-000000000001', 'jane.smith@example.com', 'Jane Smith', 'processing', 149.50, '[{"product": "Smart Watch", "qty": 1, "price": 149.50}]'::jsonb),
    ('10000000-0000-0000-0000-000000000001', 'bob.wilson@example.com', 'Bob Wilson', 'pending', 599.00, '[{"product": "Laptop Stand", "qty": 2, "price": 299.50}]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PROJECT 2: Knowledge Base
-- A documentation and support ticket system with RAG chat
-- ============================================================================

INSERT INTO sys_projects (id, name, slug, description, owner_id, settings)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    'Knowledge Base',
    'knowledge-base',
    'Documentation and support system with AI-powered search and chat.',
    '00000000-0000-0000-0000-000000000001',
    '{
        "llm_providers": [],
        "embedding_providers": []
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Knowledge Base: Documentation Collection
INSERT INTO sys_collections (id, project_id, name, dimensions, metric, index_type, metadata, rag_enabled, rag_config)
VALUES (
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'documentation',
    1536,
    'cosine',
    'hnsw',
    '{"description": "Product documentation and guides", "category": "docs"}'::jsonb,
    true,
    '{
        "llm_provider_id": "openai-1",
        "model": "gpt-4o-mini",
        "system_prompt": "You are a helpful documentation assistant. Answer questions based on the provided documentation. If you cannot find the answer in the documentation, say so clearly. Always cite the relevant section.",
        "temperature": 0.3,
        "max_tokens": 1000,
        "top_k": 8
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Knowledge Base: FAQ Collection
INSERT INTO sys_collections (id, project_id, name, dimensions, metric, index_type, metadata, rag_enabled, rag_config)
VALUES (
    '21000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'faq',
    1536,
    'cosine',
    'hnsw',
    '{"description": "Frequently asked questions", "category": "support"}'::jsonb,
    true,
    '{
        "llm_provider_id": "openai-1",
        "model": "gpt-4o-mini",
        "system_prompt": "You are a support assistant answering frequently asked questions. Provide clear, concise answers.",
        "temperature": 0.5,
        "max_tokens": 500,
        "top_k": 5
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Knowledge Base: Support Tickets Table
INSERT INTO sys_user_tables (id, project_id, table_name, schema_definition, api_enabled)
VALUES (
    '22000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'tickets',
    '{
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "ticket_number", "type": "serial"},
            {"name": "subject", "type": "varchar(500)", "nullable": false},
            {"name": "description", "type": "text", "nullable": false},
            {"name": "status", "type": "varchar(20)", "default": "open"},
            {"name": "priority", "type": "varchar(20)", "default": "medium"},
            {"name": "category", "type": "varchar(100)"},
            {"name": "submitter_email", "type": "varchar(255)", "nullable": false},
            {"name": "submitter_name", "type": "varchar(255)"},
            {"name": "assignee", "type": "varchar(255)"},
            {"name": "tags", "type": "text[]", "default": "{}"},
            {"name": "metadata", "type": "jsonb", "default": "{}"},
            {"name": "created_at", "type": "timestamptz", "default": "now()"},
            {"name": "updated_at", "type": "timestamptz", "default": "now()"},
            {"name": "resolved_at", "type": "timestamptz"}
        ]
    }'::jsonb,
    true
) ON CONFLICT (id) DO NOTHING;

-- Create the actual tickets table
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS ut_20000000_0000_0000_0000_000000000001_tickets (
        project_id UUID NOT NULL,
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_number SERIAL,
        subject VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        priority VARCHAR(20) DEFAULT 'medium',
        category VARCHAR(100),
        submitter_email VARCHAR(255) NOT NULL,
        submitter_name VARCHAR(255),
        assignee VARCHAR(255),
        tags TEXT[] DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
    );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Knowledge Base: Articles Table
INSERT INTO sys_user_tables (id, project_id, table_name, schema_definition, api_enabled)
VALUES (
    '22000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'articles',
    '{
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "title", "type": "varchar(500)", "nullable": false},
            {"name": "slug", "type": "varchar(255)", "nullable": false},
            {"name": "content", "type": "text", "nullable": false},
            {"name": "excerpt", "type": "text"},
            {"name": "category", "type": "varchar(100)"},
            {"name": "author", "type": "varchar(255)"},
            {"name": "status", "type": "varchar(20)", "default": "draft"},
            {"name": "views", "type": "integer", "default": "0"},
            {"name": "helpful_count", "type": "integer", "default": "0"},
            {"name": "tags", "type": "text[]", "default": "{}"},
            {"name": "created_at", "type": "timestamptz", "default": "now()"},
            {"name": "updated_at", "type": "timestamptz", "default": "now()"},
            {"name": "published_at", "type": "timestamptz"}
        ]
    }'::jsonb,
    true
) ON CONFLICT (id) DO NOTHING;

-- Create the actual articles table
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS ut_20000000_0000_0000_0000_000000000001_articles (
        project_id UUID NOT NULL,
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        excerpt TEXT,
        category VARCHAR(100),
        author VARCHAR(255),
        status VARCHAR(20) DEFAULT 'draft',
        views INTEGER DEFAULT 0,
        helpful_count INTEGER DEFAULT 0,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        published_at TIMESTAMPTZ
    );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Insert sample tickets
INSERT INTO ut_20000000_0000_0000_0000_000000000001_tickets (project_id, subject, description, status, priority, category, submitter_email, submitter_name)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'Cannot login to dashboard', 'I am getting an error when trying to login. Error message: Invalid credentials.', 'open', 'high', 'Authentication', 'user1@example.com', 'Alice Johnson'),
    ('20000000-0000-0000-0000-000000000001', 'API rate limit questions', 'What are the rate limits for the API? I need to plan my integration.', 'in_progress', 'medium', 'API', 'dev@company.com', 'Developer Team'),
    ('20000000-0000-0000-0000-000000000001', 'Feature request: Export to PDF', 'Would be great to have PDF export functionality for reports.', 'open', 'low', 'Feature Request', 'pm@startup.io', 'Product Manager')
ON CONFLICT DO NOTHING;

-- Insert sample articles
INSERT INTO ut_20000000_0000_0000_0000_000000000001_articles (project_id, title, slug, content, excerpt, category, author, status, published_at)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'Getting Started with Devabase', 'getting-started', 'Welcome to Devabase! This guide will help you set up your first project...', 'A quick introduction to Devabase', 'Guides', 'Documentation Team', 'published', NOW()),
    ('20000000-0000-0000-0000-000000000001', 'API Authentication', 'api-authentication', 'Devabase uses JWT tokens for authentication. To get started, create an API key...', 'Learn how to authenticate with the API', 'API Reference', 'Documentation Team', 'published', NOW()),
    ('20000000-0000-0000-0000-000000000001', 'Vector Search Best Practices', 'vector-search-best-practices', 'When building semantic search, consider these best practices for optimal results...', 'Tips for effective vector search', 'Best Practices', 'Engineering Team', 'published', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PROJECT 3: Analytics Dashboard
-- An analytics and event tracking system
-- ============================================================================

INSERT INTO sys_projects (id, name, slug, description, owner_id, settings)
VALUES (
    '30000000-0000-0000-0000-000000000001',
    'Analytics Dashboard',
    'analytics',
    'Event tracking and analytics system with log search capabilities.',
    '00000000-0000-0000-0000-000000000001',
    '{
        "llm_providers": [],
        "embedding_providers": []
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Analytics: Error Logs Collection (for semantic log search)
INSERT INTO sys_collections (id, project_id, name, dimensions, metric, index_type, metadata, rag_enabled, rag_config)
VALUES (
    '31000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'error_logs',
    1536,
    'cosine',
    'hnsw',
    '{"description": "Application error logs for semantic search", "category": "observability"}'::jsonb,
    true,
    '{
        "llm_provider_id": "openai-1",
        "model": "gpt-4o-mini",
        "system_prompt": "You are a debugging assistant. Analyze error logs and help identify root causes. Suggest potential fixes based on similar past errors.",
        "temperature": 0.2,
        "max_tokens": 800,
        "top_k": 10
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Analytics: User Feedback Collection
INSERT INTO sys_collections (id, project_id, name, dimensions, metric, index_type, metadata)
VALUES (
    '31000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'user_feedback',
    1536,
    'cosine',
    'hnsw',
    '{"description": "User feedback and feature requests", "category": "product"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Analytics: Events Table
INSERT INTO sys_user_tables (id, project_id, table_name, schema_definition, api_enabled)
VALUES (
    '32000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'events',
    '{
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "event_name", "type": "varchar(255)", "nullable": false},
            {"name": "event_type", "type": "varchar(50)", "nullable": false},
            {"name": "user_id", "type": "varchar(255)"},
            {"name": "session_id", "type": "varchar(255)"},
            {"name": "page_url", "type": "text"},
            {"name": "referrer", "type": "text"},
            {"name": "user_agent", "type": "text"},
            {"name": "ip_address", "type": "varchar(45)"},
            {"name": "country", "type": "varchar(2)"},
            {"name": "properties", "type": "jsonb", "default": "{}"},
            {"name": "timestamp", "type": "timestamptz", "default": "now()"}
        ]
    }'::jsonb,
    true
) ON CONFLICT (id) DO NOTHING;

-- Create the actual events table
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS ut_30000000_0000_0000_0000_000000000001_events (
        project_id UUID NOT NULL,
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_name VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        user_id VARCHAR(255),
        session_id VARCHAR(255),
        page_url TEXT,
        referrer TEXT,
        user_agent TEXT,
        ip_address VARCHAR(45),
        country VARCHAR(2),
        properties JSONB DEFAULT '{}',
        timestamp TIMESTAMPTZ DEFAULT NOW()
    );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Analytics: Metrics Table
INSERT INTO sys_user_tables (id, project_id, table_name, schema_definition, api_enabled)
VALUES (
    '32000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'metrics',
    '{
        "columns": [
            {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
            {"name": "metric_name", "type": "varchar(255)", "nullable": false},
            {"name": "value", "type": "decimal(20,4)", "nullable": false},
            {"name": "unit", "type": "varchar(50)"},
            {"name": "dimensions", "type": "jsonb", "default": "{}"},
            {"name": "timestamp", "type": "timestamptz", "default": "now()"}
        ]
    }'::jsonb,
    true
) ON CONFLICT (id) DO NOTHING;

-- Create the actual metrics table
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS ut_30000000_0000_0000_0000_000000000001_metrics (
        project_id UUID NOT NULL,
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_name VARCHAR(255) NOT NULL,
        value DECIMAL(20,4) NOT NULL,
        unit VARCHAR(50),
        dimensions JSONB DEFAULT '{}',
        timestamp TIMESTAMPTZ DEFAULT NOW()
    );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Insert sample events
INSERT INTO ut_30000000_0000_0000_0000_000000000001_events (project_id, event_name, event_type, user_id, session_id, page_url, country, properties)
VALUES
    ('30000000-0000-0000-0000-000000000001', 'page_view', 'pageview', 'user_001', 'sess_abc123', '/dashboard', 'US', '{"duration_ms": 3500}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'button_click', 'interaction', 'user_001', 'sess_abc123', '/dashboard', 'US', '{"button_id": "create_project", "section": "header"}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'signup_completed', 'conversion', 'user_002', 'sess_def456', '/signup', 'UK', '{"plan": "pro", "source": "google"}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'api_call', 'backend', 'user_003', 'sess_ghi789', NULL, 'DE', '{"endpoint": "/v1/collections", "method": "POST", "status": 201}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'error', 'error', 'user_001', 'sess_abc123', '/settings', 'US', '{"error_code": "E001", "message": "Invalid input"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Insert sample metrics
INSERT INTO ut_30000000_0000_0000_0000_000000000001_metrics (project_id, metric_name, value, unit, dimensions)
VALUES
    ('30000000-0000-0000-0000-000000000001', 'api_requests', 15234, 'count', '{"endpoint": "/v1/collections", "method": "GET"}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'api_latency_p99', 245.5, 'ms', '{"endpoint": "/v1/search"}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'active_users', 1847, 'count', '{"period": "daily"}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'storage_used', 2.45, 'GB', '{"project": "ecommerce"}'::jsonb),
    ('30000000-0000-0000-0000-000000000001', 'vector_count', 125000, 'count', '{"collection": "products"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SAMPLE API KEYS
-- ============================================================================
-- Note: These are example keys for demonstration. In production, users
-- create their own keys through the API or dashboard.

-- E-Commerce project API key (prefix: deva_ecom_)
INSERT INTO sys_api_keys (id, project_id, name, key_hash, key_prefix, key_type, scopes, description)
VALUES (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'E-Commerce Development Key',
    '$2b$12$placeholder.hash.for.demo.key.ecommerce',
    'deva_ecom_',
    'project',
    ARRAY['read', 'write'],
    'Development API key for E-Commerce project'
) ON CONFLICT (id) DO NOTHING;

-- Knowledge Base project API key (prefix: deva_kb_)
INSERT INTO sys_api_keys (id, project_id, name, key_hash, key_prefix, key_type, scopes, description)
VALUES (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Knowledge Base Development Key',
    '$2b$12$placeholder.hash.for.demo.key.knowledgebase',
    'deva_kb_',
    'project',
    ARRAY['read', 'write'],
    'Development API key for Knowledge Base project'
) ON CONFLICT (id) DO NOTHING;

-- Analytics project API key (prefix: deva_analytics_)
INSERT INTO sys_api_keys (id, project_id, name, key_hash, key_prefix, key_type, scopes, description)
VALUES (
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'Analytics Development Key',
    '$2b$12$placeholder.hash.for.demo.key.analytics',
    'deva_analytics_',
    'project',
    ARRAY['read', 'write'],
    'Development API key for Analytics project'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SAMPLE PROMPTS
-- ============================================================================

-- E-Commerce: Product Search Prompt
INSERT INTO sys_prompts (id, project_id, name, content, description, is_active)
VALUES (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Product Recommendation',
    'Based on the following product catalog context:

{{context}}

The customer is looking for: {{query}}

Please recommend the most relevant products. For each recommendation:
1. State the product name and key features
2. Explain why it matches the customer''s needs
3. Mention the price if available

Keep your response concise and helpful.',
    'Prompt template for product recommendations based on search context',
    true
) ON CONFLICT (id) DO NOTHING;

-- Knowledge Base: Support Response Prompt
INSERT INTO sys_prompts (id, project_id, name, content, description, is_active)
VALUES (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Support Response',
    'You are a helpful support agent. Use the following documentation to answer the user''s question:

Documentation Context:
{{context}}

User Question: {{query}}

Guidelines:
- Be friendly and professional
- Provide step-by-step instructions when applicable
- If the answer is not in the documentation, say so clearly
- Suggest related articles if relevant',
    'Prompt template for support ticket responses',
    true
) ON CONFLICT (id) DO NOTHING;

-- Analytics: Log Analysis Prompt
INSERT INTO sys_prompts (id, project_id, name, content, description, is_active)
VALUES (
    '50000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'Error Analysis',
    'Analyze the following error logs and provide insights:

Error Logs:
{{context}}

Current Error: {{query}}

Please provide:
1. Root cause analysis
2. Similar past errors and their resolutions
3. Recommended fix
4. Prevention suggestions',
    'Prompt template for error log analysis',
    true
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- Created:
--   - 1 Demo User: demo@devabase.io (password: demo123)
--
--   - Project 1: E-Commerce Platform
--     - Collections: products (RAG), reviews
--     - Tables: orders, customers (with sample data)
--
--   - Project 2: Knowledge Base
--     - Collections: documentation (RAG), faq (RAG)
--     - Tables: tickets, articles (with sample data)
--
--   - Project 3: Analytics Dashboard
--     - Collections: error_logs (RAG), user_feedback
--     - Tables: events, metrics (with sample data)
--
--   - 3 API Keys (one per project)
--   - 3 Prompt Templates (one per project)
--
-- To login: Use demo@devabase.io with password demo123
-- ============================================================================
