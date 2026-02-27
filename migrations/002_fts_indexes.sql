-- ============================================================================
-- Full-Text Search Indexes for Hybrid Search
-- Version: 2.2.0
-- ============================================================================

-- Add GIN index for full-text search on chunk content
-- This enables efficient keyword/BM25 search alongside vector search

CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
    ON sys_chunks USING GIN (to_tsvector('english', content));

-- Note: The 'english' configuration handles:
-- - Stemming (running -> run)
-- - Stop words removal (the, a, is)
-- - Case normalization

-- For production with multilingual support, consider:
-- CREATE INDEX IF NOT EXISTS idx_chunks_content_fts_simple
--     ON sys_chunks USING GIN (to_tsvector('simple', content));
