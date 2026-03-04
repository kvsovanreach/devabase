/**
 * Integration Tests for Devabase SDK
 *
 * Prerequisites:
 * - Devabase server running at http://localhost:9002
 *
 * Environment Variables:
 * - DEVABASE_URL: Server URL (default: http://localhost:9002)
 * - TEST_EMAIL: Test user email (default: sdk-test@example.com)
 * - TEST_PASSWORD: Test user password (default: TestPassword123)
 *
 * For Search/Chat tests, configure providers using ONE of these methods:
 *
 * Method 1: Use existing provider IDs (providers already configured in project)
 * - EMBEDDING_PROVIDER_ID: ID of configured embedding provider
 * - LLM_PROVIDER_ID: ID of configured LLM provider
 *
 * Method 2: Configure custom providers with URL and API key
 * - EMBEDDING_TYPE: Provider type (openai, cohere, voyage, custom)
 * - EMBEDDING_API_KEY: API key for embedding service
 * - EMBEDDING_URL: Base URL (required for custom, optional for others)
 * - EMBEDDING_MODEL: Model name (default: text-embedding-3-small)
 *
 * - LLM_TYPE: Provider type (openai, anthropic, google, custom)
 * - LLM_API_KEY: API key for LLM service
 * - LLM_URL: Base URL (required for custom, optional for others)
 * - LLM_MODEL: Model name (default: gpt-4o-mini)
 *
 * Run: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DevabaseClient, createClient } from '../client';
import type { LLMProviderType, EmbeddingProviderType } from '../resources/providers';

// Test configuration
const BASE_URL = process.env.DEVABASE_URL || 'http://localhost:9002';
const TEST_EMAIL = process.env.TEST_EMAIL || 'sdk-test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPassword123';
const TEST_NAME = 'SDK Test User';

// Provider configuration - Method 1: Use existing provider IDs
const EMBEDDING_PROVIDER_ID = process.env.EMBEDDING_PROVIDER_ID;
const LLM_PROVIDER_ID = process.env.LLM_PROVIDER_ID;

// Provider configuration - Method 2: Configure custom providers
const EMBEDDING_TYPE = process.env.EMBEDDING_TYPE as EmbeddingProviderType | undefined;
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY;
const EMBEDDING_URL = process.env.EMBEDDING_URL;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

const LLM_TYPE = process.env.LLM_TYPE as LLMProviderType | undefined;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_URL = process.env.LLM_URL;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

// Determine if we have provider configuration
const HAS_EXISTING_PROVIDERS = !!(EMBEDDING_PROVIDER_ID && LLM_PROVIDER_ID);
const HAS_CUSTOM_PROVIDERS = !!(EMBEDDING_TYPE && EMBEDDING_API_KEY && LLM_TYPE && LLM_API_KEY);
const HAS_PROVIDERS = HAS_EXISTING_PROVIDERS || HAS_CUSTOM_PROVIDERS;

// Provider IDs to use (either existing or test-created)
const TEST_EMBEDDING_PROVIDER_ID = EMBEDDING_PROVIDER_ID || 'test-embedding-provider';
const TEST_LLM_PROVIDER_ID = LLM_PROVIDER_ID || 'test-llm-provider';

// Unique identifiers for this test run
const TEST_RUN_ID = Date.now().toString(36);
const TEST_PROJECT_NAME = `sdk_test_project_${TEST_RUN_ID}`;
const TEST_COLLECTION_NAME = `sdk_test_collection_${TEST_RUN_ID}`;
const TEST_TABLE_NAME = `sdk_test_table_${TEST_RUN_ID}`;

describe('Devabase SDK Integration Tests', () => {
  let client: DevabaseClient;
  let projectId: string;
  let collectionId: string;
  let documentId: string;
  let conversationId: string;
  let tableRowId: string;

  beforeAll(async () => {
    client = createClient({ baseUrl: BASE_URL });

    if (!HAS_PROVIDERS) {
      console.log('\n----------------------------------------');
      console.log('Search/Chat tests will be skipped (no providers configured)');
      console.log('\nTo enable, set one of the following:');
      console.log('\nMethod 1 - Use existing providers:');
      console.log('  EMBEDDING_PROVIDER_ID=<id>');
      console.log('  LLM_PROVIDER_ID=<id>');
      console.log('\nMethod 2 - Configure custom providers:');
      console.log('  EMBEDDING_TYPE=openai EMBEDDING_API_KEY=sk-...');
      console.log('  LLM_TYPE=openai LLM_API_KEY=sk-...');
      console.log('----------------------------------------\n');
    } else if (HAS_CUSTOM_PROVIDERS) {
      console.log('\nConfiguring custom providers from environment...');
    }
  });

  afterAll(async () => {
    // Cleanup
    try {
      if (TEST_TABLE_NAME) await client.tables.delete(TEST_TABLE_NAME).catch(() => {});
      if (TEST_COLLECTION_NAME) await client.collections.delete(TEST_COLLECTION_NAME).catch(() => {});
      if (projectId) await client.projects.delete(projectId).catch(() => {});
    } catch {
      // Ignore
    }
  });

  // ============================================================================
  // 1. Authentication
  // ============================================================================

  describe('1. Authentication', () => {
    it('should login or register user', async () => {
      try {
        const auth = await client.auth.login({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        });
        expect(auth.token).toBeDefined();
      } catch {
        const auth = await client.auth.register({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          name: TEST_NAME,
        });
        expect(auth.token).toBeDefined();
      }
    });
  });

  // ============================================================================
  // 2. Projects
  // ============================================================================

  describe('2. Projects', () => {
    it('should create project', async () => {
      const project = await client.projects.create({ name: TEST_PROJECT_NAME });
      expect(project.id).toBeDefined();
      projectId = project.id;
      client.useProject(projectId);
    });

    it('should list projects', async () => {
      const result = await client.projects.list();
      expect(result.data.some(p => p.id === projectId)).toBe(true);
    });

    it('should get project', async () => {
      const project = await client.projects.get(projectId);
      expect(project.id).toBe(projectId);
    });

    it('should update project', async () => {
      const updated = await client.projects.update(projectId, { description: 'Updated' });
      expect(updated.description).toBe('Updated');
    });
  });

  // ============================================================================
  // 3. API Keys
  // ============================================================================

  describe('3. API Keys', () => {
    it('should create API key', async () => {
      const result = await client.projects.apiKeys.create({ name: `Test Key ${TEST_RUN_ID}` });
      expect(result.key.startsWith('dvb_')).toBe(true);
    });

    it('should list API keys', async () => {
      const result = await client.projects.apiKeys.list();
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 4. Providers (configure custom providers if env vars are set)
  // ============================================================================

  describe.skipIf(!HAS_CUSTOM_PROVIDERS)('4. Providers', () => {
    it('should configure embedding provider', async () => {
      const providers = await client.providers.embedding.upsert({
        id: TEST_EMBEDDING_PROVIDER_ID,
        type: EMBEDDING_TYPE!,
        api_key: EMBEDDING_API_KEY!,
        base_url: EMBEDDING_URL,
        model: EMBEDDING_MODEL,
      });
      expect(providers.some(p => p.id === TEST_EMBEDDING_PROVIDER_ID)).toBe(true);
    });

    it('should configure LLM provider', async () => {
      const providers = await client.providers.llm.upsert({
        id: TEST_LLM_PROVIDER_ID,
        type: LLM_TYPE!,
        api_key: LLM_API_KEY!,
        base_url: LLM_URL,
        model: LLM_MODEL,
      });
      expect(providers.some(p => p.id === TEST_LLM_PROVIDER_ID)).toBe(true);
    });

    it('should list embedding providers', async () => {
      const providers = await client.providers.embedding.list();
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should list LLM providers', async () => {
      const providers = await client.providers.llm.list();
      expect(providers.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 5. Collections
  // ============================================================================

  describe('5. Collections', () => {
    it('should create collection', async () => {
      const collection = await client.collections.create({ name: TEST_COLLECTION_NAME });
      expect(collection.name).toBe(TEST_COLLECTION_NAME);
      collectionId = collection.id;
    });

    it('should list collections', async () => {
      const result = await client.collections.list();
      expect(result.data.some(c => c.name === TEST_COLLECTION_NAME)).toBe(true);
    });

    it('should get collection', async () => {
      const collection = await client.collections.get(TEST_COLLECTION_NAME);
      expect(collection.name).toBe(TEST_COLLECTION_NAME);
    });

    it('should get collection stats', async () => {
      const stats = await client.collections.stats(TEST_COLLECTION_NAME);
      expect(stats).toBeDefined();
    });

    it.skipIf(!HAS_PROVIDERS)('should configure RAG settings', async () => {
      const updated = await client.collections.updateRagConfig(TEST_COLLECTION_NAME, {
        llm_provider_id: TEST_LLM_PROVIDER_ID,
        model: LLM_MODEL,
        system_prompt: 'You are a helpful assistant.',
      });
      expect(updated).toBeDefined();
    });
  });

  // ============================================================================
  // 6. Documents
  // ============================================================================

  describe('6. Documents', () => {
    it('should upload document', async () => {
      const content = 'This is a test document about TypeScript and JavaScript programming. It covers topics like functions, classes, and modules.';
      const document = await client.documents.upload(TEST_COLLECTION_NAME, {
        file: Buffer.from(content),
        filename: 'test-document.txt',
      });
      expect(document.id).toBeDefined();
      documentId = document.id;
    });

    it('should list documents', async () => {
      const result = await client.documents.list(TEST_COLLECTION_NAME);
      expect(result.data.some(d => d.id === documentId)).toBe(true);
    });

    it('should get document', async () => {
      const document = await client.documents.get(documentId);
      expect(document.id).toBe(documentId);
    });

    it.skipIf(!HAS_PROVIDERS)('should wait for document processing', async () => {
      let status = 'pending';
      let attempts = 0;

      while (status !== 'processed' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const doc = await client.documents.get(documentId);
        status = doc.status;
        attempts++;
      }

      expect(status).toBe('processed');
    }, 60000);
  });

  // ============================================================================
  // 7. Search (requires embedding provider)
  // ============================================================================

  describe.skipIf(!HAS_PROVIDERS)('7. Search', () => {
    it('should perform vector search', async () => {
      const results = await client.search.query({
        collection: TEST_COLLECTION_NAME,
        query: 'TypeScript programming',
        top_k: 5,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform hybrid search', async () => {
      const results = await client.search.hybrid({
        collection: TEST_COLLECTION_NAME,
        query: 'JavaScript functions',
        vector_weight: 0.7,
        keyword_weight: 0.3,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform keyword search', async () => {
      const results = await client.search.keyword({
        collection: TEST_COLLECTION_NAME,
        query: 'classes modules',
      });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ============================================================================
  // 8. Chat/RAG (requires LLM provider)
  // ============================================================================

  describe.skipIf(!HAS_PROVIDERS)('8. Chat/RAG', () => {
    it('should send chat message', async () => {
      const response = await client.chat.send({
        collection: TEST_COLLECTION_NAME,
        message: 'What programming languages are discussed?',
      });
      expect(response.message).toBeDefined();
      conversationId = response.conversation_id;
    });

    it('should continue conversation', async () => {
      const response = await client.chat.continue(conversationId, 'Tell me more');
      expect(response.message).toBeDefined();
    });

    it('should list conversations', async () => {
      const result = await client.chat.listConversations();
      expect(result).toBeDefined();
    });

    it('should get conversation', async () => {
      const conversation = await client.chat.getConversation(conversationId);
      expect(conversation.id).toBe(conversationId);
    });

    it('should delete conversation', async () => {
      await client.chat.deleteConversation(conversationId);
    });
  });

  // ============================================================================
  // 9. Tables
  // ============================================================================

  describe('9. Tables', () => {
    it('should create table', async () => {
      const table = await client.tables.create({
        name: TEST_TABLE_NAME,
        columns: [
          { name: 'id', type: 'uuid', primary: true },
          { name: 'name', type: 'text' },
          { name: 'email', type: 'text', unique: true },
          { name: 'age', type: 'integer' },
        ],
      });
      expect(table.name).toBe(TEST_TABLE_NAME);
    });

    it('should list tables', async () => {
      const result = await client.tables.list();
      expect(result.data.some(t => t.name === TEST_TABLE_NAME)).toBe(true);
    });

    it('should insert row', async () => {
      const row = await client.tables.rows(TEST_TABLE_NAME).insert({
        name: 'John Doe',
        email: `john_${TEST_RUN_ID}@example.com`,
        age: 30,
      });
      expect(row.id).toBeDefined();
      tableRowId = row.id as string;
    });

    it('should query rows', async () => {
      const result = await client.tables.rows(TEST_TABLE_NAME).query();
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should get row', async () => {
      const row = await client.tables.rows(TEST_TABLE_NAME).get(tableRowId);
      expect(row.id).toBe(tableRowId);
    });

    it('should update row', async () => {
      const updated = await client.tables.rows(TEST_TABLE_NAME).update(tableRowId, { name: 'Jane Doe' });
      expect(updated.name).toBe('Jane Doe');
    });

    it('should count rows', async () => {
      const count = await client.tables.rows(TEST_TABLE_NAME).count();
      expect(count).toBeGreaterThan(0);
    });

    it('should delete row', async () => {
      await client.tables.rows(TEST_TABLE_NAME).delete(tableRowId);
      const exists = await client.tables.rows(TEST_TABLE_NAME).exists(tableRowId);
      expect(exists).toBe(false);
    });
  });

  // ============================================================================
  // 10. SQL
  // ============================================================================

  describe('10. SQL', () => {
    it('should execute query', async () => {
      const result = await client.sql.execute('SELECT 1 as test');
      expect(result.rows).toBeDefined();
    });

    it('should get schema', async () => {
      const result = await client.sql.getSchema();
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // 11. Prompts
  // ============================================================================

  describe('11. Prompts', () => {
    const promptName = `test_prompt_${TEST_RUN_ID}`;

    it('should create prompt', async () => {
      const prompt = await client.prompts.create({
        name: promptName,
        content: 'Hello {{name}}!',
      });
      expect(prompt.name).toBe(promptName);
    });

    it('should list prompts', async () => {
      const result = await client.prompts.list();
      expect(result).toBeDefined();
    });

    it('should get prompt', async () => {
      const prompt = await client.prompts.get(promptName);
      expect(prompt.name).toBe(promptName);
    });

    it('should delete prompt', async () => {
      await client.prompts.delete(promptName);
    });
  });

  // ============================================================================
  // 12. Cleanup
  // ============================================================================

  describe('12. Cleanup', () => {
    it('should delete document', async () => {
      await client.documents.delete(documentId);
    });

    it('should delete table', async () => {
      await client.tables.delete(TEST_TABLE_NAME);
    });

    it('should delete collection', async () => {
      await client.collections.delete(TEST_COLLECTION_NAME);
    });

    it('should delete project', async () => {
      await client.projects.delete(projectId);
    });
  });
});
