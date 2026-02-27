-- ============================================================================
-- Evaluation Tables for RAG Quality Metrics
-- Version: 2.2.0
-- ============================================================================

-- Evaluation datasets group test cases for a collection
CREATE TABLE IF NOT EXISTS sys_evaluation_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES sys_collections(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_dataset_name_per_project UNIQUE (project_id, name)
);

-- Test cases define expected retrieval results for queries
CREATE TABLE IF NOT EXISTS sys_evaluation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES sys_evaluation_datasets(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    expected_chunk_ids UUID[] NOT NULL DEFAULT '{}',  -- Chunk IDs that should be retrieved
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evaluation runs track metrics over time
CREATE TABLE IF NOT EXISTS sys_evaluation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES sys_evaluation_datasets(id) ON DELETE CASCADE,
    search_mode VARCHAR(20) NOT NULL DEFAULT 'vector',  -- 'vector', 'keyword', 'hybrid'
    config JSONB DEFAULT '{}',  -- Search config (weights, top_k, etc.)
    metrics JSONB NOT NULL DEFAULT '{}',  -- { precision_at_k, recall_at_k, mrr, ndcg, ... }
    case_results JSONB DEFAULT '[]',  -- Per-case results for detailed analysis
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_evaluation_datasets_project ON sys_evaluation_datasets(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_datasets_collection ON sys_evaluation_datasets(collection_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_cases_dataset ON sys_evaluation_cases(dataset_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_dataset ON sys_evaluation_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_created ON sys_evaluation_runs(created_at DESC);
