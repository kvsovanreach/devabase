-- Fix the recursive CTE in fn_get_entity_graph
-- PostgreSQL doesn't allow multiple UNION ALL branches with recursive references
-- This version uses a simpler approach for depth=1 and CROSS JOIN LATERAL for depth>1

DROP FUNCTION IF EXISTS fn_get_entity_graph(UUID, INT);

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
    -- For depth 1, use a simple non-recursive query (most common case)
    IF p_depth = 1 THEN
        RETURN QUERY
        -- Outgoing relationships
        SELECT
            p_entity_id AS entity_id,
            e.name AS entity_name,
            e.entity_type,
            r.id AS relationship_id,
            r.relationship_type,
            e2.id AS related_entity_id,
            e2.name AS related_entity_name,
            e2.entity_type AS related_entity_type,
            'outgoing'::VARCHAR(10) AS direction
        FROM sys_entities e
        JOIN sys_relationships r ON r.source_entity_id = e.id
        JOIN sys_entities e2 ON e2.id = r.target_entity_id
        WHERE e.id = p_entity_id

        UNION

        -- Incoming relationships
        SELECT
            p_entity_id AS entity_id,
            e.name AS entity_name,
            e.entity_type,
            r.id AS relationship_id,
            r.relationship_type,
            e2.id AS related_entity_id,
            e2.name AS related_entity_name,
            e2.entity_type AS related_entity_type,
            'incoming'::VARCHAR(10) AS direction
        FROM sys_entities e
        JOIN sys_relationships r ON r.target_entity_id = e.id
        JOIN sys_entities e2 ON e2.id = r.source_entity_id
        WHERE e.id = p_entity_id;
    ELSE
        -- For depth > 1, use recursive approach with single recursive term
        RETURN QUERY
        WITH RECURSIVE entity_graph AS (
            -- Base case: direct relationships from starting entity
            SELECT
                p_entity_id AS ent_id,
                e.name AS ent_name,
                e.entity_type AS ent_type,
                r.id AS rel_id,
                r.relationship_type AS rel_type,
                e2.id AS rel_ent_id,
                e2.name AS rel_ent_name,
                e2.entity_type AS rel_ent_type,
                'outgoing'::VARCHAR(10) AS dir,
                1 AS depth,
                ARRAY[p_entity_id, e2.id] AS visited
            FROM sys_entities e
            JOIN sys_relationships r ON r.source_entity_id = e.id
            JOIN sys_entities e2 ON e2.id = r.target_entity_id
            WHERE e.id = p_entity_id

            UNION

            SELECT
                p_entity_id AS ent_id,
                e.name AS ent_name,
                e.entity_type AS ent_type,
                r.id AS rel_id,
                r.relationship_type AS rel_type,
                e2.id AS rel_ent_id,
                e2.name AS rel_ent_name,
                e2.entity_type AS rel_ent_type,
                'incoming'::VARCHAR(10) AS dir,
                1 AS depth,
                ARRAY[p_entity_id, e2.id] AS visited
            FROM sys_entities e
            JOIN sys_relationships r ON r.target_entity_id = e.id
            JOIN sys_entities e2 ON e2.id = r.source_entity_id
            WHERE e.id = p_entity_id

            UNION ALL

            -- Recursive: expand from related entities (combined outgoing + incoming)
            SELECT
                eg.rel_ent_id AS ent_id,
                eg.rel_ent_name AS ent_name,
                eg.rel_ent_type AS ent_type,
                all_rels.rel_id,
                all_rels.rel_type,
                all_rels.related_id AS rel_ent_id,
                all_rels.related_name AS rel_ent_name,
                all_rels.related_type AS rel_ent_type,
                all_rels.dir,
                eg.depth + 1 AS depth,
                eg.visited || all_rels.related_id AS visited
            FROM entity_graph eg
            CROSS JOIN LATERAL (
                -- Outgoing from current related entity
                SELECT
                    r.id AS rel_id,
                    r.relationship_type AS rel_type,
                    e2.id AS related_id,
                    e2.name AS related_name,
                    e2.entity_type AS related_type,
                    'outgoing'::VARCHAR(10) AS dir
                FROM sys_relationships r
                JOIN sys_entities e2 ON e2.id = r.target_entity_id
                WHERE r.source_entity_id = eg.rel_ent_id
                  AND NOT (e2.id = ANY(eg.visited))

                UNION ALL

                -- Incoming to current related entity
                SELECT
                    r.id AS rel_id,
                    r.relationship_type AS rel_type,
                    e2.id AS related_id,
                    e2.name AS related_name,
                    e2.entity_type AS related_type,
                    'incoming'::VARCHAR(10) AS dir
                FROM sys_relationships r
                JOIN sys_entities e2 ON e2.id = r.source_entity_id
                WHERE r.target_entity_id = eg.rel_ent_id
                  AND NOT (e2.id = ANY(eg.visited))
            ) all_rels
            WHERE eg.depth < p_depth
        )
        SELECT DISTINCT
            eg.ent_id,
            eg.ent_name,
            eg.ent_type,
            eg.rel_id,
            eg.rel_type,
            eg.rel_ent_id,
            eg.rel_ent_name,
            eg.rel_ent_type,
            eg.dir
        FROM entity_graph eg;
    END IF;
END;
$$ LANGUAGE plpgsql;
