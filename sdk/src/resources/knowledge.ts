import { HttpClient } from '../utils/http';
import {
  Entity,
  Relationship,
  EntityGraph,
  PaginatedResponse,
  QueryOptions,
  RequestOptions,
} from '../types';

export interface EntitySearchOptions extends QueryOptions {
  entity_type?: string;
  collection_id?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface RelationshipSearchOptions extends QueryOptions {
  entity_id?: string;
  relationship_type?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ExtractedKnowledge {
  entities: Entity[];
  relationships: Relationship[];
}

export class KnowledgeResource {
  constructor(private http: HttpClient) {}

  // =========================================================================
  // Entities
  // =========================================================================

  /**
   * List all entities with pagination
   * @example
   * const result = await client.knowledge.entities.list({ limit: 10 });
   * console.log(result.data); // Array of entities
   * console.log(result.pagination.total); // Total count
   */
  readonly entities = {
    list: async (
      options?: EntitySearchOptions,
      requestOptions?: RequestOptions
    ): Promise<PaginatedResponse<Entity>> => {
      return this.http.get<PaginatedResponse<Entity>>('/v1/knowledge/entities', options, requestOptions);
    },

    /**
     * Get an entity by ID with its relationships
     * @example
     * const entity = await client.knowledge.entities.get('entity-id');
     */
    get: async (
      entityId: string,
      requestOptions?: RequestOptions
    ): Promise<EntityGraph> => {
      return this.http.get<EntityGraph>(
        `/v1/knowledge/entities/${entityId}`,
        undefined,
        requestOptions
      );
    },

    /**
     * Search entities by name
     * @example
     * const results = await client.knowledge.entities.search('John');
     */
    search: async (
      query: string,
      options?: { entity_type?: string; limit?: number },
      requestOptions?: RequestOptions
    ): Promise<Entity[]> => {
      return this.http.post<Entity[]>(
        '/v1/knowledge/entities/search',
        { query, ...options },
        requestOptions
      );
    },

    /**
     * Merge duplicate entities
     * @example
     * const merged = await client.knowledge.entities.merge(
     *   'primary-entity-id',
     *   ['duplicate-id-1', 'duplicate-id-2']
     * );
     */
    merge: async (
      primaryId: string,
      duplicateIds: string[],
      requestOptions?: RequestOptions
    ): Promise<Entity> => {
      return this.http.post<Entity>(
        '/v1/knowledge/entities/merge',
        { primary_id: primaryId, duplicate_ids: duplicateIds },
        requestOptions
      );
    },

    /**
     * Create a new entity
     * @example
     * const entity = await client.knowledge.entities.create({
     *   name: 'John Doe',
     *   entity_type: 'person',
     *   description: 'Software engineer'
     * });
     */
    create: async (
      data: {
        name: string;
        entity_type: string;
        description?: string;
        aliases?: string[];
      },
      requestOptions?: RequestOptions
    ): Promise<Entity> => {
      return this.http.post<Entity>('/v1/knowledge/entities', data, requestOptions);
    },

    /**
     * Delete an entity
     * @example
     * await client.knowledge.entities.delete('entity-id');
     */
    delete: async (entityId: string, requestOptions?: RequestOptions): Promise<void> => {
      await this.http.delete<void>(`/v1/knowledge/entities/${entityId}`, requestOptions);
    },

    /**
     * Update an entity
     * @example
     * const entity = await client.knowledge.entities.update('entity-id', {
     *   description: 'Updated description'
     * });
     */
    update: async (
      entityId: string,
      data: { name?: string; description?: string; aliases?: string[] },
      requestOptions?: RequestOptions
    ): Promise<Entity> => {
      return this.http.patch<Entity>(
        `/v1/knowledge/entities/${entityId}`,
        data,
        requestOptions
      );
    },
  };

  // =========================================================================
  // Relationships
  // =========================================================================

  readonly relationships = {
    /**
     * List relationships with pagination
     * @example
     * const result = await client.knowledge.relationships.list({ limit: 10 });
     * console.log(result.data); // Array of relationships
     * console.log(result.pagination.total); // Total count
     */
    list: async (
      options?: RelationshipSearchOptions,
      requestOptions?: RequestOptions
    ): Promise<PaginatedResponse<Relationship>> => {
      return this.http.get<PaginatedResponse<Relationship>>('/v1/knowledge/relationships', options, requestOptions);
    },

    /**
     * Create a relationship between entities
     * @example
     * const relationship = await client.knowledge.relationships.create({
     *   source_entity_id: 'entity-1',
     *   target_entity_id: 'entity-2',
     *   relationship_type: 'works_at'
     * });
     */
    create: async (
      data: {
        source_entity_id: string;
        target_entity_id: string;
        relationship_type: string;
        description?: string;
      },
      requestOptions?: RequestOptions
    ): Promise<Relationship> => {
      return this.http.post<Relationship>('/v1/knowledge/relationships', data, requestOptions);
    },

    /**
     * Delete a relationship
     * @example
     * await client.knowledge.relationships.delete('relationship-id');
     */
    delete: async (relationshipId: string, requestOptions?: RequestOptions): Promise<void> => {
      await this.http.delete<void>(
        `/v1/knowledge/relationships/${relationshipId}`,
        requestOptions
      );
    },
  };

  // =========================================================================
  // Graph Operations
  // =========================================================================

  /**
   * Get the subgraph around an entity
   * @example
   * const graph = await client.knowledge.getGraph('entity-id', { depth: 2 });
   */
  async getGraph(
    entityId: string,
    options?: { depth?: number },
    requestOptions?: RequestOptions
  ): Promise<{
    entities: Entity[];
    relationships: Relationship[];
  }> {
    return this.http.get(
      `/v1/knowledge/graph/${entityId}`,
      options,
      requestOptions
    );
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get knowledge graph statistics
   * @example
   * const stats = await client.knowledge.getStats();
   * console.log(`${stats.total_entities} entities, ${stats.total_relationships} relationships`);
   */
  async getStats(requestOptions?: RequestOptions): Promise<{
    total_entities: number;
    total_relationships: number;
    entities_by_type: Array<{ entity_type: string; count: number }>;
  }> {
    return this.http.get('/v1/knowledge/stats', undefined, requestOptions);
  }

  // =========================================================================
  // Extraction
  // =========================================================================

  /**
   * Extract knowledge from a document
   * @example
   * const result = await client.knowledge.extractFromDocument('document-id');
   * console.log(`Extracted ${result.entities_extracted} entities`);
   */
  async extractFromDocument(
    documentId: string,
    requestOptions?: RequestOptions
  ): Promise<{
    document_id: string;
    entities_extracted: number;
    relationships_extracted: number;
    message: string;
  }> {
    return this.http.post(
      `/v1/knowledge/extract/${documentId}`,
      undefined,
      { ...requestOptions, timeout: 300000 } // 5 minute timeout
    );
  }
}
