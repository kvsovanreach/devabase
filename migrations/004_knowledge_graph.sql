-- ============================================================================
-- Knowledge Graph Tables
-- Version: 2.3.0
--
-- Stores entities and relationships extracted from documents for
-- graph-based retrieval and exploration.
-- ============================================================================

-- Ensure pg_trgm extension for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- sys_entities: Entities extracted from documents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES sys_collections(id) ON DELETE CASCADE,
    document_id UUID REFERENCES sys_documents(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES sys_chunks(id) ON DELETE SET NULL,

    name VARCHAR(500) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,  -- person, organization, location, concept, product, event
    description TEXT,
    aliases TEXT[] DEFAULT '{}',        -- Alternative names for the entity
    confidence FLOAT DEFAULT 1.0,       -- Extraction confidence (0-1)
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient entity queries
CREATE INDEX IF NOT EXISTS idx_entities_project ON sys_entities(project_id);
CREATE INDEX IF NOT EXISTS idx_entities_collection ON sys_entities(collection_id);
CREATE INDEX IF NOT EXISTS idx_entities_document ON sys_entities(document_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON sys_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name_lower ON sys_entities(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_entities_name_trgm ON sys_entities USING gin(name gin_trgm_ops);

-- Unique index for deduplication (case-insensitive name per project and type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_unique_name ON sys_entities(project_id, LOWER(name), entity_type);

-- Trigger for updated_at
CREATE TRIGGER trg_sys_entities_updated_at
    BEFORE UPDATE ON sys_entities
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- sys_relationships: Relationships between entities
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sys_projects(id) ON DELETE CASCADE,

    source_entity_id UUID NOT NULL REFERENCES sys_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES sys_entities(id) ON DELETE CASCADE,

    relationship_type VARCHAR(100) NOT NULL,  -- works_at, located_in, part_of, reports_to, etc.
    description TEXT,
    confidence FLOAT DEFAULT 1.0,             -- Extraction confidence (0-1)
    metadata JSONB DEFAULT '{}',

    -- Source attribution for provenance
    document_id UUID REFERENCES sys_documents(id) ON DELETE SET NULL,
    chunk_id UUID REFERENCES sys_chunks(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate relationships
    CONSTRAINT uq_relationship UNIQUE(source_entity_id, target_entity_id, relationship_type),
    -- Prevent self-relationships
    CONSTRAINT chk_no_self_relationship CHECK (source_entity_id != target_entity_id)
);

-- Indexes for efficient relationship queries
CREATE INDEX IF NOT EXISTS idx_relationships_project ON sys_relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON sys_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON sys_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON sys_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_document ON sys_relationships(document_id);

-- Trigger for updated_at
CREATE TRIGGER trg_sys_relationships_updated_at
    BEFORE UPDATE ON sys_relationships
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- Helper function: Get entity with all relationships
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_entity_graph(
    p_entity_id UUID,
    p_depth INT DEFAULT 1
)
RETURNS TABLE (
    entity_id UUID,
    entity_name VARCHAR(500),
    entity_type VARCHAR(100),
    relationship_id UUID,
    relationship_type VARCHAR(100),
    related_entity_id UUID,
    related_entity_name VARCHAR(500),
    related_entity_type VARCHAR(100),
    direction VARCHAR(10)
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE entity_graph AS (
        -- Base case: the starting entity
        SELECT
            e.id AS entity_id,
            e.name AS entity_name,
            e.entity_type,
            NULL::UUID AS relationship_id,
            NULL::VARCHAR(100) AS relationship_type,
            NULL::UUID AS related_entity_id,
            NULL::VARCHAR(500) AS related_entity_name,
            NULL::VARCHAR(100) AS related_entity_type,
            NULL::VARCHAR(10) AS direction,
            0 AS depth
        FROM sys_entities e
        WHERE e.id = p_entity_id

        UNION ALL

        -- Recursive: outgoing relationships
        SELECT
            eg.entity_id,
            eg.entity_name,
            eg.entity_type,
            r.id AS relationship_id,
            r.relationship_type,
            e2.id AS related_entity_id,
            e2.name AS related_entity_name,
            e2.entity_type AS related_entity_type,
            'outgoing'::VARCHAR(10) AS direction,
            eg.depth + 1
        FROM entity_graph eg
        JOIN sys_relationships r ON r.source_entity_id = eg.entity_id
        JOIN sys_entities e2 ON e2.id = r.target_entity_id
        WHERE eg.depth < p_depth

        UNION ALL

        -- Recursive: incoming relationships
        SELECT
            eg.entity_id,
            eg.entity_name,
            eg.entity_type,
            r.id AS relationship_id,
            r.relationship_type,
            e2.id AS related_entity_id,
            e2.name AS related_entity_name,
            e2.entity_type AS related_entity_type,
            'incoming'::VARCHAR(10) AS direction,
            eg.depth + 1
        FROM entity_graph eg
        JOIN sys_relationships r ON r.target_entity_id = eg.entity_id
        JOIN sys_entities e2 ON e2.id = r.source_entity_id
        WHERE eg.depth < p_depth
    )
    SELECT DISTINCT
        entity_graph.entity_id,
        entity_graph.entity_name,
        entity_graph.entity_type,
        entity_graph.relationship_id,
        entity_graph.relationship_type,
        entity_graph.related_entity_id,
        entity_graph.related_entity_name,
        entity_graph.related_entity_type,
        entity_graph.direction
    FROM entity_graph
    WHERE entity_graph.relationship_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
