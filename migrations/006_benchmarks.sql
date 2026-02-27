-- Benchmark Results Storage
-- Stores results from academic benchmark evaluations

CREATE TABLE IF NOT EXISTS sys_benchmark_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,

    suite_name VARCHAR(255) NOT NULL,
    dataset_name VARCHAR(255) NOT NULL,

    -- Full results as JSON (includes all metrics, comparisons, configs)
    results JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmark_results_project ON sys_benchmark_results(project_id);
CREATE INDEX idx_benchmark_results_dataset ON sys_benchmark_results(dataset_name);
CREATE INDEX idx_benchmark_results_created ON sys_benchmark_results(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE sys_benchmark_results IS 'Stores results from academic benchmark evaluations (BEIR, MS MARCO, etc.)';
COMMENT ON COLUMN sys_benchmark_results.results IS 'Complete benchmark suite results including metrics, configs, and significance tests';
