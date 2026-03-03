# Knowledge Graph Extraction

# Knowledge Graph Extraction

Devabase can automatically extract entities and relationships from your documents.

## How It Works

1. Upload a document with knowledge extraction enabled
2. LLM analyzes the content
3. Entities are identified (people, organizations, concepts, etc.)
4. Relationships between entities are mapped
5. Graph is stored and queryable

## Entity Types

- **Person** - People mentioned in documents
- **Organization** - Companies, institutions
- **Location** - Places, addresses
- **Concept** - Abstract ideas, topics
- **Product** - Products, services
- **Event** - Dates, occurrences
- **Technology** - Tools, frameworks, languages

## Querying the Graph

```typescript
// Search entities
const entities = await client.knowledge.entities.search('John Smith');

// Get entity with relationships
const graph = await client.knowledge.getGraph(entityId, { depth: 2 });

// Find path between entities
const paths = await client.knowledge.findPath(entity1Id, entity2Id);
```

## Dashboard

The Knowledge Graph page provides an interactive visualization to explore entities and their connections.